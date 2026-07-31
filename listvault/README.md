# ListVault

Shared to-do/shopping lists in real time — with the differentiator: every closed list is
permanently archived into a searchable, reusable vault. Built per the v1 MVP PRD.

**Stack:** React + Vite + TypeScript + Tailwind (PWA via `vite-plugin-pwa` / Workbox) on
Supabase (Postgres + Realtime + Auth + RLS). Server-authoritative sync with optimistic UI
and last-write-wins per item.

## Features (v1 MVP)

- **Lists & items** — create a list with name/emoji/colour in seconds; add items one per
  line with instant optimistic UI; check/uncheck, edit, delete, reorder; see *who added*
  and *who checked* every item (avatar + timestamp on tap).
- **Sharing** — WhatsApp-ready link + 6-character join code (unambiguous alphabet, no
  0/O/1/I); invitees sign in with Google in one tap and land in the list; owner can view
  members, remove a member, regenerate the code, and delete the list. Roles: Owner and
  Editor.
- **Real-time sync** — changes propagate live over Supabase Realtime; a visible
  "Synced / Syncing…" state; conflicts resolve last-write-wins per item.
- **Archive (the wedge)** — Close a list → read-only, moved to the Archive with full
  final state and per-item attribution. Reopen within 24h. Browse by month, full-text
  search across active + archived (Postgres `tsvector`), duplicate any archived list into
  a new active one (optionally excluding checked items). Never auto-deleted; only the
  owner can permanently delete, with confirmation.
- **Auth & account** — email/password signup and sign-in via Supabase Auth;
  display-name editing; JSON data export; self-serve account deletion. The
  `lv_profiles.provider` column exists so adding Google/Apple sign-in later is a
  migration, not a rewrite.
- **Admin section** — the first account to sign up becomes admin. Admins get an Admin
  tab where they can add members (name + email + temporary password, created via the
  `lv-admin-users` Edge Function — no email confirmation needed), grant/revoke admin,
  and remove accounts.
- **iOS install flow** — guided "Add to Home Screen" prompt on first visit from iOS
  Safari (push on iOS only works after install).

## Getting started

### Backend (already provisioned)

The backend is **live** on the Supabase project `jxpxwxnrdljqzxxhlhkx` ("Jugaad AI",
shared with other apps — all ListVault objects are `lv_` prefixed):

- `supabase/migrations/0001_init.sql` is applied (tables, RLS, RPCs, realtime).
- The `lv-admin-users` Edge Function is deployed (admin member management).

To move to a dedicated project later, run the same migration and redeploy the
function, then swap the two values in `.env.local`.

### App

```bash
cd listvault
cp .env.example .env.local   # already contains the live URL + anon key
npm install
npm run dev
```

Sign up with email + password — the **first account becomes admin** automatically.
Note: self-signup sends a confirmation email (Supabase default); accounts added from
the Admin tab skip confirmation and can sign in immediately. When deploying, set the
project's Site URL (Authentication → URL Configuration) to your deployed URL so
confirmation links land in the right place.

`npm run build` produces a static PWA in `dist/` — deploy to Vercel or Cloudflare Pages.
The `/j/:code` route must rewrite to `index.html` (default SPA behaviour on both hosts).

## Deliberately out of scope (v1 non-goals)

Native apps, Sign in with Apple, offline-first, projects/subtasks/dates/reminders,
payments, and AI features. Web push notification delivery (the "added to a list" push and
daily digest) needs a small server component (VAPID keys + a Supabase Edge Function) and
is stubbed at the schema level via `list_members.muted`.

## Structure

```
listvault/
├── supabase/
│   ├── migrations/0001_init.sql        # schema, RLS, RPCs (applied)
│   └── functions/lv-admin-users/       # admin member management (deployed)
├── src/
│   ├── context/AuthContext.tsx         # email auth via Supabase Auth
│   ├── hooks/useListDetail.ts          # realtime + optimistic sync engine
│   ├── pages/                          # Home, ListDetail, Join, Archive, Search, Settings, Admin
│   └── components/                     # Layout, Avatar, AuthForm, iOS install prompt
└── vite.config.ts                      # PWA manifest + Workbox caching rules
```
