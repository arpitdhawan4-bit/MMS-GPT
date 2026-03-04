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
The central fact table is planning.fact_planning which holds numeric measures
(a 'value' column) sliced by scenario, year, period, customer, product, and account.
All dimension and attribute tables are in the 'planning' schema. Never use the public schema.
IMPORTANT: All dimension tables (dim_customer, dim_product, dim_account) and all attribute
tables (attr_customer_*, attr_product_*, attr_account_*) have parent-child hierarchies
via a self-referencing parent_id column. fact_planning ALWAYS links to LEAF nodes only
(is_leaf=TRUE). Querying by a non-leaf parent requires double-joining the dimension table."""
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
  customer_id  BIGINT  FK -> planning.dim_customer.customer_id   (leaf customers ONLY)
  product_id   BIGINT  FK -> planning.dim_product.product_id     (leaf products/SKUs ONLY)
  account_id   BIGINT  FK -> planning.dim_account.account_id     (leaf accounts ONLY)
  value        NUMERIC  -- the measure (e.g. dollar amount, units)
  created_at   TIMESTAMPTZ"""
    ),

    # ── DIM_ACCOUNT ──────────────────────────────────────────────────────────
    (
        "dim_account",
        """Table: planning.dim_account
Purpose: Financial account hierarchy (P&L line items). 2-level hierarchy.
Columns:
  account_id  BIGINT PK
  code        VARCHAR
  name        VARCHAR
  parent_id   BIGINT   -- self-referencing FK (NULL for root group nodes)
  level_num   INTEGER
  is_leaf     BOOLEAN  -- TRUE for leaf accounts; FALSE for group nodes
  created_at  TIMESTAMPTZ

HIERARCHY (fact_planning links to LEAF accounts only):
  Level 1 (groups, is_leaf=FALSE, parent_id=NULL):
    REV  = Revenue
    COGS = Cost of Goods Sold
    OPEX = Operating Expenses

  Level 2 (leaves, is_leaf=TRUE):
    REV_GROSS = Gross Sales   (parent: REV)
    REV_DISC  = Discounts     (parent: REV)
    REV_NET   = Net Sales     (parent: REV)
    COGS_MAT  = Materials     (parent: COGS)
    COGS_FRT  = Freight       (parent: COGS)
    COGS_TOT  = Total COGS    (parent: COGS)
    OPEX_MKT  = Marketing     (parent: OPEX)
    OPEX_PAY  = Payroll       (parent: OPEX)
    OPEX_RENT = Rent          (parent: OPEX)
    OPEX_UTIL = Utilities     (parent: OPEX)

ACCOUNT QUERY RULES:
- "Gross Sales" or "gross revenue":                 WHERE da.code = 'REV_GROSS'
- "Net Sales" or "net revenue":                     WHERE da.code = 'REV_NET'
- "Discounts":                                      WHERE da.code = 'REV_DISC'
- "Sales" with no qualifier (default):              WHERE da.code = 'REV_GROSS'
- "Total Revenue" / "all revenue" / "revenue accounts" / "all revenue children":
    Use double-join to get ALL 3 REV children (REV_GROSS + REV_DISC + REV_NET):
    JOIN planning.dim_account da        ON f.account_id = da.account_id
    JOIN planning.dim_account da_parent ON da.parent_id = da_parent.account_id
    WHERE da_parent.code = 'REV'
    -- This returns 3 rows per period (one per leaf); GROUP BY and include da.name to break them down.
- "Total COGS" / "all COGS" / "COGS breakdown":
    Use double-join with da_parent.code = 'COGS' to get Materials + Freight + Total COGS
- "All OPEX" / "operating expenses":
    Use double-join with da_parent.code = 'OPEX' to get Marketing + Payroll + Rent + Utilities
- NEVER use da.code = 'REV' or da.code = 'COGS' or da.code = 'OPEX' — these are group nodes, not leaves."""
    ),

    # ── DIM_CUSTOMER ─────────────────────────────────────────────────────────
    (
        "dim_customer",
        """Table: planning.dim_customer
Purpose: Customer hierarchy. 3-level tree.
Columns:
  customer_id  BIGINT PK
  code         VARCHAR
  name         VARCHAR
  parent_id    BIGINT   -- self-referencing FK (NULL for groups)
  level_num    INTEGER
  is_leaf      BOOLEAN
  created_at   TIMESTAMPTZ

HIERARCHY (fact_planning links to LEAF individual customers only):
  Level 1 (groups, is_leaf=FALSE, parent_id=NULL):
    C_GRP0001 = Anderson Beverage Group, C_GRP0002 = Bennett Beverage Group, etc. (~50 groups)
  Level 2 (distributors, is_leaf=FALSE, parent=group):
    C_DIST0001 = Denver Beverage Distributing (parent: Anderson), etc.
  Level 3 (individual customers, is_leaf=TRUE, parent=distributor):
    Individual customers (the fact_planning.customer_id always references these)

RULES:
- To filter by a specific leaf customer: WHERE dc.name = 'Denver Beverage Distributing' AND dc.is_leaf = TRUE
- To filter by a distributor (level 2): double-join via parent_id
    JOIN planning.dim_customer dc ON f.customer_id = dc.customer_id
    JOIN planning.dim_customer dc_dist ON dc.parent_id = dc_dist.customer_id
    WHERE dc_dist.name = 'Denver Beverage Distributing'
- To filter by a group (level 1): triple-join
    JOIN planning.dim_customer dc ON f.customer_id = dc.customer_id
    JOIN planning.dim_customer dc_dist ON dc.parent_id = dc_dist.customer_id
    JOIN planning.dim_customer dc_grp ON dc_dist.parent_id = dc_grp.customer_id
    WHERE dc_grp.name = 'Anderson Beverage Group'
- NEVER filter dc.name = 'Anderson Beverage Group' directly without joining up the hierarchy."""
    ),

    # ── DIM_PRODUCT ──────────────────────────────────────────────────────────
    (
        "dim_product",
        """Table: planning.dim_product
Purpose: Product hierarchy. 3-level tree (Category → Brand → SKU).
Columns:
  product_id  BIGINT PK
  code        VARCHAR
  name        VARCHAR
  parent_id   BIGINT   -- hierarchy
  level_num   INTEGER
  is_leaf     BOOLEAN
  created_at  TIMESTAMPTZ

HIERARCHY (fact_planning links to LEAF products/SKUs only):
  Level 1 (categories, is_leaf=FALSE, parent_id=NULL):
    P_CAT_BEER = Beer,  P_CAT_WINE = Wine,  P_CAT_SPIRITS = Spirits
  Level 2 (brands, is_leaf=FALSE, parent=category):
    e.g. Harbor Brewing (Beer), Prairie Distillery (Spirits)
  Level 3 (individual SKUs, is_leaf=TRUE, parent=brand):
    Specific products — fact_planning.product_id references these

RULES:
- To filter by a specific SKU (leaf): WHERE dpr.is_leaf = TRUE AND dpr.name = 'SKU Name'
- To filter by Brand (level 2): double-join
    JOIN planning.dim_product dpr       ON f.product_id = dpr.product_id
    JOIN planning.dim_product dpr_brand ON dpr.parent_id = dpr_brand.product_id
    WHERE dpr_brand.name = 'Harbor Brewing'
- To filter by Category (level 1, e.g. Beer): triple-join
    JOIN planning.dim_product dpr       ON f.product_id = dpr.product_id
    JOIN planning.dim_product dpr_brand ON dpr.parent_id = dpr_brand.product_id
    JOIN planning.dim_product dpr_cat   ON dpr_brand.parent_id = dpr_cat.product_id
    WHERE dpr_cat.name = 'Beer'
- For category totals (Beer, Wine, Spirits), GROUP BY dpr_cat.name.
- NEVER filter dpr.name = 'Beer' without navigating the hierarchy — Beer is a category, not a leaf."""
    ),

    # ── DIM_PERIOD ───────────────────────────────────────────────────────────
    (
        "dim_period",
        """Table: planning.dim_period
Purpose: Monthly time periods with quarter info. No parent-child hierarchy — flat table.
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
To order by time:        ORDER BY dp.period_sort"""
    ),

    # ── DIM_YEAR ─────────────────────────────────────────────────────────────
    (
        "dim_year",
        """Table: planning.dim_year
Purpose: Fiscal/calendar years. Flat table, no parent-child hierarchy.
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
Purpose: Sales channel hierarchy for customers. 3-level hierarchy.
Bridge: planning.map_customer_channel (customer_id, channel_attr_id) — links to LEAF nodes only.
Columns: channel_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE):  All Channels (CH_ALL)
  Level 2 (groups, is_leaf=FALSE): On-Premise (CH_ON), Off-Premise (CH_OFF), E-Commerce (CH_ECOM)
  Level 3 (leaves, is_leaf=TRUE):
    On-Premise children:  Bars & Nightclubs (CH_ON_BARS), Restaurants (CH_ON_REST), Hotels (CH_ON_HOTEL)
    Off-Premise children: Grocery (CH_OFF_GROC), Convenience (CH_OFF_CONV), Liquor Store (CH_OFF_LIQR), Club/Warehouse (CH_OFF_CLUB)
    E-Commerce children:  Marketplace (CH_ECOM_MKT), Direct-to-Consumer (CH_ECOM_DTC)

RULES:
- map_customer_channel links to LEAF channels only (level 3).
- To filter by a leaf channel (e.g. Grocery): WHERE acc.name = 'Grocery' AND acc.is_leaf = TRUE
- To filter by a parent channel (e.g. Off-Premise, On-Premise): double-join
    JOIN planning.map_customer_channel mcc ON dc.customer_id = mcc.customer_id
    JOIN planning.attr_customer_channel leaf_ch   ON mcc.channel_attr_id = leaf_ch.channel_attr_id
    JOIN planning.attr_customer_channel parent_ch ON leaf_ch.parent_id   = parent_ch.channel_attr_id
    WHERE parent_ch.name = 'Off-Premise'
- NEVER use acc.name = 'Off-Premise' AND acc.is_leaf = TRUE — Off-Premise is not a leaf."""
    ),

    # ── ATTRIBUTE: REGION ────────────────────────────────────────────────────
    (
        "attr_customer_region",
        """Table: planning.attr_customer_region
Purpose: Geographic region hierarchy for customers. 3-level parent-child tree.
Bridge: planning.map_customer_region (customer_id, region_attr_id) — links to LEAF nodes (states) only.
Columns: region_attr_id (PK), code, name, parent_id (FK -> self), level_num, is_leaf

HIERARCHY:
  Level 1 (root):    United States (id=1, is_leaf=FALSE, parent_id=NULL)
  Level 2 (regions, is_leaf=FALSE): Northeast (id=5), West (id=2), Midwest (id=3), South (id=4)
  Level 3 (states, is_leaf=TRUE):
    Northeast: Connecticut, Maine, Massachusetts, NH, NJ, NY, PA, Rhode Island, Vermont
    West:      Alaska, Arizona, California, Colorado, Hawaii, Idaho, Montana, Nevada, NM, Oregon, Utah, Washington, Wyoming
    Midwest:   Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, Missouri, Nebraska, ND, Ohio, SD, Wisconsin
    South:     Alabama, Arkansas, Delaware, DC, Florida, Georgia, Kentucky, Louisiana, Maryland, Mississippi,
               NC, Oklahoma, SC, Tennessee, Texas, Virginia, WV

RULES:
- map_customer_region links to LEAF nodes (states) only.
- To filter by state (leaf):  WHERE state_region.name = 'Florida' AND state_region.is_leaf = TRUE
- To filter by region (parent): double-join
    JOIN planning.map_customer_region  mcr          ON dc.customer_id = mcr.customer_id
    JOIN planning.attr_customer_region state_region  ON mcr.region_attr_id = state_region.region_attr_id
    JOIN planning.attr_customer_region region_parent ON state_region.parent_id = region_parent.region_attr_id
    WHERE region_parent.name = 'Northeast'
- For children of a region, GROUP BY state_region.name
- NEVER use acr.name = 'Northeast' AND acr.is_leaf = TRUE — they conflict; Northeast is not a leaf.
- DO NOT use WITH RECURSIVE CTEs."""
    ),

    # ── ATTRIBUTE: INDUSTRY ──────────────────────────────────────────────────
    (
        "attr_customer_industry",
        """Table: planning.attr_customer_industry
Purpose: Industry classification for customers. 2-level hierarchy (root + leaves).
Bridge: planning.map_customer_industry (customer_id, industry_attr_id) — links to LEAF nodes only.
Columns: industry_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE):  All Industries (IND_ALL)
  Level 2 (leaves, is_leaf=TRUE):
    IND_GROC  = Grocery
    IND_CONV  = Convenience
    IND_LIQR  = Liquor Retail
    IND_BAR   = Bar / Nightclub
    IND_REST  = Restaurant
    IND_HOTEL = Hotel / Resort
    IND_EVENT = Event / Catering
    IND_DIST  = Distributor
    IND_ONLINE= Online Retailer

All named industries are LEAF nodes — direct filter works:
  JOIN planning.map_customer_industry mci ON dc.customer_id = mci.customer_id
  JOIN planning.attr_customer_industry aci ON mci.industry_attr_id = aci.industry_attr_id
  WHERE aci.name = 'Grocery'  -- Grocery IS a leaf, this is correct"""
    ),

    # ── ATTRIBUTE: PACKAGING ─────────────────────────────────────────────────
    (
        "attr_product_packaging",
        """Table: planning.attr_product_packaging
Purpose: Packaging type hierarchy for products. 3-level hierarchy.
Bridge: planning.map_product_packaging (product_id, packaging_attr_id) — links to LEAF nodes only.
Columns: packaging_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE):  All Packaging (PKG_ALL)
  Level 2 (groups, is_leaf=FALSE): Bottle (PKG_BOTTLE), Can (PKG_CAN), Keg (PKG_KEG), Box (PKG_BOX)
  Level 3 (leaves, is_leaf=TRUE):
    Bottle children: Glass Bottle (PKG_BOTTLE_GLS), PET Bottle (PKG_BOTTLE_PET)
    Can children:    Aluminum Can (PKG_CAN_AL)
    Keg children:    Half-barrel Keg (PKG_KEG_HALF), Quarter-barrel Keg (PKG_KEG_QTR)
    Box children:    Bag-in-Box (PKG_BOX_BIB)

RULES:
- map_product_packaging links to LEAF packaging types only.
- To filter by a leaf (e.g. Glass Bottle): WHERE pkg.name = 'Glass Bottle' AND pkg.is_leaf = TRUE
- To filter by a parent packaging (e.g. Bottle, Keg): double-join
    JOIN planning.map_product_packaging  mpp       ON dpr.product_id = mpp.product_id
    JOIN planning.attr_product_packaging leaf_pkg   ON mpp.packaging_attr_id = leaf_pkg.packaging_attr_id
    JOIN planning.attr_product_packaging parent_pkg ON leaf_pkg.parent_id    = parent_pkg.packaging_attr_id
    WHERE parent_pkg.name = 'Bottle'
- NEVER filter parent_pkg.name = 'Bottle' AND parent_pkg.is_leaf = TRUE — Bottle is not a leaf."""
    ),

    # ── ATTRIBUTE: PROCESS ───────────────────────────────────────────────────
    (
        "attr_product_process",
        """Table: planning.attr_product_process
Purpose: Production process hierarchy. 3-level hierarchy.
Bridge: planning.map_product_process (product_id, process_attr_id) — links to LEAF nodes only.
Columns: process_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE):  All Processes (PRC_ALL)
  Level 2 (groups, is_leaf=FALSE):
    Distilled (PRC_DIST), Fermented (PRC_FERM), Blended / Infused (PRC_BLEND)
  Level 3 (leaves, is_leaf=TRUE):
    Distilled:         Pot Still (PRC_DIST_POT), Column Still (PRC_DIST_COL)
    Fermented:         Ale (PRC_FERM_ALE), Lager (PRC_FERM_LAG), Wine Fermentation (PRC_FERM_WINE)
    Blended/Infused:   Botanical Infusion (PRC_BLEND_BOT), Barrel-aged (PRC_BLEND_BAR), Flavored/Infused (PRC_BLEND_FLV)

RULES:
- map_product_process links to LEAF process types only.
- To filter by a leaf (e.g. Ale): WHERE prc.name = 'Ale' AND prc.is_leaf = TRUE
- To filter by a parent process (e.g. Distilled, Fermented): double-join
    JOIN planning.map_product_process  mpp      ON dpr.product_id = mpp.product_id
    JOIN planning.attr_product_process leaf_prc  ON mpp.process_attr_id = leaf_prc.process_attr_id
    JOIN planning.attr_product_process parent_prc ON leaf_prc.parent_id = parent_prc.process_attr_id
    WHERE parent_prc.name = 'Distilled'
- NEVER filter parent_prc.name = 'Fermented' AND parent_prc.is_leaf = TRUE — Fermented is not a leaf."""
    ),

    # ── ATTRIBUTE: CASE SIZE ─────────────────────────────────────────────────
    (
        "attr_product_case_size",
        """Table: planning.attr_product_case_size
Purpose: Case/pack size hierarchy for products. 3-level hierarchy.
Bridge: planning.map_product_case_size (product_id, case_size_attr_id) — links to LEAF nodes only.
Columns: case_size_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE):  All Case Sizes (CS_ALL)
  Level 2 (groups, is_leaf=FALSE): Packs (CS_PACK), Bottle Case (CS_BTLCASE)
  Level 3 (leaves, is_leaf=TRUE):
    Packs:        6-pack (CS_PACK_6), 12-pack (CS_PACK_12), 24-pack (CS_PACK_24)
    Bottle Case:  6 x 750ml (CS_BTL_6X750), 12 x 750ml (CS_BTL_12X750), 24 x 355ml (CS_BTL_24X355)

RULES:
- map_product_case_size links to LEAF case sizes only.
- To filter by a leaf (e.g. 6-pack): WHERE cs.name = '6-pack' AND cs.is_leaf = TRUE
- To filter by a parent case size (e.g. Packs): double-join
    JOIN planning.map_product_case_size  mcs      ON dpr.product_id = mcs.product_id
    JOIN planning.attr_product_case_size leaf_cs   ON mcs.case_size_attr_id = leaf_cs.case_size_attr_id
    JOIN planning.attr_product_case_size parent_cs ON leaf_cs.parent_id     = parent_cs.case_size_attr_id
    WHERE parent_cs.name = 'Packs'
- NEVER filter parent_cs.name = 'Packs' AND parent_cs.is_leaf = TRUE — Packs is not a leaf."""
    ),

    # ── ATTRIBUTE: GAAP ──────────────────────────────────────────────────────
    (
        "attr_account_gaap",
        """Table: planning.attr_account_gaap
Purpose: GAAP category for accounts. 2-level hierarchy (root + leaves).
Bridge: planning.map_account_gaap (account_id, gaap_attr_id) — links to LEAF nodes only.
Columns: gaap_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE): GAAP Category (GAAP_ALL)
  Level 2 (leaves, is_leaf=TRUE):
    GAAP_IS = Income Statement
    GAAP_BS = Balance Sheet

All named GAAP categories are leaves — direct filter works:
  JOIN planning.map_account_gaap mag ON da.account_id = mag.account_id
  JOIN planning.attr_account_gaap agp ON mag.gaap_attr_id = agp.gaap_attr_id
  WHERE agp.name = 'Income Statement'"""
    ),

    # ── ATTRIBUTE: CASHFLOW ──────────────────────────────────────────────────
    (
        "attr_account_cashflow",
        """Table: planning.attr_account_cashflow
Purpose: Cash flow classification for accounts. 2-level hierarchy (root + leaves).
Bridge: planning.map_account_cashflow (account_id, cashflow_attr_id) — links to LEAF nodes only.
Columns: cashflow_attr_id, code, name, parent_id, level_num, is_leaf

HIERARCHY:
  Level 1 (root, is_leaf=FALSE): Cash Flow Category (CF_ALL)
  Level 2 (leaves, is_leaf=TRUE):
    CF_OP  = Operating
    CF_INV = Investing
    CF_FIN = Financing

All named cash flow categories are leaves — direct filter works:
  JOIN planning.map_account_cashflow mac ON da.account_id = mac.account_id
  JOIN planning.attr_account_cashflow acf ON mac.cashflow_attr_id = acf.cashflow_attr_id
  WHERE acf.name = 'Operating'"""
    ),

    # ── JOIN PATTERNS ────────────────────────────────────────────────────────
    (
        "join_pattern_basic",
        """Standard SQL join pattern for querying fact_planning:
SELECT
    ds.name  AS scenario,
    dy.year_num AS year,
    dp2.month_name AS period,
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
  AND dy.year_num = 2026
  AND da.code = 'REV_GROSS'
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
GROUP BY ds.name, ds.sort_order
ORDER BY ds.sort_order;"""
    ),

    # ── HIERARCHY JOIN PATTERNS ──────────────────────────────────────────────
    (
        "join_pattern_by_region_hierarchy",
        """CRITICAL: map_customer_region links customers to LEAF nodes (individual states) only.
Northeast/West/Midwest/South are parent nodes (is_leaf=FALSE). NEVER use WITH RECURSIVE CTEs.

PATTERN 1 — Total sales for a parent region (e.g. Northeast):
SELECT region_parent.name AS region, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds           ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy           ON f.year_id = dy.year_id
JOIN planning.dim_period           dp           ON f.period_id = dp.period_id
JOIN planning.dim_customer         dc           ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da           ON f.account_id = da.account_id
JOIN planning.map_customer_region  mcr          ON dc.customer_id = mcr.customer_id
JOIN planning.attr_customer_region state_region  ON mcr.region_attr_id = state_region.region_attr_id
JOIN planning.attr_customer_region region_parent ON state_region.parent_id = region_parent.region_attr_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2025 AND dp.month_name = 'January'
  AND da.code = 'REV_GROSS' AND region_parent.name = 'Northeast'
GROUP BY region_parent.name ORDER BY total_sales DESC;

PATTERN 2 — List child states within a parent region:
SELECT state_region.name AS state, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario         ds           ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year             dy           ON f.year_id = dy.year_id
JOIN planning.dim_period           dp           ON f.period_id = dp.period_id
JOIN planning.dim_customer         dc           ON f.customer_id = dc.customer_id
JOIN planning.dim_account          da           ON f.account_id = da.account_id
JOIN planning.map_customer_region  mcr          ON dc.customer_id = mcr.customer_id
JOIN planning.attr_customer_region state_region  ON mcr.region_attr_id = state_region.region_attr_id
JOIN planning.attr_customer_region region_parent ON state_region.parent_id = region_parent.region_attr_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2025 AND dp.month_name = 'January'
  AND da.code = 'REV_GROSS' AND region_parent.name = 'Northeast'
GROUP BY state_region.name ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_by_channel_hierarchy",
        """CRITICAL: map_customer_channel links customers to LEAF channels only (Bars, Grocery, etc.).
On-Premise, Off-Premise, E-Commerce are parent channels (is_leaf=FALSE). NEVER use WITH RECURSIVE.

PATTERN 1 — Total sales for a parent channel (e.g. Off-Premise):
SELECT parent_ch.name AS channel, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario          ds       ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year              dy       ON f.year_id = dy.year_id
JOIN planning.dim_customer          dc       ON f.customer_id = dc.customer_id
JOIN planning.dim_account           da       ON f.account_id = da.account_id
JOIN planning.map_customer_channel  mcc      ON dc.customer_id = mcc.customer_id
JOIN planning.attr_customer_channel leaf_ch   ON mcc.channel_attr_id = leaf_ch.channel_attr_id
JOIN planning.attr_customer_channel parent_ch ON leaf_ch.parent_id   = parent_ch.channel_attr_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND parent_ch.name = 'Off-Premise'
GROUP BY parent_ch.name ORDER BY total_sales DESC;

PATTERN 2 — List children of a parent channel:
SELECT leaf_ch.name AS channel, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario          ds       ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year              dy       ON f.year_id = dy.year_id
JOIN planning.dim_customer          dc       ON f.customer_id = dc.customer_id
JOIN planning.dim_account           da       ON f.account_id = da.account_id
JOIN planning.map_customer_channel  mcc      ON dc.customer_id = mcc.customer_id
JOIN planning.attr_customer_channel leaf_ch   ON mcc.channel_attr_id = leaf_ch.channel_attr_id
JOIN planning.attr_customer_channel parent_ch ON leaf_ch.parent_id   = parent_ch.channel_attr_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND parent_ch.name = 'Off-Premise'
GROUP BY leaf_ch.name ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_by_product_hierarchy",
        """CRITICAL: fact_planning links to LEAF products (SKUs) only.
Beer/Wine/Spirits are category nodes (level 1, is_leaf=FALSE). Brands are level 2 (is_leaf=FALSE).
DO NOT filter dpr.name = 'Beer' directly — Beer is a category, not a leaf SKU.
NEVER use WITH RECURSIVE CTEs.

PATTERN 1 — Total sales for a product category (e.g. Beer):
SELECT dpr_cat.name AS category, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds     ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy     ON f.year_id = dy.year_id
JOIN planning.dim_account  da     ON f.account_id = da.account_id
JOIN planning.dim_product  dpr      ON f.product_id = dpr.product_id
JOIN planning.dim_product  dpr_brand ON dpr.parent_id = dpr_brand.product_id
JOIN planning.dim_product  dpr_cat   ON dpr_brand.parent_id = dpr_cat.product_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND dpr_cat.name = 'Beer'
GROUP BY dpr_cat.name ORDER BY total_sales DESC;

PATTERN 2 — Sales by brand within a category:
SELECT dpr_brand.name AS brand, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds     ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy     ON f.year_id = dy.year_id
JOIN planning.dim_account  da     ON f.account_id = da.account_id
JOIN planning.dim_product  dpr      ON f.product_id = dpr.product_id
JOIN planning.dim_product  dpr_brand ON dpr.parent_id = dpr_brand.product_id
JOIN planning.dim_product  dpr_cat   ON dpr_brand.parent_id = dpr_cat.product_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND dpr_cat.name = 'Beer'
GROUP BY dpr_brand.name ORDER BY total_sales DESC;

PATTERN 3 — Total sales by brand alone (no category filter):
SELECT dpr_brand.name AS brand, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds     ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy     ON f.year_id = dy.year_id
JOIN planning.dim_account  da     ON f.account_id = da.account_id
JOIN planning.dim_product  dpr      ON f.product_id = dpr.product_id
JOIN planning.dim_product  dpr_brand ON dpr.parent_id = dpr_brand.product_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND dpr_brand.name = 'Harbor Brewing'
GROUP BY dpr_brand.name ORDER BY total_sales DESC;"""
    ),

    (
        "join_pattern_by_account_hierarchy",
        """CRITICAL: fact_planning links to LEAF accounts only (REV_GROSS, COGS_MAT, etc.).
REV/COGS/OPEX are account group nodes (is_leaf=FALSE).
To query all items under COGS or all Revenue accounts, use double-join on dim_account.
NEVER use WITH RECURSIVE CTEs.

KEYWORD MAPPING:
- "total revenue" / "all revenue" / "revenue breakdown" → da_parent.code = 'REV'  (gets REV_GROSS + REV_DISC + REV_NET)
- "total COGS" / "COGS breakdown" / "cost of goods"    → da_parent.code = 'COGS' (gets COGS_MAT + COGS_FRT + COGS_TOT)
- "total OPEX" / "operating expenses" / "opex"         → da_parent.code = 'OPEX' (gets OPEX_MKT + OPEX_PAY + OPEX_RENT + OPEX_UTIL)

PATTERN 0a — BREAKDOWN of all REV children by month by industry (shows Gross Sales / Discounts / Net Sales separately):
-- Use when user asks for "total revenue by month" / "revenue accounts by industry" / "each revenue line"
SELECT
    dp.month_name,
    aci.name AS industry,
    da.name  AS account,
    SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario   ds        ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year       dy        ON f.year_id     = dy.year_id
JOIN planning.dim_period     dp        ON f.period_id   = dp.period_id
JOIN planning.dim_customer   dc        ON f.customer_id = dc.customer_id
JOIN planning.dim_account    da        ON f.account_id  = da.account_id
JOIN planning.dim_account    da_parent ON da.parent_id  = da_parent.account_id
JOIN planning.map_customer_industry mci ON dc.customer_id      = mci.customer_id
JOIN planning.attr_customer_industry aci ON mci.industry_attr_id = aci.industry_attr_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2025
  AND da_parent.code = 'REV'
GROUP BY dp.period_sort, dp.month_name, aci.name, da.account_id, da.name
ORDER BY dp.period_sort, aci.name, da.account_id
LIMIT 500;

PATTERN 0b — SUM of all REV children combined into one total per month per industry (SINGLE total row):
-- Use when user asks for "SUM of all children of revenue" / "combined revenue total" / "aggregate revenue"
-- KEY: do NOT include da.name in SELECT or GROUP BY — that collapses all 3 children into one number
SELECT
    dp.month_name,
    aci.name AS industry,
    SUM(f.value) AS total_revenue
FROM planning.fact_planning f
JOIN planning.dim_scenario   ds        ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year       dy        ON f.year_id     = dy.year_id
JOIN planning.dim_period     dp        ON f.period_id   = dp.period_id
JOIN planning.dim_customer   dc        ON f.customer_id = dc.customer_id
JOIN planning.dim_account    da        ON f.account_id  = da.account_id
JOIN planning.dim_account    da_parent ON da.parent_id  = da_parent.account_id
JOIN planning.map_customer_industry mci ON dc.customer_id      = mci.customer_id
JOIN planning.attr_customer_industry aci ON mci.industry_attr_id = aci.industry_attr_id
WHERE ds.code = 'ACTUAL'
  AND dy.year_num = 2025
  AND da_parent.code = 'REV'
GROUP BY dp.period_sort, dp.month_name, aci.name
ORDER BY dp.period_sort, aci.name
LIMIT 500;

PATTERN 1 — Total for an account group (e.g. total COGS):
SELECT da_parent.name AS account_group, SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario ds       ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy       ON f.year_id = dy.year_id
JOIN planning.dim_account  da       ON f.account_id = da.account_id
JOIN planning.dim_account  da_parent ON da.parent_id = da_parent.account_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026
  AND da_parent.code = 'COGS'
GROUP BY da_parent.name;

PATTERN 2 — Breakdown of leaf accounts within a group:
SELECT da.name AS account, SUM(f.value) AS total_value
FROM planning.fact_planning f
JOIN planning.dim_scenario ds       ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy       ON f.year_id = dy.year_id
JOIN planning.dim_account  da       ON f.account_id = da.account_id
JOIN planning.dim_account  da_parent ON da.parent_id = da_parent.account_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026
  AND da_parent.code = 'COGS'
GROUP BY da.name, da.account_id ORDER BY da.account_id;"""
    ),

    (
        "join_pattern_by_customer_hierarchy",
        """CRITICAL: fact_planning links to LEAF individual customers only (is_leaf=TRUE, level 3).
Customer Groups (level 1) and Distributors (level 2) are NOT leaves.
NEVER use WITH RECURSIVE CTEs.

PATTERN 1 — Total sales for a customer group (level 1, e.g. Anderson Beverage Group):
SELECT dc_grp.name AS customer_group, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds     ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy     ON f.year_id = dy.year_id
JOIN planning.dim_account  da     ON f.account_id = da.account_id
JOIN planning.dim_customer dc      ON f.customer_id = dc.customer_id
JOIN planning.dim_customer dc_dist ON dc.parent_id  = dc_dist.customer_id
JOIN planning.dim_customer dc_grp  ON dc_dist.parent_id = dc_grp.customer_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND dc_grp.name = 'Anderson Beverage Group'
GROUP BY dc_grp.name ORDER BY total_sales DESC;

PATTERN 2 — Sales by distributor within a group:
SELECT dc_dist.name AS distributor, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds     ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy     ON f.year_id = dy.year_id
JOIN planning.dim_account  da     ON f.account_id = da.account_id
JOIN planning.dim_customer dc      ON f.customer_id = dc.customer_id
JOIN planning.dim_customer dc_dist ON dc.parent_id  = dc_dist.customer_id
JOIN planning.dim_customer dc_grp  ON dc_dist.parent_id = dc_grp.customer_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
  AND dc_grp.name = 'Anderson Beverage Group'
GROUP BY dc_dist.name ORDER BY total_sales DESC;

PATTERN 3 — Sales by leaf customer by itself:
SELECT dc.name AS customer, SUM(f.value) AS total_sales
FROM planning.fact_planning f
JOIN planning.dim_scenario ds ON f.scenario_id = ds.scenario_id
JOIN planning.dim_year     dy ON f.year_id = dy.year_id
JOIN planning.dim_customer dc ON f.customer_id = dc.customer_id
JOIN planning.dim_account  da ON f.account_id = da.account_id
WHERE ds.code = 'ACTUAL' AND dy.year_num = 2026 AND da.code = 'REV_GROSS'
GROUP BY dc.name ORDER BY total_sales DESC LIMIT 500;"""
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
