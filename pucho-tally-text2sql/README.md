# Pucho Tally Text-to-SQL Dataset Builder

Builds an execution-validated, trilingual (English/Hindi/Gujarati) NL→SQL dataset to
fine-tune **Gemma 4 E2B** for Tally ERP queries over PostgreSQL/Supabase.

## Start here
1. Read **CLAUDE.md** — it is the full project spec and the build sequence.
2. `cp .env.example .env` and fill in Supabase URL + Anthropic key.
3. `pip install -r requirements.txt`
4. In Claude Code: "Read CLAUDE.md and execute Stage 0, then stop for my review."

## What's already provided (don't rebuild)
- `schema/schema_graph.json` — the Tally schema knowledge graph (26 tables, 43 FK paths).
- `schema/tally_schema_postgres.sql` — ready-to-run Postgres/Supabase DDL.
- `schema/graph_loader.py` — join-path resolver + minimal-DDL builder for schema linking. TESTED.
- `skeletons/gold_seed.csv` — 230 cleaned real NL→SQL pairs (GOLD; held-out test seed).
- `skeletons/question_bank.xlsx` — 74 persona-driven canonical questions + coverage map.

## What Claude Code builds (per CLAUDE.md)
seed/seed_data.py · skeletons/skeletons.yaml · pipeline/{instantiate,validate_exec,
paraphrase_multilingual,backtranslate_qa,package_split}.py · eval/execution_accuracy.py

## Core principle
Generate SQL from templates (correct by construction) → execute on Supabase (keep only
valid) → LLM paraphrases the questions into many languages. One canonical question →
~30–50 paraphrases × 3 languages → 8–12k validated pairs.

## Known limitation of graph_loader
When two tables share more than one FK path (e.g. ledger↔voucher via `_party_name` vs via
the accounting line), the graph returns one valid join — the skeleton must pick the
semantically correct one. This is why we author explicit skeletons, not auto-SQL.
