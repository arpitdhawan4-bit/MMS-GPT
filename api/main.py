"""
api/main.py
-----------
FastAPI backend for MMS-GPT.

RAG pipeline per request:
  1. Embed the user's natural-language question (text-embedding-3-small)
  2. Retrieve top-K most similar schema chunks from planning.schema_embeddings (pgvector cosine)
  3. Build a GPT-4o prompt using ONLY those retrieved chunks (RAG, not CAG)
  4. GPT-4o returns a PostgreSQL query
  5. Execute that query against Supabase and return {sql, columns, rows}

Run:
    uvicorn api.main:app --reload --port 8000
"""

import os
import re
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────────────
load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

oai = OpenAI(api_key=OPENAI_API_KEY)

TOP_K = 7          # number of schema chunks to retrieve
MAX_ROWS = 500     # safety cap on result rows
MAX_SQL_RETRIES = 3  # max attempts to auto-fix broken SQL

# ── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="MMS-GPT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: str


class ChunkDetail(BaseModel):
    key: str
    similarity: float        # cosine similarity 0–1
    excerpt: str             # first ~150 chars of the chunk text
    full_text: str           # full chunk text


class QueryResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list]
    chunks_used: list[str]           # legacy: just the keys
    chunks_detail: list[ChunkDetail] # rich: key + similarity + excerpt
    rationale: str                   # GPT-generated explanation of chunk selection
    attempts: int                    # 1 = first try, 2-3 = required auto-fix
    fix_history: list[dict]          # [{attempt, error, sql}] for each failed attempt


# ── Helpers ──────────────────────────────────────────────────────────────────

def embed(text: str) -> list[float]:
    """Return OpenAI embedding vector for the given text."""
    resp = oai.embeddings.create(model="text-embedding-3-small", input=text)
    return resp.data[0].embedding


def retrieve_chunks(question_embedding: list[float], k: int = TOP_K) -> list[dict]:
    """Cosine-similarity search against planning.schema_embeddings."""
    vec_str = "[" + ",".join(str(x) for x in question_embedding) + "]"
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT chunk_key, chunk_text,
               1 - (embedding <=> %s::vector) AS similarity
        FROM planning.schema_embeddings
        ORDER BY embedding <=> %s::vector
        LIMIT %s
        """,
        (vec_str, vec_str, k),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def build_prompt(question: str, chunks: list[dict]) -> str:
    context = "\n\n---\n\n".join(c["chunk_text"] for c in chunks)
    return f"""You are an expert SQL generator for a beverage-company planning database.
Use ONLY the schema context provided below (retrieved via RAG) to write a correct PostgreSQL query.

RULES:
- Always prefix every table with the 'planning.' schema.
- Never query the public schema.
- Return ONLY the raw SQL statement – no markdown fences, no explanation.
- Always use explicit JOINs (never implicit comma joins).
- When the user asks about 'sales' without specifying a scenario, use scenario code 'ACTUAL'.
- Limit result rows to {MAX_ROWS} using LIMIT if the query could return many rows.
- Use SUM(f.value) for aggregation on fact_planning.
- Always alias aggregated columns clearly (e.g. AS total_sales).
- HIERARCHY RULE: attr_customer_region, attr_customer_channel, attr_customer_industry, and
  attr_product_* tables all have parent-child hierarchies via parent_id.
  The bridge tables (map_customer_region, map_customer_channel, etc.) ONLY link to LEAF nodes.
  When the user asks about a non-leaf parent (e.g. 'Northeast', 'West', 'Beer'),
  you MUST double-join the attr table: first alias for the leaf (from the bridge),
  second alias for the parent (via leaf.parent_id = parent.region_attr_id), then filter on parent.name.
  NEVER combine attr.name = '<parent>' AND attr.is_leaf = TRUE — parents are NOT leaves.


SCHEMA CONTEXT (retrieved chunks):
{context}

USER QUESTION:
{question}

SQL:"""


def extract_sql(raw: str) -> str:
    """Strip any accidental markdown fences GPT might add."""
    raw = raw.strip()
    # Remove ```sql ... ``` or ``` ... ```
    raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\n?```$", "", raw, flags=re.IGNORECASE)
    return raw.strip()


def generate_rationale(question: str, chunks: list[dict]) -> str:
    """Ask GPT-4o-mini to explain in plain English why each chunk was retrieved."""
    chunk_list = "\n".join(
        f"  {i+1}. \"{c['chunk_key']}\" (similarity {c['similarity']:.3f}) — {c['chunk_text'][:120].strip()}..."
        for i, c in enumerate(chunks)
    )
    prompt = f"""A user asked: "{question}"

To answer this, a RAG system retrieved the following {len(chunks)} schema chunks from a vector database
(ranked by cosine similarity to the embedded question):

{chunk_list}

In 3-5 sentences, explain in plain English:
1. Why these particular chunks were the most relevant to the question.
2. What role each chunk plays in helping the SQL generator answer the question correctly.
Be specific about the chunk names."""

    resp = oai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=350,
    )
    return (resp.choices[0].message.content or "").strip()


def build_fix_prompt(question: str, bad_sql: str, error: str, schema_context: str) -> str:
    """Prompt GPT-4o to fix a broken SQL query given the Postgres error message."""
    return f"""You are an expert PostgreSQL query fixer.
The following SQL query failed with a database error. Fix it so it executes correctly.

RULES:
- Return ONLY the corrected raw SQL statement — no markdown fences, no explanation.
- Do NOT change the intent of the query; only fix the syntax/logic error.
- Always prefix every table with the 'planning.' schema.

ORIGINAL QUESTION:
{question}

FAILED SQL:
{bad_sql}

POSTGRES ERROR:
{error}

SCHEMA CONTEXT (for reference):
{schema_context}

FIXED SQL:"""


def run_query(sql: str) -> tuple[list[str], list[list]]:
    """Execute SQL; return (column_names, rows)."""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(sql)
    columns = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()
    # Convert to serialisable Python lists
    serialised = [[str(v) if v is not None else None for v in row] for row in rows]
    return columns, serialised


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/query", response_model=QueryResponse)
def query(req: QueryRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Step 1 – Embed the question
    q_embedding = embed(req.question)

    # Step 2 – Retrieve relevant schema chunks (RAG)
    chunks = retrieve_chunks(q_embedding)
    chunks_used = [c["chunk_key"] for c in chunks]

    # Step 3 – Build prompt with retrieved context
    prompt = build_prompt(req.question, chunks)

    # Step 4 – Generate SQL with GPT-4o
    completion = oai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    raw_sql = completion.choices[0].message.content or ""
    sql = extract_sql(raw_sql)

    # Step 5 – Generate rationale (parallel-ish — uses gpt-4o-mini, fast)
    rationale = generate_rationale(req.question, chunks)

    # Step 6 – Build rich chunk details for the UI
    chunks_detail = [
        ChunkDetail(
            key=c["chunk_key"],
            similarity=round(float(c["similarity"]), 4),
            excerpt=c["chunk_text"][:150].strip() + ("…" if len(c["chunk_text"]) > 150 else ""),
            full_text=c["chunk_text"],
        )
        for c in chunks
    ]

    # Step 7 – Execute SQL with auto-fix retry loop (up to MAX_SQL_RETRIES)
    schema_context = "\n\n---\n\n".join(c["chunk_text"] for c in chunks)
    fix_history: list[dict] = []
    columns: list[str] = []
    rows: list[list] = []
    attempt = 0

    for attempt in range(1, MAX_SQL_RETRIES + 1):
        try:
            columns, rows = run_query(sql)
            break  # success — exit loop
        except Exception as exc:
            error_msg = str(exc)
            fix_history.append({
                "attempt": attempt,
                "error": error_msg,
                "sql": sql,
            })

            if attempt == MAX_SQL_RETRIES:
                # All retries exhausted — surface error to client
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"SQL failed after {MAX_SQL_RETRIES} attempts.\n\n"
                        f"Last error: {error_msg}\n\n"
                        f"Last SQL:\n{sql}"
                    ),
                )

            # Ask GPT-4o to fix the broken SQL
            fix_completion = oai.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": build_fix_prompt(req.question, sql, error_msg, schema_context),
                }],
                temperature=0,
            )
            sql = extract_sql(fix_completion.choices[0].message.content or "")

    return QueryResponse(
        sql=sql,
        columns=columns,
        rows=rows,
        chunks_used=chunks_used,
        chunks_detail=chunks_detail,
        rationale=rationale,
        attempts=attempt,
        fix_history=fix_history,
    )
