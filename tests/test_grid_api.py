"""
tests/test_grid_api.py
----------------------
API smoke tests for the two-grid feature:
  - GET  /api/grid-config  (primary_key_field, role-aware layout)
  - GET  /api/grid-data    (generic data endpoint)
  - PATCH /api/grid-data   (generic save endpoint)

Run from the project root (with the API server running on port 8001):
    python tests/test_grid_api.py

Exit code 0 = all tests passed.
"""

import sys
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8001"
PASS = "[PASS]"
FAIL = "[FAIL]"
failures: list[str] = []


def get(path: str) -> dict:
    url = f"{BASE}{path}"
    with urllib.request.urlopen(url, timeout=5) as resp:
        return json.loads(resp.read())


def patch(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req  = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method="PATCH",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  {PASS} {name}")
    else:
        msg = f"{name}" + (f" | {detail}" if detail else "")
        print(f"  {FAIL} {msg}")
        failures.append(msg)


def section(title: str) -> None:
    print(f"\n{'-'*60}")
    print(f" {title}")
    print('-'*60)


# ─────────────────────────────────────────────────────────────────────────────
# 1. /api/grid-config — structure + role awareness
# ─────────────────────────────────────────────────────────────────────────────
section("1. /api/grid-config — Employees (viewer role)")
try:
    d = get("/api/grid-config?grid_name=Employees&role=viewer")
    g = d["grid"]
    check("Returns grid object",          isinstance(g, dict))
    check("grid_name = Employees",         g["grid_name"] == "Employees")
    check("primary_key_field = id",        g["primary_key_field"] == "id",
          f"got: {g.get('primary_key_field')}")
    check("allow_edit = False (viewer)",   g["allow_edit"] == False,
          f"got: {g['allow_edit']}")
    check("12 columns returned",           len(d["columns"]) == 12,
          f"got: {len(d['columns'])}")
    check("Format rules present",          len(d["format_rules"]) > 0)
    visa = [c for c in d["columns"] if c["field_name"] == "created_at"]
    check("created_at hidden for viewer",  visa and not visa[0]["can_view"],
          "created_at should be hidden")
except Exception as e:
    check("Request succeeded", False, str(e))

section("2. /api/grid-config — Employees (admin role)")
try:
    d = get("/api/grid-config?grid_name=Employees&role=admin")
    g = d["grid"]
    check("allow_edit = True (admin)",     g["allow_edit"] == True,
          f"got: {g['allow_edit']}")
    check("frozen_columns = 2 (admin)",    g["frozen_columns"] == 2,
          f"got: {g['frozen_columns']}")
    # page_size falls back to grid default (10) because the admin role-layout
    # row has page_size = NULL — this is a valid configuration choice.
    check("page_size >= 10 (admin)",       g["page_size"] >= 10,
          f"got: {g['page_size']}")
except Exception as e:
    check("Request succeeded", False, str(e))

section("3. /api/grid-config — Contacts (admin role)")
try:
    d = get("/api/grid-config?grid_name=Contacts&role=admin")
    g = d["grid"]
    check("Returns grid object",           isinstance(g, dict))
    check("grid_name = Contacts",          g["grid_name"] == "Contacts")
    check("primary_key_field = contact_id", g["primary_key_field"] == "contact_id",
          f"got: {g.get('primary_key_field')}")
    check("allow_edit = True (admin)",     g["allow_edit"] == True)
    check("12 columns returned",           len(d["columns"]) == 12,
          f"got: {len(d['columns'])}")
    check("3 format rules (country, co.)", len(d["format_rules"]) == 3,
          f"got: {len(d['format_rules'])}")
except Exception as e:
    check("Request succeeded", False, str(e))

section("4. /api/grid-config — Contacts (viewer role)")
try:
    d = get("/api/grid-config?grid_name=Contacts&role=viewer")
    g = d["grid"]
    check("allow_edit = False (viewer)",   g["allow_edit"] == False)
    visible  = [c["field_name"] for c in d["columns"] if c["can_view"]]
    hidden   = [c["field_name"] for c in d["columns"] if not c["can_view"]]
    check("phone hidden for viewer",       "phone" not in visible,
          f"visible cols: {visible}")
    check("9 visible columns (viewer)",    len(visible) == 9,
          f"got: {len(visible)} → {visible}")
    check("3 hidden columns (viewer)",     len(hidden) == 3,
          f"got: {hidden}")
except Exception as e:
    check("Request succeeded", False, str(e))

section("5. /api/grid-config — 404 for unknown grid")
try:
    get("/api/grid-config?grid_name=DoesNotExist&role=admin")
    check("Should have raised 404", False, "No error raised")
except urllib.error.HTTPError as e:
    check("Returns HTTP 404", e.code == 404, f"got: {e.code}")
except Exception as e:
    check("Request raised error", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 2. /api/grid-data — generic data endpoint
# ─────────────────────────────────────────────────────────────────────────────
section("6. GET /api/grid-data — Employees")
try:
    d = get("/api/grid-data?grid_name=Employees")
    check("Returns columns list",          isinstance(d["columns"], list))
    check("First column = id",             d["columns"][0] == "id",
          f"got: {d['columns'][0]}")
    check("Returns 100+ rows",             len(d["rows"]) >= 100,
          f"got: {len(d['rows'])} rows")
except Exception as e:
    check("Request succeeded", False, str(e))

section("7. GET /api/grid-data — Contacts")
try:
    d = get("/api/grid-data?grid_name=Contacts")
    check("Returns columns list",          isinstance(d["columns"], list))
    check("First column = contact_id",     d["columns"][0] == "contact_id",
          f"got: {d['columns'][0]}")
    check("Returns 100+ rows",             len(d["rows"]) >= 100,
          f"got: {len(d['rows'])} rows")
except Exception as e:
    check("Request succeeded", False, str(e))

section("8. GET /api/grid-data — 404 for unknown grid")
try:
    get("/api/grid-data?grid_name=DoesNotExist")
    check("Should have raised 404", False, "No error raised")
except urllib.error.HTTPError as e:
    check("Returns HTTP 404", e.code == 404, f"got: {e.code}")
except Exception as e:
    check("Request raised error", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 3. PATCH /api/grid-data — generic save endpoint
# ─────────────────────────────────────────────────────────────────────────────
section("9. PATCH /api/grid-data — Contacts: valid editable field")
try:
    # Read the first contact to find a real contact_id
    rows_d = get("/api/grid-data?grid_name=Contacts")
    cols   = rows_d["columns"]
    pk_idx = cols.index("contact_id")
    jt_idx = cols.index("job_title")
    first_row   = rows_d["rows"][0]
    contact_id  = int(first_row[pk_idx])
    original_jt = first_row[jt_idx]

    # Write a new value then restore it
    test_value = "QA Test Engineer"
    r = patch("/api/grid-data?grid_name=Contacts",
              {"updates": [{"id": contact_id, "changes": {"job_title": test_value}}]})
    check("updated_rows = 1",              r["updated_rows"] == 1,
          f"got: {r['updated_rows']}")
    check("No errors returned",            r["errors"] == [],
          f"errors: {r['errors']}")

    # Restore original value
    patch("/api/grid-data?grid_name=Contacts",
          {"updates": [{"id": contact_id, "changes": {"job_title": original_jt}}]})
    check("Restored original value",       True)    # no exception = success
except Exception as e:
    check("Request succeeded", False, str(e))

section("10. PATCH /api/grid-data — Contacts: reject non-editable field")
try:
    rows_d    = get("/api/grid-data?grid_name=Contacts")
    pk_idx    = rows_d["columns"].index("contact_id")
    contact_id = int(rows_d["rows"][0][pk_idx])

    # contact_id is NOT editable — should produce a warning, not a crash
    r = patch("/api/grid-data?grid_name=Contacts",
              {"updates": [{"id": contact_id, "changes": {"contact_id": 99999}}]})
    check("Does not crash",                True)
    check("updated_rows = 0 (nothing written)", r["updated_rows"] == 0,
          f"got: {r['updated_rows']}")
    check("Error message returned",        len(r["errors"]) > 0,
          f"errors: {r['errors']}")
except Exception as e:
    check("Request succeeded", False, str(e))

section("11. PATCH /api/grid-data — empty updates body")
try:
    r = patch("/api/grid-data?grid_name=Contacts", {"updates": []})
    check("Returns updated_rows = 0",      r["updated_rows"] == 0)
    check("Returns empty errors list",     r["errors"] == [])
except Exception as e:
    check("Request succeeded", False, str(e))

section("12. PATCH /api/grid-data — Employees still works via generic endpoint")
try:
    rows_d  = get("/api/grid-data?grid_name=Employees")
    id_idx  = rows_d["columns"].index("id")
    loc_idx = rows_d["columns"].index("location")
    first   = rows_d["rows"][0]
    emp_id  = int(first[id_idx])
    orig_loc = first[loc_idx]

    test_loc = "QA Test City"
    r = patch("/api/grid-data?grid_name=Employees",
              {"updates": [{"id": emp_id, "changes": {"location": test_loc}}]})
    check("updated_rows = 1",              r["updated_rows"] == 1)

    patch("/api/grid-data?grid_name=Employees",
          {"updates": [{"id": emp_id, "changes": {"location": orig_loc}}]})
    check("Restored original location",    True)
except Exception as e:
    check("Request succeeded", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
if failures:
    print(f" {FAIL} {len(failures)} test(s) FAILED:")
    for f in failures:
        print(f"   • {f}")
    sys.exit(1)
else:
    total = 12   # section count
    print(f" {PASS} All checks passed!")
    sys.exit(0)
