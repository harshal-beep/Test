#!/usr/bin/env python3
"""
pipeline/instantiate.py — Stage 4: Instantiate skeletons.

Fills {slots} in each skeleton with real values sampled from the
seeded Supabase DB, then writes raw (question, sql) pairs to
data/raw/instances.jsonl.

Usage:
  python pipeline/instantiate.py              # N=5 per slotted skeleton
  python pipeline/instantiate.py --n 10       # more instances
  python pipeline/instantiate.py --dry-run    # print first 20, no file write
  python pipeline/instantiate.py --seed 42    # reproducible sampling
  python pipeline/instantiate.py --candidates-file pipeline/candidates.json
"""

import argparse
import json
import os
import random
import re
import sys
import uuid
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

OUT_PATH = ROOT / "data" / "raw" / "instances.jsonl"

# ── Slot candidate queries ────────────────────────────────────────────────────
# Each slot type maps to a SQL query that returns candidate values from the DB.
# We fetch once at startup and sample from the list during instantiation.

SLOT_QUERIES = {
    "party_name": """
        SELECT DISTINCT name FROM mst_ledger
        WHERE parent IN ('Sundry Debtors', 'Sundry Creditors')
        ORDER BY name
    """,
    "item_name": """
        SELECT DISTINCT name FROM mst_stock_item
        WHERE closing_balance IS NOT NULL
        ORDER BY name
    """,
    "ledger_name": """
        SELECT DISTINCT name FROM mst_ledger
        ORDER BY name
        LIMIT 200
    """,
    "group_name": """
        SELECT DISTINCT name FROM mst_group
        ORDER BY name
    """,
    "voucher_number": """
        SELECT DISTINCT voucher_number FROM trn_voucher
        WHERE is_invoice = 1
        ORDER BY voucher_number
        LIMIT 100
    """,
    "date": """
        SELECT DISTINCT date::text FROM trn_voucher
        WHERE is_invoice = 1
        ORDER BY date
        LIMIT 200
    """,
    "cost_centre_name": """
        SELECT DISTINCT name FROM mst_cost_centre
        ORDER BY name
    """,
}

# Month candidates: fiscal year Apr–Mar
MONTH_CANDIDATES = list(range(1, 13))


def load_candidates_file(path: str) -> dict[str, list[str]]:
    """Load pre-fetched candidates from a JSON file (avoids live DB requirement)."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def connect_db():
    """Return a psycopg connection using SUPABASE_DB_URL from .env."""
    try:
        import psycopg
    except ImportError:
        sys.exit("psycopg not installed. Run: pip install 'psycopg[binary]'")

    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        sys.exit("SUPABASE_DB_URL not set in .env")

    try:
        conn = psycopg.connect(url, connect_timeout=15)
        return conn
    except Exception as e:
        sys.exit(f"DB connection failed: {e}\nCheck SUPABASE_DB_URL in .env")


def fetch_candidates(conn) -> dict[str, list[str]]:
    """Fetch candidate values for every slot type from the live DB."""
    candidates: dict[str, list[str]] = {}
    with conn.cursor() as cur:
        for slot_type, query in SLOT_QUERIES.items():
            cur.execute(query)
            rows = cur.fetchall()
            candidates[slot_type] = [str(r[0]) for r in rows if r[0] is not None]
            print(f"  {slot_type}: {len(candidates[slot_type])} candidates")

    candidates["month"] = [str(m) for m in MONTH_CANDIDATES]
    return candidates


def find_placeholders(text: str) -> list[str]:
    """Return distinct {slot_name} placeholders found in text."""
    return list(dict.fromkeys(re.findall(r'\{(\w+)\}', text)))


def fill(template: str, values: dict[str, str]) -> str:
    """Replace {slot} with its sampled value in template."""
    result = template
    for k, v in values.items():
        result = result.replace(f"{{{k}}}", v)
    return result


def sample_values(
    slots: dict,
    candidates: dict[str, list[str]],
    rng: random.Random,
) -> dict[str, str] | None:
    """
    Sample one value per slot from candidates.
    Returns None if any slot type has no candidates.
    """
    out = {}
    for slot_name, slot_meta in slots.items():
        slot_type = slot_meta.get("type", slot_name)
        pool = candidates.get(slot_type, [])
        if not pool:
            return None
        out[slot_name] = rng.choice(pool)
    return out


def instantiate_skeleton(
    skeleton: dict,
    candidates: dict[str, list[str]],
    rng: random.Random,
    n: int,
) -> list[dict]:
    """
    Produce N instances from one skeleton.
    For skeletons with no slots, produces exactly 1 instance.
    For slotted skeletons, samples N distinct value-sets.
    """
    sk_id = skeleton["id"]
    slots = skeleton.get("slots") or {}
    sql_tmpl = skeleton["sql"]
    nl_tmpl = skeleton["nl_en"]

    # Check for any unregistered placeholders in SQL that aren't in slots dict
    sql_placeholders = find_placeholders(sql_tmpl)
    nl_placeholders = find_placeholders(nl_tmpl)
    all_placeholders = set(sql_placeholders) | set(nl_placeholders)

    # Infer slot metadata for placeholders not in the slots dict
    inferred_slots = dict(slots)
    for ph in all_placeholders:
        if ph not in inferred_slots:
            # Best-effort type inference from name
            if ph in ("party",):
                inferred_slots[ph] = {"type": "party_name"}
            elif ph in ("item",):
                inferred_slots[ph] = {"type": "item_name"}
            elif ph == "ledger":
                inferred_slots[ph] = {"type": "ledger_name"}
            elif ph == "group":
                inferred_slots[ph] = {"type": "group_name"}
            elif ph == "month":
                inferred_slots[ph] = {"type": "month"}
            elif ph == "cost_centre":
                inferred_slots[ph] = {"type": "cost_centre_name"}
            elif ph in ("voucher_number",):
                inferred_slots[ph] = {"type": "voucher_number"}
            elif ph == "date":
                inferred_slots[ph] = {"type": "date"}

    base = {
        "skeleton_id": sk_id,
        "question_bank_id": skeleton.get("question_bank_id", ""),
        "intent": skeleton.get("intent", ""),
        "persona": skeleton.get("persona", ""),
        "join_depth": skeleton.get("join_depth", 0),
        "tables": skeleton.get("tables", []),
    }

    if not inferred_slots:
        # No slots — exactly 1 instance; SQL is self-contained
        remaining = find_placeholders(sql_tmpl)
        if remaining:
            # Unfilled placeholders with no slot metadata — skip
            print(f"  WARN: {sk_id} has unfilled placeholders {remaining}, skipping")
            return []
        instance_id = f"{sk_id}__0"
        return [{
            **base,
            "id": instance_id,
            "nl_en": nl_tmpl,
            "sql": sql_tmpl.strip(),
            "slots_filled": {},
        }]

    # Slotted: sample N distinct value-sets
    instances = []
    seen: set[tuple] = set()
    attempts = 0
    max_attempts = n * 10

    while len(instances) < n and attempts < max_attempts:
        attempts += 1
        vals = sample_values(inferred_slots, candidates, rng)
        if vals is None:
            break
        key = tuple(sorted(vals.items()))
        if key in seen:
            continue
        seen.add(key)

        filled_sql = fill(sql_tmpl, vals)
        filled_nl = fill(nl_tmpl, vals)

        # Verify no unfilled slots remain
        leftover = find_placeholders(filled_sql) + find_placeholders(filled_nl)
        if leftover:
            continue

        instance_id = f"{sk_id}__{len(instances)}"
        instances.append({
            **base,
            "id": instance_id,
            "nl_en": filled_nl,
            "sql": filled_sql.strip(),
            "slots_filled": vals,
        })

    return instances


def main():
    parser = argparse.ArgumentParser(description="Instantiate NL→SQL skeletons")
    parser.add_argument("--n", type=int, default=5,
                        help="Instances per slotted skeleton (default 5)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for reproducibility (default 42)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print first 20 instances, do not write file")
    parser.add_argument("--skeleton", metavar="ID",
                        help="Instantiate only this skeleton ID (for debugging)")
    parser.add_argument("--candidates-file", metavar="PATH",
                        help="JSON file of pre-fetched candidates (skips live DB)")
    args = parser.parse_args()

    rng = random.Random(args.seed)

    # Load skeletons
    skel_path = ROOT / "skeletons" / "skeletons.yaml"
    with open(skel_path) as f:
        skeletons = yaml.safe_load(f)

    if args.skeleton:
        skeletons = [s for s in skeletons if s["id"] == args.skeleton]
        if not skeletons:
            sys.exit(f"Skeleton '{args.skeleton}' not found")

    print(f"Loaded {len(skeletons)} skeletons")

    # Load candidates (from file or live DB)
    if args.candidates_file:
        print(f"Loading candidates from {args.candidates_file}")
        candidates = load_candidates_file(args.candidates_file)
        for k, v in candidates.items():
            print(f"  {k}: {len(v)} candidates")
    else:
        print("Connecting to DB and fetching candidates...")
        conn = connect_db()
        candidates = fetch_candidates(conn)
        conn.close()

    # Instantiate
    all_instances: list[dict] = []
    errors: list[str] = []

    for sk in skeletons:
        try:
            instances = instantiate_skeleton(sk, candidates, rng, args.n)
            all_instances.extend(instances)
        except Exception as e:
            errors.append(f"{sk['id']}: {e}")

    print(f"\nGenerated {len(all_instances)} instances from {len(skeletons)} skeletons")
    if errors:
        print(f"Errors ({len(errors)}):")
        for e in errors:
            print(f"  {e}")

    # Verify no unfilled slots
    unfilled = [
        inst["id"]
        for inst in all_instances
        if find_placeholders(inst["sql"]) or find_placeholders(inst["nl_en"])
    ]
    if unfilled:
        print(f"\nWARN: {len(unfilled)} instances have unfilled slots:")
        for u in unfilled[:10]:
            print(f"  {u}")
    else:
        print("✓ No unfilled slots in any instance")

    if args.dry_run:
        print("\n── First 20 instances ──")
        for inst in all_instances[:20]:
            print(json.dumps(inst, ensure_ascii=False, indent=2))
        return

    # Write output
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for inst in all_instances:
            f.write(json.dumps(inst, ensure_ascii=False) + "\n")

    print(f"\nWritten {len(all_instances)} instances → {OUT_PATH}")

    # Intent coverage summary
    from collections import Counter
    intent_counts = Counter(i["intent"] for i in all_instances)
    print(f"\nTop 10 intents by instance count:")
    for intent, cnt in intent_counts.most_common(10):
        print(f"  {intent}: {cnt}")

    print("\nStage 4 DoD check:")
    print(f"  Total instances: {len(all_instances)}")
    print(f"  Unfilled slots:  {len(unfilled)}")
    print(f"  Skeletons used:  {len(set(i['skeleton_id'] for i in all_instances))}/{len(skeletons)}")
    dod_pass = len(all_instances) > 0 and len(unfilled) == 0
    print(f"  DoD: {'PASSED' if dod_pass else 'FAILED'}")


if __name__ == "__main__":
    main()
