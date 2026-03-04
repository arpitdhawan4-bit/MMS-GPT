import psycopg2, os
from dotenv import load_dotenv
load_dotenv(".env.local"); load_dotenv(".env")
conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
cur = conn.cursor()

queries = [
    ("dim_customer",
     "SELECT c.customer_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.dim_customer c LEFT JOIN planning.dim_customer p ON c.parent_id=p.customer_id ORDER BY c.parent_id NULLS FIRST,c.customer_id"),
    ("dim_product",
     "SELECT c.product_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.dim_product c LEFT JOIN planning.dim_product p ON c.parent_id=p.product_id ORDER BY c.parent_id NULLS FIRST,c.product_id LIMIT 40"),
    ("dim_account",
     "SELECT c.account_id,c.code,c.name,c.parent_id,c.is_leaf,p.code FROM planning.dim_account c LEFT JOIN planning.dim_account p ON c.parent_id=p.account_id ORDER BY c.parent_id NULLS FIRST,c.account_id"),
    ("attr_customer_channel",
     "SELECT c.channel_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_customer_channel c LEFT JOIN planning.attr_customer_channel p ON c.parent_id=p.channel_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_customer_industry",
     "SELECT c.industry_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_customer_industry c LEFT JOIN planning.attr_customer_industry p ON c.parent_id=p.industry_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_product_packaging",
     "SELECT c.packaging_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_product_packaging c LEFT JOIN planning.attr_product_packaging p ON c.parent_id=p.packaging_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_product_case_size",
     "SELECT c.case_size_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_product_case_size c LEFT JOIN planning.attr_product_case_size p ON c.parent_id=p.case_size_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_product_process",
     "SELECT c.process_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_product_process c LEFT JOIN planning.attr_product_process p ON c.parent_id=p.process_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_account_gaap",
     "SELECT c.gaap_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_account_gaap c LEFT JOIN planning.attr_account_gaap p ON c.parent_id=p.gaap_attr_id ORDER BY c.parent_id NULLS FIRST"),
    ("attr_account_cashflow",
     "SELECT c.cashflow_attr_id,c.code,c.name,c.parent_id,c.is_leaf,p.name FROM planning.attr_account_cashflow c LEFT JOIN planning.attr_account_cashflow p ON c.parent_id=p.cashflow_attr_id ORDER BY c.parent_id NULLS FIRST"),
]

for name, sql in queries:
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    cur.execute(sql)
    for row in cur.fetchall():
        print(row)

cur.close()
conn.close()
