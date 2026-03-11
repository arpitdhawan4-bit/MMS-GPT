/**
 * WorkflowMonitorPage  —  /workflow/monitor
 * ------------------------------------------
 * • Summary count cards (running / completed / failed)
 * • Running workflow instances table with live SLA countdown
 * • Recently completed instances table
 * • Auto-refreshes every 30 seconds
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface RunningInst {
  instance_id: number; ticket_id: number; ticket_number: string;
  customer_name: string; subject: string;
  current_phase_key: string; phase_label: string; phase_color: string;
  priority: string; agent_name: string | null;
  next_escalation_at: string | null; phase_entered_at: string; started_at: string;
  scheduler_job_id: string | null;
}
interface CompletedInst {
  instance_id: number; ticket_id: number; ticket_number: string;
  customer_name: string; phase_label: string; phase_color: string;
  priority: string; completed_at: string | null; started_at: string;
}
interface Counts { running: number; completed: number; failed?: number }

function countdown(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 0)   return { label: "⚠ Overdue", color: "text-red-400 font-semibold" };
  if (mins < 60)  return { label: `${mins}m`, color: "text-red-400 font-semibold" };
  if (mins < 240) return { label: `${Math.round(mins/60)}h ${mins%60}m`, color: "text-amber-400" };
  return { label: `${Math.round(mins/60)}h`, color: "text-gray-400" };
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function PhasePill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: color + "22",
        color: color,
        border: `1px solid ${color}44`,
      }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function PriorityDot({ p }: { p: string }) {
  const c = { high: "#f87171", medium: "#fbbf24", low: "#4ade80" }[p] ?? "#9ca3af";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
      <span className="text-xs" style={{ color: c }}>{p}</span>
    </span>
  );
}

function CountCard({ label, value, icon, color }: {
  label: string; value: number; icon: string; color: string;
}) {
  return (
    <div className={`rounded-xl border ${color} px-5 py-4 flex items-center gap-4`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

export default function WorkflowMonitorPage() {
  const navigate = useNavigate();
  const [running, setRunning] = useState<RunningInst[]>([]);
  const [completed, setCompleted] = useState<CompletedInst[]>([]);
  const [counts, setCounts] = useState<Counts>({ running: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/workflow/monitor`);
      const d = await r.json();
      setRunning(d.running ?? []);
      setCompleted(d.completed ?? []);
      setCounts(d.counts ?? {});
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const runningCount  = Number(counts["running"]   ?? 0);
  const completedCount= Number(counts["completed"] ?? 0);
  const totalCount    = runningCount + completedCount;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">📡 Workflow Monitor</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Live view of APScheduler-backed workflow instances · SLA timers stored in DB
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
          <button onClick={load}
            className="px-3 py-2 text-xs border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Count Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountCard label="Total Instances" value={totalCount}    icon="⚙️" color="border-gray-700" />
        <CountCard label="Running"         value={runningCount}  icon="🔄" color="border-blue-800" />
        <CountCard label="Completed"       value={completedCount}icon="✅" color="border-green-800" />
        <CountCard label="With SLA Jobs"
          value={running.filter(r => r.scheduler_job_id).length}
          icon="⏰" color="border-amber-800" />
      </div>

      {/* ── DB-driven engine callout ─────────────────────────────────────── */}
      <div className="rounded-xl border border-purple-900/40 bg-purple-950/20 px-5 py-3 text-sm text-purple-300 flex items-start gap-3">
        <span className="text-lg mt-0.5">🔬</span>
        <div>
          <span className="font-medium">How the engine works:</span>
          <span className="text-purple-400"> Each running instance has an APScheduler job stored in PostgreSQL.
          When the SLA timer fires, </span>
          <code className="text-purple-300 text-xs bg-purple-950/50 px-1 rounded">escalate_job(instance_id)</code>
          <span className="text-purple-400"> reads the next phase from </span>
          <code className="text-xs text-purple-300 bg-purple-950/50 px-1 rounded">workflow_sla_rules</code>
          <span className="text-purple-400"> and transitions — zero hardcoded logic.</span>
        </div>
      </div>

      {/* ── Running Instances ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">🔄 Running Workflows</span>
          <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full">
            {runningCount} active
          </span>
        </div>
        <div className="bg-gray-900 overflow-x-auto">
          {loading ? (
            <div className="py-10 text-center text-gray-500 text-sm">Loading…</div>
          ) : running.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">No running workflows</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-700 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Ticket</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Current Phase</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Assigned</th>
                  <th className="px-4 py-3 text-left">SLA Countdown</th>
                  <th className="px-4 py-3 text-left">Next Escalation</th>
                  <th className="px-4 py-3 text-left">Job ID</th>
                  <th className="px-4 py-3 text-left">Started</th>
                </tr>
              </thead>
              <tbody>
                {running.map(r => {
                  const cd = countdown(r.next_escalation_at);
                  return (
                    <tr key={r.instance_id}
                      className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/workflow/tickets/${r.ticket_id}`)}>
                      <td className="px-4 py-3 text-indigo-400 font-mono font-medium">
                        {r.ticket_number}
                      </td>
                      <td className="px-4 py-3 text-gray-200 max-w-[140px] truncate">
                        {r.customer_name}
                      </td>
                      <td className="px-4 py-3">
                        <PhasePill label={r.phase_label} color={r.phase_color} />
                      </td>
                      <td className="px-4 py-3"><PriorityDot p={r.priority} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {r.agent_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {cd ? (
                          <span className={`text-xs ${cd.color}`}>{cd.label}</span>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {fmt(r.next_escalation_at)}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-600 truncate max-w-[120px] block">
                          {r.scheduler_job_id ?? "—"}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmt(r.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Recently Completed ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">✅ Recently Completed</span>
          <span className="text-xs bg-green-900/50 text-green-300 border border-green-800 px-2 py-0.5 rounded-full">
            last 20
          </span>
        </div>
        <div className="bg-gray-900 overflow-x-auto">
          {completed.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">No completed workflows yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-700 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Ticket</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Final Phase</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Completed</th>
                </tr>
              </thead>
              <tbody>
                {completed.map(c => (
                  <tr key={c.instance_id}
                    className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/workflow/tickets/${c.ticket_id}`)}>
                    <td className="px-4 py-3 text-indigo-400 font-mono">{c.ticket_number}</td>
                    <td className="px-4 py-3 text-gray-300">{c.customer_name}</td>
                    <td className="px-4 py-3">
                      <PhasePill label={c.phase_label} color={c.phase_color} />
                    </td>
                    <td className="px-4 py-3"><PriorityDot p={c.priority} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(c.started_at)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmt(c.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
