"""
embed_schema.py
---------------
Chunks the planning schema into semantic pieces, generates OpenAI embeddings
(text-embedding-3-small, 1536 dims), and upserts them into
planning.schema_embeddings for RAG retrieval.

Usage:
    python embed_schema.py
"""

import os
import psycopg2
from openai import OpenAI
from dotenv import load_dotenv

# Load keys from .env.local (takes priority over .env)
load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

client = OpenAI(api_key=OPENAI_API_KEY)

# ---------------------------------------------------------------------------
# Schema chunks — each chunk is a self-contained piece of schema knowledge
# ---------------------------------------------------------------------------
CHUNKS = [
    # ── OVERVIEW ────────────────────────────────────────────────────────────
    (
        "overview",
        """The database uses a star schema in the 'planning' PostgreSQL schema.
The central fact table is planning.fact_planning which holds 100,000 rows of numeric measures
(a 'value' column) sliced by scenario, year, period, customer, product, and account dimensions.
All dimension tables are in the 'planning' schema. Never use the public schema."""
    ),

    # ── FACT TABLE ───────────────────────────────────────────────────────────
    (
        "fact_planning",
        """Table: planning.fact_planning
Purpose: The main fact/measure table. Each row is one numeric value for a specific
combination of scenario, year, period, customer, product, and account.
Columns:
  fact_id      BIGINT  PK
  scenario_id  BIGINT  FK -> planning.dim_scenario.scenario_id
  year_id      BIGINT  FK -> planning.dim_year.year_id
  period_id    BIGINT  FK -> planning.dim_period.period_id
  customer_id  BIGINT  FK -> planning.dim_customer.customer_id
  product_id   BIGINT  FK -> planning.dim_product.product_id
  account_id   BIGINT  FK -> planning.dim_account.account_id
  value        NUMERIC  -- the measure (e.g. dollar amount, units)
  created_at   TIMESTAMPTZ"""
    ),

    # ── DIM_ACCOUNT ──────────────────────────────────────────────────────────
    (
        "dim_account",
        """Table: planning.dim_account
Purpose: Financial account hierarchy (P&L line items).
Columns:
  account_id  BIGINT PK
  code        VARCHAR  -- e.g. 'REV_GROSS', 'REV_NET', 'COGS_MAT'
  name        VARCHAR  -- e.g. 'Gross Sales', 'Net Sales', 'Materials'
  parent_id   BIGINT   -- self-referencing FK for hierarchy
  level_num   INTEGER  -- 1=top, 2=detail, etc.
  is_leaf     BOOLEAN  -- TRUE if a leaf node (no children)
  created_at  TIMESTAMPTZ
Known accounts (leaf nodes):
  REV_GROSS = Gross Sales
  REV_DISC  = Discounts
  REV_NET   = Net Sales
  COGS_MAT  = Materials (COGS)
  COGS_FRT  = Freight (COGS)
Use is_leaf = TRUE when querying specific account values unless rolling up."""
    ),

    # ── DIM_CUSTOMER ─────────────────────────────────────────────────────────
    (
        "dim_customer",
        """Table: planning.dim_customer
Purpose: Customer hierarchy (Groups → Individual customers).
Columns:
  customer_id  BIGINT PK
  code         VARCHAR  -- e.g. 'C_GRP0001'
  name         VARCHAR  -- e.g. 'Anderson Beverage Group'
  parent_id    BIGINT   -- self-referencing for hierarchy
  level_num    INTEGER
  is_leaf      BOOLEAN
  created_at   TIMESTAMPTZ
Level 1 = Customer Groups (parent_id IS NULL).
Level 2+ = Individual customers (is_leaf = TRUE).
To query a specific customer, join on dim_customer.name or dim_customer.code."""
    ),

    # ── DIM_PRODUCT ──────────────────────────────────────────────────────────
    (
        "dim_product",
        """Table: planning.dim_product
Purpose: Product hierarchy (Categories → Brands → SKUs).
Columns:
  product_id  BIGINT PK
  code        VARCHAR  -- e.g. 'P_CAT_BEER', 'P_BR0011'
  name        VARCHAR  -- e.g. 'Beer', 'Harbor Brewing'
  parent_id   BIGINT   -- hierarchy
  level_num   INTEGER
  is_leaf     BOOLEAN
  created_at  TIMESTAMPTZ
Level 1 categories: Beer, Wine, Spirits (is_leaf=FALSE).
Level 2 = Brands (e.g. Harbor Brewing, Prairie Distillery).
Level 3+ = individual SKUs (is_leaf=TRUE)."""
    ),

    # ── DIM_PERIOD ───────────────────────────────────────────────────────────
    (
        "dim_period",
        """Table: planning.dim_period
Purpose: Monthly time periods with quarter info.
Columns:
  period_id    BIGINT PK
  code         VARCHAR  -- 'P01'..'P12'
  name         VARCHAR  -- 'Jan'..'Dec'
  month_num    INTEGER  -- 1..12
  month_name   VARCHAR  -- 'January'..'December'
  quarter_num  INTEGER  -- 1..4
  quarter_name VARCHAR  -- 'Q1'..'Q4'
  period_sort  INTEGER
To filter by month name: WHERE dp.month_name = 'January'
To filter by quarter:    WHERE dp.quarter_name = 'Q1'
To filter by month num:  WHERE dp.month_num = 1"""
    ),

    # ── DIM_YEAR ─────────────────────────────────────────────────────────────
    (
        "dim_year",
        """Table: planning.dim_year
Purpose: Fiscal/calendar years.
Columns:
  year_id    BIGINT PK
  code       VARCHAR  -- 'Y2023'..'Y2027'
  year_num   INTEGER  -- 2023..2027
  name       VARCHAR
  sort_order INTEGER
Available years: 2023, 2024, 2025, 2026, 2027.
To filter by year: WHERE dy.year_num = 2026"""
    ),

    # ── DIM_SCENARIO ─────────────────────────────────────────────────────────
    (
        "dim_scenario",
        """Table: planning.dim_scenario
Purpose: Planning scenarios for version control.
Columns:
  scenario_id  BIGINT PK
  code         VARCHAR  -- 'ACTUAL', 'BUDGET', 'PLAN1', 'PLAN2', 'PLAN3'
  name         VARCHAR  -- 'Actual', 'Budget', 'Plan 1', 'Plan 2', 'Plan 3'
  sort_order   INTEGER
  is_active    BOOLEAN
Default scenario for 'actual' or 'sales' questions: WHERE ds.code = 'ACTUAL'
Default for 'budget': WHERE ds.code = 'BUDGET'"""
    ),

    # ── ATTRIBUTE: CHANNEL ───────────────────────────────────────────────────
    (
        "attr_customer_channel",
        """Table: planning.attr_customer_channel
Purpose: Sales channel hierarchy for customers.
Columns: channel_attr_id, code, name, parent_id, level_num, is_leaf
Values: CH_ALL (root), CH_ON (On-Premise), CH_OFF (Off-Premise), CH_ECOM (E-Commerce)
        CH_ON_BARS (Bars & Nightclubs), and more leaf nodes.
Bridge: planning.map_customer_channel (customer_id, channel_attr_id)
To filter customers by channel:
  JOIN planning.map_customer_channel mcc ON dc.customer_id = mcc.customer_id
  JOIN planning.attr_customer_channel acc ON mcc.channel_attr_id = acc.channel_attr_id"""
    ),

    # ── ATTRIBUTE: REGION ────────────────────────────────────────────────────
    (
        "attr_customer_region",
        """Table: planning.attr_customer_region
Purpose: Geographic region hierarchy for customers. 3-level parent-child tree.
Columns: region_attr_id (PK), code, name, parent_id (FK -> self), level_num, is_leaf
CRITICAL HIERARCHY (parent_id is a self-referencing FK):
  Level 1 (root):    United States (region_attr_id=1, is_leaf=FALSE, parent_id=NULL)
  Level 2 (regions): Northeast (id=5), West (id=2), Midwest (id=3), South (id=4) — all is_leaf=FALSE
  Level 3 (states):  Connecticut,Maine,Massachusetts,NH,NJ,NY,PA,RI,Vermont -> Northeast
                     Alaska,Arizona,California,Colorado,Hawaii,Idaho,Montana,Nevada,NM,Oregon,Utah,Washington,Wyoming -> West
                     Illinois,Indiana,Iowa,Kansas,Michigan,Minnesota,Missouri,Nebraska,ND,Ohio,SD,Wisconsin -> Midwest
                     Alabama,Arkansas,Delaware,DC,Florida,Georgia,Kentucky,Louisiana,Maryland,Mississippi,NC,Oklahoma,SC,Tennessee,Texas,Virginia,WV -> South
                     All state rows have is_leaf=TRUE
Bridge: planning.map_customer_region (customer_id, region_attr_id)
IMPORTANT: planning.map_customer_region maps customers to LEAF nodes (individual states) ONLY.
To filter by a region like 'Northeast', you MUST join attr_customer_region twice:
  once for the leaf (state) and once for the parent (region), matching via parent_id.
  DO NOT filter acr.is_leaf=TRUE when also filtering acr.name = 'Northeast' — Northeast is not a leaf."""
    ),

    # ── ATTRIBUTE: INDUSTRY ──────────────────────────────────────────────────
    (
        "attr_customer_industry",
        """Table: planning.attr_customer_industry
Purpose: Industry classification for customers.
Columns: industry_attr_id, code, name, parent_id, level_num, is_leaf
Values: IND_ALL (root), IND_GROC (Grocery), IND_CONV (Convenience),
        IND_LIQR (Liquor Retail), IND_BAR (Bar/Nightclub)
Bridge: planning.map_customer_industry (customer_id, industry_attr_id)"""
    ),

    # ── ATTRIBUTE: PACKAGING ─────────────────────────────────────────────────
    (
        "attr_product_packaging",
        """Table: planning.attr_product_packaging
Purpose: Packaging type hierarchy for products.
Columns: packaging_attr_id, code, name, parent_id, level_num, is_leaf
Values: PKG_ALL (root), PKG_BOTTLE, PKG_CAN, PKG_KEG, PKG_BOX
Bridge: planning.map_product_packaging (product_id, packaging_attr_id)
To filter products by packaging:
  JOIN planning.map_product_packaging mpp ON dp.product_id = mpp.product_id
  JOIN planning.attr_product_packaging app ON mpp.packaging_attr_id = app.packaging_attr_id"""
    ),

    # ── ATTRIBUTE: PROCESS ───────────────────────────────────────────────────
    (
        "attr_product_process",
        """Table: planning.attr_product_process
Purpose: Production process hierarchy for products.
Columns: process_attr_id, code, name, parent_id, level_num, is_leaf
Values: PRC_ALL (root), PRC_DIST (Distilled), PRC_FERM (Fermented),
        PRC_BLEND (Blended/Infused)
Bridge: planning.map_product_process (product_id, process_attr_id)"""
    ),

    # ── ATTRIBUTE: CASE SIZE ─────────────────────────────────────────────────
    (
        "attr_product_case_size",
        """Table: planning.attr_product_case_size
Purpose: Case/pack size hierarchy for products.
Columns: case_size_attr_id, code, name, parent_id, level_num, is_leaf
Values: CS_ALL (root), CS_PACK (Packs), CS_BTLCASE (Bottle Case),
        CS_PACK_6 (6-pack), CS_PACK_12 (12-pack)
Bridge: planning.map_product_case_size (product_id, case_size_attr_id)"""
    ),

    # ── ATTRIBUTE: GAAP ──────────────────────────────────────────────────────
    (
        "attr_account_gaap",
        """Table: planning.attr_account_gaap
Purpose: GAAP category classification for accounts.
Columns: gaap_attr_id, code, name, parent_id, level_num, is_leaf
Values: GAAP_ALL (root), GAAP_IS (Income Statement), GAAP_BS (Balance Sheet)
Bridge: planning.map_account_gaap (account_id, gaap_attr_id)"""
    ),

    # ── ATTRIBUTE: CASHFLOW ──────────────────────────────────────────────────
    (
        "attr_account_cashflow",
        """Table: planning.attr_account_cashflow
Purpose: Cash flow classification for accounts.
Columns: cashflow_attr_id, code, name, parent_id, level_num, is_leaf
Values: CF_ALL (root), CF_OP (Operating), CF_INV (Investing), CF_FIN (Financing)
Bridge: planning.map_account_cashflow (account_id, cashflow_attr_id)"""
    ),

    # ── JOIN PATTERNS ────────────────────────────────────────────────────────
    (
        "join_pattern_basic",
        """Standard SQL join pattern for querying fact_planning with all dimensions:
SELECT
    ds.name  AS scenario,
    dy.year_num AS year,
    dp2.name AS period,
    dc.name  AS customer,
    dpr.name AS product,
    da.name  AS account,
    SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario ds  ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy  ON f.year_id     = dy.year_id
JOIN planning.dim_period   dp2 ON f.period_id   = dp2.period_id
JOIN planning.dim_customer dc  ON f.customer_id = dc.customer_id
JOIN planning.dim_product  dpr ON f.product_id  = dpr.product_id
JOIN planning.dim_account  da  ON f.account_id  = da.account_id
WHERE ds.code = 'ACTUAL'
GROUP BY 1,2,3,4,5,6
ORDER BY 2,3;"""
    ),

    (
        "join_pattern_sales_by_month",
        """To get total sales (Gross Sales or Net Sales) by month for a given year:
SELECT
    dp.month_name,
    dp.quarter_name,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy ON f.year_id = dy.year_id
JOIN planning.dim_period   dp ON f.period_id = dp.period_id
JOIN planning.dim_account  da ON f.account_id = da.account_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026          -- substitute year
  AND da.code = 'REV_GROSS'       -- or REV_NET for net sales
GROUP BY dp.period_sort, dp.month_name, dp.quarter_name
ORDER BY dp.period_sort;"""
    ),

    (
        "join_pattern_sales_specific_month",
        """To get sales for a specific month (e.g. January 2026):
SELECT
    dy.year_num,
    dp.month_name,
    da.name AS account,
    SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario ds ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy ON f.year_id = dy.year_id
JOIN planning.dim_period   dp ON f.period_id = dp.period_id
JOIN planning.dim_account  da ON f.account_id = da.account_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026
  AND dp.month_name = 'January'
  AND da.code IN ('REV_GROSS', 'REV_NET')
GROUP BY dy.year_num, dp.month_name, da.name
ORDER BY da.name;"""
    ),

    (
        "join_pattern_by_customer",
        """To get sales by customer:
SELECT
    dc.name AS customer,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy ON f.year_id = dy.year_id
JOIN planning.dim_customer dc ON f.customer_id = dc.customer_id
JOIN planning.dim_account  da ON f.account_id = da.account_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
GROUP BY dc.name
ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_by_product",
        """To get sales by product or product category:
SELECT
    dpr.name AS product,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds  ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy  ON f.year_id = dy.year_id
JOIN planning.dim_product  dpr ON f.product_id = dpr.product_id
JOIN planning.dim_account  da  ON f.account_id = da.account_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
GROUP BY dpr.name
ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_actual_vs_budget",
        """To compare Actual vs Budget:
SELECT
    ds.name AS scenario,
    SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario ds ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy ON f.year_id = dy.year_id
JOIN planning.dim_account  da ON f.account_id = da.account_id
WHERE ds.code IN ('ACTUAL', 'BUDGET')
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
GROUP BY ds.name
ORDER BY ds.sort_order;"""
    ),

    (
        "join_pattern_by_region",
        """To get sales broken down by leaf-level region (individual states):
SELECT
    acr.name AS state,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds  ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy  ON f.year_id = dy.year_id
JOIN planning.dim_customer         dc  ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da  ON f.account_id = da.account_id
JOIN planning.map_customer_region  mcr ON dc.customer_id = mcr.customer_id
JOIN planning.attr_customer_region acr ON mcr.region_attr_id = acr.region_attr_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
  AND acr.is_leaf = TRUE   -- map_customer_region links to leaf (state-level) rows only
GROUP BY acr.name
ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_by_region_hierarchy",
        """CRITICAL: To filter sales for a PARENT region (e.g. Northeast, West, Midwest, South),
you MUST double-join attr_customer_region because map_customer_region maps to LEAF NODES (states) only.
Parent regions like Northeast/West/Midwest/South have is_leaf=FALSE and appear in attr_customer_region,
but NOT in map_customer_region rows (customers are always linked to state rows, not region rows).

PATTERN 1 — Simple parent join (use when filtering by a specific named parent region):
SELECT
    region_parent.name AS region,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds           ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy           ON f.year_id = dy.year_id
JOIN planning.dim_period           dp           ON f.period_id = dp.period_id
JOIN planning.dim_customer         dc           ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da           ON f.account_id = da.account_id
JOIN planning.map_customer_region  mcr          ON dc.customer_id = mcr.customer_id
JOIN planning.attr_customer_region state_region ON mcr.region_attr_id = state_region.region_attr_id  -- leaf (state)
JOIN planning.attr_customer_region region_parent ON state_region.parent_id = region_parent.region_attr_id  -- parent (Northeast etc)
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2025
  AND dp.month_name = 'January'
  AND da.code = 'REV_GROSS'
  AND region_parent.name = 'Northeast'   -- filter on PARENT region name
GROUP BY region_parent.name
ORDER BY total_sales DESC;

PATTERN 2 — Recursive CTE (use when region depth is unknown or you want all descendants):
WITH region_tree AS (
    SELECT region_attr_id FROM planning.attr_customer_region WHERE name = 'Northeast'
    UNION ALL
    SELECT child.region_attr_id
    FROM planning.attr_customer_region child
    JOIN region_tree rt ON child.parent_id = rt.region_attr_id
)
SELECT SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds  ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy  ON f.year_id = dy.year_id
JOIN planning.dim_customer         dc  ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da  ON f.account_id = da.account_id
JOIN planning.map_customer_region  mcr ON dc.customer_id = mcr.customer_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2025
  AND da.code = 'REV_GROSS'
  AND mcr.region_attr_id IN (SELECT region_attr_id FROM region_tree);

NEVER do: acr.name = 'Northeast' AND acr.is_leaf = TRUE  -- Northeast is NOT a leaf, this returns 0 rows."""
    ),

    (
        "join_pattern_by_channel",
        """To get sales by sales channel:
SELECT
    acc.name AS channel,
    SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds  ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy  ON f.year_id = dy.year_id
JOIN planning.dim_customer         dc  ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da  ON f.account_id = da.account_id
JOIN planning.map_customer_channel mcc ON dc.customer_id = mcc.customer_id
JOIN planning.attr_customer_channel acc ON mcc.channel_attr_id = acc.channel_attr_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
  AND acc.is_leaf = TRUE
GROUP BY acc.name
ORDER BY total_sales DESC;"""
    ),
]


def get_embedding(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Ensure pgvector extension and table exist
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS planning.schema_embeddings (
            id bigserial PRIMARY KEY,
            chunk_key text NOT NULL,
            chunk_text text NOT NULL,
            embedding vector(1536),
            created_at timestamptz DEFAULT now()
        );
    """)
    conn.commit()

    print(f"Generating embeddings for {len(CHUNKS)} schema chunks...")

    # Clear existing embeddings
    cur.execute("DELETE FROM planning.schema_embeddings")
    conn.commit()

    for i, (key, text) in enumerate(CHUNKS):
        print(f"  [{i+1}/{len(CHUNKS)}] Embedding chunk: {key}")
        embedding = get_embedding(text)
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
        cur.execute(
            "INSERT INTO planning.schema_embeddings (chunk_key, chunk_text, embedding) VALUES (%s, %s, %s::vector)",
            (key, text, embedding_str)
        )
        conn.commit()

    cur.close()
    conn.close()
    print(f"\nDone! {len(CHUNKS)} chunks embedded and stored in planning.schema_embeddings")


if __name__ == "__main__":
    main()
