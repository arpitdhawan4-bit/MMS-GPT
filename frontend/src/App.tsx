import { useState } from "react";
import QueryInput from "./components/QueryInput";
import RagRationale from "./components/RagRationale";
import SqlDisplay from "./components/SqlDisplay";
import ResultTable from "./components/ResultTable";
import ErrorBanner from "./components/ErrorBanner";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface ChunkDetail {
  key: string;
  similarity: number;
  excerpt: string;
  full_text: string;
}

interface FixEntry {
  attempt: number;
  error: string;
  sql: string;
}

interface QueryResult {
  sql: string;
  columns: string[];
  rows: string[][];
  chunks_used: string[];
  chunks_detail: ChunkDetail[];
  rationale: string;
  attempts: number;
  fix_history: FixEntry[];
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  async function handleSubmit(question: string) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }

      const data: QueryResult = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl">🥂</span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">MMS-GPT</h1>
          <p className="text-xs text-gray-400">Ask questions about your planning data in plain English</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Question input */}
        <QueryInput onSubmit={handleSubmit} loading={loading} />

        {/* Error */}
        {error && <ErrorBanner message={error} />}

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-6">

            {/* ① RAG Rationale — shown BEFORE the SQL */}
            <RagRationale
              rationale={result.rationale}
              chunks={result.chunks_detail}
            />

            {/* ② Generated SQL */}
            <SqlDisplay
              sql={result.sql}
              attempts={result.attempts}
              fixHistory={result.fix_history}
            />

            {/* ③ Result table */}
            <ResultTable columns={result.columns} rows={result.rows} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-3 text-center text-xs text-gray-600">
        Powered by OpenAI GPT-4o · Supabase pgvector RAG · PostgreSQL
      </footer>
    </div>
  );
}
