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
- **Auth & account** — Sign in with Google only (v1); display-name editing; JSON data
  export; self-serve account deletion. The `profiles.provider` column exists now so
  adding Sign in with Apple later is a migration, not a rewrite.
- **iOS install flow** — guided "Add to Home Screen" prompt on first visit from iOS
  Safari (push on iOS only works after install).

## Getting started

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: paste `supabase/migrations/0001_init.sql` into the SQL editor
   (or `supabase db push` with the CLI).
3. Enable the **Google** provider under Authentication → Providers and add your app's
   URL(s) to the redirect allowlist.

### 2. App

```bash
cd listvault
cp .env.example .env.local   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

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
├── supabase/migrations/0001_init.sql   # schema, RLS, RPCs (join/search/duplicate/export)
├── src/
│   ├── context/AuthContext.tsx         # Google sign-in via Supabase Auth
│   ├── hooks/useListDetail.ts          # realtime + optimistic sync engine
│   ├── pages/                          # Home, ListDetail, Join, Archive, Search, Settings
│   └── components/                     # Layout, Avatar, iOS install prompt
└── vite.config.ts                      # PWA manifest + Workbox caching rules
```
