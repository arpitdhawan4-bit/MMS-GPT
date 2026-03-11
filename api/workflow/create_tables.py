"""
api/workflow/create_tables.py
------------------------------
DDL script: creates all 8 workflow + customer-support tables in the planning schema.
Idempotent — uses CREATE TABLE IF NOT EXISTS, safe to re-run.

Tables created:
  Customer Support data (3):
    planning.support_agents
    planning.support_tickets
    planning.ticket_activities

  Workflow engine (5):
    planning.workflow_definitions
    planning.workflow_phases
    planning.workflow_sla_rules
    planning.workflow_signals
    planning.workflow_instances

Run from project root:
    python api/workflow/create_tables.py
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]

DDL = """
-- ── 1. support_agents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.support_agents (
    agent_id    SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(200) NOT NULL UNIQUE,
    level       VARCHAR(20)  NOT NULL CHECK (level IN ('L1', 'L2', 'Manager')),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. support_tickets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.support_tickets (
    ticket_id       SERIAL        PRIMARY KEY,
    ticket_number   VARCHAR(20)   NOT NULL UNIQUE,
    customer_name   VARCHAR(150)  NOT NULL,
    customer_email  VARCHAR(200)  NOT NULL,
    subject         VARCHAR(300)  NOT NULL,
    description     TEXT,
    category        VARCHAR(80)   NOT NULL DEFAULT 'Technical',
    sub_category    VARCHAR(80),
    priority        VARCHAR(20)   NOT NULL CHECK (priority IN ('high','medium','low')),
    status          VARCHAR(30)   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','escalated',
                                          'manager_escalated','resolved','closed')),
    assigned_to     INT REFERENCES planning.support_agents(agent_id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

-- ── 3. ticket_activities ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning.ticket_activities (
    activity_id   SERIAL       PRIMARY KEY,
    ticket_id     INT          NOT NULL REFERENCES planning.support_tickets(ticket_id) ON DELETE CASCADE,
    actor_name    VARCHAR(150) NOT NULL,
    action_type   VARCHAR(60)  NOT NULL,
    description   TEXT,
    old_value     VARCHAR(200),
    new_value     VARCHAR(200),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 4. workflow_definitions ──────────────────────────────────────────────────
-- One row per workflow type (e.g. ticket_escalation, order_review, …).
-- Adding a new workflow type = INSERT here + phases + sla_rules + signals.
-- Zero Python code changes required.
CREATE TABLE IF NOT EXISTS planning.workflow_definitions (
    workflow_def_id  SERIAL        PRIMARY KEY,
    name             VARCHAR(100)  NOT NULL UNIQUE,
    description      TEXT,
    entity_type      VARCHAR(60)   NOT NULL,   -- 'ticket', 'order', 'invoice', …
    dataset_table    VARCHAR(150)  NOT NULL,   -- fully-qualified: 'planning.support_tickets'
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 5. workflow_phases ───────────────────────────────────────────────────────
-- Ordered stages of a workflow.  The engine walks phase_order 1→N, stopping
-- at the first is_terminal phase it enters via a signal or SLA timeout.
CREATE TABLE IF NOT EXISTS planning.workflow_phases (
    phase_id         SERIAL        PRIMARY KEY,
    workflow_def_id  INT           NOT NULL REFERENCES planning.workflow_definitions(workflow_def_id),
    phase_order      INT           NOT NULL,
    phase_key        VARCHAR(60)   NOT NULL,   -- snake_case identifier
    phase_label      VARCHAR(120)  NOT NULL,   -- human-readable
    phase_color      VARCHAR(20)   NOT NULL DEFAULT '#6b7280',  -- hex colour for UI
    is_terminal      BOOLEAN       NOT NULL DEFAULT FALSE,
    UNIQUE (workflow_def_id, phase_key)
);

-- ── 6. workflow_sla_rules ────────────────────────────────────────────────────
-- How long to wait in a phase before auto-advancing to next_phase_id.
-- One row per (phase × priority) combination.
-- Set demo_timeout_sec to a small number (e.g. 30) for fast-mode demos.
CREATE TABLE IF NOT EXISTS planning.workflow_sla_rules (
    sla_rule_id      SERIAL       PRIMARY KEY,
    phase_id         INT          NOT NULL REFERENCES planning.workflow_phases(phase_id),
    priority         VARCHAR(20)  NOT NULL CHECK (priority IN ('high','medium','low')),
    timeout_minutes  INT          NOT NULL,    -- production SLA
    next_phase_id    INT REFERENCES planning.workflow_phases(phase_id),  -- NULL = terminal
    demo_timeout_sec INT          NOT NULL DEFAULT 60,   -- fast-mode for demos
    UNIQUE (phase_id, priority)
);

-- ── 7. workflow_signals ──────────────────────────────────────────────────────
-- Actions a user can send to a running workflow.
-- allowed_phases = NULL means the signal is valid in any phase.
-- requires_fields (JSONB) drives the action form rendered in the React UI:
--   [{"name":"agent_id","type":"select","label":"Assign To",
--     "source":"support_agents","source_label":"name","source_value":"agent_id"},
--    {"name":"note","type":"textarea","label":"Note","required":false}]
CREATE TABLE IF NOT EXISTS planning.workflow_signals (
    signal_id        SERIAL        PRIMARY KEY,
    workflow_def_id  INT           NOT NULL REFERENCES planning.workflow_definitions(workflow_def_id),
    signal_key       VARCHAR(60)   NOT NULL,
    signal_label     VARCHAR(120)  NOT NULL,
    icon             VARCHAR(10),                       -- emoji
    allowed_phases   TEXT[],                            -- NULL = all phases
    target_phase_key VARCHAR(60),                       -- NULL = no phase change
    requires_fields  JSONB         NOT NULL DEFAULT '[]',
    display_order    INT           NOT NULL DEFAULT 1,
    UNIQUE (workflow_def_id, signal_key)
);

-- ── 8. workflow_instances ────────────────────────────────────────────────────
-- One row per running (or completed) workflow execution.
-- The engine writes current_phase_key + next_escalation_at here.
-- scheduler_job_id is the APScheduler job ID; cleared on completion.
CREATE TABLE IF NOT EXISTS planning.workflow_instances (
    instance_id          SERIAL        PRIMARY KEY,
    workflow_def_id      INT           NOT NULL REFERENCES planning.workflow_definitions(workflow_def_id),
    entity_id            INT           NOT NULL,   -- ticket_id (or order_id etc.)
    current_phase_key    VARCHAR(60)   NOT NULL,
    status               VARCHAR(20)   NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','completed','failed','cancelled')),
    priority             VARCHAR(20)   NOT NULL,
    phase_entered_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    next_escalation_at   TIMESTAMPTZ,              -- when the SLA timer fires
    started_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ,
    scheduler_job_id     VARCHAR(200),             -- APScheduler job ID
    UNIQUE (workflow_def_id, entity_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON planning.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON planning.support_tickets (priority);
CREATE INDEX IF NOT EXISTS idx_activities_ticket ON planning.ticket_activities (ticket_id);
CREATE INDEX IF NOT EXISTS idx_instances_entity  ON planning.workflow_instances (entity_id);
CREATE INDEX IF NOT EXISTS idx_instances_status  ON planning.workflow_instances (status);
"""


def main():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Creating tables (idempotent)...")
        cur.execute(DDL)
        conn.commit()
        print("[OK] All 8 tables created (or already exist).")
        print("     planning.support_agents")
        print("     planning.support_tickets")
        print("     planning.ticket_activities")
        print("     planning.workflow_definitions")
        print("     planning.workflow_phases")
        print("     planning.workflow_sla_rules")
        print("     planning.workflow_signals")
        print("     planning.workflow_instances")
    except Exception as exc:
        conn.rollback()
        print(f"[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
