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

/** Score cached events against both partners' tastes; writes reason/score. */
async function rankEvents(admin: SupabaseClient, apiKey: string, model: string) {
  const [{ data: events }, { data: profiles }] = await Promise.all([
    admin.from('lv_events').select('id, title, category, venue, area, price_text').limit(40),
    admin.from('lv_profiles').select('display_name, tastes')
  ])
  if (!events || events.length === 0) return
  const tastes = (profiles ?? [])
    .filter((p) => p.tastes)
    .map((p) => `${p.display_name}: ${JSON.stringify(p.tastes)}`)
    .join('\n')

  const prompt = `Two partners use a shared app. Their tastes:\n${tastes || '(no taste profiles yet — judge general couple appeal)'}\n\nEvents in Mumbai:\n${JSON.stringify(
    events
  )}\n\nScore each event 0-100 for how well it suits BOTH of them doing it together, with a warm one-line reason referencing their tastes when possible (e.g. "You both said live music"). Reply with ONLY a JSON array: [{"id": string, "score": number, "reason": string}]`
  const out = await openrouter(apiKey, model, prompt, 6000)
  const ranks = extractArray(out) as { id: string; score: number; reason: string }[]
  await Promise.all(
    ranks
      .filter((r) => r.id && typeof r.score === 'number')
      .map((r) =>
        admin
          .from('lv_events')
          .update({ score: Math.max(0, Math.min(100, Math.round(r.score))), reason: String(r.reason ?? '').slice(0, 300) })
          .eq('id', r.id)
      )
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

Reply with ONLY a JSON array: [{"text": string, "mood": "fun|memories|preferences|deeper"}]`
      const out = await openrouter(apiKey, model, prompt, 4000)
      const arr = (extractArray(out) as { text: string; mood: string }[])
        .filter((q) => q.text && ['fun', 'memories', 'preferences', 'deeper'].includes(q.mood))
        .map((q) => ({ text: String(q.text).slice(0, 300), mood: q.mood, source: 'ai' }))
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
