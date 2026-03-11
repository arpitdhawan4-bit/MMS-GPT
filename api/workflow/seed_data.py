"""
api/workflow/seed_data.py
-------------------------
Seeds all workflow and customer-support data:
  1. planning.support_agents        (12 agents: 6 L1, 4 L2, 2 Manager)
  2. planning.workflow_definitions  (1 workflow: ticket_escalation)
  3. planning.workflow_phases       (5 phases for ticket_escalation)
  4. planning.workflow_sla_rules    (9 SLA rules: 3 phases x 3 priorities)
  5. planning.workflow_signals      (5 signals)
  6. planning.support_tickets       (50 tickets, mixed statuses/priorities)
  7. planning.ticket_activities     (3-8 activities per ticket)
  8. planning.workflow_instances    (1 per active ticket)

Idempotent — checks for existing data before inserting.
Run from project root:
    python api/workflow/seed_data.py
"""

import os, json
from datetime import datetime, timedelta, timezone
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]

now = datetime.now(timezone.utc)

def ago(**kwargs):
    return now - timedelta(**kwargs)

def future(**kwargs):
    return now + timedelta(**kwargs)


# ── 1. Agents ─────────────────────────────────────────────────────────────────
AGENTS = [
    # (name, email, level)
    ("Alex Johnson",      "alex.johnson@support.internal",     "L1"),
    ("Emma Brown",        "emma.brown@support.internal",       "L1"),
    ("Ryan Davis",        "ryan.davis@support.internal",       "L1"),
    ("Mia Wilson",        "mia.wilson@support.internal",       "L1"),
    ("Carlos Rivera",     "carlos.rivera@support.internal",    "L1"),
    ("Sophie Chen",       "sophie.chen@support.internal",      "L1"),
    ("Nathan Wright",     "nathan.wright@support.internal",    "L2"),
    ("Diana Lee",         "diana.lee@support.internal",        "L2"),
    ("Marcus Thompson",   "marcus.thompson@support.internal",  "L2"),
    ("Rachel Kim",        "rachel.kim@support.internal",       "L2"),
    ("James Martinez",    "james.martinez@support.internal",   "Manager"),
    ("Victoria Anderson", "victoria.anderson@support.internal","Manager"),
]


# ── 2-5. Workflow engine data ─────────────────────────────────────────────────
# ticket_escalation: L1 Open → L2 Escalated → Manager Review → Resolved / Auto-Closed
WORKFLOW = {
    "name":        "ticket_escalation",
    "description": "Customer support ticket escalation workflow. "
                   "Tickets auto-escalate on SLA breach: L1 -> L2 -> Manager -> Auto-Closed. "
                   "Agents can resolve, assign, or manually escalate at any point.",
    "entity_type": "ticket",
    "dataset_table": "planning.support_tickets",
}

PHASES = [
    # (phase_order, phase_key, phase_label, phase_color, is_terminal)
    (1, "l1_open",             "L1 Open",       "#f59e0b", False),
    (2, "l2_escalated",        "L2 Escalated",  "#f97316", False),
    (3, "manager_escalated",   "Manager Review","#ef4444", False),
    (4, "resolved",            "Resolved",      "#22c55e", True),
    (5, "auto_closed",         "Auto-Closed",   "#6b7280", True),
]

# SLA rules: (phase_key, priority, timeout_minutes, next_phase_key, demo_timeout_sec)
# Only for non-terminal phases (they need a timer)
SLA_RULES = [
    # L1 Open SLAs
    ("l1_open",           "high",   240,  "l2_escalated",      45),
    ("l1_open",           "medium", 480,  "l2_escalated",      60),
    ("l1_open",           "low",    1440, "l2_escalated",      90),
    # L2 Escalated SLAs
    ("l2_escalated",      "high",   240,  "manager_escalated", 45),
    ("l2_escalated",      "medium", 480,  "manager_escalated", 60),
    ("l2_escalated",      "low",    1440, "manager_escalated", 90),
    # Manager Review SLAs — auto-close if manager doesn't act
    ("manager_escalated", "high",   240,  "auto_closed",       45),
    ("manager_escalated", "medium", 480,  "auto_closed",       60),
    ("manager_escalated", "low",    1440, "auto_closed",       90),
]

# Signals: (signal_key, signal_label, icon, allowed_phases, target_phase_key,
#           requires_fields_json, display_order)
# allowed_phases=None means valid in all non-terminal phases.
SIGNALS = [
    (
        "assign_agent", "Assign Agent", "👤",
        None,   # all phases
        None,   # no phase change
        [{"name":"agent_id","type":"select","label":"Assign To",
          "source":"support_agents","source_label":"name","source_value":"agent_id",
          "required":True},
         {"name":"note","type":"textarea","label":"Assignment Note","required":False}],
        1,
    ),
    (
        "add_note", "Add Note", "📝",
        None,   # all phases
        None,   # no phase change
        [{"name":"note_text","type":"textarea","label":"Note","required":True}],
        2,
    ),
    (
        "resolve", "Resolve Ticket", "✅",
        ["l1_open","l2_escalated","manager_escalated"],
        "resolved",
        [{"name":"resolution_note","type":"textarea","label":"Resolution Summary","required":True}],
        3,
    ),
    (
        "escalate", "Escalate", "🔺",
        ["l1_open"],
        "l2_escalated",
        [{"name":"reason","type":"textarea","label":"Escalation Reason","required":True}],
        4,
    ),
    (
        "reopen", "Re-open Ticket", "🔄",
        ["resolved","auto_closed"],
        "l1_open",
        [{"name":"reason","type":"textarea","label":"Reason for Re-opening","required":True}],
        5,
    ),
]


# ── 6. Tickets ────────────────────────────────────────────────────────────────
# 50 tickets spread across:
#   status:   open(12), in_progress(10), escalated(9), manager_escalated(5),
#             resolved(9), closed(5)
#   priority: high(12), medium(20), low(18)

CUSTOMERS = [
    ("Acme Corp",         "support@acme.com"),
    ("GlobalTech",        "help@globaltech.io"),
    ("DataSystems Inc",   "ops@datasystems.com"),
    ("Nexus Solutions",   "tech@nexussol.net"),
    ("Pinnacle Group",    "support@pinnaclegroup.co"),
    ("Summit Analytics",  "admin@summitanalytics.com"),
    ("CloudBase Ltd",     "helpdesk@cloudbase.io"),
    ("FusionWorks",       "support@fusionworks.net"),
    ("QuantumEdge",       "portal@quantumedge.com"),
    ("MetroGrid",         "support@metrogrid.io"),
    ("AlphaStream",       "help@alphastream.co"),
    ("Vertex Dynamics",   "ops@vertexdynamics.com"),
    ("BrightPath",        "support@brightpath.io"),
    ("TechNova",          "admin@technova.ai"),
    ("Cascade Systems",   "support@cascadesys.com"),
]

SUBJECTS_BY_SUB = {
    "Login": [
        "SSO login fails with HTTP 500 error",
        "Password reset email not being received",
        "MFA code not accepted after recent update",
        "Active Directory sync causing login loops",
        "Session timeout too aggressive — users re-login every 10 min",
        "OAuth token refresh breaking on mobile",
    ],
    "Performance": [
        "Dashboard load time exceeds 30 seconds",
        "API response timeout on bulk data export",
        "Reports page freezes when filtering large date ranges",
        "Search results taking over 15 seconds to load",
        "Slow query noticed in planning module after schema migration",
    ],
    "Data Loss": [
        "Historical records disappeared after last update",
        "Exported report shows fewer rows than the UI count",
        "Deleted records reappearing after sync",
        "Missing transaction data for Q4 2025",
        "User profile data partially overwritten",
    ],
    "Integration": [
        "Salesforce sync not reflecting updates made in-app",
        "Webhook not firing on ticket status change",
        "Azure AD group mapping not working post-upgrade",
        "REST API returning 404 on previously working endpoint",
        "Third-party BI tool losing connection after idle timeout",
    ],
    "Configuration": [
        "Role permissions not saving after logout/login cycle",
        "Email notification settings reset on every deploy",
        "Column config not persisting in grid views",
        "Custom colour themes reverting to default",
        "Feature flag changes not applying to all users",
    ],
    "Other": [
        "CSV export has incorrect date formatting",
        "Browser console errors appearing on search page",
        "Accessibility issue: screen reader skips table headers",
        "Print layout cuts off right column in Firefox",
        "Tooltip text displays inconsistently across browsers",
    ],
}

# Flat list: (sub_category, subject)
ALL_SUBJECTS = []
for sub, subjects in SUBJECTS_BY_SUB.items():
    for s in subjects:
        ALL_SUBJECTS.append((sub, s))

# 50 ticket definitions: (cust_idx, subj_idx, priority, status, created_delta_hours,
#                          assigned_agent_idx or None)
# agent_idx is 0-based index into the agents list after insertion
TICKET_DEFS = [
    # HIGH priority tickets
    (0,  0,  "high",   "open",               1.5,  None),     # 1  - TKT-0001
    (1,  4,  "high",   "in_progress",         3.0,  0),        # 2  - assigned to Alex (L1)
    (2,  6,  "high",   "escalated",          10.0,  6),        # 3  - assigned to Nathan (L2)
    (3,  11, "high",   "manager_escalated",  18.0,  10),       # 4  - assigned to James (Mgr)
    (4,  1,  "high",   "resolved",           48.0,  1),        # 5
    (5,  7,  "high",   "open",               0.5,  None),      # 6
    (6,  13, "high",   "in_progress",         2.0,  2),        # 7
    (7,  2,  "high",   "escalated",          12.0,  7),        # 8
    (8,  17, "high",   "resolved",           36.0,  3),        # 9
    (9,  5,  "high",   "open",               0.25, None),      # 10
    (10, 9,  "high",   "in_progress",         1.0,  4),        # 11
    (11, 21, "high",   "manager_escalated",  20.0,  11),       # 12

    # MEDIUM priority tickets
    (12, 3,  "medium", "open",               4.0,  None),     # 13
    (13, 8,  "medium", "in_progress",         6.0,  5),        # 14
    (14, 14, "medium", "escalated",          20.0,  8),        # 15
    (0,  18, "medium", "manager_escalated",  35.0,  10),       # 16
    (1,  22, "medium", "resolved",           96.0,  0),        # 17
    (2,  10, "medium", "closed",            168.0,  1),        # 18
    (3,  15, "medium", "open",               5.0,  None),     # 19
    (4,  19, "medium", "in_progress",         8.0,  2),        # 20
    (5,  23, "medium", "escalated",          25.0,  7),        # 21
    (6,  0,  "medium", "resolved",          120.0,  3),        # 22
    (7,  4,  "medium", "in_progress",         9.0,  4),        # 23
    (8,  11, "medium", "open",               7.0,  None),     # 24
    (9,  16, "medium", "closed",            200.0,  5),        # 25
    (10, 20, "medium", "escalated",          30.0,  6),        # 26
    (11, 24, "medium", "open",               3.0,  None),     # 27
    (12, 12, "medium", "resolved",           72.0,  8),        # 28
    (13, 3,  "medium", "in_progress",        10.0,  9),        # 29
    (14, 8,  "medium", "open",               2.0,  None),     # 30
    (0,  16, "medium", "resolved",           90.0,  0),        # 31
    (1,  21, "medium", "closed",            250.0,  1),        # 32
    (2,  25, "medium", "open",               6.0,  None),     # 33

    # LOW priority tickets
    (3,  1,  "low",    "open",              12.0,  None),     # 34
    (4,  5,  "low",    "in_progress",        18.0,  5),        # 35
    (5,  9,  "low",    "escalated",          50.0,  7),        # 36
    (6,  13, "low",    "open",              24.0,  None),     # 37
    (7,  17, "low",    "resolved",          192.0,  2),        # 38
    (8,  21, "low",    "open",              36.0,  None),     # 39
    (9,  2,  "low",    "in_progress",        40.0,  3),        # 40
    (10, 6,  "low",    "resolved",          300.0,  4),        # 41
    (11, 10, "low",    "open",              48.0,  None),     # 42
    (12, 14, "low",    "closed",            400.0,  6),        # 43
    (13, 18, "low",    "in_progress",        55.0,  8),        # 44
    (14, 22, "low",    "open",              60.0,  None),     # 45
    (0,  3,  "low",    "resolved",          250.0,  9),        # 46
    (1,  7,  "low",    "open",              20.0,  None),     # 47
    (2,  11, "low",    "in_progress",        30.0,  0),        # 48
    (3,  15, "low",    "escalated",         100.0,  7),        # 49
    (4,  19, "low",    "closed",            350.0,  1),        # 50
]

# SLA minutes by priority
SLA_MINUTES = {"high": 240, "medium": 480, "low": 1440}

# Status → workflow phase key mapping
STATUS_TO_PHASE = {
    "open":               "l1_open",
    "in_progress":        "l1_open",
    "escalated":          "l2_escalated",
    "manager_escalated":  "manager_escalated",
    "resolved":           "resolved",
    "closed":             "auto_closed",
}


def seed(cur):
    # ── Guard ──────────────────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM planning.support_agents")
    if cur.fetchone()[0] > 0:
        print("  Data already exists — skipping seed.")
        return

    # ── 1. Agents ──────────────────────────────────────────────────────────────
    agent_ids = []
    for (name, email, level) in AGENTS:
        cur.execute("""
            INSERT INTO planning.support_agents (name, email, level)
            VALUES (%s, %s, %s) RETURNING agent_id
        """, (name, email, level))
        agent_ids.append(cur.fetchone()[0])
    print(f"  support_agents    -> {len(agent_ids)} agents")

    # ── 2. Workflow definition ─────────────────────────────────────────────────
    cur.execute("""
        INSERT INTO planning.workflow_definitions
            (name, description, entity_type, dataset_table)
        VALUES (%s, %s, %s, %s) RETURNING workflow_def_id
    """, (WORKFLOW["name"], WORKFLOW["description"],
          WORKFLOW["entity_type"], WORKFLOW["dataset_table"]))
    wf_id = cur.fetchone()[0]
    print(f"  workflow_definitions -> workflow_def_id={wf_id} ({WORKFLOW['name']})")

    # ── 3. Phases ──────────────────────────────────────────────────────────────
    phase_id_map: dict[str, int] = {}
    for (order, key, label, color, terminal) in PHASES:
        cur.execute("""
            INSERT INTO planning.workflow_phases
                (workflow_def_id, phase_order, phase_key, phase_label, phase_color, is_terminal)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING phase_id
        """, (wf_id, order, key, label, color, terminal))
        phase_id_map[key] = cur.fetchone()[0]
    print(f"  workflow_phases   -> {len(phase_id_map)} phases: {list(phase_id_map.keys())}")

    # ── 4. SLA rules ───────────────────────────────────────────────────────────
    sla_count = 0
    for (phase_key, priority, timeout_min, next_phase_key, demo_sec) in SLA_RULES:
        next_id = phase_id_map.get(next_phase_key) if next_phase_key else None
        cur.execute("""
            INSERT INTO planning.workflow_sla_rules
                (phase_id, priority, timeout_minutes, next_phase_id, demo_timeout_sec)
            VALUES (%s, %s, %s, %s, %s)
        """, (phase_id_map[phase_key], priority, timeout_min, next_id, demo_sec))
        sla_count += 1
    print(f"  workflow_sla_rules -> {sla_count} rules")

    # ── 5. Signals ─────────────────────────────────────────────────────────────
    for (sig_key, sig_label, icon, allowed, target, fields, order) in SIGNALS:
        cur.execute("""
            INSERT INTO planning.workflow_signals
                (workflow_def_id, signal_key, signal_label, icon,
                 allowed_phases, target_phase_key, requires_fields, display_order)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (wf_id, sig_key, sig_label, icon, allowed, target, json.dumps(fields), order))
    print(f"  workflow_signals  -> {len(SIGNALS)} signals")

    # ── 6. Tickets ─────────────────────────────────────────────────────────────
    ticket_ids = []
    for i, (cust_i, subj_i, priority, status, age_hours, agent_i) in enumerate(TICKET_DEFS):
        ticket_num = f"TKT-{(i+1):04d}"
        cust_name, cust_email = CUSTOMERS[cust_i % len(CUSTOMERS)]
        sub_cat, subject      = ALL_SUBJECTS[subj_i % len(ALL_SUBJECTS)]
        created = ago(hours=age_hours)
        updated = created if agent_i is None else created + timedelta(minutes=15)
        resolved_at = (ago(hours=age_hours - 4)
                       if status in ("resolved", "closed") else None)
        assigned_id = agent_ids[agent_i] if agent_i is not None else None

        description = (
            f"Reported by {cust_name}. "
            f"Sub-category: {sub_cat}. "
            f"Priority: {priority.upper()}. "
            f"Details: User encountered this issue and it is affecting their workflow. "
            f"Ticket created at {created.strftime('%Y-%m-%d %H:%M UTC')}."
        )

        cur.execute("""
            INSERT INTO planning.support_tickets
                (ticket_number, customer_name, customer_email, subject, description,
                 category, sub_category, priority, status, assigned_to,
                 created_at, updated_at, resolved_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING ticket_id
        """, (ticket_num, cust_name, cust_email, subject, description,
              "Technical", sub_cat, priority, status, assigned_id,
              created, updated, resolved_at))
        ticket_ids.append(cur.fetchone()[0])

    print(f"  support_tickets   -> {len(ticket_ids)} tickets")

    # ── 7. Activities ──────────────────────────────────────────────────────────
    act_count = 0
    for i, (cust_i, subj_i, priority, status, age_hours, agent_i) in enumerate(TICKET_DEFS):
        ticket_id = ticket_ids[i]
        created = ago(hours=age_hours)
        cust_name, _ = CUSTOMERS[cust_i % len(CUSTOMERS)]
        sub_cat, subject = ALL_SUBJECTS[subj_i % len(ALL_SUBJECTS)]

        # Activity 1: created
        cur.execute("""
            INSERT INTO planning.ticket_activities
                (ticket_id, actor_name, action_type, description, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (ticket_id, "System", "created",
              f"Ticket created by {cust_name}. Subject: {subject}",
              created))
        act_count += 1

        # Activity 2: assigned (if agent set or status not open)
        if agent_i is not None:
            agent_name = AGENTS[agent_i][0]
            level = AGENTS[agent_i][2]
            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description,
                     new_value, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (ticket_id, "System", "assigned",
                  f"Ticket assigned to {agent_name} ({level})",
                  agent_name, created + timedelta(minutes=15)))
            act_count += 1

        # Activity 3: escalation (if escalated)
        if status in ("escalated", "manager_escalated"):
            sla_min = SLA_MINUTES[priority]
            escalated_at = created + timedelta(minutes=sla_min)
            escalated_to = ("L2 Support" if status == "escalated"
                            else "Manager")
            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description,
                     old_value, new_value, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (ticket_id, "System", "escalated",
                  f"SLA breached — auto-escalated to {escalated_to}",
                  "L1 Open", escalated_to, escalated_at))
            act_count += 1

        if status == "manager_escalated":
            l2_sla = created + timedelta(minutes=SLA_MINUTES[priority] * 2)
            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description,
                     old_value, new_value, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (ticket_id, "System", "escalated",
                  "L2 SLA breached — auto-escalated to Manager Review",
                  "L2 Escalated", "Manager Review", l2_sla))
            act_count += 1

        # Activity 4: note (for in_progress or escalated)
        if status in ("in_progress", "escalated", "manager_escalated"):
            agent_name = AGENTS[agent_i][0] if agent_i is not None else "System"
            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description, created_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (ticket_id, agent_name, "note_added",
                  "Agent is investigating the issue. Will update shortly.",
                  created + timedelta(minutes=30)))
            act_count += 1

        # Activity 5: resolved/closed
        if status in ("resolved", "closed"):
            resolver = AGENTS[agent_i][0] if agent_i is not None else "System"
            action = "resolved" if status == "resolved" else "closed"
            notes = ("Issue resolved: root cause identified and fix applied."
                     if status == "resolved"
                     else "Ticket closed after no response from customer.")
            resolved_ts = ago(hours=max(age_hours - 4, 0.5))
            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description,
                     old_value, new_value, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (ticket_id, resolver, action, notes,
                  status, "resolved" if status == "resolved" else "closed",
                  resolved_ts))
            act_count += 1

    print(f"  ticket_activities -> {act_count} activities")

    # ── 8. Workflow instances ──────────────────────────────────────────────────
    inst_count = 0
    terminal_phases = {"resolved", "auto_closed"}

    for i, (cust_i, subj_i, priority, status, age_hours, agent_i) in enumerate(TICKET_DEFS):
        ticket_id   = ticket_ids[i]
        phase_key   = STATUS_TO_PHASE[status]
        is_terminal = phase_key in terminal_phases
        wf_status   = "completed" if is_terminal else "running"
        created     = ago(hours=age_hours)

        # Calculate phase_entered_at and next_escalation_at
        sla_min = SLA_MINUTES[priority]
        if phase_key == "l1_open":
            phase_entered = created
            next_esc = created + timedelta(minutes=sla_min)
        elif phase_key == "l2_escalated":
            phase_entered = created + timedelta(minutes=sla_min)
            next_esc = phase_entered + timedelta(minutes=sla_min)
        elif phase_key == "manager_escalated":
            phase_entered = created + timedelta(minutes=sla_min * 2)
            next_esc = phase_entered + timedelta(minutes=sla_min)
        else:
            phase_entered = created
            next_esc = None

        # For demo: make some active tickets have near-future escalations
        if not is_terminal and next_esc and next_esc < now:
            # Push escalation 2 hours into the future for demo visibility
            next_esc = now + timedelta(hours=2)

        completed_at = (ago(hours=max(age_hours - 4, 0.5))
                        if is_terminal else None)

        cur.execute("""
            INSERT INTO planning.workflow_instances
                (workflow_def_id, entity_id, current_phase_key, status,
                 priority, phase_entered_at, next_escalation_at,
                 started_at, completed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (wf_id, ticket_id, phase_key, wf_status,
              priority, phase_entered, next_esc, created, completed_at))
        inst_count += 1

    print(f"  workflow_instances -> {inst_count} instances")
    print(f"\n  Summary: 12 agents | 50 tickets | {act_count} activities | "
          f"50 workflow instances")
    print(f"  Workflow def_id={wf_id} | 5 phases | 9 SLA rules | 5 signals")


def main():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Seeding workflow + support data...")
        seed(cur)
        conn.commit()
        print("\n[OK] Seed complete.")
    except Exception as exc:
        conn.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
