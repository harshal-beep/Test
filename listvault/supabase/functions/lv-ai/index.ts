// lv-ai — DEPLOYED to Supabase project jxpxwxnrdljqzxxhlhkx.
// AI assist for notes: summarize, fix grammar, format into a list.
// Calls OpenRouter (default model deepseek/deepseek-v4-flash). Both the API
// key and model resolve from env vars (OPENROUTER_API_KEY / OPENROUTER_MODEL)
// when set, otherwise from the service-role-only lv_secrets table.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'

const PROMPTS: Record<string, string> = {
  summarize:
    'Summarize the following note into a few short, clear sentences. Keep names, dates, amounts, and action items. Reply with ONLY the summary text, no preamble.',
  fix_grammar:
    'Fix the spelling and grammar of the following note. Keep the meaning, tone, language mix (e.g. Hinglish), and formatting intact. Reply with ONLY the corrected text, no preamble.',
  format_list:
    'Convert the following note into a clean list, one item per line. Merge duplicates, group obviously related items next to each other, and drop filler words. Reply with ONLY the list items, one per line, no bullets, numbering, or preamble.'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  try {
    // Signed-in AND a member of at least one space — signup alone is not
    // enough to spend AI credits.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'not signed in' }, 401)
    const gate = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: membership } = await gate
      .from('lv_space_members')
      .select('space_id')
      .eq('user_id', userData.user.id)
      .limit(1)
    if (!membership?.length) return json({ error: 'join a space first' }, 403)

    // Config: env vars win; otherwise the service-role-only lv_secrets table
    let apiKey = Deno.env.get('OPENROUTER_API_KEY')
    let model = Deno.env.get('OPENROUTER_MODEL')
    if (!apiKey || !model) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data } = await admin
        .from('lv_secrets')
        .select('key, value')
        .in('key', ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'])
      const map = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
      apiKey = apiKey ?? map.OPENROUTER_API_KEY
      model = model ?? map.OPENROUTER_MODEL
    }
    model = model ?? DEFAULT_MODEL
    if (!apiKey) {
      return json({ error: 'AI is not configured yet. Ask the admin to add an OPENROUTER_API_KEY.' }, 503)
    }

    const { action, text } = await req.json()
    const prompt = PROMPTS[action]
    if (!prompt) return json({ error: 'unknown action' }, 400)
    if (!text || typeof text !== 'string' || !text.trim()) return json({ error: 'text required' }, 400)
    if (text.length > 20000) return json({ error: 'text too long' }, 400)

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hamaara.vercel.app',
        'X-Title': 'HaMaara'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: `${prompt}\n\n<note>\n${text}\n</note>` }]
      })
    })

    const data = await resp.json()
    if (!resp.ok || data.error) {
      const msg = data?.error?.message ?? `AI provider error (${resp.status})`
      return json({ error: msg }, 502)
    }

    const out = (data.choices?.[0]?.message?.content ?? '').trim()
    if (!out) return json({ error: 'empty AI response' }, 502)
    return json({ result: out })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
