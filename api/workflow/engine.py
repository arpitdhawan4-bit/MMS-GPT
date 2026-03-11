"""
api/workflow/engine.py
-----------------------
Generic APScheduler-backed workflow state machine.
All workflow behaviour (phases, SLA timers, signals) is read from the DB —
no hardcoded workflow logic here.

Public API:
  scheduler           — APScheduler BackgroundScheduler (started by main.py lifespan)
  create_instance()   — start a new workflow for a ticket
  send_signal()       — process a user action (resolve, assign, escalate, note, ...)
  get_instance()      — fetch current state from DB
  escalate_job()      — called automatically by scheduler on SLA breach
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL   = os.environ["SUPABASE_DB_URL"]
log      = logging.getLogger("workflow.engine")

# ── APScheduler bootstrap ─────────────────────────────────────────────────────
# Jobs are stored in PostgreSQL so they survive FastAPI restarts.
# The DB_URL is psycopg2-style (postgres://...) — SQLAlchemy needs postgresql+psycopg2://
_sa_url = DB_URL.replace("postgres://", "postgresql+psycopg2://", 1) \
               .replace("postgresql://", "postgresql+psycopg2://", 1)

scheduler = BackgroundScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=_sa_url)},
    job_defaults={"coalesce": True, "max_instances": 1},
    timezone="UTC",
)


# ── DB helpers ─────────────────────────────────────────────────────────────────
def _conn():
    return psycopg2.connect(DB_URL)


def _dict_conn():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    return conn


# ── Core transition ────────────────────────────────────────────────────────────
def _transition_phase(
    instance_id: int,
    new_phase_key: str,
    actor: str,
    description: str,
    conn,
) -> None:
    """
    Update workflow_instance.current_phase_key and:
      - If terminal → mark completed, cancel SLA job
      - If not terminal → schedule next SLA escalation from DB config
    Also appends to ticket_activities.
    All in the passed-in transaction.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Load instance + new phase info
    cur.execute("""
        SELECT wi.*, wp.is_terminal, wp.phase_label,
               wd.workflow_def_id
        FROM   planning.workflow_instances wi
        JOIN   planning.workflow_phases    wp
               ON  wp.workflow_def_id = wi.workflow_def_id
               AND wp.phase_key       = %s
        JOIN   planning.workflow_definitions wd
               ON  wd.workflow_def_id = wi.workflow_def_id
        WHERE  wi.instance_id = %s
    """, (new_phase_key, instance_id))
    row = cur.fetchone()
    if not row:
        log.warning("instance %s or phase %s not found", instance_id, new_phase_key)
        return

    old_phase = row["current_phase_key"]
    is_terminal = row["is_terminal"]
    entity_id = row["entity_id"]
    priority = row["priority"]
    now = datetime.now(timezone.utc)

    # Cancel existing SLA job
    job_id = row["scheduler_job_id"]
    if job_id:
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

    if is_terminal:
        # Finalise
        cur.execute("""
            UPDATE planning.workflow_instances
            SET current_phase_key = %s, status = 'completed',
                completed_at = %s, scheduler_job_id = NULL, phase_entered_at = %s,
                next_escalation_at = NULL
            WHERE instance_id = %s
        """, (new_phase_key, now, now, instance_id))

        # Mirror on ticket
        ticket_status = "resolved" if new_phase_key == "resolved" else "closed"
        resolved_col = "resolved_at = %s," if new_phase_key == "resolved" else ""
        if new_phase_key == "resolved":
            cur.execute("""
                UPDATE planning.support_tickets
                SET status = %s, resolved_at = %s, updated_at = %s
                WHERE ticket_id = %s
            """, (ticket_status, now, now, entity_id))
        else:
            cur.execute("""
                UPDATE planning.support_tickets
                SET status = %s, updated_at = %s WHERE ticket_id = %s
            """, (ticket_status, now, entity_id))
        next_esc = None
        new_job_id = None
    else:
        # Look up SLA rule for new phase + priority
        cur.execute("""
            SELECT sr.timeout_minutes, sr.demo_timeout_sec
            FROM   planning.workflow_sla_rules sr
            JOIN   planning.workflow_phases    wp
                   ON wp.phase_id = sr.phase_id
            WHERE  wp.workflow_def_id = %s
              AND  wp.phase_key = %s
              AND  sr.priority  = %s
        """, (row["workflow_def_id"], new_phase_key, priority))
        sla = cur.fetchone()
        timeout_min = sla["timeout_minutes"] if sla else 240

        next_esc = now + timedelta(minutes=timeout_min)
        new_job_id = f"sla_{instance_id}_{new_phase_key}"

        scheduler.add_job(
            escalate_job,
            "date",
            run_date=next_esc,
            args=[instance_id],
            id=new_job_id,
            replace_existing=True,
        )

        cur.execute("""
            UPDATE planning.workflow_instances
            SET current_phase_key = %s, phase_entered_at = %s,
                next_escalation_at = %s, scheduler_job_id = %s
            WHERE instance_id = %s
        """, (new_phase_key, now, next_esc, new_job_id, instance_id))

        # Mirror status on ticket
        status_map = {
            "l1_open":           "open",
            "l2_escalated":      "escalated",
            "manager_escalated": "manager_escalated",
        }
        ticket_status = status_map.get(new_phase_key, "open")
        cur.execute("""
            UPDATE planning.support_tickets
            SET status = %s, updated_at = %s WHERE ticket_id = %s
        """, (ticket_status, now, entity_id))

    # Activity log
    cur.execute("""
        INSERT INTO planning.ticket_activities
            (ticket_id, actor_name, action_type, description, old_value, new_value, created_at)
        VALUES (%s, %s, 'phase_changed', %s, %s, %s, %s)
    """, (entity_id, actor, description, old_phase, new_phase_key, now))


# ── Public: create instance ────────────────────────────────────────────────────
def create_instance(ticket_id: int, priority: str, workflow_name: str = "ticket_escalation") -> int:
    """Start a workflow for a newly created ticket. Returns instance_id."""
    conn = _conn()
    try:
        with conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Load workflow def + first non-terminal phase
            cur.execute("""
                SELECT wd.workflow_def_id, wp.phase_key, wp.phase_id,
                       sr.timeout_minutes
                FROM   planning.workflow_definitions wd
                JOIN   planning.workflow_phases wp
                       ON wp.workflow_def_id = wd.workflow_def_id
                      AND wp.phase_order = 1
                LEFT JOIN planning.workflow_sla_rules sr
                       ON sr.phase_id = wp.phase_id AND sr.priority = %s
                WHERE  wd.name = %s
            """, (priority, workflow_name))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Workflow '{workflow_name}' not found")

            now = datetime.now(timezone.utc)
            timeout_min = row["timeout_minutes"] or 240
            next_esc = now + timedelta(minutes=timeout_min)
            job_id = f"sla_new_{ticket_id}_{now.timestamp():.0f}"

            cur.execute("""
                INSERT INTO planning.workflow_instances
                    (workflow_def_id, entity_id, current_phase_key, status,
                     priority, phase_entered_at, next_escalation_at,
                     started_at, scheduler_job_id)
                VALUES (%s,%s,%s,'running',%s,%s,%s,%s,%s)
                RETURNING instance_id
            """, (row["workflow_def_id"], ticket_id, row["phase_key"],
                  priority, now, next_esc, now, job_id))
            instance_id = cur.fetchone()["instance_id"]

            # Update job_id to use real instance_id
            real_job_id = f"sla_{instance_id}_{row['phase_key']}"
            cur.execute(
                "UPDATE planning.workflow_instances SET scheduler_job_id=%s WHERE instance_id=%s",
                (real_job_id, instance_id)
            )

            scheduler.add_job(
                escalate_job, "date",
                run_date=next_esc, args=[instance_id],
                id=real_job_id, replace_existing=True,
            )
            return instance_id
    finally:
        conn.close()


# ── Public: send signal ────────────────────────────────────────────────────────
def send_signal(
    ticket_id:  int,
    signal_key: str,
    payload:    dict,
    actor:      str = "User",
) -> dict:
    """
    Process a user action on a running workflow.
    Reads everything from the DB — no hardcoded signal logic.
    Returns {"ok": True, "new_phase": ...} or raises ValueError.
    """
    conn = _conn()
    try:
        with conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # Load instance
            cur.execute("""
                SELECT wi.*, wd.name AS wf_name
                FROM   planning.workflow_instances wi
                JOIN   planning.workflow_definitions wd
                       ON wd.workflow_def_id = wi.workflow_def_id
                WHERE  wi.entity_id = %s AND wi.workflow_def_id = (
                    SELECT workflow_def_id FROM planning.workflow_definitions
                    WHERE  entity_type = 'ticket' LIMIT 1
                )
            """, (ticket_id,))
            inst = cur.fetchone()
            if not inst:
                raise ValueError(f"No workflow instance for ticket {ticket_id}")

            # Load signal def
            cur.execute("""
                SELECT * FROM planning.workflow_signals
                WHERE  workflow_def_id = %s AND signal_key = %s
            """, (inst["workflow_def_id"], signal_key))
            sig = cur.fetchone()
            if not sig:
                raise ValueError(f"Signal '{signal_key}' not defined")

            current_phase = inst["current_phase_key"]
            allowed = sig["allowed_phases"]   # None = all, else array of strings

            # Validate phase allowance
            if allowed and current_phase not in allowed:
                raise ValueError(
                    f"Signal '{signal_key}' not allowed in phase '{current_phase}'. "
                    f"Allowed: {allowed}"
                )

            # If signal has a target phase → transition
            if sig["target_phase_key"]:
                _transition_phase(
                    inst["instance_id"],
                    sig["target_phase_key"],
                    actor,
                    payload.get("resolution_note") or
                    payload.get("reason") or
                    f"{signal_key} by {actor}",
                    conn,
                )
                new_phase = sig["target_phase_key"]
            else:
                new_phase = current_phase

            # For assign_agent: update ticket.assigned_to
            if signal_key == "assign_agent" and "agent_id" in payload:
                cur.execute("""
                    UPDATE planning.support_tickets
                    SET assigned_to = %s, status = 'in_progress', updated_at = NOW()
                    WHERE ticket_id = %s
                """, (payload["agent_id"], ticket_id))

            # Always log note/activity for add_note, assign_agent, etc.
            if sig["target_phase_key"] is None:
                note = (payload.get("note_text") or payload.get("note")
                        or f"{sig['signal_label']} by {actor}")
                cur.execute("""
                    INSERT INTO planning.ticket_activities
                        (ticket_id, actor_name, action_type, description, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                """, (ticket_id, actor, signal_key, note))

            return {"ok": True, "new_phase": new_phase}
    finally:
        conn.close()


# ── APScheduler job: SLA escalation ───────────────────────────────────────────
def escalate_job(instance_id: int) -> None:
    """
    Called by APScheduler when an SLA timer fires.
    Reads the next phase from workflow_sla_rules and transitions.
    This function has ZERO hardcoded workflow logic — it all comes from DB.
    """
    log.info("SLA timer fired for instance_id=%s", instance_id)
    conn = _conn()
    try:
        with conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("""
                SELECT wi.instance_id, wi.current_phase_key, wi.priority,
                       wi.workflow_def_id, wp.phase_id
                FROM   planning.workflow_instances wi
                JOIN   planning.workflow_phases wp
                       ON wp.workflow_def_id = wi.workflow_def_id
                      AND wp.phase_key       = wi.current_phase_key
                WHERE  wi.instance_id = %s AND wi.status = 'running'
            """, (instance_id,))
            inst = cur.fetchone()
            if not inst:
                log.info("instance %s already completed, skipping", instance_id)
                return

            cur.execute("""
                SELECT wp2.phase_key AS next_key
                FROM   planning.workflow_sla_rules sr
                JOIN   planning.workflow_phases    wp2
                       ON wp2.phase_id = sr.next_phase_id
                WHERE  sr.phase_id = %s AND sr.priority = %s
            """, (inst["phase_id"], inst["priority"]))
            nxt = cur.fetchone()
            if not nxt:
                log.warning("No SLA next-phase for instance %s", instance_id)
                return

            _transition_phase(
                instance_id,
                nxt["next_key"],
                "System (SLA)",
                f"Auto-escalated: SLA breached in phase '{inst['current_phase_key']}'",
                conn,
            )
            log.info("instance %s transitioned to %s", instance_id, nxt["next_key"])
    except Exception:
        log.exception("escalate_job failed for instance_id=%s", instance_id)
    finally:
        conn.close()


# ── Public: get instance ───────────────────────────────────────────────────────
def get_instance(ticket_id: int) -> Optional[dict]:
    conn = _dict_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT wi.*, wp.phase_label, wp.phase_color, wp.is_terminal,
                       wp.phase_order,
                       (SELECT COUNT(*) FROM planning.workflow_phases
                        WHERE workflow_def_id = wi.workflow_def_id
                          AND is_terminal = FALSE) AS total_active_phases
                FROM   planning.workflow_instances wi
                JOIN   planning.workflow_phases    wp
                       ON wp.workflow_def_id = wi.workflow_def_id
                      AND wp.phase_key       = wi.current_phase_key
                WHERE  wi.entity_id = %s AND wi.workflow_def_id = (
                    SELECT workflow_def_id FROM planning.workflow_definitions
                    WHERE entity_type = 'ticket' LIMIT 1
                )
            """, (ticket_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()
