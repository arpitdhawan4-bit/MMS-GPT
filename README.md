# MMS-GPT — Natural Language → SQL (RAG-powered)

Ask plain-English questions about your beverage-company planning data.  
The system uses a **RAG (Retrieval-Augmented Generation)** pipeline — NOT context-stuffing — to generate accurate PostgreSQL queries against Supabase.

---

## Architecture

```
User Question
     │
     ▼
[1] OpenAI text-embedding-3-small   ← embed the question
     │
     ▼
[2] pgvector cosine search          ← retrieve top-7 schema chunks from planning.schema_embeddings
     │
     ▼
[3] GPT-4o prompt (RAG context)     ← build prompt with ONLY retrieved chunks
     │
     ▼
[4] Generated SQL
     │
     ▼
[5] Execute against Supabase PostgreSQL
     │
     ▼
[6] Return { sql, columns, rows } to React frontend
```

---

## Project Structure

```
MMS-GPT/
├── .env                    # SUPABASE_DB_URL (never committed)
├── .env.local              # OPENAI_API_KEY + SUPABASE_DB_URL (never committed)
├── inspect_schema.py       # Schema inspection utility
├── embed_schema.py         # One-time: chunk schema → OpenAI embeddings → pgvector
│
├── api/
│   └── main.py             # FastAPI backend (RAG pipeline + SQL execution)
│
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   └── components/
    │       ├── QueryInput.tsx   # Question text area + example prompts
    │       ├── SqlDisplay.tsx   # Generated SQL with copy button
    │       ├── ResultTable.tsx  # Query results table
    │       ├── ChunkBadges.tsx  # Shows which RAG chunks were retrieved
    │       └── ErrorBanner.tsx  # Error display
    └── .env                # VITE_API_URL=http://localhost:8000
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node 18+
- Supabase project with pgvector enabled

### 1. Python dependencies
```bash
pip install openai psycopg2-binary fastapi uvicorn python-dotenv
```

### 2. Embed the schema (one-time, re-run when schema changes)
```bash
python embed_schema.py
```

### 3. Start the FastAPI backend
```bash
python -m uvicorn api.main:app --reload --port 8000
```

### 4. Start the React frontend (dev)
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: **http://localhost:5173**  
Backend runs at:  **http://localhost:8000**

---

## Example Questions
- "What were my gross sales in January 2026?"
- "Show me total sales by customer for 2025"
- "Compare actual vs budget gross sales for 2026"
- "What are my top 5 products by sales in 2024?"
- "Show me sales by region for 2026"
- "What was my net sales in Q1 2025?"

---

## RAG Details

Schema chunks stored in `planning.schema_embeddings` (pgvector):
- `overview` — star-schema overview
- `fact_planning`, `dim_account`, `dim_customer`, `dim_product`, `dim_period`, `dim_year`, `dim_scenario` — dimension tables
- `attr_*` — attribute hierarchy tables (channel, region, industry, packaging, process, case size, GAAP, cashflow)
- `join_pattern_*` — pre-written SQL join templates for common query types

On each request, the top-7 most semantically similar chunks are retrieved and passed to GPT-4o as context.
