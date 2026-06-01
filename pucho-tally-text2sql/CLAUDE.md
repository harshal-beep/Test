# CLAUDE.md — Pucho Tally Text-to-SQL Dataset Builder

> Project instructions for Claude Code. Read this fully before acting.
> This builds the training dataset for a Tally ERP natural-language → SQL model.

-----

## 1. What we’re building & why

A model that turns an Indian MSME’s plain-language question (“aa mahine ketlo nafo thayo?”)
into a correct PostgreSQL query over their Tally data. Target model: **Gemma 4 E2B**
(on-device, ~2B effective). Because E2B is tiny, **the dataset is the product** — coverage
of question patterns and SQL correctness decide accuracy, not model size.

Goal: **8,000–12,000 execution-validated NL→SQL pairs**, trilingual (English / Hindi / Gujarati

- romanized Hinglish), full coverage of all 26 Tally tables.

## 2. Core principle — DO NOT VIOLATE

We **invert the hard direction**. Never ask an LLM to write SQL from a question (it hallucinates
joins and Tally sign conventions). Instead:

1. Author **SQL skeletons** (templates); fill joins from the schema graph → correct by construction.
1. **Execute every query on Supabase** → keep only what runs and returns sane rows.
1. Use the LLM **only to paraphrase** validated questions into many variants, in 3 languages.

Volume = paraphrase fan-out. Correctness = templates + execution. One canonical question
becomes ~30–50 paraphrases × 3 languages.

## 3. Locked decisions

|Decision        |Value                                                                 |
|----------------|----------------------------------------------------------------------|
|Model           |Gemma 4 E2B-IT, QLoRA via Unsloth                                     |
|DB / validation |Supabase (Postgres), **connected via MCP**                            |
|Languages       |English + Hindi (Devanagari) + Gujarati + Hinglish                    |
|Metric          |Execution accuracy (rows match gold), never string match              |
|Inference design|Schema linking mandatory — feed only the 3–4 relevant tables per query|

## 4. Inputs (place in repo) & environment

Files:

- `schema/schema_graph.json` — Neo4j export: 26 tables, 43 FK join paths (source of truth for joins).
- `schema/tally_schema_postgres.sql` — generated DDL, ready to run.
- `skeletons/gold_seed.csv` — the 234 real hand-written pairs (GOLD; cleaned from the xlsx).
- `skeletons/question_bank.xlsx` — 74 persona-driven canonical questions + coverage map (the demand spec).

`.env`:

```
SUPABASE_DB_URL=postgresql://...   # direct connection, for BULK execution + training/eval scripts
ANTHROPIC_API_KEY=...              # paraphrase + back-translation QA
HF_TOKEN=...                       # gated Gemma weights (fine-tune stage)
```

## 5. How to use Supabase (MCP vs direct — important)

- **MCP** (`execute_sql`, `apply_migration`, `list_tables`, `get_advisors`): schema setup,
  interactive development, spot-checking, small batches. Use for Stages 0–1 and ad-hoc checks.
- **Direct `SUPABASE_DB_URL`** (psycopg): **bulk** execution-validation of thousands of queries,
  and the training/eval scripts (Unsloth runs outside Claude Code and cannot use MCP).
  Do not push 10k validation queries through MCP one-by-one — write a batched script.
- Use a **dedicated schema** (e.g. `tally_t2s`) or a dedicated project — never mix with
  other Pucho/Muneem data.

## 6. Repo structure

```
pucho-tally-text2sql/
  CLAUDE.md
  .env
  schema/   schema_graph.json  tally_schema_postgres.sql  graph_loader.py
  seed/     seed_data.py            # synthetic Tally data OR loader for a real sanitized export
  skeletons/ gold_seed.csv  question_bank.xlsx  skeletons.yaml
  pipeline/ instantiate.py  validate_exec.py  paraphrase_multilingual.py
            backtranslate_qa.py  package_split.py
  data/     raw/  validated/  final/
  eval/     execution_accuracy.py
  reports/  coverage_report.md
```

## 7. Build pipeline — ordered stages

Each stage has a **Definition of Done (DoD)**. Do not start the next stage until DoD passes.

**Stage 0 — Schema on Supabase**

- Via MCP: run `tally_schema_postgres.sql` in schema `tally_t2s`. Confirm the `config` table.
- DoD: `list_tables` shows 26 + `config`; FKs present (`get_advisors` clean).

**Stage 1 — Schema graph loader**

- `graph_loader.py`: load `schema_graph.json` into networkx. Expose `join_path(tables) -> ON clauses`
  and `ddl_subset(tables) -> minimal DDL` (for schema_context / linking).
- DoD: given `[mst_ledger, trn_accounting, trn_voucher]` returns the correct 2-hop join.

**Stage 2 — Seed a generic Indian MSME dataset** (synthetic — this is the RIGHT default, not a fallback)

- This product serves thousands of MSMEs, so seed the **standard Tally chart of accounts**
  that nearly every Indian MSME shares — do NOT model any single real company (that overfits
  to one firm’s ledger names and quirks).
- ~200 ledgers under standard groups (Sundry Debtors/Creditors, Sales/Purchase Accounts,
  Duties & Taxes, Direct/Indirect Expenses, Bank Accounts, Cash-in-Hand), ~500 stock items
  across groups/categories/UOMs/godowns, employees + standard payheads + attendance,
  cost centres + categories, 2–3 financial years of vouchers (sales/purchase/receipt/payment/
  journal/contra/payroll) with **correct sign conventions**. Indian names, GSTINs, item names.
  Fill `config` (Period From / Period To, company state).
- Cover the **superset**, not one variant: book GST **both** ways (item-level `tax_rate` AND
  ledger-level Duties & Taxes), include the common payheads, make cost centres present-but-optional.
  This way the model handles whatever a given MSME actually uses.
- Optional: sanity-check realism against an anonymized real export, but never train on one company.
- DoD: aggregate queries return non-trivial numbers; every one of the 26 tables has rows;
  both GST styles present.

**Stage 3 — Author skeletons** (highest-leverage step)

- Cluster `gold_seed.csv` by SQL pattern → lift skeletons for COVERED/PARTIAL questions.
- For the 51 NEW questions in `question_bank.xlsx` (payroll, cost-centre, GST, godown, etc.),
  author new skeletons from scratch using §8 semantics + the graph for joins.
- Target 150–250 skeletons; every persona × intent × join-depth cell filled.
- DoD: every `question_bank` row maps to ≥1 skeleton; coverage report shows 0 empty grid cells.

**Stage 4 — Instantiate**

- `instantiate.py`: fill skeleton slots with real values sampled from the seeded DB
  (real ledger/item/party names, valid date ranges). Produces raw (question, sql) pairs.
- DoD: every raw pair has resolvable entities; no unfilled `{slots}`.

**Stage 5 — Execution validation** (the quality gate)

- `validate_exec.py`: run each SQL via direct connection. Keep iff it executes AND returns
  sane output (≥1 row, or a sensible empty for “none” questions). Log failures with error.
- **Failures point to bad skeletons → fix skeleton, re-run.** Tight loop. Don’t discard silently.
- DoD: ≥95% of instantiated queries pass after skeleton fixes; failure log reviewed.

**Stage 6 — Multilingual paraphrase**

- `paraphrase_multilingual.py`: for each validated (question, sql), call Claude to produce
  ~30–50 NL variants across EN (formal+casual), HI (Devanagari), GU, Hinglish (romanized).
  SQL stays fixed. Vary phrasing, abbreviations, typos like real MSME users type.
- DoD: balanced language distribution; no SQL altered.

**Stage 7 — Multilingual QA**

- `backtranslate_qa.py`: back-translate each non-English paraphrase to English, embed-compare
  to the canonical question; drop low-similarity (intent drift). Flag borderline for human review.
- DoD: drift-filtered set; report of drop rate per language.

**Stage 8 — Package & split**

- `package_split.py`: assemble final records (§7 format). `schema_context` = `ddl_subset(tables_used)`.
- **Split by skeleton** — no skeleton in more than one of train/val/test (else accuracy is fake).
- Held-out test = cleaned gold (never paraphrased) + a synthetic slice.
- Output JSONL in Gemma/Unsloth chat format.
- DoD: split leakage check passes; distribution report (intent/lang/join-depth) in `reports/`.

## 8. Skeleton authoring — Tally semantics cheat-sheet (get SQL right)

Joins:

- Everything joins on `guid`. Line tables (`trn_accounting`, `trn_inventory`, `trn_bill`,
  `trn_bank`, `trn_batch`, `trn_payhead`, `trn_attendance`, cost tables) join to the header
  `trn_voucher` on `guid`. `trn_voucher.guid` is unique; line `guid` is not.
- Underscore columns are FK ids → join to `target.guid`: `_ledger,_item,_godown,_party_name, _voucher_type,_parent,_category,_uom,_costcentre,_costcategory,_employee_name,_payhead_name, _attendancetype_name`. Non-underscore twins (`ledger,item,party_name,godown`) are denormalized
  name strings — handy for filters, but prefer the id join for correctness.

Signs & conventions (from the gold queries — must respect):

- Sales / income `amount` in `trn_accounting` is **negative** → use `ABS()` or `-SUM()`.
- Stock value: **`-SUM(closing_value)`** from `mst_stock_item`.
- Party sales rows: `ta.ledger = tv.party_name AND ta.amount < 0`.
- Period comes from `config` (‘Period From’ / ‘Period To’) — `value::date` — not hardcoded.
- Receivables = `mst_ledger` under group **‘Sundry Debtors’**; payables = **‘Sundry Creditors’**.
- Income groups: ‘Sales Accounts’,‘Direct Incomes’,‘Indirect Incomes’. Expenses similar.
- Voucher gating: `is_invoice`, `is_inventory_voucher`, `is_order_voucher`, `is_accounting_voucher`.
- GST/tax ledgers sit under **‘Duties & Taxes’**; `gst_duty_head`, `tax_rate`, `gstn`,
  `gst_registration_type`, `place_of_supply` carry GST logic.
- Payroll: `trn_payhead` (amount per payhead) → `mst_payhead` (Basic/HRA/PF/ESI) +
  `mst_employee` via `_employee_name`. Attendance: `trn_attendance` → `mst_attendance_type`.
- Cost centre: `trn_cost_centre` (`_ledger`,`_costcentre`); add category via `trn_cost_category_centre`.

Skeleton YAML:

```yaml
- id: payroll_salary_by_employee_month
  persona: HR / Admin
  intent: salary_by_employee
  join_depth: 3
  tables: [mst_employee, trn_payhead, trn_voucher]
  slots: {month: {type: month, source: voucher_dates}}
  sql: |
    SELECT me.name AS employee, SUM(tp.amount) AS salary
    FROM mst_employee me
    JOIN trn_payhead tp ON tp._employee_name = me.guid
    JOIN trn_voucher tv ON tp.guid = tv.guid
    WHERE EXTRACT(MONTH FROM tv.date) = {month}
    GROUP BY me.name ORDER BY salary DESC;
  nl_en: "Show salary paid to each employee in month {month}."
```

## 9. Coverage choices (cover the standard Indian MSME superset — don’t model one company)

Because the product is generic, default to the **common case for Indian MSMEs** and cover
variants rather than asking about a specific firm:

- **GST**: cover BOTH item-level (`tax_rate` on stock items) and ledger-level (Duties & Taxes
  ledgers). Standard rates: 0/5/12/18/28%. Include CGST/SGST/IGST split and one TDS ledger.
- **Stock**: include a `reorder_level` notion; “low stock” = closing qty below reorder.
- **Payroll**: standard payheads — Basic, HRA, Conveyance, PF, ESI, Professional Tax, Bonus.
- **Attendance**: Present, Absent, Leave, Overtime.
- **Cost centres/categories**: present but optional (some MSMEs use them for branches/projects,
  many don’t — cover both so queries degrade gracefully).
- **Financial years**: 2–3 recent FYs. **Home state**: pick one (e.g. Maharashtra) so interstate
  GST logic has both intra- and inter-state cases.

## 10. Eval

`eval/execution_accuracy.py`: for the held-out test set, run model SQL and gold SQL on Supabase
(direct conn), compare result sets. Report overall + per intent / join-depth / language.
v1 realistic target: **65–80%**; then iterate on the worst failure categories.

## 11. How to work (Harshal’s rules)

- For any 3+ step task: **plan first, get alignment, then execute.** Don’t just dump code.
- Give a clear recommendation with a POV — options + pros/cons, then a strong call. No fence-sitting.
- **Challenge your own output** before presenting it.
- **Never mark a stage done without verifying its DoD.** No silent assumptions.
- Prefer **elegant over hacky**. If an approach feels wrong, stop and re-plan — don’t push through.
- Keep everything in **Indian MSME reality**: messy data, mixed languages, real Tally vocabulary.
- Never invent figures or claim a query is correct without executing it.