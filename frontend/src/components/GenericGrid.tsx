/**
 * GenericGrid.tsx
 * ---------------
 * Reusable, DB-driven AG Grid component that works with ANY grid configured in
 * the planning.grid_* schema.  All behaviour (columns, editability, frozen cols,
 * format rules, page size) is loaded at runtime from the API — zero per-grid
 * hardcoding.
 *
 * Props
 *   gridName        – matches planning.grid_definitions.grid_name ("Employees", "Contacts", …)
 *   role            – current role ("admin" | "viewer") driven by parent page
 *   onPendingChange – called whenever unsaved-changes state toggles (used by parent guard)
 *
 * Imperative handle (ref)
 *   saveChanges()        – save all pending changes to the API; returns true on success
 *   discardChanges()     – cancel all pending changes and reset grid to last-loaded state
 *   hasPendingChanges()  – true when there are unsaved edits
 *
 * Data flow
 *   GET  /api/grid-data?grid_name=…    – fetch row data
 *   GET  /api/grid-config?grid_name=…   – fetch layout / column / format-rule config
 *   PATCH /api/grid-data?grid_name=…   – save pending changes
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import {
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  type ValueFormatterParams,
  type CellValueChangedEvent,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Theme ─────────────────────────────────────────────────────────────────────
const darkTheme = themeQuartz.withParams({
  backgroundColor:      "#111827",
  foregroundColor:      "#e5e7eb",
  headerBackgroundColor: "#1f2937",
  oddRowBackgroundColor: "#0d1117",
  borderColor:          "#374151",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize:   12,
  accentColor: "#6366f1",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AgGrid = AgGridReact as any;

// ── Cell-style constants ──────────────────────────────────────────────────────
const WRITE_CELL_STYLE   = { backgroundColor: "#1e3a5f", color: "#93c5fd" };
const READ_CELL_STYLE    = { backgroundColor: "#1a2535", color: "#9ca3af" };
const PENDING_CELL_STYLE = { backgroundColor: "#78350f", color: "#fed7aa" };

// ── API types ─────────────────────────────────────────────────────────────────
interface GridMeta {
  grid_id:           number;
  grid_name:         string;
  description:       string | null;
  dataset_table:     string | null;
  pagination_enabled: boolean;
  page_size:         number;
  frozen_columns:    number;
  frozen_rows:       number;
  allow_export:      boolean;
  allow_edit:        boolean;
  primary_key_field: string;   // e.g. "id" for employees, "contact_id" for contacts
}
interface GridColumnCfg {
  column_id:    number;
  field_name:   string;
  header_name:  string | null;
  data_type:    string | null;
  sortable:     boolean;
  filterable:   boolean;
  editable:     boolean;
  visible:      boolean;
  pinned:       string | null;
  column_order: number | null;
  can_view:     boolean;
  can_edit:     boolean;
}
interface FormatRule {
  field_name:           string;
  condition_expression: string | null;
  style_json:           Record<string, string>;
  priority:             number;
}
interface GridConfigResponse { grid: GridMeta; columns: GridColumnCfg[]; format_rules: FormatRule[]; }
interface RowDataResponse     { columns: string[]; column_types: string[]; rows: (string | null)[][]; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function evalCondition(expr: string, value: unknown): boolean {
  try { return !!(new Function("value", `return !!(${expr})`))(value); }
  catch { return false; }
}
function numericFormatter(p: ValueFormatterParams): string {
  if (p.value == null) return "";
  const n = Number(p.value);
  return isFinite(n) ? n.toLocaleString("en-US") : String(p.value);
}
function NullCell({ value }: CustomCellRendererProps) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#6b7280", fontStyle: "italic" }}>null</span>;
  return <span>{String(value)}</span>;
}

type PendingMap = Map<number, Record<string, unknown>>;

// ── Public types ──────────────────────────────────────────────────────────────
export type Role = "admin" | "viewer";

export interface GenericGridHandle {
  saveChanges:      () => Promise<boolean>;
  discardChanges:   () => void;
  hasPendingChanges: () => boolean;
}

interface GenericGridProps {
  gridName:        string;
  role:            Role;
  onPendingChange: (gridName: string, hasPending: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const GenericGrid = forwardRef<GenericGridHandle, GenericGridProps>(
  function GenericGrid({ gridName, role, onPendingChange }, ref) {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gridRef = useRef<any>(null);

    // ── Data & config state ─────────────────────────────────────────────────
    const [config,      setConfig]      = useState<GridConfigResponse | null>(null);
    const [rowApiData,  setRowApiData]  = useState<RowDataResponse | null>(null);
    const [configLoading, setConfigLoading] = useState(true);
    const [dataLoading,   setDataLoading]   = useState(true);
    const [fetchError,    setFetchError]    = useState<string | null>(null);

    // ── Pending change tracking ─────────────────────────────────────────────
    const pendingRef = useRef<PendingMap>(new Map());
    const [pendingChanges, setPendingChanges] = useState<PendingMap>(new Map());
    const hasPending = pendingChanges.size > 0;

    // ── Save state ──────────────────────────────────────────────────────────
    const [saving,   setSaving]   = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedMsg,  setSavedMsg]  = useState<string | null>(null);

    // ── Version counter: forces rowData useMemo to recompute on cancel ──────
    const [dataVersion, setDataVersion] = useState(0);

    // ── Retry counter: incrementing forces both fetch useEffects to re-run ──
    const [retryCount, setRetryCount] = useState(0);
    const doRetry = useCallback(() => setRetryCount(c => c + 1), []);

    // ── Fetch row data (re-runs on gridName change or explicit retry) ───────
    useEffect(() => {
      setDataLoading(true);
      setFetchError(null);
      fetch(`/api/grid-data?grid_name=${encodeURIComponent(gridName)}`)
        .then(r => {
          if (!r.ok) throw new Error(`Data API → HTTP ${r.status}`);
          return r.json() as Promise<RowDataResponse>;
        })
        .then(d  => { setRowApiData(d); setDataLoading(false); })
        .catch((e: Error) => { setFetchError(e.message); setDataLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridName, retryCount]);

    // ── Fetch config whenever role changes (or explicit retry) ──────────────
    useEffect(() => {
      setConfigLoading(true);
      setFetchError(null);
      fetch(`/api/grid-config?grid_name=${encodeURIComponent(gridName)}&role=${role}`)
        .then(r => {
          if (!r.ok) throw new Error(`Config API → HTTP ${r.status}`);
          return r.json() as Promise<GridConfigResponse>;
        })
        .then(d  => { setConfig(d); setConfigLoading(false); })
        .catch((e: Error) => { setFetchError(e.message); setConfigLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridName, role, retryCount]);

    // ── Notify parent whenever pending state changes ─────────────────────────
    useEffect(() => {
      onPendingChange(gridName, hasPending);
    }, [hasPending, gridName, onPendingChange]);

    // ── Row data: recomputes from immutable rowApiData on dataVersion bump ───
    const pkField = config?.grid?.primary_key_field ?? "id";

    const rowData = useMemo(() => {
      if (!rowApiData) return [];
      return rowApiData.rows.map(row =>
        Object.fromEntries(
          rowApiData.columns.map((col, i) => {
            const raw = row[i] ?? null;
            return [col, (raw !== null && rowApiData.column_types[i] === "numeric") ? Number(raw) : raw];
          })
        )
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowApiData, dataVersion]);

    // ── Column definitions ───────────────────────────────────────────────────
    const columnDefs = useMemo<ColDef[]>(() => {
      if (!config) return [];
      const { grid, columns, format_rules } = config;

      const rulesByField = new Map<string, FormatRule[]>();
      for (const r of format_rules) {
        if (!rulesByField.has(r.field_name)) rulesByField.set(r.field_name, []);
        rulesByField.get(r.field_name)!.push(r);
      }

      return columns
        .filter(c => c.visible && c.can_view)
        .map((col, idx) => {
          const isNumeric  = col.data_type === "numeric";
          const isWritable = col.editable && col.can_edit && grid.allow_edit;

          const pinned: "left" | "right" | undefined =
            col.pinned === "left"  ? "left"  :
            col.pinned === "right" ? "right" :
            idx < grid.frozen_columns ? "left" : undefined;

          const rules = rulesByField.get(col.field_name) ?? [];

          const cellStyle = (params: { value: unknown; data: Record<string, unknown> }) => {
            const rowId = params.data?.[pkField] as number;
            const isPending = pendingRef.current.get(rowId)?.[col.field_name] !== undefined;
            if (isPending) return PENDING_CELL_STYLE;
            for (const rule of rules) {
              if (rule.condition_expression && evalCondition(rule.condition_expression, params.value))
                return rule.style_json;
            }
            return isWritable ? WRITE_CELL_STYLE : READ_CELL_STYLE;
          };

          return {
            field:          col.field_name,
            headerName:     col.header_name ?? col.field_name,
            sortable:       col.sortable,
            filter:         col.filterable ? (isNumeric ? "agNumberColumnFilter" : true) : false,
            floatingFilter: col.filterable,
            resizable:      true,
            editable:       isWritable,
            pinned,
            type:           isNumeric ? "numericColumn" : undefined,
            valueFormatter: isNumeric ? numericFormatter : undefined,
            cellRenderer:   isNumeric ? undefined : NullCell,
            cellStyle,
            headerClass:    isWritable ? "text-blue-300" : undefined,
          } satisfies ColDef;
        });
    }, [config, pkField]);

    const defaultColDef = useMemo<ColDef>(() => ({ flex: 1, minWidth: 100, resizable: true }), []);

    // ── Cell edit handler ────────────────────────────────────────────────────
    const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
      const rowId = (event.data as Record<string, unknown>)?.[pkField] as number;
      const field = event.colDef.field!;

      const next = new Map(pendingRef.current);
      const row  = { ...(next.get(rowId) ?? {}) };
      row[field] = event.newValue;
      next.set(rowId, row);

      pendingRef.current = next;
      setPendingChanges(new Map(next));
      gridRef.current?.api?.refreshCells({ rowNodes: [event.node], force: true });
    }, [pkField]);

    // ── Save handler ─────────────────────────────────────────────────────────
    const doSave = useCallback(async (): Promise<boolean> => {
      if (pendingRef.current.size === 0) return true;
      setSaving(true);
      setSaveError(null);
      setSavedMsg(null);

      const updates = Array.from(pendingRef.current.entries()).map(([id, changes]) => ({ id, changes }));

      try {
        const res = await fetch(`/api/grid-data?grid_name=${encodeURIComponent(gridName)}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ updates }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
          throw new Error(err.detail ?? `HTTP ${res.status}`);
        }
        const result = await res.json() as { updated_rows: number; errors: string[] };

        pendingRef.current = new Map();
        setPendingChanges(new Map());
        gridRef.current?.api?.refreshCells({ force: true });

        const msg = result.errors.length
          ? `Saved ${result.updated_rows} rows. Warnings: ${result.errors.join("; ")}`
          : `Saved ${result.updated_rows} row(s) successfully.`;
        setSavedMsg(msg);
        setTimeout(() => setSavedMsg(null), 4000);
        return true;
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    }, [gridName]);

    // ── Cancel handler ────────────────────────────────────────────────────────
    const doCancel = useCallback(() => {
      pendingRef.current = new Map();
      setPendingChanges(new Map());
      setSaveError(null);
      setDataVersion(v => v + 1);   // forces rowData recompute from immutable rowApiData
    }, []);

    // ── Expose imperative API to parent ──────────────────────────────────────
    useImperativeHandle(ref, () => ({
      saveChanges:      doSave,
      discardChanges:   doCancel,
      hasPendingChanges: () => pendingRef.current.size > 0,
    }), [doSave, doCancel]);

    // ── Grid events ──────────────────────────────────────────────────────────
    const onGridReady = useCallback((event: GridReadyEvent) => {
      event.api.sizeColumnsToFit();
    }, []);

    const onExportCsv = useCallback(() => {
      gridRef.current?.api?.exportDataAsCsv({ fileName: `${gridName.toLowerCase()}.csv` });
    }, [gridName]);

    const onAutoSize = useCallback(() => {
      (gridRef.current?.api as GridApi | undefined)?.autoSizeAllColumns();
    }, []);

    const loading  = configLoading || dataLoading;
    const gridMeta = config?.grid;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <div className="rounded-xl border border-gray-700 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-gray-800 px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">
              📋 {gridMeta?.grid_name ?? gridName}
            </span>
            {gridMeta?.description && (
              <span className="text-xs text-gray-500 hidden sm:inline">{gridMeta.description}</span>
            )}
            {loading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
            {!loading && rowData.length > 0 && (
              <span className="text-xs text-gray-400">{rowData.length.toLocaleString("en-US")} rows</span>
            )}
            {hasPending && (
              <span className="text-xs bg-amber-900/50 border border-amber-700 text-amber-300 rounded px-2 py-0.5">
                {pendingChanges.size} row{pendingChanges.size !== 1 ? "s" : ""} with unsaved changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {gridMeta && !loading && (
              <div className="hidden md:flex items-center gap-1.5 text-xs mr-2">
                <BadgePill label="Page" value={String(gridMeta.page_size)} />
                <BadgePill label="Frozen" value={String(gridMeta.frozen_columns)} />
                <BadgePill label="Edit" value={gridMeta.allow_edit ? "on" : "off"} />
              </div>
            )}
            <button onClick={onAutoSize}
              className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors">
              ⇔ Fit
            </button>
            {gridMeta?.allow_export && (
              <button onClick={onExportCsv}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors">
                ↓ CSV
              </button>
            )}
            {hasPending && (
              <>
                <button onClick={doCancel}
                  className="rounded border border-red-700 bg-red-900/30 px-3 py-1 text-xs text-red-300 hover:bg-red-900/60 transition-colors">
                  ✕ Cancel
                </button>
                <button onClick={doSave} disabled={saving}
                  className="rounded border border-green-700 bg-green-900/30 px-3 py-1 text-xs text-green-300 hover:bg-green-900/60 transition-colors disabled:opacity-50">
                  {saving ? "Saving…" : "✓ Save"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status banners */}
        {fetchError && (
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-red-300 bg-red-950/40 border-b border-red-800">
            <span>⚠ Error loading {gridName}: {fetchError}</span>
            <button onClick={doRetry}
              className="ml-auto rounded border border-red-600 bg-red-900/50 px-3 py-0.5 text-red-200 hover:bg-red-800/60 transition-colors whitespace-nowrap">
              ↺ Retry
            </button>
          </div>
        )}
        {saveError && (
          <div className="px-4 py-2 text-xs text-red-300 bg-red-950/40 border-b border-red-800">
            ⚠ Save failed: {saveError}
          </div>
        )}
        {savedMsg && (
          <div className="px-4 py-2 text-xs text-green-300 bg-green-950/40 border-b border-green-800">
            ✓ {savedMsg}
          </div>
        )}

        {/* AG Grid */}
        <div style={{ height: 460 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading {gridName} grid…
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">
              Failed to load — check the API server.
            </div>
          ) : (
            <AgGrid
              ref={gridRef}
              theme={darkTheme}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={gridMeta?.pagination_enabled ?? true}
              paginationPageSize={gridMeta?.page_size ?? 25}
              paginationPageSizeSelector={[10, 25, 50, 100]}
              onGridReady={onGridReady}
              onCellValueChanged={onCellValueChanged}
              enableCellTextSelection={true}
              copyHeadersToClipboard={true}
              stopEditingWhenCellsLoseFocus={true}
            />
          )}
        </div>
      </div>
    );
  }
);

// ── Sub-components ─────────────────────────────────────────────────────────────
function BadgePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-300 font-medium">{value}</span>
    </span>
  );
}
