import psycopg2, os
from dotenv import load_dotenv
load_dotenv(".env")

conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
cur = conn.cursor()

print("=== planning.contacts columns ===")
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='planning' AND table_name='contacts'
    ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(r)

print()
print("=== planning.grid_definitions ===")
cur.execute("SELECT grid_id, grid_name FROM planning.grid_definitions ORDER BY 1")
for r in cur.fetchall():
    print(r)

print()
print("=== current contacts count ===")
cur.execute("SELECT COUNT(*) FROM planning.contacts")
print(cur.fetchone())

cur.close()
conn.close()
