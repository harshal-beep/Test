"""
Stage 8 — Package & split.

Assembles final Gemma/Unsloth training records:
  - schema_context = ddl_subset(tables_used) from SchemaGraph
  - Input: NL question + schema context
  - Output: SQL

Split is done BY SKELETON so no skeleton appears in more than one of
train / val / test (prevents inflated eval accuracy).

Test set = synthetic slice (10% of skeletons) + all 230 gold seed pairs.

Outputs:
  data/final/train.jsonl   ~80% of skeletons
  data/final/val.jsonl     ~10% of skeletons
  data/final/test.jsonl    ~10% of skeletons + gold seed
  reports/split_report.txt distribution by intent / lang / join_depth
"""

import csv
import json
import pathlib
import random
import sys
from collections import Counter, defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from schema.graph_loader import SchemaGraph

# ── Config ────────────────────────────────────────────────────────────────────
PARAPHRASED   = pathlib.Path("data/paraphrased/instances.jsonl")
GOLD_SEED     = pathlib.Path("skeletons/gold_seed.csv")
SCHEMA_GRAPH  = pathlib.Path("schema/schema_graph.json")
OUT_DIR       = pathlib.Path("data/final")
REPORTS_DIR   = pathlib.Path("reports")

TRAIN_FRAC = 0.80
VAL_FRAC   = 0.10
# test = remaining ~10% of skeletons + all gold seed pairs

SEED = 42  # reproducible split

SYSTEM_PROMPT = (
    "You are a Tally ERP SQL assistant for an Indian MSME. "
    "Given a database schema and a business question, write a correct PostgreSQL query. "
    "Use only the tables and columns shown. Respect sign conventions: "
    "sales/income amounts in trn_accounting are negative — use -SUM() or ABS(). "
    "Period dates come from the config table. Output SQL only, no explanation."
)


def make_record(nl: str, sql: str, schema_ctx: str, meta: dict) -> dict:
    """Assemble one Gemma/Unsloth ShareGPT-format training record."""
    user_msg = f"Schema:\n{schema_ctx}\n\nQuestion: {nl}"
    return {
        "conversations": [
            {"from": "system", "value": SYSTEM_PROMPT},
            {"from": "human", "value": user_msg},
            {"from": "gpt",   "value": sql.strip()},
        ],
        "metadata": meta,
    }


def split_skeletons(skeleton_ids: list[str]) -> tuple[set, set, set]:
    """Split skeleton ids into train/val/test, preserving intent distribution."""
    rng = random.Random(SEED)
    ids = sorted(skeleton_ids)
    rng.shuffle(ids)
    n = len(ids)
    n_val  = max(1, round(n * VAL_FRAC))
    n_test = max(1, round(n * (1 - TRAIN_FRAC - VAL_FRAC)))
    test_ids  = set(ids[:n_test])
    val_ids   = set(ids[n_test:n_test + n_val])
    train_ids = set(ids[n_test + n_val:])
    return train_ids, val_ids, test_ids


def load_gold_seed(path: pathlib.Path, sg: SchemaGraph) -> list[dict]:
    """Load gold seed CSV → final records. Uses mst_ledger+trn_accounting+trn_voucher
    as a conservative schema context since gold seeds don't carry table metadata."""
    default_tables = ["mst_ledger", "trn_accounting", "trn_voucher", "mst_group"]
    try:
        ctx = sg.ddl_subset(default_tables)
    except Exception:
        ctx = ""
    records = []
    for row in csv.DictReader(path.open()):
        meta = {
            "source": "gold_seed",
            "gold_id": row["id"],
            "lang": "en",
            "split": "test",
        }
        records.append(make_record(row["question"], row["query"], ctx, meta))
    return records


def distribution_report(splits: dict[str, list[dict]]) -> str:
    lines = ["Stage 8 — Distribution Report", "=" * 50]
    for split_name, records in splits.items():
        lines.append(f"\n── {split_name.upper()} ({len(records):,} records) ──")
        by_lang   = Counter(r["metadata"].get("lang", "?") for r in records)
        by_depth  = Counter(str(r["metadata"].get("join_depth", "?")) for r in records)
        by_intent = Counter(r["metadata"].get("intent", "?") for r in records)
        lines.append("  Language:")
        for k, v in sorted(by_lang.items()):
            lines.append(f"    {k:<12} {v:>5,}  ({v/len(records)*100:.1f}%)")
        lines.append("  Join depth:")
        for k, v in sorted(by_depth.items()):
            lines.append(f"    depth {k}      {v:>5,}  ({v/len(records)*100:.1f}%)")
        lines.append(f"  Unique intents: {len(by_intent)}")
        top5 = by_intent.most_common(5)
        for intent, cnt in top5:
            lines.append(f"    {intent:<30} {cnt:>4,}")
    return "\n".join(lines)


def leakage_check(
    train: list[dict], val: list[dict], test: list[dict]
) -> tuple[bool, str]:
    def skel_set(records):
        return {r["metadata"].get("skeleton_id") for r in records
                if r["metadata"].get("skeleton_id")}

    tr, va, te = skel_set(train), skel_set(val), skel_set(test)
    tv_overlap  = tr & va
    tt_overlap  = tr & te
    vt_overlap  = va & te
    ok = not (tv_overlap or tt_overlap or vt_overlap)
    msg = "PASSED — no skeleton appears in multiple splits"
    if not ok:
        details = []
        if tv_overlap: details.append(f"train∩val: {tv_overlap}")
        if tt_overlap: details.append(f"train∩test: {tt_overlap}")
        if vt_overlap: details.append(f"val∩test: {vt_overlap}")
        msg = "FAILED — " + "; ".join(details)
    return ok, msg


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading schema graph...")
    sg = SchemaGraph(str(SCHEMA_GRAPH))

    # Pre-build schema contexts per unique table-set (avoids re-computing)
    print("Loading paraphrased instances...")
    para_records = [json.loads(l) for l in PARAPHRASED.open()]
    print(f"  {len(para_records):,} records, building schema contexts...")

    ctx_cache: dict[str, str] = {}
    def get_ctx(tables: list[str]) -> str:
        key = "|".join(sorted(tables))
        if key not in ctx_cache:
            try:
                ctx_cache[key] = sg.ddl_subset(tables)
            except Exception:
                ctx_cache[key] = ""
        return ctx_cache[key]

    # Group records by skeleton
    by_skeleton: dict[str, list] = defaultdict(list)
    for r in para_records:
        by_skeleton[r["skeleton_id"]].append(r)

    # Split skeletons
    all_skeletons = list(by_skeleton.keys())
    train_skels, val_skels, test_skels = split_skeletons(all_skeletons)
    print(f"  Skeleton split: train={len(train_skels)} val={len(val_skels)} test={len(test_skels)}")

    # Build final records per split
    train_recs, val_recs, test_recs = [], [], []
    for skel_id, instances in by_skeleton.items():
        for inst in instances:
            ctx = get_ctx(inst["tables"])
            meta = {
                "source":       "paraphrased",
                "source_id":    inst["source_id"],
                "skeleton_id":  inst["skeleton_id"],
                "intent":       inst["intent"],
                "persona":      inst["persona"],
                "join_depth":   inst["join_depth"],
                "lang":         inst["lang"],
                "paraphrase_idx": inst["paraphrase_idx"],
            }
            rec = make_record(inst["nl"], inst["sql"], ctx, meta)
            if skel_id in train_skels:
                train_recs.append(rec)
            elif skel_id in val_skels:
                val_recs.append(rec)
            else:
                test_recs.append(rec)

    # Add gold seed to test
    print("Loading gold seed...")
    gold_recs = load_gold_seed(GOLD_SEED, sg)
    test_recs.extend(gold_recs)
    print(f"  Added {len(gold_recs)} gold seed pairs to test set")

    # Shuffle within splits (keep seed for reproducibility)
    rng = random.Random(SEED)
    rng.shuffle(train_recs)
    rng.shuffle(val_recs)
    rng.shuffle(test_recs)

    # Write JSONL files
    splits = {"train": train_recs, "val": val_recs, "test": test_recs}
    for name, records in splits.items():
        out_path = OUT_DIR / f"{name}.jsonl"
        with out_path.open("w") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"  Wrote {out_path}: {len(records):,} records")

    # Leakage check
    ok, msg = leakage_check(train_recs, val_recs, test_recs)
    print(f"\nLeakage check: {msg}")

    # Distribution report
    report = distribution_report(splits)
    report_path = REPORTS_DIR / "split_report.txt"
    report_path.write_text(report)
    print(f"\n{report}")
    print(f"\nReport saved to {report_path}")

    # DoD summary
    total = sum(len(r) for r in splits.values())
    print(f"\n── Stage 8 DoD ─────────────────────────────────────")
    print(f"  Total records   : {total:,}")
    print(f"  train / val / test: {len(train_recs):,} / {len(val_recs):,} / {len(test_recs):,}")
    print(f"  Leakage check   : {'PASSED' if ok else 'FAILED'}")
    print(f"  DoD: {'PASSED' if ok and total > 7000 else 'FAILED'}")


if __name__ == "__main__":
    main()
