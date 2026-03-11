"""
api/seed_contacts_grid.py
--------------------------
Additive migration: inserts records for the 'Contacts' grid into all five
planning.grid_* tables, based on the planning.contacts schema:

  contact_id, first_name, last_name, email, phone, company_name,
  job_title, city, state, country, created_at, updated_at

Does NOT drop or recreate any existing tables or touch the Employees grid.

Run from the project root:
    python api/seed_contacts_grid.py
"""

import os, json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]


def seed(cur):
    # ── guard: skip if already exists ────────────────────────────────────────
    cur.execute("SELECT grid_id FROM planning.grid_definitions WHERE grid_name = 'Contacts'")
    row = cur.fetchone()
    if row:
        print(f"  Contacts grid already exists (grid_id={row[0]}) -- skipping.")
        return

    # ── 1. grid_definitions ──────────────────────────────────────────────────
    cur.execute("""
        INSERT INTO planning.grid_definitions
            (grid_name, description, dataset_table,
             pagination_enabled, page_size, frozen_columns, frozen_rows)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING grid_id
    """, (
        "Contacts",
        "Business contacts CRM listing — 1,000 seeded records",
        "planning.contacts",
        True, 25, 1, 0,
    ))
    grid_id = cur.fetchone()[0]
    print(f"  grid_definitions  -> grid_id = {grid_id}")

    # ── 2. grid_columns ──────────────────────────────────────────────────────
    # Columns of planning.contacts (verified from information_schema):
    #   contact_id, first_name, last_name, email, phone, company_name,
    #   job_title, city, state, country, created_at, updated_at
    #
    # editable=True  -> 'write' (blue) cell when allow_edit is on
    # editable=False -> 'read'  (slate) cell
    columns = [
        # (field,         header,           dtype,     sort, filt, edit, vis, pinned, order)
        ("contact_id",   "ID",             "numeric", True,  True,  False, True, "left", 1),
        ("first_name",   "First Name",     "text",    True,  True,  True,  True, None,   2),
        ("last_name",    "Last Name",      "text",    True,  True,  True,  True, None,   3),
        ("email",        "Email",          "text",    True,  True,  True,  True, None,   4),
        ("phone",        "Phone",          "text",    True,  True,  True,  True, None,   5),
        ("company_name", "Company",        "text",    True,  True,  True,  True, None,   6),
        ("job_title",    "Job Title",      "text",    True,  True,  True,  True, None,   7),
        ("city",         "City",           "text",    True,  True,  True,  True, None,   8),
        ("state",        "State",          "text",    True,  True,  True,  True, None,   9),
        ("country",      "Country",        "text",    True,  True,  True,  True, None,  10),
        ("created_at",   "Created At",     "date",    True,  False, False, True, None,  11),
        ("updated_at",   "Updated At",     "date",    True,  False, False, True, None,  12),
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

    print(f"  grid_columns      -> {len(col_ids)} columns")

    # ── 3. grid_column_permissions ────────────────────────────────────────────
    # admin  -> can view + edit all editable fields; see created_at & updated_at
    # viewer -> can view names, email, company, job_title, city, state, country
    #           CANNOT edit anything, CANNOT see phone, created_at, updated_at
    permissions = [
        # (field,         role,      can_view, can_edit)
        ("first_name",   "admin",   True,  True),
        ("last_name",    "admin",   True,  True),
        ("email",        "admin",   True,  True),
        ("phone",        "admin",   True,  True),
        ("company_name", "admin",   True,  True),
        ("job_title",    "admin",   True,  True),
        ("city",         "admin",   True,  True),
        ("state",        "admin",   True,  True),
        ("country",      "admin",   True,  True),
        ("created_at",   "admin",   True,  False),
        ("updated_at",   "admin",   True,  False),
        # viewer
        ("first_name",   "viewer",  True,  False),
        ("last_name",    "viewer",  True,  False),
        ("email",        "viewer",  True,  False),
        ("phone",        "viewer",  False, False),  # hidden from viewer
        ("company_name", "viewer",  True,  False),
        ("job_title",    "viewer",  True,  False),
        ("city",         "viewer",  True,  False),
        ("state",        "viewer",  True,  False),
        ("country",      "viewer",  True,  False),
        ("created_at",   "viewer",  False, False),  # hidden from viewer
        ("updated_at",   "viewer",  False, False),  # hidden from viewer
    ]
    for (field, role, view, edit) in permissions:
        cur.execute("""
            INSERT INTO planning.grid_column_permissions
                (column_id, role_name, can_view, can_edit)
            VALUES (%s, %s, %s, %s)
        """, (col_ids[field], role, view, edit))

    print(f"  grid_column_perms -> {len(permissions)} rows")

    # ── 4. grid_format_rules ─────────────────────────────────────────────────
    # Highlight contacts whose country is 'United States' (domestic) vs other.
    # Also flag rows with missing company_name using a neutral cool tone.
    format_rules = [
        # field,        condition,                   style,                              priority
        ("country", "value === 'United States'",
         {"backgroundColor": "#14532d", "color": "#86efac"},    # green  = domestic
         1),
        ("country", "value !== 'United States' && value != null",
         {"backgroundColor": "#1e3a5f", "color": "#93c5fd"},    # blue   = international
         2),
        ("company_name", "value == null || value === ''",
         {"backgroundColor": "#3b0764", "color": "#d8b4fe"},    # purple = no company
         1),
    ]
    for (field, cond, style, pri) in format_rules:
        cur.execute("""
            INSERT INTO planning.grid_format_rules
                (column_id, condition_expression, style_json, priority)
            VALUES (%s, %s, %s, %s)
        """, (col_ids[field], cond, json.dumps(style), pri))

    print(f"  grid_format_rules -> {len(format_rules)} rules")

    # ── 5. grid_role_layout ───────────────────────────────────────────────────
    # admin  -> 2 frozen cols, 50 rows/page, can export and edit
    # viewer -> 1 frozen col,  25 rows/page, can export, read-only
    layouts = [
        # (role,    frozen, page, export, edit)
        ("admin",  2, 50, True,  True),
        ("viewer", 1, 25, True,  False),
    ]
    for (role, frz, pg, exp, edt) in layouts:
        cur.execute("""
            INSERT INTO planning.grid_role_layout
                (grid_id, role_name, frozen_columns, page_size, allow_export, allow_edit)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (grid_id, role, frz, pg, exp, edt))

    print(f"  grid_role_layout  -> {len(layouts)} role layouts")
    print(f"\n  Summary: Contacts grid_id={grid_id} | 12 cols | 22 perms | 3 rules | 2 layouts")


def main():
    print("Connecting to database ...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Seeding Contacts grid config ...")
        seed(cur)
        conn.commit()
        print("\n[OK] Contacts grid config inserted successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
