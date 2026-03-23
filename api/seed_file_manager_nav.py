"""
api/seed_file_manager_nav.py
-----------------------------
Adds the "File Manager" entry to planning.nav_items so it appears
in the sidebar automatically (alongside Ask MMS-GPT, Support Tickets, etc.).

Safe to re-run — uses ON CONFLICT (nav_id) DO NOTHING.

Run from project root:
    python api/seed_file_manager_nav.py
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]

def main():
    print("Connecting to database…")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        # Skip if already present
        cur.execute("SELECT 1 FROM planning.nav_items WHERE label = 'File Manager'")
        if cur.fetchone():
            print("[OK] 'File Manager' nav item already exists — skipped.")
        else:
            # Sync the SERIAL sequence to max existing id before inserting
            cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('planning.nav_items', 'nav_id'),
                    COALESCE((SELECT MAX(nav_id) FROM planning.nav_items), 0) + 1,
                    false
                )
            """)
            cur.execute("""
                INSERT INTO planning.nav_items
                    (parent_id, label, path, icon_key, sort_order)
                VALUES
                    (NULL, 'File Manager', '/file-manager', 'HardDrive', 5)
            """)
            conn.commit()
            print("[OK] 'File Manager' nav item inserted.")

        # Show current nav items
        cur.execute("""
            SELECT
                n.nav_id,
                COALESCE(p.label, '--') AS parent_label,
                n.label,
                n.path,
                n.icon_key,
                n.sort_order
            FROM planning.nav_items n
            LEFT JOIN planning.nav_items p ON p.nav_id = n.parent_id
            ORDER BY n.sort_order, n.nav_id
        """)
        rows = cur.fetchall()
        print(f"\n{'ID':<5} {'Parent':<18} {'Label':<22} {'Path':<28} {'Icon':<15} {'Sort'}")
        print("-" * 95)
        for nav_id, parent_label, label, path, icon_key, sort_order in rows:
            print(
                f"{nav_id:<5} {parent_label:<18} {label:<22} {(path or '--'):<28}"
                f" {(icon_key or '--'):<15} {sort_order}"
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
