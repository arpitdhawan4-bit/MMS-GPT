import psycopg2, re

url = None
for fn in ['.env.local', '.env']:
    try:
        m = re.search(r'SUPABASE_DB_URL=(\S+)', open(fn).read())
        if m: url = m.group(1).strip(); break
    except: pass

conn = psycopg2.connect(url)
cur = conn.cursor()

print("=== attr_product_case_size COLUMNS ===")
cur.execute("""SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='planning' AND table_name='attr_product_case_size' ORDER BY ordinal_position""")
for row in cur.fetchall():
    print(" ", row)

print("\n=== attr_product_case_size SAMPLE ROWS ===")
cur.execute("SELECT * FROM planning.attr_product_case_size LIMIT 15")
for row in cur.fetchall():
    print(" ", row)

print("\n=== schema_embeddings chunks for case_size ===")
cur.execute("SELECT chunk_key, chunk_text FROM planning.schema_embeddings WHERE chunk_key LIKE '%case_size%'")
for row in cur.fetchall():
    print(f"\nKEY: {row[0]}")
    print(f"TEXT: {row[1][:1000]}")

print("\nDone.")
