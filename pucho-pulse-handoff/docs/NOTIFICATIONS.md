# NOTIFICATIONS — WhatsApp triggers, templates, SLAs

All sends go through `sendWhatsApp(to, template, params, lang)` and are ledgered in `GtmAlert` (dedupe = unique (type, organizationId); digests keyed differently — see DATA_MODEL). Language = partner's preferred; **Gujarati required for Gujarat partners**; templates below are the English masters. Placeholders in `{braces}`. Times IST.

## 1. Trigger table (priority order)

| # | Type | Condition | When | SLA → escalation |
|---|---|---|---|---|
| 1 | `BAND_A` | PPS enters Band A OR grant credits cross 700 | real-time (30-min scan, 08:00–21:00) | 72h no ack → Pucho Sales, partner CC |
| 2 | `EXHAUSTED` | grant hits 1,000 | real-time | 24h |
| 3 | `OFFICE_NOUSE_72H` | 72h post-workshop registration, zero Office chats | hourly scan | next digest |
| 4 | `MOMENTUM_BREAK` | Office-active account, 5 days Office-silent | daily 08:30 | 48h |
| 5 | `WRONG_LANE` | Band W detected | daily 08:30 | book re-demo within 7d |
| 6 | `EXCEL_ONLY` | strong Excel, zero Word/PPT, day 14 | daily 08:30 | none (growth nudge) |
| 7 | `SINGLE_PLAYER` | >400 credits, 1 user, day 14 | daily 08:30 | none |
| 8 | `ZERO_USE_7D` / `ZERO_USE_14D` | zero credits at 7d / 14d | daily 08:30 | 14d version also alerts Pucho Sales |
| 9 | `DIGEST` | weekly partner summary | Mon 09:00 | — |
| 10 | `SCORECARD` | monthly partner rank + health score | 1st, 09:00 | — |

Internal (ops, not partner): attendance-entry reminder (18:00 to deliverer), SLA-breach notices, job-failure alerts.

## 2. Templates

**T1 · BAND_A (hot lead + close kit)**
```
🔥 HOT LEAD — {org_name}
Score {pps}/100. {office_days} days in Pucho Office this fortnight, {office_chats} sessions ({apps_list}).
Credits: {credits_used}/1000 — runs dry in ~{days_left} days at this pace.
Right plan (from their usage): {suggested_plan} @ ₹{price}/mo.
Close kit attached. Best time to call is NOW.
Reply ✅ once contacted.
```

**T2 · EXHAUSTED**
```
⛽ {org_name} has used ALL 1,000 free credits — value proven, urgency at peak.
Offer (7 days only): convert now and 200 bonus credits carry into their plan.
Suggested plan: {suggested_plan} @ ₹{price}/mo. Script: {script_link}
Reply ✅ once contacted.
```

**T3 · OFFICE_NOUSE_72H**
```
📋 {org_name} attended the Pucho Office workshop {days_ago} days ago but hasn't opened Office yet.
One specific ask works best: "Open your sales sheet in Pucho Excel and ask it these 3 questions" — workbook page 3: {workbook_link}
```

**T4 · MOMENTUM_BREAK**
```
⚠️ {org_name} went quiet — they were at {pps} and climbing, last Office use {last_active}.
One call now beats ten later. Their last activity: {last_feature}.
```

**T5 · WRONG_LANE**
```
🔁 {org_name} is active in Pucho ({chat_count} chats) but has NOT touched Pucho Office.
They're using the wrong product for what they bought into. Don't pitch a plan yet —
book a 15-minute Office re-demo ON THEIR FILES this week: {booking_link}
```

**T6 · EXCEL_ONLY**
```
📈 {org_name} is strong in Pucho Excel ({excel_chats} sessions) but hasn't tried Word/PPT.
Second-app users convert far better. Send the 2-min Word demo: {word_demo_link}
```

**T7 · SINGLE_PLAYER**
```
👥 {org_name}: {credits} credits used but still ONE user. Team accounts convert 3–4× solo.
Ask {user_name} to add one colleague — invite link: {invite_link}
```

**T8 · ZERO_USE (7d / 14d)**
```
😴 {org_name} signed up on {date} — zero credits used.
{7d: "A 15-min call re-running the workbook usually revives these." |
 14d: "Second warning — Pucho Sales will call if this stays zero this week."}
Workbook: {workbook_link}
```

**T9 · DIGEST (Monday 09:00)**
```
🟣 Pucho Weekly — {partner_name} · {date_range}
📥 New: {new_accounts} | ⚡ Active: {active_week} | 🏢 In Office: {office_active}
🔥 HOT — call today ({hot_count}): {hot_list}
🔁 Wrong lane ({wrong_count}): {wrong_list}
😴 Zero-use ({zero_count}): {zero_list}
✅ Converted total: {converted} | 💰 Your rev share this month: ₹{rev_share}
Pucho Toh Sahi!
```

**T10 · SCORECARD (monthly)**
```
🏆 {month} scorecard — {partner_name}
Health: {score}/100 (Grade {grade}) — Engagement {e}/30 · Conversion {c}/30 · Zero-use {z}/20 · Speed {v}/20
Rank: #{rank} of {total_partners}. {up_or_down_line}
Focus for {next_month}: {weakest_component_advice}
```

## 3. Mechanics

- **Ack:** WhatsApp quick-reply ✅ → webhook → `POST /api/alerts/:id/ack`. No ack within SLA → `sla-escalation` job notifies Pucho Sales with full context, partner CC'd.
- **Dedupe:** one alert per (type, org) lifetime for threshold types; ZERO_USE_7D and _14D are distinct types; digests/scorecards keyed by partner+period in payload.
- **Suggested plan computation:** monthly-ized burn (credits_used ÷ days_active × 30) mapped to the smallest plan whose monthly credit quota covers it (plan quotas from `Package.credit`).
- **Quiet hours:** no partner sends before 08:00 or after 21:00 IST; real-time triggers queue.
- **Kill switch:** per-trigger enable flags in config; a bad template must be stoppable without a deploy.
