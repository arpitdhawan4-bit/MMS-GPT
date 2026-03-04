"""Quick DB check for test debugging."""
import psycopg2, re, sys

# SUPABASE_DB_URL is the key used by api/main.py
url = None
for fn in ["c:/Users/arpit/github/MMS-GPT/.env.local", "c:/Users/arpit/github/MMS-GPT/.env"]:
    env = open(fn).read()
    m = re.search(r"SUPABASE_DB_URL=(\S+)", env)
    if m:
        url = m.group(1).strip()
        break
if not url:
    raise RuntimeError("SUPABASE_DB_URL not found in .env.local or .env")
conn = psycopg2.connect(url)
cur = conn.cursor()

# Month names
cur.execute("SELECT DISTINCT month_num, month_name FROM planning.dim_period ORDER BY month_num")
print("MONTHS:", [(r[0], r[1]) for r in cur.fetchall()])

# Industries
cur.execute("SELECT DISTINCT name FROM planning.attr_customer_industry ORDER BY name")
print("INDUSTRIES:", [r[0] for r in cur.fetchall()])

# REV_NET for Hotel/Resort check
cur.execute("""
SELECT COUNT(*) FROM planning.fact_planning f
  JOIN planning.dim_account da ON f.account_id=da.account_id
  JOIN planning.dim_year dy ON f.year_id=dy.year_id
  JOIN planning.dim_customer dc ON f.customer_id=dc.customer_id
  JOIN planning.map_customer_industry mci ON dc.customer_id=mci.customer_id
  JOIN planning.attr_customer_industry aci ON mci.industry_attr_id=aci.industry_attr_id
  WHERE da.code='REV_NET' AND dy.year_num=2025
""")
print("REV_NET 2025 (all industries):", cur.fetchone()[0])

# REV_DISC for South Jan 2026
cur.execute("""
SELECT COUNT(*) FROM planning.fact_planning f
  JOIN planning.dim_account da ON f.account_id=da.account_id
  JOIN planning.dim_year dy ON f.year_id=dy.year_id
  JOIN planning.dim_period dp ON f.period_id=dp.period_id
  WHERE da.code='REV_DISC' AND dy.year_num=2026 AND dp.month_num=1
""")
print("REV_DISC Jan 2026 (global):", cur.fetchone()[0])

# Region parent names
cur.execute("SELECT DISTINCT name FROM planning.attr_customer_region WHERE parent_id IS NOT NULL AND (SELECT COUNT(*) FROM planning.attr_customer_region c WHERE c.parent_id=planning.attr_customer_region.region_attr_id) > 0 ORDER BY name LIMIT 20")
print("REGION PARENTS:", [r[0] for r in cur.fetchall()])

# REV_DISC for South region Jan 2026
cur.execute("""
SELECT COUNT(*) FROM planning.fact_planning f
  JOIN planning.dim_account da ON f.account_id=da.account_id
  JOIN planning.dim_year dy ON f.year_id=dy.year_id
  JOIN planning.dim_period dp ON f.period_id=dp.period_id
  JOIN planning.dim_customer dc ON f.customer_id=dc.customer_id
  JOIN planning.map_customer_region mcr ON dc.customer_id=mcr.customer_id
  JOIN planning.attr_customer_region state_region ON mcr.region_attr_id=state_region.region_attr_id
  JOIN planning.attr_customer_region region_parent ON state_region.parent_id=region_parent.region_attr_id
  WHERE da.code='REV_DISC' AND dy.year_num=2026 AND dp.month_num=1
    AND region_parent.name='South'
""")
print("REV_DISC South Jan2026:", cur.fetchone()[0])

# REV_GROSS Beer in Northeast Jan 2025 using dpr triple join
cur.execute("""
SELECT COUNT(*) FROM planning.fact_planning f
  JOIN planning.dim_account da ON f.account_id=da.account_id
  JOIN planning.dim_year dy ON f.year_id=dy.year_id
  JOIN planning.dim_period dp ON f.period_id=dp.period_id
  JOIN planning.dim_customer dc ON f.customer_id=dc.customer_id
  JOIN planning.map_customer_region mcr ON dc.customer_id=mcr.customer_id
  JOIN planning.attr_customer_region state_region ON mcr.region_attr_id=state_region.region_attr_id
  JOIN planning.attr_customer_region region_parent ON state_region.parent_id=region_parent.region_attr_id
  JOIN planning.dim_product dpr ON f.product_id=dpr.product_id
  JOIN planning.dim_product dpr_brand ON dpr.parent_id=dpr_brand.product_id
  JOIN planning.dim_product dpr_cat ON dpr_brand.parent_id=dpr_cat.product_id
  WHERE da.code='REV_GROSS' AND dy.year_num=2025 AND dp.month_num=1
    AND region_parent.name='Northeast' AND dpr_cat.name='Beer'
""")
print("Beer+NE+REV_GROSS+Jan2025:", cur.fetchone()[0])
