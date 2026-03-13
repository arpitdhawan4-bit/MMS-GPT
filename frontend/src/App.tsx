import { Component, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import QueryInput from "./components/QueryInput";
import RagRationale from "./components/RagRationale";
import SqlDisplay from "./components/SqlDisplay";
import ResultTable from "./components/ResultTable";
import ErrorBanner from "./components/ErrorBanner";
import AgGridTestingPage from "./pages/AgGridTestingPage";
import WorkflowDashboardPage from "./pages/WorkflowDashboardPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import WorkflowMonitorPage from "./pages/WorkflowMonitorPage";
import { MainLayout } from "./components/layout/MainLayout";

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
  column_types: string[];
  rows: string[][];
  chunks_used: string[];
  chunks_detail: ChunkDetail[];
  rationale: string;
  attempts: number;
  fix_history: FixEntry[];
  total_count: number;
  is_large_result: boolean;
  sql_for_pagination: string;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
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
        <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-5 py-4 text-sm text-red-700 dark:text-red-300">
          <strong className="block mb-1">⚠ Rendering error</strong>
          <code className="text-xs text-red-500 dark:text-red-400 break-all">
            {this.state.message}
          </code>
          <p className="mt-2 text-xs text-red-400 dark:text-red-500">
            Open the browser console for full details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Collapsible section ──────────────────────────────────────────────────────
interface CollapsibleSectionProps {
  title: string;
  icon: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function CollapsibleSection({
  title, icon, badge, defaultOpen = false, children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</span>
          {badge && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-1">
              — {badge}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 select-none shrink-0 ml-4">
          {open ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>
      {open && (
        <div className="bg-white dark:bg-gray-900 px-4 py-4">{children}</div>
      )}
    </div>
  );
}

// ─── Static section header ───────────────────────────────────────────────────
interface StaticHeaderProps { title: string; icon: string; badge?: string }

function StaticHeader({ title, icon, badge }: StaticHeaderProps) {
  return (
    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</span>
      </div>
      {badge && <span className="text-xs text-gray-400">{badge}</span>}
    </div>
  );
}

// ─── Home page ────────────────────────────────────────────────────────────────
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

  const chunks   = result?.chunks_detail ?? [];
  const fixHist  = result?.fix_history   ?? [];
  const attempts = result?.attempts      ?? 1;
  const rowCount = result?.rows?.length  ?? 0;

  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Ask a Question
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Ask plain-English questions about your beverage-company planning data.
        </p>
      </div>

      {/* Section 1: Query input */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <StaticHeader title="Ask a Question" icon="💬" />
        <div className="bg-white dark:bg-gray-900 px-4 py-4 flex flex-col gap-3">
          <QueryInput onSubmit={handleSubmit} loading={loading} />
          {error && <ErrorBanner message={error} />}
        </div>
      </div>

      {result && (
        <>
          {/* Section 2: AI Response */}
          <ErrorBoundary>
            <CollapsibleSection
              title="AI Response"
              icon="🔍"
              badge={`${chunks.length} schema chunks retrieved`}
              defaultOpen={false}
            >
              <RagRationale rationale={result.rationale ?? ""} chunks={chunks} />
            </CollapsibleSection>
          </ErrorBoundary>

          {/* Section 3: Generated SQL */}
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

          {/* Section 4: Results */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <StaticHeader
              title="Query Results"
              icon="📊"
              badge={
                result.is_large_result
                  ? `${(result.total_count ?? 0).toLocaleString("en-US")}+ rows`
                  : `${rowCount} row${rowCount !== 1 ? "s" : ""}`
              }
            />
            <div className="bg-white dark:bg-gray-900">
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
    <Routes>
      {/* MainLayout wraps all pages — provides sidebar, tabs, breadcrumbs, dark mode toggle */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/ag-grid-testing" element={<AgGridTestingPage />} />
        <Route path="/workflow" element={<WorkflowDashboardPage />} />
        <Route path="/workflow/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/workflow/monitor" element={<WorkflowMonitorPage />} />
      </Route>
    </Routes>
  );
}
