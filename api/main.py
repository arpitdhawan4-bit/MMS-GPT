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


class QueryResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list]
    chunks_used: list[str]   # for transparency – which chunks were retrieved


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

    # Step 5 – Execute SQL
    try:
        columns, rows = run_query(sql)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"SQL execution failed: {str(e)}\n\nGenerated SQL:\n{sql}",
        )

    return QueryResponse(sql=sql, columns=columns, rows=rows, chunks_used=chunks_used)
