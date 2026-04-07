/**
 * TicketDetailPage  —  /workflow/tickets/:ticketId
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL ?? "";

interface Ticket {
  ticket_id: number; ticket_number: string; customer_name: string;
  customer_email: string; subject: string; description: string;
  priority: string; status: string; sub_category: string;
  assigned_to: number | null; agent_name: string | null; agent_level: string | null;
  created_at: string; updated_at: string; resolved_at: string | null;
}
interface WorkflowInst {
  instance_id: number; current_phase_key: string; status: string;
  priority: string; phase_label: string; phase_color: string;
  is_terminal: boolean; phase_entered_at: string;
  next_escalation_at: string | null; started_at: string;
}
interface Activity {
  activity_id: number; actor_name: string; action_type: string;
  description: string; old_value: string | null; new_value: string | null;
  created_at: string;
}
interface Phase {
  phase_id: number; phase_order: number; phase_key: string;
  phase_label: string; phase_color: string; is_terminal: boolean;
}
interface FieldDef {
  name: string; type: "text" | "textarea" | "select"; label: string;
  required?: boolean; source?: string; source_label?: string; source_value?: string;
}
interface Signal {
  signal_id: number; signal_key: string; signal_label: string;
  icon: string; target_phase_key: string | null;
  requires_fields: FieldDef[];
}
interface Agent { agent_id: number; name: string; level: string }

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function PriorityBadge({ p }: { p: string }) {
  const s: Record<string, string> = {
    high:   "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
    medium: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    low:    "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s[p] ?? ""}`}>{p}</span>;
}

function countdown(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 0) return { label: "Overdue", color: "text-red-500 dark:text-red-400" };
  if (mins < 60) return { label: `${mins}m`, color: "text-red-500 dark:text-red-400 font-semibold" };
  if (mins < 240) return { label: `${Math.round(mins / 60)}h ${mins % 60}m`, color: "text-amber-600 dark:text-amber-400" };
  return { label: `${Math.round(mins / 60)}h`, color: "text-gray-500 dark:text-gray-400" };
}

function WorkflowTimeline({
  phases, currentPhaseKey, nextEscAt,
}: { phases: Phase[]; currentPhaseKey: string; nextEscAt: string | null }) {
  const currentIdx = phases.findIndex(p => p.phase_key === currentPhaseKey);
  const cd = countdown(nextEscAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        {phases.map((p, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLast = i === phases.length - 1;
          return (
            <div key={p.phase_key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 relative">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isCurrent ? "scale-110 shadow-lg" : isDone ? "border-opacity-50 opacity-60" : "opacity-30"
                  }`}
                  style={isCurrent || isDone ? {
                    backgroundColor: p.phase_color + "33",
                    borderColor: p.phase_color,
                    color: p.phase_color,
                  } : { borderColor: "#9ca3af" }}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span className={`text-xs whitespace-nowrap ${isCurrent ? "text-gray-900 dark:text-white font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                  {p.phase_label}
                </span>
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${isDone ? "bg-gray-400 dark:bg-gray-500" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>
          );
        })}
      </div>
      {cd && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-500">Next escalation in:</span>
          <span className={cd.color}>{cd.label}</span>
          {nextEscAt && <span className="text-gray-400 dark:text-gray-600">({fmt(nextEscAt)})</span>}
        </div>
      )}
    </div>
  );
}

function ActionModal({
  signal, agents, onClose, onSuccess,
}: {
  signal: Signal; agents: Agent[];
  onClose: () => void; onSuccess: () => void;
}) {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inp = "w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500";
  const lbl = "block text-xs text-gray-600 dark:text-gray-400 mb-1";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/workflow/tickets/${ticketId}/signal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal_key: signal.signal_key, payload: values, actor: "Agent" }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail ?? `HTTP ${r.status}`); }
      onSuccess();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {signal.icon} {signal.signal_label}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
          {signal.requires_fields.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Confirm this action?</p>
          ) : (
            signal.requires_fields.map((f) => (
              <div key={f.name}>
                <label className={lbl}>{f.label}{f.required ? " *" : ""}</label>
                {f.type === "textarea" ? (
                  <textarea rows={3} required={f.required} className={inp}
                    value={values[f.name] ?? ""}
                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))} />
                ) : f.type === "select" ? (
                  <select required={f.required} className={inp}
                    value={values[f.name] ?? ""}
                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}>
                    <option value="">— Select —</option>
                    {agents.map(a => (
                      <option key={a.agent_id} value={a.agent_id}>{a.name} ({a.level})</option>
                    ))}
                  </select>
                ) : (
                  <input required={f.required} className={inp}
                    value={values[f.name] ?? ""}
                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))} />
                )}
              </div>
            ))
          )}
          {err && <p className="text-red-500 dark:text-red-400 text-xs">{err}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg disabled:opacity-50">
              {busy ? "Sending…" : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function actionColor(type: string) {
  const m: Record<string, string> = {
    created:      "text-blue-600 dark:text-blue-400",
    assigned:     "text-indigo-600 dark:text-indigo-400",
    escalated:    "text-orange-600 dark:text-orange-400",
    resolved:     "text-green-600 dark:text-green-400",
    closed:       "text-gray-500 dark:text-gray-500",
    phase_changed:"text-purple-600 dark:text-purple-400",
    add_note:     "text-gray-600 dark:text-gray-300",
    note_added:   "text-gray-600 dark:text-gray-300",
  };
  return m[type] ?? "text-gray-500 dark:text-gray-400";
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowInst | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [detRes, phRes, sigRes, agRes] = await Promise.all([
        fetch(`${API}/api/workflow/tickets/${ticketId}`),
        fetch(`${API}/api/workflow/phases/${ticketId}`),
        fetch(`${API}/api/workflow/signals/${ticketId}`),
        fetch(`${API}/api/workflow/agents`),
      ]);
      const det = await detRes.json();
      setTicket(det.ticket); setWorkflow(det.workflow); setActivities(det.activities ?? []);
      const ph = await phRes.json(); setPhases(ph.phases ?? []);
      const sg = await sigRes.json(); setSignals(sg.signals ?? []);
      const ag = await agRes.json(); setAgents(ag.agents ?? []);
    } finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-gray-500 dark:text-gray-400">
        Loading ticket…
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-red-500 dark:text-red-400">
        Ticket not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">

      {/* Back + Header */}
      <div>
        <button onClick={() => navigate("/workflow")}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-3 flex items-center gap-1 transition-colors">
          ← Back to Tickets
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-lg">{ticket.ticket_number}</span>
              <PriorityBadge p={ticket.priority} />
              <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide">{ticket.sub_category}</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">{ticket.subject}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {ticket.customer_name}
              <span className="text-gray-400 dark:text-gray-600 mx-1.5">·</span>
              {ticket.customer_email}
              <span className="text-gray-400 dark:text-gray-600 mx-1.5">·</span>
              Created {fmt(ticket.created_at)}
            </p>
          </div>
          {workflow && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: (workflow.phase_color ?? "#6b7280") + "33",
                  color: workflow.phase_color ?? "#9ca3af",
                  border: `1px solid ${workflow.phase_color ?? "#6b7280"}66`,
                }}>
                {workflow.phase_label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {ticket.agent_name ? `Assigned: ${ticket.agent_name}` : "Unassigned"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Workflow Timeline */}
      {phases.length > 0 && workflow && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">⚙️ Workflow Timeline
            <span className="text-xs text-gray-400 dark:text-gray-600 font-normal ml-2">
              (phases & SLA rules defined in DB)
            </span>
          </h3>
          <WorkflowTimeline
            phases={phases}
            currentPhaseKey={workflow.current_phase_key}
            nextEscAt={workflow.next_escalation_at ?? null}
          />
        </div>
      )}

      {/* Signal Action Buttons */}
      {signals.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            🎯 Actions
            <span className="text-xs text-gray-400 dark:text-gray-600 font-normal ml-2">
              (from workflow_signals table)
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {signals.map(sig => {
              const isResolve  = sig.target_phase_key === "resolved";
              const isEscalate = sig.signal_key === "escalate";
              return (
                <button key={sig.signal_key}
                  onClick={() => setActiveSignal(sig)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                    isResolve
                      ? "bg-green-50 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/70"
                      : isEscalate
                      ? "bg-orange-50 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/70"
                      : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}>
                  <span>{sig.icon}</span>
                  <span>{sig.signal_label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {ticket.description && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📄 Description</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{ticket.description}</p>
        </div>
      )}

      {/* Activity Log */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">📜 Activity Log</span>
          <span className="text-xs text-gray-500 dark:text-gray-500 ml-2">({activities.length} entries)</span>
        </div>
        <div className="bg-white dark:bg-gray-900">
          {activities.length === 0 ? (
            <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">No activities yet</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {activities.map(a => (
                <div key={a.activity_id} className="px-5 py-3 flex items-start gap-4">
                  <div className="shrink-0 w-24 text-right">
                    <span className={`text-xs font-medium ${actionColor(a.action_type)}`}>
                      {a.action_type.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{a.description}</p>
                    {(a.old_value || a.new_value) && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {a.old_value && <span className="line-through mr-2">{a.old_value}</span>}
                        {a.new_value && <span className="text-gray-600 dark:text-gray-400">→ {a.new_value}</span>}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-gray-500 dark:text-gray-600">{a.actor_name}</span>
                    <p className="text-xs text-gray-400 dark:text-gray-700">{fmt(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeSignal && (
        <ActionModal
          signal={activeSignal}
          agents={agents}
          onClose={() => setActiveSignal(null)}
          onSuccess={() => { setActiveSignal(null); load(); }}
        />
      )}
    </div>
  );
}
