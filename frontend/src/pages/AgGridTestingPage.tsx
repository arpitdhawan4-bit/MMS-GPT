/**
 * AgGridTestingPage.tsx
 * ---------------------
 * Slim page shell that renders all AG Grid instances for the /ag-grid-testing route.
 *
 * Responsibilities of THIS file:
 *   - Shared role switcher (affects ALL grids simultaneously)
 *   - Shared colour-legend panel
 *   - Page-level unsaved-changes guard (shows one modal before switching roles)
 *   - Mounting one <GenericGrid> per configured grid
 *
 * All grid logic (data fetching, column defs, pending-change tracking, save/cancel)
 * lives in <GenericGrid>.  Adding a new grid is a single-line change here.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  GenericGrid,
  type GenericGridHandle,
  type Role,
} from "../components/GenericGrid";

const ROLES: Role[] = ["admin", "viewer"];

// ── Grids to display (add new rows here for future grids) ─────────────────────
const GRIDS: string[] = ["Employees", "Contacts", "Products"];

// ── Save-confirm modal (shown when switching roles while edits are pending) ───
interface ModalProps {
  onSaveAll:    () => void;
  onDiscardAll: () => void;
  onCancel:     () => void;
  saving:       boolean;
}
function RoleSwitchModal({ onSaveAll, onDiscardAll, onCancel, saving }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-gray-900 dark:text-white font-semibold text-base mb-2">Unsaved Changes</h3>
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
          One or more grids have unsaved changes. What would you like to do before switching roles?
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDiscardAll}
            className="px-4 py-1.5 rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 text-xs hover:bg-red-100 dark:hover:bg-red-900/70 transition-colors"
          >
            Discard All
          </button>
          <button
            onClick={onSaveAll}
            disabled={saving}
            className="px-4 py-1.5 rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs hover:bg-green-100 dark:hover:bg-green-900/70 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Legend swatch ──────────────────────────────────────────────────────────────
function LegendSwatch({ bg, label }: { bg: string; fg: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-4 rounded-sm border border-gray-200 dark:border-gray-600" style={{ backgroundColor: bg }} />
      <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AgGridTestingPage() {
  const [role, setRole] = useState<Role>("viewer");

  // Track which grids have pending changes (grid name → boolean)
  const [pendingGridSet, setPendingGridSet] = useState<Set<string>>(new Set());
  const anyPending = pendingGridSet.size > 0;

  // Role-switch guard state
  const [pendingRoleSwitch, setPendingRoleSwitch] = useState<Role | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Refs to each grid's imperative handle
  const gridRefs = useRef<Map<string, GenericGridHandle | null>>(new Map());

  // Pre-create ONE stable callback per grid name so React never sees a new ref function.
  // GRIDS is a module-level constant so the empty dep array is correct.
  const gridRefCallbacks = useMemo(
    () => Object.fromEntries(
      GRIDS.map(name => [
        name,
        (handle: GenericGridHandle | null) => { gridRefs.current.set(name, handle); },
      ])
    ) as Record<string, (h: GenericGridHandle | null) => void>,
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Called by each GenericGrid when its pending state changes
  const handlePendingChange = useCallback((gridName: string, hasPending: boolean) => {
    setPendingGridSet(prev => {
      const next = new Set(prev);
      if (hasPending) next.add(gridName);
      else next.delete(gridName);
      return next;
    });
  }, []);

  // Role-switcher click — guard if any grid has pending changes
  const handleRoleClick = useCallback((newRole: Role) => {
    if (newRole === role) return;
    if (anyPending) {
      setPendingRoleSwitch(newRole);
    } else {
      setRole(newRole);
    }
  }, [role, anyPending]);

  // Modal: Save All then switch
  const handleModalSaveAll = useCallback(async () => {
    setModalSaving(true);
    const gridsWithPending = [...pendingGridSet];
    const results = await Promise.all(
      gridsWithPending.map(name => gridRefs.current.get(name)?.saveChanges() ?? Promise.resolve(true))
    );
    setModalSaving(false);
    if (results.every(Boolean) && pendingRoleSwitch) {
      setRole(pendingRoleSwitch);
      setPendingRoleSwitch(null);
    }
  }, [pendingGridSet, pendingRoleSwitch]);

  // Modal: Discard All then switch
  const handleModalDiscardAll = useCallback(() => {
    for (const name of pendingGridSet) {
      gridRefs.current.get(name)?.discardChanges();
    }
    if (pendingRoleSwitch) {
      setRole(pendingRoleSwitch);
      setPendingRoleSwitch(null);
    }
  }, [pendingGridSet, pendingRoleSwitch]);

  // Modal: Cancel — don't switch
  const handleModalCancel = useCallback(() => setPendingRoleSwitch(null), []);

  return (
    <div className="max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-6">

      {/* Role-switch modal */}
      {pendingRoleSwitch && (
        <RoleSwitchModal
          onSaveAll={handleModalSaveAll}
          onDiscardAll={handleModalDiscardAll}
          onCancel={handleModalCancel}
          saving={modalSaving}
        />
      )}

      {/* ── Page heading ────────────────────────────────────────────────── */}
      <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          🧪 AG Grid Testing
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Grid layout and permissions driven by DB rules in{" "}
          <code className="text-indigo-300">planning.grid_*</code>.
          Data from{" "}
          <code className="text-indigo-300">planning.employees</code> /{" "}
          <code className="text-indigo-300">planning.contacts</code> /{" "}
          <code className="text-indigo-300">planning.dim_product</code>.
        </p>
      </div>

      {/* ── Role switcher ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Role</label>
        <div className="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => handleRoleClick(r)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                role === r
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {anyPending && (
          <span className="text-xs text-amber-400">
            ⚠ {pendingGridSet.size} grid{pendingGridSet.size !== 1 ? "s have" : " has"} unsaved changes
          </span>
        )}
      </div>

      {/* ── Colour legend ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Cell colour legend
        </p>
        <div className="flex flex-wrap gap-4">
          <LegendSwatch bg="#1e3a5f" fg="#93c5fd" label="Editable / write cell" />
          <LegendSwatch bg="#1a2535" fg="#9ca3af" label="Read-only cell" />
          <LegendSwatch bg="#78350f" fg="#fed7aa" label="Edited — pending save" />
          <LegendSwatch bg="#14532d" fg="#86efac" label="Salary > $100k / country = USA" />
          <LegendSwatch bg="#713f12" fg="#fde68a" label="Salary $70k – $100k" />
          <LegendSwatch bg="#7f1d1d" fg="#fca5a5" label="Salary ≤ $70k" />
          <LegendSwatch bg="#312e81" fg="#a5b4fc" label="Age ≥ 50 (senior)" />
          <LegendSwatch bg="#134e4a" fg="#5eead4" label="Age < 30 (junior)" />
          <LegendSwatch bg="#1e3a5f" fg="#93c5fd" label="International contact" />
          <LegendSwatch bg="#3b0764" fg="#d8b4fe" label="No company name" />
          <LegendSwatch bg="#451a03" fg="#fed7aa" label="Product — category (L1)" />
          <LegendSwatch bg="#1e3a5f" fg="#93c5fd" label="Product — brand (L2)" />
          <LegendSwatch bg="#052e16" fg="#86efac" label="Product — SKU / leaf (L3)" />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Pending (amber) overrides all other styles until saved or cancelled.
          Switching role applies to all grids simultaneously.
        </p>
      </div>

      {/* ── Grids ─────────────────────────────────────────────────────────── */}
      {GRIDS.map(gridName => (
        <GenericGrid
          key={gridName}
          ref={gridRefCallbacks[gridName]}
          gridName={gridName}
          role={role}
          onPendingChange={handlePendingChange}
        />
      ))}
    </div>
  );
}
