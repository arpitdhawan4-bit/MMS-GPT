"""
api/create_grid_config.py
--------------------------
One-time migration: creates the 5 grid-config tables in the planning schema
and seeds them with data for the planning.employees AG Grid Testing page.

Run from the project root:
    python api/create_grid_config.py

The script is idempotent — re-running it will drop and recreate the tables.
"""

import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]


# ── DDL ───────────────────────────────────────────────────────────────────────
DDL = """
-- ── Drop in reverse FK order ────────────────────────────────────────────────
DROP TABLE IF EXISTS planning.grid_format_rules       CASCADE;
DROP TABLE IF EXISTS planning.grid_column_permissions CASCADE;
DROP TABLE IF EXISTS planning.grid_role_layout        CASCADE;
DROP TABLE IF EXISTS planning.grid_columns            CASCADE;
DROP TABLE IF EXISTS planning.grid_definitions        CASCADE;

-- ── 1. grid_definitions ─────────────────────────────────────────────────────
CREATE TABLE planning.grid_definitions (
    grid_id            SERIAL PRIMARY KEY,
    grid_name          VARCHAR(100) NOT NULL,
    description        TEXT,
    dataset_table      VARCHAR(100),
    pagination_enabled BOOLEAN   DEFAULT TRUE,
    page_size          INTEGER   DEFAULT 20,
    frozen_columns     INTEGER   DEFAULT 0,
    frozen_rows        INTEGER   DEFAULT 0,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. grid_columns ──────────────────────────────────────────────────────────
CREATE TABLE planning.grid_columns (
    column_id    SERIAL PRIMARY KEY,
    grid_id      INTEGER REFERENCES planning.grid_definitions(grid_id) ON DELETE CASCADE,
    field_name   VARCHAR(100) NOT NULL,
    header_name  VARCHAR(100),
    data_type    VARCHAR(50),   -- 'text' | 'numeric' | 'date'
    sortable     BOOLEAN DEFAULT TRUE,
    filterable   BOOLEAN DEFAULT TRUE,
    editable     BOOLEAN DEFAULT FALSE,
    visible      BOOLEAN DEFAULT TRUE,
    pinned       VARCHAR(10),   -- 'left' | 'right' | NULL
    column_order INTEGER
);

-- ── 3. grid_column_permissions ───────────────────────────────────────────────
CREATE TABLE planning.grid_column_permissions (
    permission_id SERIAL PRIMARY KEY,
    column_id     INTEGER REFERENCES planning.grid_columns(column_id) ON DELETE CASCADE,
    role_name     VARCHAR(50),
    can_view      BOOLEAN DEFAULT TRUE,
    can_edit      BOOLEAN DEFAULT FALSE
);

-- ── 4. grid_format_rules ─────────────────────────────────────────────────────
CREATE TABLE planning.grid_format_rules (
    rule_id              SERIAL PRIMARY KEY,
    column_id            INTEGER REFERENCES planning.grid_columns(column_id) ON DELETE CASCADE,
    condition_expression TEXT,   -- e.g.  "value > 100000"
    style_json           JSONB,
    priority             INTEGER DEFAULT 1
);

-- ── 5. grid_role_layout ──────────────────────────────────────────────────────
CREATE TABLE planning.grid_role_layout (
    layout_id      SERIAL PRIMARY KEY,
    grid_id        INTEGER REFERENCES planning.grid_definitions(grid_id) ON DELETE CASCADE,
    role_name      VARCHAR(50),
    frozen_columns INTEGER,
    page_size      INTEGER,
    allow_export   BOOLEAN DEFAULT TRUE,
    allow_edit     BOOLEAN DEFAULT FALSE
);
"""


# ── Seed data ─────────────────────────────────────────────────────────────────
def seed(cur):
    # ── grid_definitions ─────────────────────────────────────────────────────
    cur.execute("""
        INSERT INTO planning.grid_definitions
            (grid_name, description, dataset_table,
             pagination_enabled, page_size, frozen_columns, frozen_rows)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING grid_id
    """, (
        "Employees",
        "HR employee listing — AG Grid configuration demo",
        "planning.employees",
        True, 25, 1, 0
    ))
    grid_id = cur.fetchone()[0]
    print(f"  grid_definitions -> grid_id = {grid_id}")

    # ── grid_columns ─────────────────────────────────────────────────────────
    # Actual columns of planning.employees (verified from information_schema):
    #   id, employee_code, name, department, role, age, joining_date,
    #   salary, manager_id, location, status, created_at
    #
    # Columns marked editable=True are 'write' cells; others are 'read' cells.
    # visible=False  → hidden from ALL roles
    # (role-specific hiding is done via grid_column_permissions can_view=False)
    columns = [
        # (field_name,     header_name,     data_type, sort,  filt,  edit,  vis,   pinned,  order)
        ("id",             "ID",            "numeric", True,  True,  False, True,  "left",  1),
        ("employee_code",  "Code",          "text",    True,  True,  False, True,  None,    2),
        ("name",           "Name",          "text",    True,  True,  False, True,  None,    3),
        ("department",     "Department",    "text",    True,  True,  True,  True,  None,    4),
        ("role",           "Role",          "text",    True,  True,  True,  True,  None,    5),
        ("age",            "Age",           "numeric", True,  True,  False, True,  None,    6),
        ("joining_date",   "Joining Date",  "date",    True,  True,  False, True,  None,    7),
        ("salary",         "Salary",        "numeric", True,  True,  True,  True,  None,    8),
        ("manager_id",     "Manager ID",    "numeric", True,  False, False, True,  None,    9),
        ("location",       "Location",      "text",    True,  True,  True,  True,  None,    10),
        ("status",         "Status",        "text",    True,  True,  True,  True,  None,    11),
        ("created_at",     "Created At",    "date",    True,  False, False, True,  None,    12),
    ]

    col_ids: dict[str, int] = {}
    for (field, header, dtype, sort, filt, edit, vis, pin, order) in columns:
        cur.execute("""
            INSERT INTO planning.grid_columns
                (grid_id, field_name, header_name, data_type,
                 sortable, filterable, editable, visible, pinned, column_order)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING column_id
        """, (grid_id, field, header, dtype, sort, filt, edit, vis, pin, order))
        col_ids[field] = cur.fetchone()[0]

    print(f"  grid_columns -> {len(col_ids)} columns inserted")

    # ── grid_column_permissions ───────────────────────────────────────────────
    # admin  → can view + edit salary, department, role, location, status
    #          can view (not edit) manager_id and created_at
    # viewer → can view salary but not edit
    #          CANNOT see manager_id, created_at, or status (internal fields)
    permissions = [
        # (field_name,    role_name,  can_view, can_edit)
        ("salary",        "admin",    True,     True),
        ("department",    "admin",    True,     True),
        ("role",          "admin",    True,     True),
        ("location",      "admin",    True,     True),
        ("status",        "admin",    True,     True),
        ("manager_id",    "admin",    True,     False),
        ("created_at",    "admin",    True,     False),
        # viewer restrictions
        ("salary",        "viewer",   True,     False),
        ("department",    "viewer",   True,     False),
        ("role",          "viewer",   True,     False),
        ("location",      "viewer",   True,     False),
        ("status",        "viewer",   False,    False),   # hidden from viewer
        ("manager_id",    "viewer",   False,    False),   # hidden from viewer
        ("created_at",    "viewer",   False,    False),   # hidden from viewer
    ]
    for (field, role, view, edit) in permissions:
        cur.execute("""
            INSERT INTO planning.grid_column_permissions
                (column_id, role_name, can_view, can_edit)
            VALUES (%s, %s, %s, %s)
        """, (col_ids[field], role, view, edit))

    print(f"  grid_column_permissions -> {len(permissions)} rows inserted")

    # ── grid_format_rules ─────────────────────────────────────────────────────
    # Salary: 3 colour tiers
    salary_rules = [
        # (condition_expression, style_json, priority)
        ("value > 100000",
         {"backgroundColor": "#14532d", "color": "#86efac"},   # green  > $100k
         1),
        ("value > 70000",
         {"backgroundColor": "#713f12", "color": "#fde68a"},   # amber  $70k-$100k
         2),
        ("value <= 70000",
         {"backgroundColor": "#7f1d1d", "color": "#fca5a5"},   # red    <= $70k
         3),
    ]
    for (cond, style, pri) in salary_rules:
        cur.execute("""
            INSERT INTO planning.grid_format_rules
                (column_id, condition_expression, style_json, priority)
            VALUES (%s, %s, %s, %s)
        """, (col_ids["salary"], cond, json.dumps(style), pri))

    # Age: colour-code seniority
    age_rules = [
        ("value >= 50",
         {"backgroundColor": "#312e81", "color": "#a5b4fc"},   # indigo  senior
         1),
        ("value < 30",
         {"backgroundColor": "#134e4a", "color": "#5eead4"},   # teal    junior
         2),
    ]
    for (cond, style, pri) in age_rules:
        cur.execute("""
            INSERT INTO planning.grid_format_rules
                (column_id, condition_expression, style_json, priority)
            VALUES (%s, %s, %s, %s)
        """, (col_ids["age"], cond, json.dumps(style), pri))

    print(f"  grid_format_rules -> {len(salary_rules)} salary + {len(age_rules)} age rules inserted")

    # ── grid_role_layout ──────────────────────────────────────────────────────
    # admin  → 2 frozen cols, 50 rows/page, can export and edit
    # viewer → 1 frozen col,  25 rows/page, can export but NOT edit
    layouts = [
        # (role_name, frozen_columns, page_size, allow_export, allow_edit)
        ("admin",  2, 50, True,  True),
        ("viewer", 1, 25, True,  False),
    ]
    for (role, frz, pg, exp, edt) in layouts:
        cur.execute("""
            INSERT INTO planning.grid_role_layout
                (grid_id, role_name, frozen_columns, page_size, allow_export, allow_edit)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (grid_id, role, frz, pg, exp, edt))

    print(f"  grid_role_layout -> {len(layouts)} role layouts inserted")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Connecting to database …")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("Running DDL (drop + recreate tables) …")
        cur.execute(DDL)

        print("Seeding data …")
        seed(cur)

        conn.commit()
        print("\n[OK] Grid config tables created and seeded successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
