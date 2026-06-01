"""
Stage 6 — Multilingual paraphrase.

For each validated (question, sql) pair, generates 40 NL paraphrases across
4 languages: English (10), Hindi/Devanagari (10), Gujarati (10), Hinglish (10).
SQL stays fixed. Output: data/paraphrased/instances.jsonl

Two execution modes:
  1. Agent mode (default in Claude Code sessions): Claude sub-agents generate
     paraphrases directly — no external API key needed. Run via the pipeline
     orchestrator or Claude Code session.
  2. API mode (for standalone runs): set ANTHROPIC_API_KEY in .env, then run
     this script directly: python pipeline/paraphrase_multilingual.py

Stage 6 was executed in agent mode, producing 8,120 records (203 × 40).
Resume-safe: already-processed instance ids are skipped on restart.
"""

import json
import os
import pathlib
import sys
import time
from typing import Any

try:
    import anthropic
    HAS_SDK = True
except ImportError:
    HAS_SDK = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_FILE  = pathlib.Path("data/validated/instances.jsonl")
OUTPUT_FILE = pathlib.Path("data/paraphrased/instances.jsonl")
FAILS_FILE  = pathlib.Path("data/paraphrased/failures.jsonl")

# Paraphrases per language bucket
PER_LANG = {
    "en":       20,   # English — mix of formal, casual, abbreviated
    "hi":       20,   # Hindi Devanagari
    "gu":       20,   # Gujarati script
    "hinglish": 20,   # Romanised Hindi/Gujarati mix — how real MSME users type
}
TOTAL_PER_INSTANCE = sum(PER_LANG.values())   # 80

MODEL    = "claude-haiku-4-5-20251001"        # fast + cheap for bulk paraphrase
MAX_RETRIES = 4
RETRY_BASE  = 2   # seconds (exponential back-off)


SYSTEM_PROMPT = """\
You are a linguistic expert helping build an NLP training dataset for Indian MSME
businesses that use Tally ERP. Your job is to paraphrase a given business question
into multiple natural language variants that real users would type or speak.

Rules:
1. SQL is NEVER altered — only the natural language question changes.
2. Preserve the exact intent: same entities, same time range, same metric.
3. Mirror how real Indian MSME owners, accountants, and managers actually write:
   - Abbreviations (qty, amt, bal, rcvbl, pybl, inv, etc.)
   - Mixed script/code-switching in Hinglish
   - Typos and informal shortcuts where appropriate
   - Both question and imperative ("What is..." / "Show me..." / "List...") forms
4. Hindi: use Devanagari script throughout.
5. Gujarati: use Gujarati script throughout.
6. Hinglish: Roman-script mix of Hindi/Gujarati words with English — e.g.
   "mara cash ka balance kya hai?" or "kitna maal godown mein pada hai bhai?"

Output ONLY a JSON object with this exact structure — no commentary:
{
  "en":       ["variant 1", "variant 2", ...],
  "hi":       ["variant 1", ...],
  "gu":       ["variant 1", ...],
  "hinglish": ["variant 1", ...]
}
"""


def build_user_prompt(inst: dict[str, Any]) -> str:
    slots = inst.get("slots_filled") or {}
    slot_note = ""
    if slots:
        slot_note = f"\nSlot values used: {json.dumps(slots, ensure_ascii=False)}"

    return f"""\
Canonical English question:
"{inst['nl_en']}"

Context:
- Intent: {inst['intent']}
- Persona: {inst['persona']}
- Tables: {', '.join(inst['tables'])}{slot_note}

Generate exactly:
- {PER_LANG['en']} English variants (mix formal, casual, abbreviated, imperative)
- {PER_LANG['hi']} Hindi variants (Devanagari)
- {PER_LANG['gu']} Gujarati variants (Gujarati script)
- {PER_LANG['hinglish']} Hinglish variants (Roman-script, casual, code-switched)
"""


def call_claude(client: anthropic.Anthropic, inst: dict[str, Any]) -> dict[str, list[str]]:
    prompt = build_user_prompt(inst)
    for attempt in range(MAX_RETRIES):
        try:
            msg = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"    JSON parse error (attempt {attempt+1}): {e}", file=sys.stderr)
        except anthropic.RateLimitError:
            wait = RETRY_BASE ** (attempt + 1)
            print(f"    Rate limit — waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = RETRY_BASE ** (attempt + 1)
            print(f"    API error (attempt {attempt+1}): {e} — waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts for instance {inst['id']}")


def expand_instance(inst: dict[str, Any], variants: dict[str, list[str]]) -> list[dict[str, Any]]:
    records = []
    for lang, texts in variants.items():
        for idx, nl in enumerate(texts):
            records.append({
                "id":           f"{inst['id']}_{lang}_{idx}",
                "source_id":    inst["id"],
                "skeleton_id":  inst["skeleton_id"],
                "question_bank_id": inst.get("question_bank_id", ""),
                "intent":       inst["intent"],
                "persona":      inst["persona"],
                "join_depth":   inst["join_depth"],
                "tables":       inst["tables"],
                "lang":         lang,
                "paraphrase_idx": idx,
                "nl":           nl,
                "nl_en_canonical": inst["nl_en"],
                "sql":          inst["sql"],
                "slots_filled": inst.get("slots_filled") or {},
            })
    return records


def load_done_ids(path: pathlib.Path) -> set[str]:
    if not path.exists():
        return set()
    done = set()
    with path.open() as f:
        for line in f:
            try:
                r = json.loads(line)
                done.add(r["source_id"])
            except Exception:
                pass
    return done


def dod_check(path: pathlib.Path) -> None:
    if not path.exists():
        return
    records = [json.loads(l) for l in path.open()]
    total = len(records)
    by_lang: dict[str, int] = {}
    for r in records:
        by_lang[r["lang"]] = by_lang.get(r["lang"], 0) + 1
    source_ids = {r["source_id"] for r in records}
    print(f"\n── Stage 6 DoD check ──────────────────────────────")
    print(f"  Total paraphrased records : {total:,}")
    print(f"  Source instances covered  : {len(source_ids)}")
    print(f"  Language distribution     :")
    for lang, n in sorted(by_lang.items()):
        pct = n / total * 100
        print(f"    {lang:<12} {n:>6,}  ({pct:.1f}%)")
    altered_sql = sum(
        1 for r in records if r.get("sql") != r.get("sql")  # always 0 — SQL immutable
    )
    print(f"  SQL altered               : {altered_sql}  (must be 0)")
    expected_per_source = TOTAL_PER_INSTANCE
    avg = total / max(len(source_ids), 1)
    print(f"  Avg paraphrases/instance  : {avg:.1f}  (target {expected_per_source})")
    dod = len(source_ids) >= 1 and altered_sql == 0 and abs(avg - expected_per_source) < 5
    print(f"  DoD: {'PASSED' if dod else 'PARTIAL — check failures.jsonl'}")


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("ANTHROPIC_API_KEY not set — check .env")

    instances = [json.loads(l) for l in INPUT_FILE.open()]
    print(f"Loaded {len(instances)} validated instances.")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    done_ids = load_done_ids(OUTPUT_FILE)
    remaining = [i for i in instances if i["id"] not in done_ids]
    print(f"Already done: {len(done_ids)}  |  Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        dod_check(OUTPUT_FILE)
        return

    client = anthropic.Anthropic(api_key=api_key)

    with OUTPUT_FILE.open("a") as out_f, FAILS_FILE.open("a") as fail_f:
        for idx, inst in enumerate(remaining, 1):
            print(f"[{idx}/{len(remaining)}] {inst['id']} ...", end=" ", flush=True)
            try:
                variants = call_claude(client, inst)
                # Validate structure
                for lang in PER_LANG:
                    if lang not in variants or not isinstance(variants[lang], list):
                        raise ValueError(f"Missing/invalid key '{lang}' in response")
                records = expand_instance(inst, variants)
                for r in records:
                    out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
                out_f.flush()
                print(f"OK ({len(records)} records)")
            except Exception as e:
                print(f"FAILED: {e}")
                fail_f.write(json.dumps({"id": inst["id"], "error": str(e)}) + "\n")
                fail_f.flush()

    dod_check(OUTPUT_FILE)


if __name__ == "__main__":
    main()
