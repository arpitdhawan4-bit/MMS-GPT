import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import {
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  type RowSelectionOptions,
  type ValueFormatterParams,
  type IDatasource,
  type IGetRowsParams,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
} from "ag-grid-community";

// Register all AG Grid Community modules once at module level
ModuleRegistry.registerModules([AllCommunityModule]);

// Dark Quartz theme — only well-documented params to avoid runtime errors
const darkTheme = themeQuartz.withParams({
  backgroundColor: "#111827",
  foregroundColor: "#e5e7eb",
  headerBackgroundColor: "#1f2937",
  oddRowBackgroundColor: "#0d1117",
  borderColor: "#374151",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  accentColor: "#6366f1",
});

// Workaround: React 19 changed JSX class-component typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AgGrid = AgGridReact as any;

// ─── Cell renderer for text columns ──────────────────────────────────────────
function NullCell({ value }: CustomCellRendererProps) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "#6b7280", fontStyle: "italic" }}>null</span>;
  }
  return <span>{String(value)}</span>;
}

// ─── Comma-formatted value formatter for numeric columns ─────────────────────
function numericFormatter(params: ValueFormatterParams): string {
  if (params.value === null || params.value === undefined) return "";
  const n = Number(params.value);
  if (!isFinite(n)) return String(params.value);
  return n.toLocaleString("en-US");
}

// ─── Page sizes ───────────────────────────────────────────────────────────────
const CLIENT_PAGE_SIZE = 25;
const SERVER_PAGE_SIZE = 100; // larger blocks = fewer API round-trips

interface Props {
  /** Column names */
  columns: string[];
  /** "numeric" | "text" per column — provided by the API */
  columnTypes: string[];
  /** Row data. Empty array when isLargeResult=true. */
  rows: string[][];
  /** Total row count (exact for small results; lower bound for large). */
  totalCount: number;
  /** When true the grid uses the Infinite Row Model and calls /api/paginate. */
  isLargeResult: boolean;
  /** Base SQL without LIMIT/OFFSET — used as the paginate payload. */
  sqlForPagination: string;
  /** API base URL (e.g. "http://localhost:8000") */
  apiBase: string;
}

export default function ResultTable({
  columns,
  columnTypes,
  rows,
  totalCount,
  isLargeResult,
  sqlForPagination,
  apiBase,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gridRef = useRef<any>(null);
  const [quickFilter, setQuickFilter] = useState("");

  // ── Derive numeric column set from API-provided types ────────────────────
  const numericCols = useMemo(() => {
    const s = new Set<string>();
    columns.forEach((col, i) => {
      if (columnTypes[i] === "numeric") s.add(col);
    });
    return s;
  }, [columns, columnTypes]);

  // ── Column definitions (shared by both row models) ───────────────────────
  const columnDefs = useMemo<ColDef[]>(
    () =>
      columns.map((col) => {
        const isNumeric = numericCols.has(col);
        return {
          field: col,
          headerName: col,
          sortable: true,
          filter: isNumeric ? "agNumberColumnFilter" : true,
          resizable: true,
          // Floating filters add clutter in infinite mode and don't help much
          floatingFilter: !isLargeResult,
          minWidth: 80,
          type: isNumeric ? "numericColumn" : undefined,
          cellStyle: isNumeric
            ? { textAlign: "right", justifyContent: "flex-end" }
            : undefined,
          valueFormatter: isNumeric ? numericFormatter : undefined,
          cellRenderer: isNumeric ? undefined : NullCell,
        };
      }),
    [columns, numericCols, isLargeResult]
  );

  // ── Client-side: convert string[][] to array of row objects ──────────────
  const clientRowData = useMemo(() => {
    if (isLargeResult) return undefined; // not used in infinite model
    return rows.map((row) =>
      Object.fromEntries(
        columns.map((col, i) => {
          const raw = row[i] ?? null;
          if (raw !== null && numericCols.has(col)) return [col, Number(raw)];
          return [col, raw];
        })
      )
    );
  }, [columns, rows, numericCols, isLargeResult]);

  // ── Server-side: Infinite Row Model datasource ───────────────────────────
  const datasource = useMemo<IDatasource>(
    () => ({
      getRows: (params: IGetRowsParams) => {
        const { startRow, endRow, successCallback, failCallback } = params;
        const limit = endRow - startRow;

        fetch(`${apiBase}/api/paginate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: sqlForPagination, offset: startRow, limit }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<{
              columns: string[];
              column_types: string[];
              rows: (string | null)[][];
            }>;
          })
          .then((data) => {
            const rowObjects = data.rows.map((row) =>
              Object.fromEntries(
                columns.map((col, i) => {
                  const raw = row[i] ?? null;
                  if (raw !== null && numericCols.has(col)) return [col, Number(raw)];
                  return [col, raw];
                })
              )
            );
            // Tell AG Grid the last row index when we detect the final page
            const lastRow =
              data.rows.length < limit ? startRow + data.rows.length : -1;
            successCallback(rowObjects, lastRow);
          })
          .catch(() => failCallback());
      },
    }),
    [apiBase, sqlForPagination, columns, numericCols]
  );

  // ── Shared defaults ───────────────────────────────────────────────────────
  const rowSelection = useMemo<RowSelectionOptions>(
    () => ({
      mode: "multiRow",
      checkboxes: true,
      headerCheckbox: true,
      enableClickSelection: true,
    }),
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      flex: 1,
      minWidth: 100,
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: !isLargeResult,
    }),
    [isLargeResult]
  );

  const onGridReady = useCallback(
    (event: GridReadyEvent) => {
      if (!isLargeResult) event.api.sizeColumnsToFit();
    },
    [isLargeResult]
  );

  const onExportCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({ fileName: "query_results.csv" });
  }, []);

  const onQuickFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuickFilter(e.target.value),
    []
  );

  const onAutoSize = useCallback(() => {
    const api: GridApi | undefined = gridRef.current?.api;
    api?.autoSizeAllColumns();
  }, []);

  // ── Empty-state for client-side mode ─────────────────────────────────────
  if (!isLargeResult && rows.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-gray-500 text-sm">
        Query returned 0 rows.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-800/60 px-4 py-2 border-b border-gray-700">
        {/* Left: mode badge */}
        {isLargeResult ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <span>⚡</span>
            <span>
              Server-side pagination &mdash;{" "}
              {totalCount.toLocaleString("en-US")}+ rows
            </span>
          </span>
        ) : (
          /* Quick filter — client-side only */
          <input
            type="text"
            value={quickFilter}
            onChange={onQuickFilterChange}
            placeholder="Quick filter rows…"
            className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-48"
          />
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onAutoSize}
            title="Auto-size all columns to content"
            className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
          >
            ⇔ Fit
          </button>
          <button
            onClick={onExportCsv}
            title="Export current page to CSV"
            className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* ── AG Grid ───────────────────────────────────────────────────────── */}
      <div style={{ height: 480 }}>
        {!isLargeResult ? (
          /* ── Client-side Row Model (≤ 5,000 rows) ── */
          <AgGrid
            ref={gridRef}
            theme={darkTheme}
            rowData={clientRowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection={rowSelection}
            quickFilterText={quickFilter}
            pagination={true}
            paginationPageSize={CLIENT_PAGE_SIZE}
            paginationPageSizeSelector={[10, 25, 50, 100]}
            onGridReady={onGridReady}
            enableCellTextSelection={true}
            copyHeadersToClipboard={true}
          />
        ) : (
          /* ── Infinite Row Model (> 5,000 rows) ── */
          <AgGrid
            ref={gridRef}
            theme={darkTheme}
            rowModelType="infinite"
            datasource={datasource}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection={rowSelection}
            cacheBlockSize={SERVER_PAGE_SIZE}
            maxBlocksInCache={20}
            pagination={true}
            paginationPageSize={SERVER_PAGE_SIZE}
            paginationPageSizeSelector={[25, 50, 100, 200]}
            onGridReady={onGridReady}
            enableCellTextSelection={true}
            copyHeadersToClipboard={true}
          />
        )}
      </div>
    </div>
  );
}
