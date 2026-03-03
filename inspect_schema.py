import psycopg2

# Password decoded: ShubArpit3236!@  (%21 = !, %40 = @)
conn = psycopg2.connect(
    host="db.uktiiojtustyglhcsqse.supabase.co",
    port=5432,
    dbname="postgres",
    user="postgres",
    password="ShubArpit3236!@"
)
cur = conn.cursor()

# 1. List non-system schemas
cur.execute("""
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','pg_temp_1','pg_toast_temp_1')
    ORDER BY schema_name
""")
schemas = cur.fetchall()
print("=== SCHEMAS ===")
for s in schemas:
    print(" ", s[0])

# 2. List all tables with their schema
cur.execute("""
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name
""")
tables = cur.fetchall()
print("\n=== TABLES ===")
for t in tables:
    print(f"  {t[0]}.{t[1]}  ({t[2]})")

# 3. Columns for each user table
cur.execute("""
    SELECT table_schema, table_name, column_name, ordinal_position,
           column_default, is_nullable, data_type, character_maximum_length,
           numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name, ordinal_position
""")
cols = cur.fetchall()
print("\n=== COLUMNS ===")
current = None
for c in cols:
    key = f"{c[0]}.{c[1]}"
    if key != current:
        print(f"\n  {key}")
        current = key
    nullable = "NULL" if c[5] == "YES" else "NOT NULL"
    dtype = c[6]
    if c[7]:
        dtype += f"({c[7]})"
    elif c[8]:
        dtype += f"({c[8]},{c[9]})"
    default = f" DEFAULT {c[4]}" if c[4] else ""
    print(f"    {c[2]:40s} {dtype:30s} {nullable}{default}")

# 4. Foreign keys
cur.execute("""
    SELECT
        tc.table_schema, tc.table_name, kcu.column_name,
        ccu.table_schema AS foreign_schema,
        ccu.table_name  AS foreign_table,
        ccu.column_name AS foreign_column,
        tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY tc.table_schema, tc.table_name
""")
fks = cur.fetchall()
print("\n=== FOREIGN KEYS ===")
for fk in fks:
    print(f"  {fk[0]}.{fk[1]}.{fk[2]}  ->  {fk[3]}.{fk[4]}.{fk[5]}   [{fk[6]}]")

# 5. Indexes
cur.execute("""
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY schemaname, tablename, indexname
""")
idxs = cur.fetchall()
print("\n=== INDEXES ===")
for i in idxs:
    print(f"  {i[0]}.{i[1]} | {i[2]}")
    print(f"    {i[3]}")

cur.close()
conn.close()
print("\nDone.")
