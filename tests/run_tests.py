"""
tests/run_tests.py
------------------
Runs the MMS-GPT test suite against the live API at http://localhost:8000/api/query.

Usage:
    python tests/run_tests.py

Outputs:
    - Live progress to console (pass/fail per query)
    - tests/test_results/results_<timestamp>.json   (full detail)
    - tests/test_results/summary_<timestamp>.md     (human-readable report)

Requirements:
    pip install requests
    The backend must be running: python -m uvicorn api.main:app --reload --port 8000
"""

import json
import os
import sys
import time
import io
import argparse
import requests
from datetime import datetime

# Force UTF-8 stdout so emojis / unicode work on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── Config ─────────────────────────────────────────────────────────────────
API_URL      = "http://localhost:8000/api/query"
TEST_FILE    = os.path.join(os.path.dirname(__file__), "test_queries.json")
RESULTS_DIR  = os.path.join(os.path.dirname(__file__), "test_results")
TIMEOUT_SECS = 60   # per request timeout

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── ANSI colours ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def green(s):  return f"{GREEN}{s}{RESET}"
def red(s):    return f"{RED}{s}{RESET}"
def yellow(s): return f"{YELLOW}{s}{RESET}"
def cyan(s):   return f"{CYAN}{s}{RESET}"
def bold(s):   return f"{BOLD}{s}{RESET}"


# ── Single test execution ────────────────────────────────────────────────────

def run_test(tc: dict) -> dict:
    """Execute one test case; return a result dict."""
    tid      = tc["id"]
    question = tc["question"]
    result   = {
        "id":         tid,
        "group":      tc["group"],
        "question":   question,
        "status":     "UNKNOWN",
        "failures":   [],
        "sql":        "",
        "columns":    [],
        "row_count":  0,
        "attempts":   0,
        "elapsed_s":  0.0,
        "error":      None,
    }

    t0 = time.time()
    try:
        resp = requests.post(
            API_URL,
            json={"question": question},
            timeout=TIMEOUT_SECS,
        )
        elapsed = round(time.time() - t0, 2)
        result["elapsed_s"] = elapsed

        if resp.status_code != 200:
            result["status"] = "FAIL"
            result["error"]  = f"HTTP {resp.status_code}: {resp.text[:300]}"
            result["failures"].append(f"HTTP error: {resp.status_code}")
            return result

        data             = resp.json()
        sql              = data.get("sql", "")
        columns          = data.get("columns", [])
        rows             = data.get("rows", [])
        attempts         = data.get("attempts", 0)

        result["sql"]       = sql
        result["columns"]   = columns
        result["row_count"] = len(rows)
        result["attempts"]  = attempts

        failures = []

        # ── Check 1: attempts threshold ─────────────────────────────────
        max_att = tc.get("expected_attempt_max", 1)
        if attempts > max_att:
            failures.append(f"attempts={attempts} > expected max {max_att} (needed auto-fix)")

        # ── Check 2: SQL must-contain patterns ──────────────────────────
        for pattern in tc.get("sql_must_contain", []):
            if pattern.lower() not in sql.lower():
                failures.append(f"SQL missing required pattern: '{pattern}'")

        # ── Check 3: SQL must-NOT-contain patterns ──────────────────────
        for pattern in tc.get("sql_must_not_contain", []):
            if pattern.lower() in sql.lower():
                failures.append(f"SQL contains forbidden pattern: '{pattern}'")

        # ── Check 4: Expected column names ──────────────────────────────
        col_names_lower = [c.lower() for c in columns]
        for col in tc.get("expected_cols_include", []):
            if col.lower() not in col_names_lower:
                failures.append(f"Result missing expected column: '{col}'")

        # ── Check 5: Minimum row count ──────────────────────────────────
        min_rows = tc.get("min_row_count", 1)
        if len(rows) < min_rows:
            failures.append(f"row_count={len(rows)} < expected min {min_rows}")

        result["failures"] = failures
        result["status"]   = "PASS" if not failures else "FAIL"

    except requests.exceptions.Timeout:
        result["status"] = "FAIL"
        result["error"]  = f"Request timed out after {TIMEOUT_SECS}s"
        result["failures"].append("Timeout")
    except Exception as exc:
        result["status"] = "FAIL"
        result["error"]  = str(exc)
        result["failures"].append(f"Exception: {exc}")

    result["elapsed_s"] = round(time.time() - t0, 2)
    return result


# ── Report writers ───────────────────────────────────────────────────────────

def write_json_results(results: list, path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)


def write_markdown_summary(results: list, path: str, elapsed_total: float):
    passed  = [r for r in results if r["status"] == "PASS"]
    failed  = [r for r in results if r["status"] == "FAIL"]
    pct     = round(len(passed) / len(results) * 100, 1) if results else 0
    avg_att = round(sum(r["attempts"] for r in results if r["attempts"]) / max(1, len([r for r in results if r["attempts"]])), 2)

    lines = [
        "# MMS-GPT Test Suite Results",
        f"**Run date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Total queries:** {len(results)}  |  ✅ Pass: {len(passed)}  |  ❌ Fail: {len(failed)}  |  Pass rate: {pct}%",
        f"**Total time:** {round(elapsed_total, 1)}s  |  Avg attempts per query: {avg_att}",
        "",
        "---",
        "",
        "## ❌ Failed Tests",
        "",
    ]

    if not failed:
        lines.append("*All tests passed! 🎉*")
    else:
        for r in failed:
            lines.append(f"### Test {r['id']} — `{r['group']}`")
            lines.append(f"**Question:** {r['question']}")
            lines.append(f"**Attempts:** {r['attempts']}  |  **Rows:** {r['row_count']}  |  **Time:** {r['elapsed_s']}s")
            if r.get("error"):
                lines.append(f"**Error:** {r['error']}")
            lines.append("**Failures:**")
            for fail in r["failures"]:
                lines.append(f"- {fail}")
            if r["sql"]:
                lines.append(f"**Generated SQL:**")
                lines.append(f"```sql\n{r['sql']}\n```")
            lines.append("")

    lines += [
        "---",
        "",
        "## ✅ Passed Tests",
        "",
    ]
    for r in passed:
        att_note = f"⚠️ attempts={r['attempts']}" if r["attempts"] > 1 else f"attempt={r['attempts']}"
        lines.append(f"- **#{r['id']}** `{r['group']}` — {r['question'][:80]}{'...' if len(r['question'])>80 else ''}  ({att_note}, {r['row_count']} rows, {r['elapsed_s']}s)")

    lines += [
        "",
        "---",
        "",
        "## Results by Group",
        "",
    ]

    groups = {}
    for r in results:
        g = r["group"]
        groups.setdefault(g, {"pass": 0, "fail": 0})
        if r["status"] == "PASS":
            groups[g]["pass"] += 1
        else:
            groups[g]["fail"] += 1

    lines.append("| Group | Pass | Fail | Rate |")
    lines.append("|---|---|---|---|")
    for g, counts in sorted(groups.items()):
        total = counts["pass"] + counts["fail"]
        rate  = round(counts["pass"] / total * 100)
        lines.append(f"| `{g}` | {counts['pass']} | {counts['fail']} | {rate}% |")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MMS-GPT Test Runner")
    parser.add_argument(
        "--ids",
        nargs="+",
        type=int,
        metavar="ID",
        help="Run only specific test IDs (e.g. --ids 2 5 12 44)",
    )
    args = parser.parse_args()

    # Check backend is up
    try:
        health = requests.get("http://localhost:8000/health", timeout=5)
        if health.status_code != 200:
            print(red("❌ Backend health check failed. Is the server running?"))
            sys.exit(1)
    except Exception:
        print(red("❌ Cannot reach http://localhost:8000/health"))
        print(yellow("   Start the backend first: python -m uvicorn api.main:app --reload --port 8000"))
        sys.exit(1)

    with open(TEST_FILE, "r", encoding="utf-8") as f:
        all_cases = json.load(f)

    if args.ids:
        test_cases = [tc for tc in all_cases if tc["id"] in args.ids]
        if not test_cases:
            print(red(f"No test cases matched IDs: {args.ids}"))
            sys.exit(1)
    else:
        test_cases = all_cases

    total     = len(test_cases)
    passed    = 0
    failed    = 0
    results   = []
    t_start   = time.time()

    print(bold(f"\n{'='*70}"))
    print(bold(f"  MMS-GPT Test Suite  —  {total} queries"))
    print(bold(f"{'='*70}\n"))

    for i, tc in enumerate(test_cases, 1):
        glyph = f"[{i:>2}/{total}]"
        print(f"{CYAN}{glyph}{RESET} Q{tc['id']:>2} ({tc['group'][:35]:<35})  ", end="", flush=True)

        r = run_test(tc)
        results.append(r)

        if r["status"] == "PASS":
            passed += 1
            note = f"att={r['attempts']} rows={r['row_count']} {r['elapsed_s']}s"
            print(green(f"✅ PASS") + f"  {note}")
        else:
            failed += 1
            print(red(f"❌ FAIL"))
            for fail in r["failures"]:
                print(f"        {yellow('↳')} {fail}")
            if r.get("error"):
                print(f"        {yellow('↳')} {r['error'][:120]}")

    elapsed_total = round(time.time() - t_start, 1)
    pct = round(passed / total * 100, 1) if total else 0

    print(bold(f"\n{'='*70}"))
    print(bold(f"  Results: {passed}/{total} passed ({pct}%)  —  {elapsed_total}s total"))
    print(bold(f"{'='*70}\n"))

    # Write output files
    ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path   = os.path.join(RESULTS_DIR, f"results_{ts}.json")
    md_path     = os.path.join(RESULTS_DIR, f"summary_{ts}.md")

    write_json_results(results, json_path)
    write_markdown_summary(results, md_path, elapsed_total)

    print(f"📄 JSON results → {json_path}")
    print(f"📋 Markdown summary → {md_path}\n")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
