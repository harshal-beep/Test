# HaMaara — research-backed feature roadmap

Date: 2026-08-01 (revised after clarifying the actual use case)
Method: Composio (Exa web search + Perplexity Sonar Pro, high search context) over App Store /
Play reviews, couple-app comparisons and mobile UX research sources; plus direct web searches.

## What HaMaara is actually for

Two people who **live separately**. The app is for:

1. **Things we want to do together** — date ideas, places to eat, activities, trips.
   (Real lists in use: "date card game", "street pani puri", "Street Photography",
   "Beach walk", restaurant picks.)
2. **Shared notes.**
3. **A habit tracker** — same habit, each person's own streak.

It is **not** a household-management app. Groceries, chores, meal planning, chore rotation
and mental-load/fairness scoring are all out of scope — that research applies to
cohabiting couples and was set aside.

## What this means for the backlog

The centre of gravity is a **shared wishlist of experiences**, and the emotional payoff is
**doing them and remembering them** — not clearing a chore queue. Two consequences:

- Completing an item is a *milestone*, not a dismissal. It should be celebrated and kept.
- Because the two people are apart, the list is also a **conversation** and the calendar
  question is "when are we next together", not "who does the dishes".

## Tier 1 — fits the real use case

### 1. Memories: completed items become a shared timeline
When "street pani puri" gets ticked, it shouldn't just grey out and vanish under Done.
It becomes a thing you did together, with a date and optionally a photo.

UX: on completion, offer "Add a photo / a line about it". A **Memories** view — reverse
chronological, photo cards, "Last year you did…". Reuses the avatar storage bucket pattern
(migration 0013) for image upload.
Why: this is the payoff of the entire app for this couple; no competitor feature required.

### 2. Plan a date: "planned for" + countdown
Living apart makes *when* the scarce resource. An item can be scheduled ("Sat 9 Aug"),
and the home screen shows **"Next together: 6 days — Beach walk"**.

UX: optional date on any item; a "Coming up" strip at the top of Home; a countdown card.
Long-distance couple apps universally centre a countdown — it is the single most emotionally
effective feature in that category.

### 3. Reactions and comments on items
Because they are apart, the list *is* the conversation. Research on shared-list apps flags
in-app comments on the item — instead of a parallel text thread — as a top request.

UX: tap an item → react (❤️ 🔥 😍) or leave a short comment; reactions show inline as small
emoji on the row. Feeds the activity feed.

### 4. "Surprise us" picker
A shuffle button on a wishlist list: "What should we do this weekend?" → picks one at random
(optionally filtered to unplanned items).
Tiny to build, directly serves the core journey.

## Tier 2 — still valid from the research

5. **Appreciation taps** — a heart/thank-you on something the other person added or did.
   The emotional layer Lovelee / Lovio / Connected users respond to.
6. **Rituals / check-in prompts** — "Weekly check-in", "Call night" as habit templates with
   rotating AI prompts ("What felt heavy this week?"), behind a logistics-only toggle.
7. **Gentle nudges, not notification spam** — one daily digest at most; reviews show
   over-notification causes conflict and abandonment in couple apps. The in-app version
   (a nudge banner on open) needs no push infrastructure.
8. **Quick daily wins** — the strongest retention pattern in 2026 mobile UX research:
   something meaningful possible in 2-3 minutes. Habits already do this; a "today" strip
   would extend it.

## Dropped as not applicable

- Grocery mode, aisle categorisation, meal planning — they do not shop together.
- Chore rotation, "who did it last", fairness/balance scoring, mental-load domain boards —
  these solve cohabiting-household load, which does not exist here.
- Recurring tasks — largely covered by the habit tracker for this use case; low priority.

## Constraints specific to a PWA

- **iOS home-screen widgets are not available to web apps.** Native couple apps lean heavily
  on widgets (countdowns, love notes); HaMaara structurally cannot match that. Nearest
  equivalent is the installed PWA with a fast, glanceable home screen.
- **Push notifications require the installed PWA** (iOS 16.4+) plus service-worker work.
  This gates digests and habit reminders.
- **Voice input** is unreliable in iOS WebKit — previously assessed and skipped.

## Competitor mistakes to keep avoiding

- Aggressive subscription prompts and ads after purchase (Cupla, Between).
- AI bolted on where it annoys rather than helps (a live Cupla complaint) — HaMaara's AI is
  opt-in per action, which is the right shape.

## Suggested build order

1. Memories (photo + note on completion, Memories timeline)
2. Plan a date ("planned for" + next-together countdown on Home)
3. Reactions / comments on items
4. Surprise-us picker
5. Appreciation taps
6. Rituals and prompts
7. In-app gentle nudge banner (push digests after notification groundwork)
