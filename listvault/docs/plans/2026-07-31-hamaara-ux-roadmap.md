# HaMaara — UX Roadmap & Feature Brainstorm

*2026-07-31 · outcome of the /brainstorming pass on core UX*

## Shipped in this iteration

1. **iOS Chrome (WebKit) adaptivity** — 16px form fields (kills focus auto-zoom),
   `100dvh` layouts (URL-bar churn), `overscroll-behavior` lock, visualViewport-driven
   quick-add bar that lifts above the keyboard, install prompt covering Chrome's
   Add-to-Home-Screen path.
2. **Drag & drop** — tasks reorder via a grip handle (dnd-kit, fractional positions);
   notes reorder by long-press (200ms) in a 2-column grid, persisted via a new
   `position` column. Arrow buttons removed in favour of dragging.
3. **WhatsApp invite polish** — formatted invite (*bold*, emoji, Hinglish tagline,
   password-change tip) and a formatted list-share message with code fallback.
4. **Password change** in Settings — closes the temp-password loop for invited members.

## Top features — prioritized backlog

**Now (highest value ÷ effort)**
- **Activity feed** ("Priya added 3 items · 2m ago") on Home — makes the app feel alive;
  data already exists in item attribution.
- **Push notifications** — "added to a list", daily digest (PRD v1 scope). Needs VAPID
  keys + an edge function; per-list mute column already exists.
- **Invite emails via Resend** — replace manual credential sharing when email is
  preferred; free tier suffices.

**Next**
- **AI: note → task list** — one tap turns a note into a real HaMaara list (AI plumbing
  and list creation both exist; just glue).
- **Habit reminders** — a nudge at a chosen hour if today's check-in is missing
  (depends on push).
- **Weekly household recap** — AI-written Sunday summary: tasks done, streaks, who did
  the most (delightful, on-brand "ours" moment).

**Later**
- Offline queue for adds/checks (PRD called this out; service worker groundwork exists).
- Item photos for grocery disambiguation (PRD open question #3).
- Voice quick-add (Web Speech API), Hindi/Gujarati UI (PRD v2).

## Deliberately not doing (YAGNI)

Dates/reminders per task (that's a task manager, not HaMaara), folders/tags, viewer
role, payments, native apps until PWA retention data argues otherwise (PRD stage gates).
