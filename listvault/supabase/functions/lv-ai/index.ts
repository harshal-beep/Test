// lv-ai — DEPLOYED to Supabase project jxpxwxnrdljqzxxhlhkx.
// AI assist for notes: summarize, fix grammar, format into a list.
// Requires the ANTHROPIC_API_KEY secret on the project
// (Dashboard → Edge Functions → Secrets, or `supabase secrets set`).
// Until it's set, the function returns a friendly "not configured" error.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

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
    // Any signed-in ListVault user may use AI assist
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'not signed in' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json(
        { error: 'AI is not configured yet. Ask the admin to add an ANTHROPIC_API_KEY secret to the Supabase project.' },
        503
      )
    }

    const { action, text } = await req.json()
    const prompt = PROMPTS[action]
    if (!prompt) return json({ error: 'unknown action' }, 400)
    if (!text || typeof text !== 'string' || !text.trim()) return json({ error: 'text required' }, 400)
    if (text.length > 20000) return json({ error: 'text too long' }, 400)

    const anthropic = new Anthropic({ apiKey })
    // Server-side refusal fallback: if Claude Opus 5's safety classifiers
    // decline, the API re-serves the request on the recommended fallback model.
    const response = await (anthropic.beta.messages.create as (p: unknown) => Promise<Anthropic.Message>)({
      model: 'claude-opus-5',
      max_tokens: 4096,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: `${prompt}\n\n<note>\n${text}\n</note>` }]
    })

    if (response.stop_reason === 'refusal') {
      return json({ error: 'The AI declined to process this note.' }, 422)
    }

    const out = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()
    if (!out) return json({ error: 'empty AI response' }, 502)
    return json({ result: out })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
