import { Component, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import QueryInput from "./components/QueryInput";
import RagRationale from "./components/RagRationale";
import SqlDisplay from "./components/SqlDisplay";
import ResultTable from "./components/ResultTable";
import ErrorBanner from "./components/ErrorBanner";
import AgGridTestingPage from "./pages/AgGridTestingPage";
import WorkflowDashboardPage from "./pages/WorkflowDashboardPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import WorkflowMonitorPage from "./pages/WorkflowMonitorPage";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  column_types: string[];        // "numeric" | "text" per column
  rows: string[][];
  chunks_used: string[];
  chunks_detail: ChunkDetail[];
  rationale: string;
  attempts: number;
  fix_history: FixEntry[];
  total_count: number;           // exact for small results; lower bound for large
  is_large_result: boolean;      // true → frontend paginates via /api/paginate
  sql_for_pagination: string;    // base SQL without LIMIT/OFFSET
}

// ─── Error Boundary (catches render crashes so we never show a blank screen) ──
interface EBState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Section crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-700 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          <strong className="block mb-1">⚠ Rendering error</strong>
          <code className="text-xs text-red-400 break-all">{this.state.message}</code>
          <p className="mt-2 text-xs text-red-500">
            Open the browser console for full details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Collapsible section wrapper (Sections 2 & 3) ────────────────────────────
interface CollapsibleSectionProps {
  title: string;
  icon: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      {/* Clickable header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-gray-800 px-4 py-3
                   hover:bg-gray-700/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-sm font-semibold text-gray-200">{title}</span>
          {badge && (
            <span className="text-xs text-gray-400 font-normal ml-1">
              — {badge}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 select-none shrink-0 ml-4">
          {open ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {/* Body — only rendered when open */}
      {open && <div className="bg-gray-900 px-4 py-4">{children}</div>}
    </div>
  );
}

// ─── Static (non-collapsible) section header ─────────────────────────────────
interface StaticHeaderProps {
  title: string;
  icon: string;
  badge?: string;
}

function StaticHeader({ title, icon, badge }: StaticHeaderProps) {
  return (
    <div className="flex items-center justify-between bg-gray-800 px-4 py-3 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      {badge && <span className="text-xs text-gray-400">{badge}</span>}
    </div>
  );
}

// ─── Shared page shell (header + footer, wraps both pages) ───────────────────
function PageShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const p = location.pathname;

  function navCls(prefix: string) {
    return `px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
      p === prefix || p.startsWith(prefix + "/")
        ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
        : "border-gray-600 bg-gray-800 text-gray-300 hover:border-indigo-500 hover:text-indigo-300"
    }`;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ── Shared header ──────────────────────────────────────────────── */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4 flex-wrap">
        {/* Logo — always links back to home */}
        <Link to="/" className="flex items-center gap-3 group">
          <span className="text-2xl">🥂</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors">
              MMS-GPT
            </h1>
            <p className="text-xs text-gray-400">
              Ask questions about your planning data in plain English
            </p>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="ml-4 flex items-center gap-2 flex-wrap">
          <Link to="/ag-grid-testing" className={navCls("/ag-grid-testing")}>
            🧪 AG Grid Testing
          </Link>
          <Link to="/workflow" className={navCls("/workflow")}>
            🎫 Support Tickets
          </Link>
          <Link to="/workflow/monitor" className={navCls("/workflow/monitor")}>
            📡 Workflow Monitor
          </Link>
        </nav>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Shared footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 px-6 py-3 text-center text-xs text-gray-600">
        Powered by OpenAI GPT-4o · Supabase pgvector RAG · PostgreSQL
      </footer>
    </div>
  );
}

// ─── Home page (the original MMS-GPT query interface) ────────────────────────
function HomePage() {
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

  // Normalise potentially-missing fields that the API always sends
  // (defensive: guards against any future API shape changes)
  const chunks   = result?.chunks_detail ?? [];
  const fixHist  = result?.fix_history   ?? [];
  const attempts = result?.attempts      ?? 1;
  const rowCount = result?.rows?.length  ?? 0;

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6">

        {/* ── SECTION 1: Ask a Question (always visible, no collapse) ──── */}
        <div className="rounded-xl border border-gray-700 overflow-hidden">
          <StaticHeader title="Ask a Question" icon="💬" />
          <div className="bg-gray-900 px-4 py-4 flex flex-col gap-3">
            <QueryInput onSubmit={handleSubmit} loading={loading} />
            {error && <ErrorBanner message={error} />}
          </div>
        </div>

        {/* ── Sections 2–4 — only appear after a successful API response ── */}
        {result && (
          <>
            {/* ── SECTION 2: AI Response (collapsible, default collapsed) ─ */}
            <ErrorBoundary>
              <CollapsibleSection
                title="AI Response"
                icon="🔍"
                badge={`${chunks.length} schema chunks retrieved`}
                defaultOpen={false}
              >
                <RagRationale
                  rationale={result.rationale ?? ""}
                  chunks={chunks}
                />
              </CollapsibleSection>
            </ErrorBoundary>

            {/* ── SECTION 3: Generated SQL (collapsible, default collapsed) */}
            <ErrorBoundary>
              <CollapsibleSection
                title="Generated SQL"
                icon="🛠️"
                badge={attempts > 1 ? `auto-fixed in ${attempts} attempts` : "first try"}
                defaultOpen={false}
              >
                <SqlDisplay
                  sql={result.sql ?? ""}
                  attempts={attempts}
                  fixHistory={fixHist}
                />
              </CollapsibleSection>
            </ErrorBoundary>

            {/* ── SECTION 4: Query Results (always visible, no collapse) ── */}
            <div className="rounded-xl border border-gray-700 overflow-hidden">
              <StaticHeader
                title="Query Results"
                icon="📊"
                badge={
                  result.is_large_result
                    ? `${(result.total_count ?? 0).toLocaleString("en-US")}+ rows`
                    : `${rowCount} row${rowCount !== 1 ? "s" : ""}`
                }
              />
              <div className="bg-gray-900">
                <ErrorBoundary>
                  <ResultTable
                    columns={result.columns ?? []}
                    columnTypes={result.column_types ?? []}
                    rows={result.rows ?? []}
                    totalCount={result.total_count ?? 0}
                    isLargeResult={result.is_large_result ?? false}
                    sqlForPagination={result.sql_for_pagination ?? ""}
                    apiBase={API_BASE}
                  />
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <PageShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/ag-grid-testing" element={<AgGridTestingPage />} />
        <Route path="/workflow" element={<WorkflowDashboardPage />} />
        <Route path="/workflow/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/workflow/monitor" element={<WorkflowMonitorPage />} />
      </Routes>
    </PageShell>
  );
}
