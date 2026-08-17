# ALGORITHMS — Pucho Pulse

Canonical implementations are in `SQL_LIBRARY.sql`. This file is the reasoning + constants; if code and this doc disagree, the SQL is truth for v0/v0.1 and this doc governs intent.

All weights/thresholds live in `config/scoring.ts` — one file, never scattered.

---

## 1. PPS v0.1 — Purchase Propensity Score, Pucho Office edition (CANONICAL)

**Purpose:** rank grant accounts by likelihood to purchase, computed nightly, from behavior only + one firmographic prior. The September workshops sell **Pucho Office**, so Office behavior is the score's core; general-platform usage without Office is a *wrong-lane* signal, not a buying signal.

**Office activity source:** `ChatHistory."chatType"::text LIKE 'PUCHO_OFFICE%'` (Excel/Word/PPT chat enums), joined to org via `OrganizationUser.id = ChatHistory."organizationUserId"`.

### Scorecard (sum, clamp 0–100)

| Component | Pts | Formula | Full marks | Rationale |
|---|---|---|---|---|
| Office habit | 25 | `min(25, office_days_14 × 4)` | ~6 distinct Office days /14 | habit in daily documents = what renews |
| Credit depth | 20 | `min(20, round(credits_used / 35))` | 700 credits | value metered in the billing unit |
| Office app breadth | 12 | `min(12, office_apps × 4)` | Excel+Word+PPT | 2nd app = suite, not trick |
| Office volume | 10 | `min(10, round(office_chats / 5))` | 50 Office chats | |
| Embedding | 15 | own docs (ORG_KNOWLEDGE) 6 + ≥2 Office users 6 + any workflow 3 | all | sunk cost + team adoption; workflow = expansion |
| Momentum | 10 | Office 7d ≥ prior 7d and >0 → 10; >0 decaying → 4; 0 → 0 | rising | propensity is perishable |
| Firmographic prior | 8 | target industries × '51-200'/'201-500' → 8; '11-50'/'51-200' → 4; else 0 | | replace CASE with live P1 rates monthly |
| Recency penalty | −20…0 | last Office activity >14d → −20; >7d → −10 | | |

### Bands

`W` (override): `office_chats = 0 AND non_office_chats ≥ 10` → wrong lane; **Office re-demo on their own files — never a close attempt**. Otherwise: `A ≥ 70` close within 72h · `B 45–69` push to aha event · `C 20–44` re-onboard (15-min workbook session on own data) · `D < 20` automated drip only, no partner hours.

### Timing windows
Score is meaningless before day 3 post-registration; decays fast after grant exhaustion + 15 days. Best close moments: crossing 700 credits and exhaustion (offer: convert within 7 days → 200 bonus credits carry).

### Nightly snapshot
Upsert one `PropensityLog` row per grant org per day (pps, band, components jsonb). This history is the calibration/training data — non-negotiable from day one.

## 2. Aha-moment finder

Method: for each candidate event, conversion% of accounts that did it vs didn't; largest lift (with n ≥ 30 per side) wins and becomes the activation goal for workshops and Band-B plays. Office-edition candidates: (1) Office chat within 48h of signup — **prior favorite; the workshop should manufacture it live**; (2) 10+ Office chats week 1; (3) 2nd Office app in week 2; (4) 2nd Office user in week 2. Finder SQL in library. Re-validate monthly.

## 3. Partner Health Score (0–100)

`30 × min(1, engaged%/50%) + 30 × min(1, conv%/5%) + 20 × min(1, (1−zeroUse%)/80%) + 20 × min(1, fastStart48h%/40%)`, where engaged = ≥300 grant credits, fastStart = first credit use within 48h of signup. Grades: A ≥80, B ≥60, C ≥40, D <40. Uses: tier reviews, October slot allocation, monthly partner agenda. SQL: A2.

## 4. Benchmarks & red lines (Credit Grant module)

Grant utilization healthy 50–75% · exhaustion sweet spot 20–40% · never-landed (<100 cr) red line 35% · median days-to-300 target ≤14 · median days-to-exhaustion healthy 25–45 · conversion-by-band curve must rise steeply (flat curve = grant doesn't drive conversion → re-examine the ₹3.6L/month) · credits-at-conversion percentiles (B5) drive the Oct A/B: 750 / 1,000 / 1,250 by segment.

## 5. GTM economics constants

Credit value ₹0.30 · grant 1,000 credits · ~1,200 accounts/month → ₹3.6L/month credit investment · break-even ≈ 13 conversions/month at ₹3,000 avg plan and 12-month lifetime · target ≥3% conversion (36–48/month) · headline metric `revenue_per_credit_rupee` (G5) must cross 1.0 in October and climb.

## 6. Calibration path

- **v0.1 (ship):** scorecard above, hand-set weights.
- **v1 (~50 conversions):** band-monotonicity check (A>B>C>D, A ≥ 5×D conversion); adjust component weights where reality disagrees; swap firmographic CASE for empirical P1 rates.
- **v2 (~150–200 conversions, only if v1 separation is weak):** logistic regression on PropensityLog components (scikit-learn, L2, report AUC; top-quintile capture ≥60% of conversions is the bar). Keep the scorecard as the explainable fallback — partners must be able to understand why an account is Band A.
- **Never claimed:** individual certainty. The algorithm allocates attention; humans convert.
