"""
api/create_nav_items.py
-----------------------
DDL + seed script: creates and populates planning.nav_items.

This table drives the left-hand navigation sidebar.
Each row is a nav entry; parent_id = NULL means it is a top-level item.
Group nodes (e.g. "Support Tickets") have path = NULL.

Run from project root:
    python api/create_nav_items.py

Safe to re-run — uses CREATE TABLE IF NOT EXISTS and INSERT … ON CONFLICT DO NOTHING.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]

# ── DDL ─────────────────────────────────────────────────────────────────────
DDL = """
CREATE TABLE IF NOT EXISTS planning.nav_items (
    nav_id      SERIAL        PRIMARY KEY,
    parent_id   INT           REFERENCES planning.nav_items(nav_id) ON DELETE CASCADE,
    label       VARCHAR(150)  NOT NULL,
    path        VARCHAR(300),             -- NULL for group / section nodes
    icon_key    VARCHAR(60),              -- Lucide icon component name (e.g. 'Home', 'Ticket')
    sort_order  INT           NOT NULL DEFAULT 0,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_items_parent ON planning.nav_items (parent_id);
"""

# ── Seed ─────────────────────────────────────────────────────────────────────
# Insert parents before children (self-referencing FK).
# ON CONFLICT (nav_id) DO NOTHING makes this safe to re-run.

SEED = """
-- Top-level items (parent_id = NULL)
INSERT INTO planning.nav_items
    (nav_id, parent_id, label, path, icon_key, sort_order)
VALUES
    (1, NULL, 'Ask MMS-GPT',     '/',    'Home',      1),
    (2, NULL, 'Support Tickets', NULL,   'Ticket',    2),
    (3, NULL, 'Data & Reports',  NULL,   'FolderTree', 3)
ON CONFLICT (nav_id) DO NOTHING;

-- Children of "Support Tickets" (parent_id = 2)
INSERT INTO planning.nav_items
    (nav_id, parent_id, label, path, icon_key, sort_order)
VALUES
    (4, 2, 'Ticket Dashboard',  '/workflow',         'LayoutDashboard', 1),
    (5, 2, 'Workflow Monitor',  '/workflow/monitor', 'Monitor',         2)
ON CONFLICT (nav_id) DO NOTHING;

-- Children of "Data & Reports" (parent_id = 3)
INSERT INTO planning.nav_items
    (nav_id, parent_id, label, path, icon_key, sort_order)
VALUES
    (6, 3, 'AG Grid Testing', '/ag-grid-testing', 'FlaskConical', 1)
ON CONFLICT (nav_id) DO NOTHING;
"""


def main():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        print("Creating planning.nav_items table (idempotent)...")
        cur.execute(DDL)

        print("Seeding nav items...")
        cur.execute(SEED)

        conn.commit()
        print("[OK] planning.nav_items created and seeded.")
        print()

        # Show what was inserted
        cur.execute("""
            SELECT
                n.nav_id,
                n.parent_id,
            COALESCE(p.label, '--') AS parent_label,
                n.label,
                n.path,
                n.icon_key,
                n.sort_order,
                n.is_active
            FROM planning.nav_items n
            LEFT JOIN planning.nav_items p ON p.nav_id = n.parent_id
            ORDER BY n.sort_order, n.parent_id NULLS FIRST, n.nav_id
        """)
        rows = cur.fetchall()
        print(f"{'ID':<5} {'Parent':<16} {'Label':<22} {'Path':<28} {'Icon':<20} {'Order':<7} {'Active'}")
        print("-" * 105)
        for row in rows:
            nav_id, parent_id, parent_label, label, path, icon_key, sort_order, is_active = row
            indent = "  +-- " if parent_id else ""
            print(
                f"{nav_id:<5} {parent_label:<16} {indent}{label:<22} {(path or '--'):<28}"
                f" {(icon_key or '--'):<20} {sort_order:<7} {is_active}"
            )

    except Exception as exc:
        conn.rollback()
        print(f"[ERROR] {exc}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
