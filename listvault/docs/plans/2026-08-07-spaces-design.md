# Spaces: multiple groups in HaMaara

*Validated with Harshal on 2026-08-07.*

## Why

HaMaara today is hard-wired for two people. Harshal wants the same
activities — lists, notes, habits, calendar, split money — with friend
groups (a trip, flatmates), without diluting the couple experience.

## Decisions

- **Model**: separate spaces with a switcher (Slack-style), not per-list
  sharing. Each space is a self-contained world.
- **Group features**: lists & tasks, notes, habits + calendar/milestones,
  and full multi-way Money. The Us tab (questions, memories, events,
  tastes) exists only in the couple space.
- **Joining**: shareable invite links with regenerable 6-char codes plus
  open signup. A fresh account with no invite sees an empty app.
- **Rollout**: everything at once.

## Data model

- `lv_spaces` — id, name, emoji, kind (`couple` | `group`), invite_code,
  created_by. Exactly one couple space.
- `lv_space_members` — space_id, user_id, role (`owner` | `member`).
- Content tables gain `space_id` (not null): lv_lists, lv_notes,
  lv_habits, lv_expenses, lv_settlements, lv_milestones,
  lv_question_rounds, lv_events. Children (items, comments, reactions,
  checks, answers, shares) inherit scope through their parent.
- `lv_expense_shares` — expense_id, user_id, share_amount. Replaces the
  pairwise `owed_amount` as source of truth; the couple ledger is just a
  2-member group.

## Security

RLS moves from "any authenticated user" to membership checks via a
security-definer helper (`lv_is_member(space_id)`). Non-members cannot
read or write another space's rows even with direct API access. Invite
redemption happens only through a guarded RPC (`lv_join_space(code)`);
owners can regenerate codes to invalidate old links.

## Migration

One migration creates the couple space ("HaMaara 💜"), enrolls both
existing users, stamps every existing row into it, and backfills
expense shares from `owed_amount` (payer share = amount − owed, partner
share = owed). Couple balance must match before/after to the paisa.

## Client

- `SpaceContext` holds the space list + current space (persisted per
  device). Header wordmark/sidebar becomes the switcher.
- Group tab set adapts; Us appears only in the couple space.
- Sign-in page gains signup; `/join/:code` deep link confirms → joins
  (after signup if needed).
- Per-space Members page: invite share-sheet, rename, remove, leave;
  owner-only controls. Global Admin page shrinks accordingly.
- Money gains a split editor (equal one-tap / unequal with live
  remainder check), per-member net balances, and a simplify-debts view
  (greedy max-debtor → max-creditor matching). Receipt scan, categories
  and insights carry over unchanged.

## Testing

- Security: prove a non-member account cannot select/insert into another
  space (the critical test).
- Migration: couple balance identical pre/post, row counts stamped.
- Ledger: N-way equal/unequal splits, simplify-debts correctness,
  settlements.
- E2E: signup + invite redemption with throwaway accounts; switcher and
  group flows screenshotted on mobile + desktop widths.

## Addendum: UX audit round (same day)

Audit of all five journeys found and fixed: no password recovery
(admin `set_password` + self-serve reset link + /reset page), signup
stuck on unreliable confirmation mail (resend button; admin reset also
force-confirms), invite links losing context at sign-in (invite banner,
walkthrough skipped), Calendar unreachable on mobile (Home entry),
Settings still describing the pre-spaces household (now shows the
current space), stale household copy, and ungated notes-AI.

Decision reversal: couple spaces are no longer unique to the original
pair. Anyone may form one (0030): max 2 members, one couple per person,
enforced by DB triggers; invites lock at two; couples dissolve as a
whole instead of losing members one by one.
