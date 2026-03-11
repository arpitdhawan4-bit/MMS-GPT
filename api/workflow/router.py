"""
api/workflow/router.py
-----------------------
FastAPI router for all /api/workflow/* endpoints.

Endpoints:
  GET  /api/workflow/tickets              — list all tickets + workflow phase
  POST /api/workflow/tickets              — create ticket + start workflow
  GET  /api/workflow/tickets/{id}         — ticket detail + workflow state + activities
  POST /api/workflow/tickets/{id}/signal  — send a signal (resolve, assign, escalate…)
  GET  /api/workflow/monitor              — running workflow instances + SLA timers
  GET  /api/workflow/agents               — list support agents (for assign form)
  GET  /api/workflow/phases               — all phases for a workflow (for timeline UI)
  GET  /api/workflow/signals/{ticket_id}  — available signals for current phase
  GET  /api/workflow/stats                — KPI counts (open / escalated / resolved)
"""

import os
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

from api.workflow.engine import create_instance, send_signal, get_instance

load_dotenv(".env.local")
load_dotenv(".env")

DB_URL = os.environ["SUPABASE_DB_URL"]
router = APIRouter(prefix="/api/workflow", tags=["workflow"])


def _dict_cur():
    conn = psycopg2.connect(DB_URL)
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    return conn


def _serialize(row: dict) -> dict:
    """Convert datetime/date objects to ISO strings for JSON."""
    result = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        elif hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


# ── Request models ─────────────────────────────────────────────────────────────
class CreateTicketRequest(BaseModel):
    customer_name:  str
    customer_email: str
    subject:        str
    description:    Optional[str] = None
    sub_category:   Optional[str] = "Other"
    priority:       str = "medium"       # high | medium | low
    assigned_to:    Optional[int] = None
    actor:          Optional[str] = "User"


class SignalRequest(BaseModel):
    signal_key: str                       # resolve | assign_agent | add_note | escalate | reopen
    payload:    dict = {}                 # signal-specific fields
    actor:      str  = "User"


# ── KPI stats ──────────────────────────────────────────────────────────────────
@router.get("/stats")
def get_stats():
    """Return ticket counts grouped by status."""
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT status, COUNT(*) AS count
                FROM   planning.support_tickets
                GROUP  BY status
            """)
            rows = {r["status"]: r["count"] for r in cur.fetchall()}
        return {
            "open":               rows.get("open", 0),
            "in_progress":        rows.get("in_progress", 0),
            "escalated":          rows.get("escalated", 0),
            "manager_escalated":  rows.get("manager_escalated", 0),
            "resolved":           rows.get("resolved", 0),
            "closed":             rows.get("closed", 0),
            "total":              sum(rows.values()),
        }
    finally:
        conn.close()


# ── List tickets ───────────────────────────────────────────────────────────────
@router.get("/tickets")
def list_tickets(status: Optional[str] = None, priority: Optional[str] = None):
    """
    Return all tickets joined with current workflow phase info.
    Optional filters: ?status=open,escalated  ?priority=high
    """
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            where_parts = []
            params = []
            if status:
                statuses = [s.strip() for s in status.split(",")]
                placeholders = ",".join(["%s"] * len(statuses))
                where_parts.append(f"t.status IN ({placeholders})")
                params.extend(statuses)
            if priority:
                priorities = [p.strip() for p in priority.split(",")]
                placeholders = ",".join(["%s"] * len(priorities))
                where_parts.append(f"t.priority IN ({placeholders})")
                params.extend(priorities)

            where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

            cur.execute(f"""
                SELECT
                    t.ticket_id, t.ticket_number, t.customer_name, t.subject,
                    t.priority, t.status, t.sub_category,
                    t.assigned_to, t.created_at, t.updated_at, t.resolved_at,
                    a.name   AS agent_name,
                    wi.current_phase_key, wi.next_escalation_at,
                    wp.phase_label, wp.phase_color
                FROM   planning.support_tickets t
                LEFT JOIN planning.support_agents  a
                       ON a.agent_id = t.assigned_to
                LEFT JOIN planning.workflow_instances wi
                       ON wi.entity_id = t.ticket_id
                LEFT JOIN planning.workflow_phases  wp
                       ON wp.workflow_def_id = wi.workflow_def_id
                      AND wp.phase_key = wi.current_phase_key
                {where_sql}
                ORDER BY t.created_at DESC
            """, params)
            rows = [_serialize(dict(r)) for r in cur.fetchall()]
        return {"tickets": rows, "total": len(rows)}
    finally:
        conn.close()


# ── Create ticket ──────────────────────────────────────────────────────────────
@router.post("/tickets", status_code=201)
def create_ticket(req: CreateTicketRequest):
    """Create a new support ticket and start its workflow."""
    conn = psycopg2.connect(DB_URL)
    try:
        with conn:
            cur = conn.cursor()
            # Generate ticket number
            cur.execute("SELECT COUNT(*)+1 FROM planning.support_tickets")
            seq = cur.fetchone()[0]
            ticket_num = f"TKT-{seq:04d}"

            cur.execute("""
                INSERT INTO planning.support_tickets
                    (ticket_number, customer_name, customer_email, subject,
                     description, category, sub_category, priority, status, assigned_to)
                VALUES (%s,%s,%s,%s,%s,'Technical',%s,%s,'open',%s)
                RETURNING ticket_id
            """, (ticket_num, req.customer_name, req.customer_email, req.subject,
                  req.description, req.sub_category, req.priority, req.assigned_to))
            ticket_id = cur.fetchone()[0]

            cur.execute("""
                INSERT INTO planning.ticket_activities
                    (ticket_id, actor_name, action_type, description)
                VALUES (%s,%s,'created',%s)
            """, (ticket_id, req.actor,
                  f"Ticket created by {req.customer_name}. Subject: {req.subject}"))

        # Start workflow (outside the WITH block so it has its own transaction)
        instance_id = create_instance(ticket_id, req.priority)

        return {
            "ticket_id":   ticket_id,
            "ticket_number": ticket_num,
            "instance_id": instance_id,
            "workflow_started": True,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


# ── Ticket detail ──────────────────────────────────────────────────────────────
@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int):
    """Return full ticket detail + workflow state + recent activities."""
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT t.*, a.name AS agent_name, a.level AS agent_level
                FROM   planning.support_tickets t
                LEFT JOIN planning.support_agents a ON a.agent_id = t.assigned_to
                WHERE  t.ticket_id = %s
            """, (ticket_id,))
            ticket_row = cur.fetchone()
            if not ticket_row:
                raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
            ticket = _serialize(dict(ticket_row))

            # Activities (most recent 50)
            cur.execute("""
                SELECT * FROM planning.ticket_activities
                WHERE  ticket_id = %s
                ORDER  BY created_at DESC
                LIMIT  50
            """, (ticket_id,))
            activities = [_serialize(dict(r)) for r in cur.fetchall()]
    finally:
        conn.close()

    # Workflow state
    instance = get_instance(ticket_id)
    if instance:
        instance = _serialize(instance)

    return {
        "ticket":     ticket,
        "workflow":   instance,
        "activities": activities,
    }


# ── Send signal ────────────────────────────────────────────────────────────────
@router.post("/tickets/{ticket_id}/signal")
def post_signal(ticket_id: int, req: SignalRequest):
    """
    Send a workflow signal to a running ticket workflow.
    signal_key: resolve | assign_agent | add_note | escalate | reopen
    """
    try:
        result = send_signal(
            ticket_id=ticket_id,
            signal_key=req.signal_key,
            payload=req.payload,
            actor=req.actor,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Available signals for current phase ──────────────────────────────────────
@router.get("/signals/{ticket_id}")
def get_available_signals(ticket_id: int):
    """Return signals available for the current workflow phase of this ticket."""
    instance = get_instance(ticket_id)
    if not instance:
        return {"signals": []}

    current_phase = instance["current_phase_key"]
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT signal_id, signal_key, signal_label, icon,
                       allowed_phases, target_phase_key, requires_fields, display_order
                FROM   planning.workflow_signals
                WHERE  workflow_def_id = %s
                ORDER  BY display_order
            """, (instance["workflow_def_id"],))
            all_sigs = cur.fetchall()

        available = []
        for s in all_sigs:
            allowed = s["allowed_phases"]
            if allowed is None or current_phase in allowed:
                available.append(dict(s))

        return {"current_phase": current_phase, "signals": available}
    finally:
        conn.close()


# ── Workflow phases (for timeline UI) ──────────────────────────────────────────
@router.get("/phases/{ticket_id}")
def get_phases(ticket_id: int):
    """Return all phases for the workflow, with the current phase indicated."""
    instance = get_instance(ticket_id)
    if not instance:
        return {"phases": [], "current_phase": None}

    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT phase_id, phase_order, phase_key, phase_label,
                       phase_color, is_terminal
                FROM   planning.workflow_phases
                WHERE  workflow_def_id = %s
                ORDER  BY phase_order
            """, (instance["workflow_def_id"],))
            phases = [dict(r) for r in cur.fetchall()]

        return {
            "phases": phases,
            "current_phase": instance["current_phase_key"],
            "next_escalation_at": _serialize({"v": instance.get("next_escalation_at")})["v"],
        }
    finally:
        conn.close()


# ── Agents list ────────────────────────────────────────────────────────────────
@router.get("/agents")
def list_agents(level: Optional[str] = None):
    """Return active support agents, optionally filtered by level."""
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            if level:
                cur.execute("""
                    SELECT agent_id, name, email, level FROM planning.support_agents
                    WHERE is_active = TRUE AND level = %s ORDER BY name
                """, (level,))
            else:
                cur.execute("""
                    SELECT agent_id, name, email, level FROM planning.support_agents
                    WHERE is_active = TRUE ORDER BY level, name
                """)
            rows = [dict(r) for r in cur.fetchall()]
        return {"agents": rows}
    finally:
        conn.close()


# ── Workflow monitor (running instances + SLA countdowns) ─────────────────────
@router.get("/monitor")
def get_monitor():
    """
    Return running workflow instances with SLA countdown info.
    Designed for the /workflow/monitor dashboard page.
    """
    conn = _dict_cur()
    try:
        with conn.cursor() as cur:
            # Running instances
            cur.execute("""
                SELECT
                    wi.instance_id, wi.entity_id AS ticket_id, wi.current_phase_key,
                    wi.priority, wi.status, wi.phase_entered_at, wi.next_escalation_at,
                    wi.started_at, wi.scheduler_job_id,
                    wp.phase_label, wp.phase_color,
                    t.ticket_number, t.customer_name, t.subject, t.assigned_to,
                    a.name AS agent_name
                FROM   planning.workflow_instances wi
                JOIN   planning.workflow_phases   wp
                       ON wp.workflow_def_id = wi.workflow_def_id
                      AND wp.phase_key = wi.current_phase_key
                JOIN   planning.support_tickets t ON t.ticket_id = wi.entity_id
                LEFT JOIN planning.support_agents a ON a.agent_id = t.assigned_to
                WHERE  wi.status = 'running'
                ORDER  BY wi.next_escalation_at ASC NULLS LAST
            """)
            running = [_serialize(dict(r)) for r in cur.fetchall()]

            # Recently completed
            cur.execute("""
                SELECT
                    wi.instance_id, wi.entity_id AS ticket_id,
                    wi.current_phase_key, wi.priority, wi.status,
                    wi.started_at, wi.completed_at,
                    wp.phase_label, wp.phase_color,
                    t.ticket_number, t.customer_name
                FROM   planning.workflow_instances wi
                JOIN   planning.workflow_phases   wp
                       ON wp.workflow_def_id = wi.workflow_def_id
                      AND wp.phase_key = wi.current_phase_key
                JOIN   planning.support_tickets t ON t.ticket_id = wi.entity_id
                WHERE  wi.status = 'completed'
                ORDER  BY wi.completed_at DESC
                LIMIT  20
            """)
            completed = [_serialize(dict(r)) for r in cur.fetchall()]

            # Summary counts
            cur.execute("""
                SELECT status, COUNT(*) AS n
                FROM planning.workflow_instances GROUP BY status
            """)
            counts = {r["status"]: r["n"] for r in cur.fetchall()}

        now = datetime.now(timezone.utc).isoformat()
        return {
            "as_of":      now,
            "counts":     counts,
            "running":    running,
            "completed":  completed,
        }
    finally:
        conn.close()
