"""
api/seed_dim_product_grid.py
-----------------------------
Additive migration: inserts records for the 'Products' grid into all five
planning.grid_* tables, based on the planning.dim_product schema:

  product_id, code, name, parent_id, level_num, is_leaf, created_at

Hierarchy is 3 levels:
  level_num=1  category  (Beer, Wine, Spirits, …)
  level_num=2  brand     (Summit Brewing, Canyon Vineyards, …)
  level_num=3  SKU/leaf  (individual product codes)

Does NOT drop or recreate any existing tables or touch other grids.

Run from the project root:
    python api/seed_dim_product_grid.py
"""

import os, json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]


def seed(cur):
    # ── guard: skip if already exists ────────────────────────────────────────
    cur.execute("SELECT grid_id FROM planning.grid_definitions WHERE grid_name = 'Products'")
    row = cur.fetchone()
    if row:
        print(f"  Products grid already exists (grid_id={row[0]}) -- skipping.")
        return

    # ── 1. grid_definitions ──────────────────────────────────────────────────
    cur.execute("""
        INSERT INTO planning.grid_definitions
            (grid_name, description, dataset_table,
             pagination_enabled, page_size, frozen_columns, frozen_rows)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING grid_id
    """, (
        "Products",
        "Product hierarchy (categories > brands > SKUs) -- 1,000 items, 3 levels",
        "planning.dim_product",
        True, 25, 2, 0,
    ))
    grid_id = cur.fetchone()[0]
    print(f"  grid_definitions  -> grid_id = {grid_id}")

    # ── 2. grid_columns ──────────────────────────────────────────────────────
    # Columns of planning.dim_product:
    #   product_id, code, name, parent_id, level_num, is_leaf, created_at
    #
    # editable=True  -> admins can rename a product's code or name
    # editable=False -> structural/PK fields are read-only always
    columns = [
        # (field,       header,       dtype,     sort,  filt,  edit,  vis,  pinned,   order)
        ("product_id", "ID",         "numeric", True,  True,  False, True, "left",   1),
        ("code",       "Code",       "text",    True,  True,  True,  True, "left",   2),
        ("name",       "Name",       "text",    True,  True,  True,  True, None,     3),
        ("parent_id",  "Parent ID",  "numeric", True,  False, False, True, None,     4),
        ("level_num",  "Level",      "numeric", True,  True,  False, True, None,     5),
        ("is_leaf",    "Is Leaf",    "text",    True,  True,  False, True, None,     6),
        ("created_at", "Created At", "date",    True,  False, False, True, None,     7),
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
    # admin  -> can view all; can edit code and name; created_at visible
    # viewer -> can view product_id, code, name, parent_id, level_num, is_leaf
    #           CANNOT see created_at; CANNOT edit anything
    permissions = [
        # (field,       role,      can_view, can_edit)
        ("product_id", "admin",   True,  False),   # PK — never editable
        ("code",       "admin",   True,  True),
        ("name",       "admin",   True,  True),
        ("parent_id",  "admin",   True,  False),   # hierarchy FK — read-only
        ("level_num",  "admin",   True,  False),   # computed — read-only
        ("is_leaf",    "admin",   True,  False),   # computed — read-only
        ("created_at", "admin",   True,  False),
        # viewer
        ("product_id", "viewer",  True,  False),
        ("code",       "viewer",  True,  False),
        ("name",       "viewer",  True,  False),
        ("parent_id",  "viewer",  True,  False),
        ("level_num",  "viewer",  True,  False),
        ("is_leaf",    "viewer",  True,  False),
        ("created_at", "viewer",  False, False),   # hidden from viewer
    ]
    for (field, role, view, edit) in permissions:
        cur.execute("""
            INSERT INTO planning.grid_column_permissions
                (column_id, role_name, can_view, can_edit)
            VALUES (%s, %s, %s, %s)
        """, (col_ids[field], role, view, edit))

    print(f"  grid_column_perms -> {len(permissions)} rows")

    # ── 4. grid_format_rules ─────────────────────────────────────────────────
    # Colour-code rows by hierarchy level so readers can instantly see
    # whether a row is a category, brand, or leaf SKU.
    #
    # level_num is sent as numeric so conditions use JS numeric equality.
    format_rules = [
        # field,       condition,          style,                                priority
        ("level_num", "value === 1",
         {"backgroundColor": "#451a03", "color": "#fed7aa"},    # amber  = category (L1)
         1),
        ("level_num", "value === 2",
         {"backgroundColor": "#1e3a5f", "color": "#93c5fd"},    # blue   = brand    (L2)
         2),
        ("level_num", "value === 3",
         {"backgroundColor": "#052e16", "color": "#86efac"},    # green  = SKU/leaf (L3)
         3),
    ]
    for (field, cond, style, pri) in format_rules:
        cur.execute("""
            INSERT INTO planning.grid_format_rules
                (column_id, condition_expression, style_json, priority)
            VALUES (%s, %s, %s, %s)
        """, (col_ids[field], cond, json.dumps(style), pri))

    print(f"  grid_format_rules -> {len(format_rules)} rules")

    # ── 5. grid_role_layout ───────────────────────────────────────────────────
    # admin  -> 2 frozen cols, 50 rows/page, can export and edit code/name
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
    print(f"\n  Summary: Products grid_id={grid_id} | 7 cols | 14 perms | 3 rules | 2 layouts")


def main():
    print("Connecting to database ...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Seeding Products (dim_product) grid config ...")
        seed(cur)
        conn.commit()
        print("\n[OK] Products grid config inserted successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
