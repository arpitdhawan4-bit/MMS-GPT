"""
api/workflow/seed_grid_configs.py
----------------------------------
Inserts AG Grid configuration (5-table pattern) for all 7 workflow/support tables.
Idempotent — skips any grid that already exists by name.

Grids created:
  Tickets            → planning.support_tickets
  TicketActivities   → planning.ticket_activities
  Agents             → planning.support_agents
  WorkflowDefs       → planning.workflow_definitions
  WorkflowPhases     → planning.workflow_phases
  WorkflowSLARules   → planning.workflow_sla_rules
  WorkflowSignals    → planning.workflow_signals

Run from project root:
    python api/workflow/seed_grid_configs.py
"""

import os, json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")
DB_URL = os.environ["SUPABASE_DB_URL"]

# ─────────────────────────────────────────────────────────────────────────────
# Each grid spec:  (grid_name, description, dataset_table, frozen, columns,
#                   format_rules, admin_layout, viewer_layout)
#
# columns: list of
#   (field, header, dtype, sort, filt, editable, visible, pinned, order)
#
# format_rules: list of
#   (field, condition_expr, style_dict, priority)
#
# admin_layout / viewer_layout:
#   (frozen_cols, page_size, allow_export, allow_edit)
#
# permissions: auto-generated as:
#   admin  → can_view=True,  can_edit = column.editable
#   viewer → can_view column-specific, can_edit=False
#   hidden_from_viewer: list of field names viewer cannot see
# ─────────────────────────────────────────────────────────────────────────────

GRIDS = [

    # ── 1. Tickets ────────────────────────────────────────────────────────────
    dict(
        grid_name="Tickets",
        description="Customer support tickets — 50 seeded across High/Medium/Low priorities",
        dataset_table="planning.support_tickets",
        columns=[
            ("ticket_id",     "ID",           "numeric", True,  True,  False, True, "left", 1),
            ("ticket_number", "Ticket #",     "text",    True,  True,  False, True, "left", 2),
            ("customer_name", "Customer",     "text",    True,  True,  False, True, None,   3),
            ("subject",       "Subject",      "text",    True,  True,  False, True, None,   4),
            ("priority",      "Priority",     "text",    True,  True,  False, True, None,   5),
            ("status",        "Status",       "text",    True,  True,  False, True, None,   6),
            ("sub_category",  "Sub-Category", "text",    True,  True,  False, True, None,   7),
            ("assigned_to",   "Assigned To",  "numeric", True,  False, False, True, None,   8),
            ("created_at",    "Created",      "date",    True,  False, False, True, None,   9),
            ("updated_at",    "Updated",      "date",    True,  False, False, True, None,   10),
            ("resolved_at",   "Resolved",     "date",    True,  False, False, False, None,  11),
            ("customer_email","Email",        "text",    True,  False, False, False, None,  12),
        ],
        format_rules=[
            ("status", "value === 'open'",             {"backgroundColor":"#292524","color":"#fde68a"}, 1),
            ("status", "value === 'in_progress'",      {"backgroundColor":"#1c2b45","color":"#93c5fd"}, 2),
            ("status", "value === 'escalated'",        {"backgroundColor":"#431407","color":"#fdba74"}, 3),
            ("status", "value === 'manager_escalated'",{"backgroundColor":"#450a0a","color":"#fca5a5"}, 4),
            ("status", "value === 'resolved'",         {"backgroundColor":"#052e16","color":"#86efac"}, 5),
            ("status", "value === 'closed'",           {"backgroundColor":"#18181b","color":"#71717a"}, 6),
            ("priority","value === 'high'",            {"backgroundColor":"#450a0a","color":"#fca5a5"}, 1),
            ("priority","value === 'medium'",          {"backgroundColor":"#431407","color":"#fdba74"}, 2),
            ("priority","value === 'low'",             {"backgroundColor":"#14532d","color":"#86efac"}, 3),
        ],
        hidden_from_viewer=["customer_email","resolved_at"],
        admin_layout=(2, 50, True, False),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 2. TicketActivities ───────────────────────────────────────────────────
    dict(
        grid_name="TicketActivities",
        description="Audit trail — all actions taken on support tickets",
        dataset_table="planning.ticket_activities",
        columns=[
            ("activity_id", "ID",          "numeric", True,  False, False, True, None,   1),
            ("ticket_id",   "Ticket ID",   "numeric", True,  True,  False, True, "left", 2),
            ("actor_name",  "Actor",       "text",    True,  True,  False, True, None,   3),
            ("action_type", "Action",      "text",    True,  True,  False, True, None,   4),
            ("description", "Description", "text",    False, False, False, True, None,   5),
            ("old_value",   "From",        "text",    True,  False, False, True, None,   6),
            ("new_value",   "To",          "text",    True,  False, False, True, None,   7),
            ("created_at",  "Timestamp",   "date",    True,  False, False, True, None,   8),
        ],
        format_rules=[
            ("action_type","value === 'escalated'",{"backgroundColor":"#431407","color":"#fdba74"},1),
            ("action_type","value === 'resolved'", {"backgroundColor":"#052e16","color":"#86efac"},2),
            ("action_type","value === 'closed'",   {"backgroundColor":"#18181b","color":"#71717a"},3),
            ("action_type","value === 'created'",  {"backgroundColor":"#1c2b45","color":"#93c5fd"},4),
        ],
        hidden_from_viewer=[],
        admin_layout=(1, 50, True, False),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 3. Agents ─────────────────────────────────────────────────────────────
    dict(
        grid_name="Agents",
        description="Support agents — 12 agents at L1, L2, and Manager levels",
        dataset_table="planning.support_agents",
        columns=[
            ("agent_id",   "ID",       "numeric", True,  True,  False, True, "left", 1),
            ("name",       "Name",     "text",    True,  True,  False, True, None,   2),
            ("email",      "Email",    "text",    True,  True,  False, True, None,   3),
            ("level",      "Level",    "text",    True,  True,  False, True, None,   4),
            ("is_active",  "Active",   "text",    True,  True,  False, True, None,   5),
            ("created_at", "Created",  "date",    True,  False, False, False, None,  6),
        ],
        format_rules=[
            ("level","value === 'L1'",      {"backgroundColor":"#1c2b45","color":"#93c5fd"},1),
            ("level","value === 'L2'",      {"backgroundColor":"#1e1b4b","color":"#a5b4fc"},2),
            ("level","value === 'Manager'", {"backgroundColor":"#2e1065","color":"#d8b4fe"},3),
        ],
        hidden_from_viewer=["email","created_at"],
        admin_layout=(1, 25, True, False),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 4. WorkflowDefs ───────────────────────────────────────────────────────
    dict(
        grid_name="WorkflowDefs",
        description="DB-driven workflow definitions — add new workflow types by inserting rows here",
        dataset_table="planning.workflow_definitions",
        columns=[
            ("workflow_def_id","ID",            "numeric", True,  False, False, True, "left", 1),
            ("name",           "Name",          "text",    True,  True,  False, True, None,   2),
            ("description",    "Description",   "text",    False, False, True,  True, None,   3),
            ("entity_type",    "Entity Type",   "text",    True,  True,  False, True, None,   4),
            ("dataset_table",  "Dataset Table", "text",    True,  True,  False, True, None,   5),
            ("is_active",      "Active",        "text",    True,  True,  True,  True, None,   6),
            ("created_at",     "Created",       "date",    True,  False, False, True, None,   7),
        ],
        format_rules=[
            ("is_active","value === 'True'", {"backgroundColor":"#052e16","color":"#86efac"},1),
            ("is_active","value === 'False'",{"backgroundColor":"#18181b","color":"#71717a"},2),
        ],
        hidden_from_viewer=[],
        admin_layout=(1, 25, True, True),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 5. WorkflowPhases ─────────────────────────────────────────────────────
    dict(
        grid_name="WorkflowPhases",
        description="Ordered phases per workflow — edit labels, colors, and order here",
        dataset_table="planning.workflow_phases",
        columns=[
            ("phase_id",        "ID",          "numeric", True, False, False, True, "left", 1),
            ("workflow_def_id", "Workflow",    "numeric", True, True,  False, True, None,   2),
            ("phase_order",     "Order",       "numeric", True, True,  True,  True, None,   3),
            ("phase_key",       "Key",         "text",    True, True,  False, True, None,   4),
            ("phase_label",     "Label",       "text",    True, True,  True,  True, None,   5),
            ("phase_color",     "Color (hex)", "text",    True, False, True,  True, None,   6),
            ("is_terminal",     "Terminal",    "text",    True, True,  False, True, None,   7),
        ],
        format_rules=[
            ("is_terminal","value === 'True'",{"backgroundColor":"#052e16","color":"#86efac"},1),
        ],
        hidden_from_viewer=[],
        admin_layout=(1, 25, True, True),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 6. WorkflowSLARules ────────────────────────────────────────────────────
    dict(
        grid_name="WorkflowSLARules",
        description="SLA timers per phase × priority — edit timeout_minutes and demo_timeout_sec here",
        dataset_table="planning.workflow_sla_rules",
        columns=[
            ("sla_rule_id",    "ID",              "numeric", True, False, False, True, "left", 1),
            ("phase_id",       "Phase ID",        "numeric", True, True,  False, True, None,   2),
            ("priority",       "Priority",        "text",    True, True,  False, True, None,   3),
            ("timeout_minutes","Timeout (min)",   "numeric", True, True,  True,  True, None,   4),
            ("next_phase_id",  "Next Phase ID",   "numeric", True, False, False, True, None,   5),
            ("demo_timeout_sec","Demo (sec)",     "numeric", True, False, True,  True, None,   6),
        ],
        format_rules=[
            ("priority","value === 'high'",  {"backgroundColor":"#450a0a","color":"#fca5a5"},1),
            ("priority","value === 'medium'",{"backgroundColor":"#431407","color":"#fdba74"},2),
            ("priority","value === 'low'",   {"backgroundColor":"#14532d","color":"#86efac"},3),
        ],
        hidden_from_viewer=[],
        admin_layout=(1, 25, True, True),
        viewer_layout=(1, 25, True, False),
    ),

    # ── 7. WorkflowSignals ────────────────────────────────────────────────────
    dict(
        grid_name="WorkflowSignals",
        description="Available signals/actions per workflow — controls action buttons in the UI",
        dataset_table="planning.workflow_signals",
        columns=[
            ("signal_id",        "ID",              "numeric", True, False, False, True, "left", 1),
            ("workflow_def_id",  "Workflow",        "numeric", True, True,  False, True, None,   2),
            ("signal_key",       "Key",             "text",    True, True,  False, True, None,   3),
            ("signal_label",     "Label",           "text",    True, True,  True,  True, None,   4),
            ("icon",             "Icon",            "text",    True, False, True,  True, None,   5),
            ("target_phase_key", "Target Phase",    "text",    True, True,  False, True, None,   6),
            ("display_order",    "Order",           "numeric", True, False, True,  True, None,   7),
            ("requires_fields",  "Fields (JSONB)",  "text",    False,False, False, False, None,  8),
            ("allowed_phases",   "Allowed Phases",  "text",    False,False, False, True, None,   9),
        ],
        format_rules=[],
        hidden_from_viewer=["requires_fields"],
        admin_layout=(1, 25, True, True),
        viewer_layout=(1, 25, True, False),
    ),
]


def insert_grid(cur, spec):
    name = spec["grid_name"]

    # Guard
    cur.execute("SELECT grid_id FROM planning.grid_definitions WHERE grid_name=%s", (name,))
    if cur.fetchone():
        print(f"  {name}: already exists — skipped")
        return

    # 1. grid_definitions
    cur.execute("""
        INSERT INTO planning.grid_definitions
            (grid_name, description, dataset_table, pagination_enabled,
             page_size, frozen_columns, frozen_rows)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING grid_id
    """, (name, spec["description"], spec["dataset_table"],
          True, spec["admin_layout"][1], spec["admin_layout"][0], 0))
    grid_id = cur.fetchone()[0]

    # 2. grid_columns
    col_ids: dict[str, int] = {}
    for (field, header, dtype, sort, filt, editable, vis, pin, order) in spec["columns"]:
        cur.execute("""
            INSERT INTO planning.grid_columns
                (grid_id, field_name, header_name, data_type,
                 sortable, filterable, editable, visible, pinned, column_order)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING column_id
        """, (grid_id, field, header, dtype, sort, filt, editable, vis, pin, order))
        col_ids[field] = cur.fetchone()[0]

    # 3. grid_column_permissions
    hidden = set(spec.get("hidden_from_viewer", []))
    editable_fields = {f for (f,_,_,_,_,ed,_,_,_) in spec["columns"] if ed}
    for (field, *_) in spec["columns"]:
        # admin
        cur.execute("""
            INSERT INTO planning.grid_column_permissions
                (column_id, role_name, can_view, can_edit)
            VALUES (%s,'admin',True,%s)
        """, (col_ids[field], field in editable_fields))
        # viewer
        cur.execute("""
            INSERT INTO planning.grid_column_permissions
                (column_id, role_name, can_view, can_edit)
            VALUES (%s,'viewer',%s,False)
        """, (col_ids[field], field not in hidden))

    # 4. grid_format_rules
    for (field, cond, style, pri) in spec["format_rules"]:
        cur.execute("""
            INSERT INTO planning.grid_format_rules
                (column_id, condition_expression, style_json, priority)
            VALUES (%s,%s,%s,%s)
        """, (col_ids[field], cond, json.dumps(style), pri))

    # 5. grid_role_layout
    for (role, (frz, pg, exp, edt)) in [
        ("admin",  spec["admin_layout"]),
        ("viewer", spec["viewer_layout"]),
    ]:
        cur.execute("""
            INSERT INTO planning.grid_role_layout
                (grid_id, role_name, frozen_columns, page_size, allow_export, allow_edit)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (grid_id, role, frz, pg, exp, edt))

    n_cols  = len(spec["columns"])
    n_rules = len(spec["format_rules"])
    n_perms = n_cols * 2
    print(f"  {name:25s} grid_id={grid_id:<3} | {n_cols} cols | {n_perms} perms | {n_rules} rules")


def main():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Seeding AG Grid configs for 7 workflow/support grids...\n")
        for spec in GRIDS:
            insert_grid(cur, spec)
        conn.commit()
        print(f"\n[OK] {len(GRIDS)} grid configs inserted.")
    except Exception as exc:
        conn.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
