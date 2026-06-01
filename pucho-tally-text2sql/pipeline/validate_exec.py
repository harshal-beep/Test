#!/usr/bin/env python3
"""
pipeline/validate_exec.py — Stage 5: Execution validation.

Runs each SQL from data/raw/instances.jsonl against Supabase.
Passes: query executes without error.
Warning: query returns 0 rows (flagged but kept unless --strict-rows).
Fails: query raises a DB exception.

On failure, the skeleton_id is logged so the skeleton can be fixed
and instantiate.py re-run before retrying validation.

Usage:
  python pipeline/validate_exec.py                   # validate all
  python pipeline/validate_exec.py --workers 8       # parallel (default 4)
  python pipeline/validate_exec.py --strict-rows     # fail on 0-row results
  python pipeline/validate_exec.py --skeleton ID     # one skeleton only
  python pipeline/validate_exec.py --limit 20        # first N instances
  python pipeline/validate_exec.py --dry-run         # syntax check only, no DB
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

RAW_PATH       = ROOT / "data" / "raw" / "instances.jsonl"
VALIDATED_PATH = ROOT / "data" / "validated" / "instances.jsonl"
FAILURES_PATH  = ROOT / "data" / "validated" / "failures.jsonl"

# Intents that legitimately return 0 rows in some data states
ALLOW_EMPTY_INTENTS = {
    "negative_stock", "missing_gstin", "dormant_customers", "batch_expiry",
    "cheques_pending", "round_off", "bank_recon", "godown_transfer",
    "contra_entries", "uom_check",
}

SEARCH_PATH_PREFIX = "SET search_path TO tally_t2s;\n"


def make_pool(n_workers: int):
    """Return a psycopg ConnectionPool for concurrent validation."""
    try:
        from psycopg_pool import ConnectionPool
    except ImportError:
        sys.exit("psycopg_pool not installed. Run: pip install 'psycopg-pool'")

    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        sys.exit("SUPABASE_DB_URL not set in .env")
    return ConnectionPool(url, min_size=1, max_size=n_workers, open=True)


def validate_one(instance: dict, conn) -> dict:
    """
    Execute one instance's SQL.
    Returns enriched dict with validation_status, row_count, error.
    """
    sql = SEARCH_PATH_PREFIX + instance["sql"]
    t0 = time.monotonic()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            row_count = len(rows)
            elapsed = time.monotonic() - t0
            # Check for meaningful result
            is_empty = row_count == 0
            allow_empty = instance["intent"] in ALLOW_EMPTY_INTENTS
            if is_empty and not allow_empty:
                status = "warn_empty"
            else:
                status = "pass"
            return {
                **instance,
                "validation_status": status,
                "row_count": row_count,
                "elapsed_ms": round(elapsed * 1000),
                "error": None,
            }
    except Exception as e:
        elapsed = time.monotonic() - t0
        return {
            **instance,
            "validation_status": "fail",
            "row_count": -1,
            "elapsed_ms": round(elapsed * 1000),
            "error": str(e),
        }


def dry_run_check(instances: list[dict]) -> None:
    """Syntax/placeholder check without a DB connection."""
    import re
    issues = []
    for inst in instances:
        leftover = re.findall(r'\{(\w+)\}', inst["sql"])
        if leftover:
            issues.append((inst["id"], f"unfilled slots: {leftover}"))

    if issues:
        print(f"FAIL: {len(issues)} instances with unfilled slots:")
        for iid, msg in issues:
            print(f"  {iid}: {msg}")
    else:
        print(f"OK: {len(instances)} instances, no unfilled slots")


def main():
    parser = argparse.ArgumentParser(description="Execution-validate NL→SQL instances")
    parser.add_argument("--workers", type=int, default=4,
                        help="Parallel DB connections (default 4)")
    parser.add_argument("--strict-rows", action="store_true",
                        help="Treat 0-row results as failures (not warnings)")
    parser.add_argument("--skeleton", metavar="ID",
                        help="Validate only instances from this skeleton")
    parser.add_argument("--limit", type=int,
                        help="Validate only first N instances")
    parser.add_argument("--dry-run", action="store_true",
                        help="Placeholder check only, no DB queries")
    args = parser.parse_args()

    # Load instances
    with open(RAW_PATH, encoding="utf-8") as f:
        instances = [json.loads(l) for l in f]

    if args.skeleton:
        instances = [i for i in instances if i["skeleton_id"] == args.skeleton]
        if not instances:
            sys.exit(f"No instances found for skeleton '{args.skeleton}'")

    if args.limit:
        instances = instances[: args.limit]

    print(f"Validating {len(instances)} instances ...")

    if args.dry_run:
        dry_run_check(instances)
        return

    # Connect
    pool = make_pool(args.workers)

    results: list[dict] = []
    done = 0
    t_start = time.monotonic()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {}
        for inst in instances:
            conn = pool.getconn()
            fut = executor.submit(validate_one, inst, conn)
            futures[fut] = conn

        for fut in as_completed(futures):
            conn = futures[fut]
            pool.putconn(conn)
            result = fut.result()
            results.append(result)
            done += 1
            if done % 20 == 0 or done == len(instances):
                elapsed = time.monotonic() - t_start
                print(f"  {done}/{len(instances)} ({elapsed:.1f}s)", end="\r")

    pool.close()
    print()

    # Re-sort to original order for determinism
    id_order = {inst["id"]: i for i, inst in enumerate(instances)}
    results.sort(key=lambda r: id_order.get(r["id"], 9999))

    # Partition
    passed   = [r for r in results if r["validation_status"] in ("pass", "warn_empty")]
    warnings = [r for r in results if r["validation_status"] == "warn_empty"]
    failed   = [r for r in results if r["validation_status"] == "fail"]

    if args.strict_rows:
        passed   = [r for r in results if r["validation_status"] == "pass"]
        failed   += warnings
        warnings = []

    # Write outputs
    VALIDATED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(VALIDATED_PATH, "w", encoding="utf-8") as f:
        for r in passed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(FAILURES_PATH, "w", encoding="utf-8") as f:
        for r in failed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Report
    total = len(results)
    pass_rate = len(passed) / total * 100 if total else 0
    print(f"\n── Validation Results ──────────────────────")
    print(f"  Total:    {total}")
    print(f"  Pass:     {len(passed) - len(warnings)} ({(len(passed)-len(warnings))/total*100:.1f}%)")
    print(f"  Warn(0row):{len(warnings)} ({len(warnings)/total*100:.1f}%)")
    print(f"  Fail:     {len(failed)} ({len(failed)/total*100:.1f}%)")
    print(f"  Pass rate:{pass_rate:.1f}%  (target ≥95%)")
    print(f"\nWritten → {VALIDATED_PATH} ({len(passed)} instances)")
    print(f"Written → {FAILURES_PATH} ({len(failed)} failures)")

    if failed:
        print(f"\n── Failed skeletons (fix these, re-run instantiate + validate) ──")
        skeleton_errors: dict[str, list[str]] = defaultdict(list)
        for r in failed:
            skeleton_errors[r["skeleton_id"]].append(r["error"] or "unknown")
        for sk_id, errs in skeleton_errors.items():
            # Show first unique error per skeleton
            unique_err = list(dict.fromkeys(errs))[0]
            print(f"  {sk_id}: {unique_err[:100]}")

    if warnings:
        print(f"\n── 0-row warnings (check seed data if unexpected) ──")
        for r in warnings[:10]:
            print(f"  {r['id']} (intent: {r['intent']})")
        if len(warnings) > 10:
            print(f"  ... and {len(warnings)-10} more")

    dod_pass = pass_rate >= 95.0
    print(f"\nStage 5 DoD: {'PASSED' if dod_pass else 'FAILED'} (pass rate {pass_rate:.1f}% vs target 95%)")


if __name__ == "__main__":
    main()
