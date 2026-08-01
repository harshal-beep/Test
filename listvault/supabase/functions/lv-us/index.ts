// lv-us — DEPLOYED to Supabase project jxpxwxnrdljqzxxhlhkx.
// Backend for the "Us" tab:
//   refresh_events — refill the Mumbai events cache (AllEvents.in when an
//     ALLEVENTS_API_KEY secret exists, else AI web curation via OpenRouter
//     `:online`), then rank everything against both partners' tastes.
//   rerank_events — re-score the existing cache after tastes change.
//   more_questions — AI top-up of the question deck when it runs low.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'
const FRESH_MS = 20 * 60 * 60 * 1000 // refresh at most ~once a day

interface EventRow {
  title: string
  category: string | null
  venue: string | null
  area: string | null
  starts_on: string | null
  price_text: string | null
  url: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/** Mumbai's calendar date (IST), independent of where the function runs. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
}

/** Pull the first JSON array out of an LLM reply that may have prose around it. */
function extractArray(text: string): unknown[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('no JSON array in AI reply')
  return JSON.parse(text.slice(start, end + 1))
}

async function openrouter(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 4096
): Promise<string> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://hamaara.vercel.app',
      'X-Title': 'HaMaara'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data?.error?.message ?? `AI provider error (${resp.status})`)
  const out = (data.choices?.[0]?.message?.content ?? '').trim()
  if (!out) throw new Error('empty AI response')
  return out
}

/** AllEvents.in — used when the admin has stored an ALLEVENTS_API_KEY secret. */
async function fetchAllEvents(apiKey: string): Promise<EventRow[]> {
  const resp = await fetch('https://api.allevents.in/events/list/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ city: 'Mumbai', page: 1, rows: 40 })
  })
  if (!resp.ok) throw new Error(`AllEvents error (${resp.status})`)
  const data = await resp.json()
  const items = (data?.data ?? data?.events ?? []) as Record<string, unknown>[]
  if (!Array.isArray(items) || items.length === 0) throw new Error('AllEvents returned no events')
  return items.slice(0, 40).map((e) => ({
    title: String(e.eventname ?? e.title ?? '').slice(0, 200),
    category: e.categories ? String(e.categories).split(',')[0] : null,
    venue: String((e.venue as Record<string, unknown>)?.full_address ?? e.venue_name ?? '') || null,
    area: String((e.venue as Record<string, unknown>)?.city ?? 'Mumbai'),
    starts_on: e.start_time ? new Date(Number(e.start_time) * 1000).toISOString().slice(0, 10) : null,
    price_text: e.tickets ? null : null,
    url: String(e.event_url ?? '') || null
  })).filter((e) => e.title)
}

/** AI web curation via OpenRouter's `:online` search-enabled variant. */
async function fetchAiEvents(apiKey: string, model: string): Promise<EventRow[]> {
  const prompt = `Search the web for events and things to do in Mumbai, India between ${istToday()} and 14 days later that would suit a couple in their 20s-30s: concerts and gigs, standup comedy, theatre, art exhibitions, food festivals and pop-ups, workshops, markets, outdoor experiences.

Reply with ONLY a JSON array (no prose, no markdown fences) of up to 25 objects:
[{"title": string, "category": "music|comedy|theatre|art|food|workshop|market|outdoor|other", "venue": string or null, "area": string (neighbourhood, e.g. "Lower Parel") or null, "starts_on": "YYYY-MM-DD" or null, "price_text": string like "₹499 onwards" or "Free" or null, "url": source link string or null}]

Only include events you found on real pages, with their real dates. Skip anything already past.`
  const out = await openrouter(apiKey, `${model}:online`, prompt, 6000)
  const arr = extractArray(out) as Record<string, unknown>[]
  return arr
    .map((e) => ({
      title: String(e.title ?? '').slice(0, 200),
      category: e.category ? String(e.category) : null,
      venue: e.venue ? String(e.venue).slice(0, 200) : null,
      area: e.area ? String(e.area).slice(0, 80) : null,
      starts_on: typeof e.starts_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.starts_on) ? e.starts_on : null,
      price_text: e.price_text ? String(e.price_text).slice(0, 60) : null,
      url: e.url ? String(e.url).slice(0, 500) : null
    }))
    .filter((e) => e.title)
}

/* ------------------------- recommendation engine -------------------------
 * Deterministic and explainable: every score is a sum of named factors, and
 * the reason line is generated from the top contributing factors — no AI in
 * the scoring loop. AI is used once per refresh, only to classify free-text
 * item history ("street pani puri" → food) into categories.
 *
 * Signals per user, per category (with exponential decay, 60-day half-life):
 *   +3  added a Discover event to a list        (client-written, event_add)
 *   -4  hid a Discover event                    (client-written, event_hide)
 *   +2  completed an item of this category      (derived here from history)
 * Quiz interests map to categories at +2 each (no decay — they're explicit).
 *
 * Per-user event score  = 50 + 28·affinity(category) + budget fit ± 8
 *                          + setting fit ± 5 (outdoor only)
 * Couple score          = 0.6·min(A, B) + 0.4·mean(A, B)
 * min-weighting means an event one of you dislikes can't win on the other's
 * enthusiasm alone — it has to work for both.
 * ------------------------------------------------------------------------ */

const CATEGORIES = ['music', 'comedy', 'theatre', 'art', 'food', 'workshop', 'market', 'outdoor', 'other']

const INTEREST_TO_CATEGORY: Record<string, string[]> = {
  'Live music': ['music'],
  Comedy: ['comedy'],
  Art: ['art'],
  Films: ['other'],
  'Nature & walks': ['outdoor'],
  Sports: ['outdoor'],
  Shopping: ['market'],
  Theatre: ['theatre'],
  Photography: ['art', 'outdoor'],
  'Board games': ['workshop']
}

const HALF_LIFE_DAYS = 60

interface TastesJson {
  cuisines?: string[]
  budget?: string
  setting?: string
  interests?: string[]
}

function decay(createdAt: string): number {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

/** ₹-band (1-3) from free-form price text; null when unknown. */
function priceBand(priceText: string | null): number | null {
  if (!priceText) return null
  if (/free/i.test(priceText)) return 1
  const nums = priceText.match(/\d[\d,]*/g)?.map((n) => parseInt(n.replace(/,/g, ''), 10)) ?? []
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  return min < 500 ? 1 : min <= 1500 ? 2 : 3
}

/** Per-user category affinity in [-1, 1] from signals + quiz interests. */
function buildAffinity(
  tastes: TastesJson | null,
  signals: { category: string; weight: number; created_at: string }[]
): Map<string, number> {
  const raw = new Map<string, number>()
  for (const c of CATEGORIES) raw.set(c, 0)
  for (const s of signals) {
    raw.set(s.category, (raw.get(s.category) ?? 0) + s.weight * decay(s.created_at))
  }
  for (const interest of tastes?.interests ?? []) {
    for (const c of INTEREST_TO_CATEGORY[interest] ?? []) raw.set(c, (raw.get(c) ?? 0) + 2)
  }
  if ((tastes?.cuisines?.length ?? 0) > 0) raw.set('food', (raw.get('food') ?? 0) + 2)
  const peak = Math.max(1, ...[...raw.values()].map(Math.abs))
  const norm = new Map<string, number>()
  for (const [c, v] of raw) norm.set(c, v / peak)
  return norm
}

interface UserModel {
  name: string
  tastes: TastesJson | null
  affinity: Map<string, number>
}

function scoreForUser(u: UserModel, ev: { category: string | null; price_text: string | null }): number {
  let s = 50
  const cat = ev.category ?? 'other'
  s += 28 * (u.affinity.get(cat) ?? 0)
  const band = priceBand(ev.price_text)
  const budget = u.tastes?.budget ? u.tastes.budget.length : null // '₹₹' → 2
  if (band !== null && budget !== null) s += Math.abs(band - budget) <= 0 ? 8 : Math.abs(band - budget) === 1 ? 0 : -8
  if (cat === 'outdoor' && u.tastes?.setting) {
    s += u.tastes.setting === 'Outdoor' || u.tastes.setting === 'Both' ? 5 : -5
  }
  return Math.max(0, Math.min(100, s))
}

/** Human reason from the top contributing factors — fully deterministic. */
function reasonFor(a: UserModel, b: UserModel, ev: { category: string | null; price_text: string | null }): string {
  const cat = ev.category ?? 'other'
  const CAT_PHRASE: Record<string, string> = {
    music: 'live music',
    comedy: 'comedy nights',
    theatre: 'theatre',
    art: 'art things',
    food: 'food adventures',
    workshop: 'trying things hands-on',
    market: 'markets and browsing',
    outdoor: 'being outdoors',
    other: 'new experiences'
  }
  const phrase = CAT_PHRASE[cat]
  const aLikes = (a.affinity.get(cat) ?? 0) > 0.25
  const bLikes = (b.affinity.get(cat) ?? 0) > 0.25
  const parts: string[] = []
  if (aLikes && bLikes) parts.push(`You both keep choosing ${phrase}`)
  else if (aLikes) parts.push(`${a.name} loves ${phrase}`)
  else if (bLikes) parts.push(`${b.name} loves ${phrase}`)
  const band = priceBand(ev.price_text)
  const budgets = [a, b].map((u) => (u.tastes?.budget ? u.tastes.budget.length : null))
  if (band !== null && budgets.every((x) => x !== null && Math.abs(band - x) <= 0)) {
    parts.push('fits your usual budget')
  }
  if (parts.length === 0) return 'Something different to try together'
  return parts.join(' — ')
}

/** Classify recent completed items into categories (the one AI call). */
async function historySignals(
  admin: SupabaseClient,
  apiKey: string,
  model: string
): Promise<{ user_id: string; category: string; created_at: string }[]> {
  const { data: items } = await admin
    .from('lv_items')
    .select('text, checked_by, checked_at')
    .eq('checked', true)
    .not('checked_at', 'is', null)
    .not('checked_by', 'is', null)
    .order('checked_at', { ascending: false })
    .limit(40)
  if (!items || items.length === 0) return []
  try {
    const prompt = `Classify each activity into exactly one category from: ${CATEGORIES.join(', ')}. Household chores, groceries or unclear items → "skip". Reply with ONLY a JSON array of strings, same order and length as the input, e.g. ["food","skip","music"].\n\n${JSON.stringify(items.map((i) => i.text))}`
    const out = await openrouter(apiKey, model, prompt, 2000)
    const cats = extractArray(out) as string[]
    return items
      .map((it, i) => ({ user_id: it.checked_by as string, category: cats[i], created_at: it.checked_at as string }))
      .filter((r) => CATEGORIES.includes(r.category))
  } catch {
    return [] // classification is a bonus, never a blocker
  }
}

/** Score cached events for the couple; writes score + explainable reason. */
async function rankEvents(admin: SupabaseClient, apiKey: string, model: string) {
  const [{ data: events }, { data: profiles }, { data: signals }, history] = await Promise.all([
    admin.from('lv_events').select('id, category, price_text').limit(60),
    admin.from('lv_profiles').select('id, display_name, tastes'),
    admin
      .from('lv_taste_signals')
      .select('user_id, category, weight, created_at')
      .gte('created_at', new Date(Date.now() - 180 * 86400000).toISOString()),
    historySignals(admin, apiKey, model)
  ])
  if (!events || events.length === 0 || !profiles || profiles.length === 0) return

  const users: UserModel[] = profiles.slice(0, 2).map((p) => {
    const own = (signals ?? []).filter((s) => s.user_id === p.id)
    const ownHistory = history.filter((h) => h.user_id === p.id).map((h) => ({ category: h.category, weight: 2, created_at: h.created_at }))
    return {
      name: (p.display_name as string)?.split(' ')[0] || 'Partner',
      tastes: p.tastes as TastesJson | null,
      affinity: buildAffinity(p.tastes as TastesJson | null, [...own, ...ownHistory])
    }
  })
  const [a, b] = users.length === 2 ? users : [users[0], users[0]]

  await Promise.all(
    events.map((ev) => {
      const sa = scoreForUser(a, ev)
      const sb = scoreForUser(b, ev)
      const couple = Math.round(0.6 * Math.min(sa, sb) + 0.4 * ((sa + sb) / 2))
      return admin
        .from('lv_events')
        .update({ score: couple, reason: reasonFor(a, b, ev).slice(0, 300) })
        .eq('id', ev.id)
    })
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Any signed-in HaMaara user may trigger these; writes go via service role.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'not signed in' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: secretRows } = await admin
      .from('lv_secrets')
      .select('key, value')
      .in('key', ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'ALLEVENTS_API_KEY'])
    const secrets = Object.fromEntries((secretRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
    const apiKey = Deno.env.get('OPENROUTER_API_KEY') ?? secrets.OPENROUTER_API_KEY
    const model = Deno.env.get('OPENROUTER_MODEL') ?? secrets.OPENROUTER_MODEL ?? DEFAULT_MODEL
    if (!apiKey) return json({ error: 'AI is not configured yet.' }, 503)

    const { action } = await req.json()

    if (action === 'refresh_events') {
      // Staleness gate lives server-side so many clients can't stampede it.
      const { data: newest } = await admin
        .from('lv_events')
        .select('fetched_at')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (newest && Date.now() - new Date(newest.fetched_at).getTime() < FRESH_MS) {
        return json({ result: 'fresh' })
      }

      let rows: EventRow[]
      let source = 'ai'
      if (secrets.ALLEVENTS_API_KEY) {
        try {
          rows = await fetchAllEvents(secrets.ALLEVENTS_API_KEY)
          source = 'allevents'
        } catch {
          rows = await fetchAiEvents(apiKey, model)
        }
      } else {
        rows = await fetchAiEvents(apiKey, model)
      }
      if (rows.length === 0) return json({ error: 'no events found this time' }, 502)

      // Replace the cache wholesale: hides cascade, stale listings vanish.
      await admin.from('lv_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      const { error: insErr } = await admin
        .from('lv_events')
        .upsert(rows.map((r) => ({ ...r, source })), { onConflict: 'title,starts_on', ignoreDuplicates: true })
      if (insErr) return json({ error: insErr.message }, 500)

      await rankEvents(admin, apiKey, model)
      return json({ result: 'refreshed', count: rows.length, source })
    }

    if (action === 'rerank_events') {
      await rankEvents(admin, apiKey, model)
      return json({ result: 'reranked' })
    }

    if (action === 'more_questions') {
      const { data: existing } = await admin.from('lv_questions').select('text')
      const prompt = `Write 20 fresh questions for a couple's question deck. They are a young Indian couple who live in Mumbai but separately; the deck helps them understand each other better. Split across four moods: fun, memories, preferences, deeper (5 each). Warm, specific, non-cheesy, one sentence each. English with an occasional natural Indian touch is fine.

Do NOT repeat or closely paraphrase any of these existing questions:\n${(existing ?? []).map((q: { text: string }) => `- ${q.text}`).join('\n')}

For about half the questions include "options": an array of 2-4 short predefined choices (this-or-that style); for the rest omit options so the answer is free text.

Reply with ONLY a JSON array: [{"text": string, "mood": "fun|memories|preferences|deeper", "options": [string] or omitted}]`
      const out = await openrouter(apiKey, model, prompt, 4000)
      const arr = (extractArray(out) as { text: string; mood: string; options?: string[] }[])
        .filter((q) => q.text && ['fun', 'memories', 'preferences', 'deeper'].includes(q.mood))
        .map((q) => ({
          text: String(q.text).slice(0, 300),
          mood: q.mood,
          source: 'ai',
          options:
            Array.isArray(q.options) && q.options.length >= 2
              ? q.options.slice(0, 4).map((o) => String(o).slice(0, 120))
              : null
        }))
      if (arr.length === 0) return json({ error: 'no questions generated' }, 502)
      const { error: qErr } = await admin
        .from('lv_questions')
        .upsert(arr, { onConflict: 'text', ignoreDuplicates: true })
      if (qErr) return json({ error: qErr.message }, 500)
      return json({ result: 'added', count: arr.length })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
