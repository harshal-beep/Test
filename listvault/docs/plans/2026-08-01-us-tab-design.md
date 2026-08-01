# "Us" — questions, taste profiles, and Mumbai discovery

Date: 2026-08-01
Status: design agreed, not yet built.
Decisions made: on-demand question deck (no daily schedule) · events from
AllEvents.in once a key exists with AI web curation as the immediate source
and permanent fallback · lives in an "Us" tab that replaces the Memories tab.

## The loop

Questions → understanding each other → taste profiles → "things in Mumbai
you'd both love" → add to a list → plan it (countdown) → do it → Memory.
The last three steps already exist; this adds the first three.

## Navigation

Bottom tab "Memories" becomes **"Us"** (heart icon stays). Three segments:

- **Memories** — the existing timeline, unchanged.
- **Questions** — the deck.
- **Discover** — Mumbai events, ranked for the two of you.

## Piece 1 — Question deck

On-demand: either partner draws a card whenever they feel like it. No cron,
no push, no guilt.

**Blind reveal.** Drawing a card creates an *open question*. Each partner
answers without seeing the other's answer; both answers unlock only when both
have answered. States: "Your turn" / "Waiting for Amaara 👀" / revealed side
by side with ❤️ reactions. Cap open questions at 3 so they don't pile up.

**History.** Revealed questions accumulate into a browsable archive —
"12 questions answered together".

**Question source.** A curated seed deck (~60 questions across four moods:
fun, memories, preferences, deeper) shipped in a table; when the deck runs
low, the existing `lv-ai` edge function generates more in the same moods,
avoiding repeats. Draw = random unanswered card, mood filter optional.

**Data.**
- `lv_questions` (id, text, mood, source curated|ai, created_at)
- `lv_question_rounds` (id, question_id, opened_by, opened_at, revealed_at)
- `lv_question_answers` (round_id, user_id, body, created_at, pk(round_id,user_id))
- RLS: household-read; answers insert self-only; **answers of a round are
  selectable only when the round is revealed or the row is your own** —
  enforce reveal server-side with a view or a `revealed_at` check in the
  select policy, not in the client.
- Reveal: trigger sets `revealed_at` when the second answer arrives.

## Piece 2 — Taste profiles

Per-person quiz, ~2 minutes, all chips, editable any time in Settings →
"Your tastes". Dimensions: cuisines · veg/non-veg · vibe (chill ↔
adventurous) · indoor/outdoor · budget band (₹, ₹₹, ₹₹₹) · interests
(music, art, food, nature, films, sports, comedy, shopping) · usual free
time (weekday evenings / weekends).

- Stored as `lv_profiles.tastes jsonb` (no new table needed).
- **"You two" card** at the top of Discover: overlaps ("You both love:
  street food, live music") and playful differences ("Amaara: heights,
  You: solid ground 😄").

## Piece 3 — Discover (Mumbai events)

**Sources — decision: both.**
1. **Now:** `lv-events-refresh` edge function, scheduled daily (Supabase
   cron). Calls OpenRouter with a web-search-enabled model, asks for events
   and things to do in Mumbai in the next 14 days, gets structured JSON
   (name, date, venue, area, price, url, category), upserts into `lv_events`.
   One search per day, cached for everyone — cost is negligible.
2. **Later:** when the user signs up at allevents.in/api and provides a key,
   the same function calls AllEvents first and falls back to AI curation.
   Stored in `lv_secrets` like the OpenRouter key. The table schema is
   source-agnostic (`source` column) so this is a drop-in.

**Ranking.** A second AI action scores cached events against the two taste
profiles → top 10 with a one-line reason each ("You both said street food →
Mohammed Ali Road food walk"). Re-ranked only when tastes change or the
cache refreshes; stored so the feed renders instantly.

**Card actions.** "Add to list" (picker → item created, then the existing
plan/countdown flow takes over) · open source link · hide.

**Data.**
- `lv_events` (id, source, title, category, venue, area, starts_on, price_text,
  url, fetched_at) — service-role writes only, household read.
- `lv_event_ranks` (event_id, reason, score, ranked_at) or a jsonb blob in a
  single row — smallest thing that works.

## Honest constraints

- BookMyShow / District have no public API; scraping them violates ToS —
  not doing that. AI web curation reads what's publicly indexed instead.
- AI-curated listings can occasionally be stale or mis-dated; every card
  links out to the source for checking before booking.
- AllEvents free tier has rate limits — fine at one refresh/day.

## Build order (when green-lit)

1. Migration: questions/rounds/answers + events tables, RLS, reveal trigger.
2. Seed deck (~60 curated questions).
3. Us tab shell with three segments; move Memories under it.
4. Question deck UI (draw, answer, waiting, reveal, history).
5. Taste quiz + Settings entry + "You two" card.
6. lv-events-refresh function + cron + Discover feed + add-to-list.
7. AllEvents integration when the key arrives.
