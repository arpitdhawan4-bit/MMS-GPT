/**
 * WorkflowDashboardPage  —  /workflow
 * -----------------------------------
 * • KPI tiles (total / open / escalated / manager review)
 * • Live ticket list
 * • "New Ticket" slide-in form → POST /api/workflow/tickets
 * • Click a ticket_number → navigate to /workflow/tickets/:id
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Stats {
  total: number; open: number; in_progress: number;
  escalated: number; manager_escalated: number;
  resolved: number; closed: number;
}
interface Agent { agent_id: number; name: string; level: string }

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KpiTile({
  label, value, icon, borderClass,
}: { label: string; value: number; icon: string; borderClass: string }) {
  return (
    <div className={`rounded-xl border ${borderClass} bg-white dark:bg-gray-900 px-5 py-4 flex items-center gap-4`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── New Ticket Form ────────────────────────────────────────────────────────────
function NewTicketForm({
  agents, onClose, onCreated,
}: {
  agents: Agent[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState({
    customer_name: "", customer_email: "", subject: "", description: "",
    sub_category: "Other", priority: "medium", assigned_to: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const SUB_CATS = ["Login","Performance","Data Loss","Integration","Configuration","Other"];

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { ...form, assigned_to: form.assigned_to ? Number(form.assigned_to) : null };
      const r = await fetch(`${API}/api/workflow/tickets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? `HTTP ${r.status}`); }
      const data = await r.json();
      onCreated(data.ticket_id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const inp = "w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500";
  const lbl = "block text-xs text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">🎫 New Support Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Customer Name *</label>
              <input required className={inp} value={form.customer_name}
                onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Customer Email *</label>
              <input required type="email" className={inp} value={form.customer_email}
                onChange={e => setForm(p => ({ ...p, customer_email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={lbl}>Subject *</label>
            <input required className={inp} value={form.subject}
              onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Description</label>
            <textarea rows={3} className={inp} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Sub-Category</label>
              <select className={inp} value={form.sub_category}
                onChange={e => setForm(p => ({ ...p, sub_category: e.target.value }))}>
                {SUB_CATS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select className={inp} value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Assign To</label>
              <select className={inp} value={form.assigned_to}
                onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {agents.map(a => (
                  <option key={a.agent_id} value={a.agent_id}>{a.name} ({a.level})</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-red-500 dark:text-red-400 text-xs">{err}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {busy ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Priority badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ p }: { p: string }) {
  const styles: Record<string, string> = {
    high:   "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
    medium: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    low:    "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[p] ?? ""}`}>
      {p}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const styles: Record<string, string> = {
    open:               "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300",
    in_progress:        "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
    escalated:          "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
    manager_escalated:  "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
    resolved:           "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
    closed:             "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  };
  const labels: Record<string, string> = {
    manager_escalated: "Mgr Review", in_progress: "In Progress",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[s] ?? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
      {labels[s] ?? s}
    </span>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function WorkflowDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, aRes, tRes] = await Promise.all([
        fetch(`${API}/api/workflow/stats`),
        fetch(`${API}/api/workflow/agents`),
        fetch(`${API}/api/workflow/tickets`),
      ]);
      setStats(await sRes.json());
      const ad = await aRes.json(); setAgents(ad.agents ?? []);
      const td = await tRes.json(); setTickets(td.tickets ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  function handleCreated(id: number) {
    setShowNewForm(false);
    navigate(`/workflow/tickets/${id}`);
  }

  const FILTERS = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "escalated", label: "Escalated" },
    { key: "manager_escalated", label: "Mgr Review" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
  ];

  const filtered = activeFilter === "all"
    ? tickets
    : tickets.filter(t => t.status === activeFilter);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🎫 Support Ticket Workflow</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            DB-driven escalation engine — phases, SLA timers, and signals all defined in database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            🔄 Refresh
          </button>
          <button onClick={() => setShowNewForm(true)}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors">
            + New Ticket
          </button>
        </div>
      </div>

      {/* KPI Tiles */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiTile label="Total Tickets"  value={stats.total}             icon="🎫" borderClass="border-gray-200 dark:border-gray-700" />
          <KpiTile label="Open"           value={stats.open}              icon="📭" borderClass="border-yellow-200 dark:border-yellow-800" />
          <KpiTile label="In Progress"    value={stats.in_progress}       icon="🔧" borderClass="border-blue-200 dark:border-blue-800" />
          <KpiTile label="Escalated"      value={stats.escalated}         icon="🔺" borderClass="border-orange-200 dark:border-orange-800" />
          <KpiTile label="Manager Review" value={stats.manager_escalated} icon="👔" borderClass="border-red-200 dark:border-red-800" />
          <KpiTile label="Resolved"       value={stats.resolved}          icon="✅" borderClass="border-green-200 dark:border-green-800" />
        </div>
      )}

      {/* Engine info banner */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/20 px-5 py-3 text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-3">
        <span className="text-lg">⚙️</span>
        <span>
          Workflow engine reads all phases, SLA timers, and signal definitions from the database.
          <span className="text-indigo-600 dark:text-indigo-400 font-medium"> Add a new workflow type by inserting rows — zero code changes.</span>
        </span>
      </div>

      {/* Ticket List */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">📋 Tickets</span>
          <div className="flex items-center gap-1">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeFilter === f.key
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Loading tickets…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No tickets found</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Ticket #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Phase</th>
                  <th className="px-4 py-3 text-left">Assigned</th>
                  <th className="px-4 py-3 text-left">Next Escalation</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {(filtered as Record<string, unknown>[]).map((t) => {
                  const nextEsc = t.next_escalation_at ? new Date(t.next_escalation_at as string) : null;
                  const now = new Date();
                  const minsLeft = nextEsc ? Math.round((nextEsc.getTime() - now.getTime()) / 60000) : null;
                  const created = t.created_at ? new Date(t.created_at as string).toLocaleDateString() : "—";
                  return (
                    <tr key={t.ticket_id as number}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/workflow/tickets/${t.ticket_id}`)}>
                      <td className="px-4 py-3 text-indigo-600 dark:text-indigo-400 font-mono font-medium hover:underline">
                        {t.ticket_number as string}
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{t.customer_name as string}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[220px] truncate" title={t.subject as string}>
                        {t.subject as string}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge p={t.priority as string} /></td>
                      <td className="px-4 py-3"><StatusBadge s={t.status as string} /></td>
                      <td className="px-4 py-3">
                        {t.phase_label ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: (t.phase_color as string) ?? "#6b7280" }} />
                            <span className="text-xs text-gray-700 dark:text-gray-300">{t.phase_label as string}</span>
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {t.agent_name as string ?? "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {minsLeft !== null ? (
                          <span className={minsLeft < 60 ? "text-red-500 dark:text-red-400 font-medium" : minsLeft < 240 ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}>
                            {minsLeft < 0 ? "Overdue" : minsLeft < 60 ? `${minsLeft}m` : `${Math.round(minsLeft / 60)}h`}
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{created}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNewForm && (
        <NewTicketForm agents={agents} onClose={() => setShowNewForm(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
