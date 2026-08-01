# HaMaara — research-backed feature roadmap

Date: 2026-08-01
Method: Composio (Exa web search + Perplexity Sonar Pro, high search context) over App Store /
Play reviews, couple-app comparisons and mobile UX research sources; plus direct web searches.

Apps studied: Cupla, Between, Cozi, OurHome, Maple, Sweepy, Tody, Nipto, Agenda,
Mental Loadless, Eqwity Mind, fiftyfifty, FairShare, Connected, Candle, Lovio.

## Where HaMaara already stands

Strong: real-time sync, multi-assignee tasks ("both of us"), swipe + drag interactions,
shared/private notes with AI, shared habits with streaks and weekly goals, activity feed,
household model with no join codes, installable PWA, light/dark/system.

The 2026 couple-app comparisons list the table stakes as: real-time sync, clear assignment,
grocery lists, in-app context/communication. HaMaara has the first two well covered.

## Tier 1 — the real gaps (highest impact per unit of work)

### 1. Recurring / repeating tasks
The single most common complaint in shared-todo reviews: routine chores (bins, laundry,
dishes) can't repeat. Household lists are inherently cyclical; HaMaara has no repeat at all.

UX: a "Repeat" row in the task editor — None / Daily / Weekdays / Weekly (day) / Monthly.
Completing an occurrence creates the next one and keeps completion history (which feeds #2).
Show a small repeat glyph + next date on the row. Support household-owned recurring tasks
either partner can claim.

### 2. Rotation, "who did it last", and a fairness view
An entire 2026 app category (Mental Loadless, Eqwity Mind, fiftyfifty, FairShare) exists
purely to make household load visible. Reddit threads on couple apps ask for "who did it
last" and balance, not just assignment.

UX: per-recurring-task ownership = A / B / **Rotate** / Anyone, with "Next up: A" on the chip.
A "Balance" card: share of completed work over 7/30 days, optional 1-3 weight per task,
"Last done by A, 2 days ago" on each chore, tap for history. Keep language supportive —
"balance", never "winning".

### 3. Gentle nudges + digests, not notification spam
Reviews repeatedly show over-notification causes conflict and abandonment; UX guidance for
task apps recommends batching low-priority alerts into digests.

UX: default "Gentle mode" — one daily digest ("3 for you, 2 for both, 1 overdue") and a
weekly balance recap. Critical/overdue-only as the alternative. In-app nudge banner on open:
"2 small things today — 5-minute blitz?" that filters to today.
Blocked on push infrastructure (see Constraints); the in-app banner is not.

## Tier 2 — rich and natural fits

4. **Grocery mode with aisle categories.** Cupla is actively criticised for poor grocery
   handling. Add a list type where items auto-categorise (Produce / Dairy / Pantry /
   Household) with collapsible sections. HaMaara already has an AI edge function to do the
   categorising.
5. **Points / kudos on completion.** Stack on existing streak logic; scoreboard card in the
   feed. Supportive framing, tied to the fairness numbers.
6. **Meal planning → groceries.** Week grid, each meal pushes ingredients into the grocery
   list. Pairs with #4; AI can propose "3 vegetarian nights".
7. **Rituals / check-in prompts.** Between and Cupla differentiate on rituals. Ship as habit
   templates (Weekly check-in, Date night, Walk together) with rotating AI prompts —
   "What felt heavy this week?" — behind a "logistics only" toggle.
8. **Appreciation taps.** Lightweight "thank you"/heart on a task someone completed. The
   emotional layer users of Lovelee/Lovio/Connected respond to, at almost no cost.

## Tier 3 — bigger bets

9. **Shared calendar.** Cozi/Maple win on calendar + lists + chores in one place. MVP:
   internal "Today / This week" strip and due-date overlay; external Google/Apple sync later.
10. **Mental-load board.** Fair Play-style domains (Food, Cleaning, Admin, Health, Social)
    with ownership per domain and a load index. Strategic differentiator, heaviest lift.
11. **Presence-weighted fairness.** Adjust balance when one partner travels. Needs 9 + 2.

## UI/UX richness patterns worth adopting

- **Quick daily wins (2-3 min)** — the "blitz" filter above; the strongest retention pattern
  in 2026 productivity UX research.
- **Progress visualisation** beyond streaks — weekly recap cards in the feed.
- **Layout personalisation** — surface the sections each person actually uses.
- **Micro-interactions** — already strong here (confetti, check burst, gliding tab pill).

## Competitor mistakes to deliberately avoid

- Aggressive subscription prompts and ads after purchase (Cupla, Between) — HaMaara is free
  and private; keep it that way.
- Bolting on AI where it annoys rather than helps (a live Cupla complaint) — HaMaara's AI is
  opt-in per action, which is the right shape.
- Missing shared checklists inside a "couples" app (Between) — HaMaara's core strength.

## Constraints specific to a PWA

- **iOS home-screen widgets are not available to web apps.** Native couple apps lean heavily
  on widgets; HaMaara cannot match that. The nearest equivalent is an installed PWA with a
  fast, glanceable home screen.
- **Push notifications require the installed PWA** (iOS 16.4+) plus service-worker work.
  This gates the digest feature and habit reminders.
- **Voice input** is unreliable in iOS WebKit — previously assessed and skipped.

## Suggested build order

1. Recurring tasks
2. Rotation + "who did it last" + Balance view
3. Grocery mode with aisle categories
4. Appreciation taps + points/kudos
5. In-app gentle nudge banner (digest push after notification groundwork)
6. Meal planning
7. Rituals and prompts
8. Calendar, then mental-load board
