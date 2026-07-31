// lv-admin-users — DEPLOYED to Supabase project jxpxwxnrdljqzxxhlhkx.
// Lets ListVault admins create and remove member accounts. The caller's JWT
// is verified and their lv_profiles.is_admin flag re-checked server-side
// before any service-role auth operation runs.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Identify the caller from their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'not signed in' }, 401)

    // Verify the caller is a ListVault admin
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await admin
      .from('lv_profiles')
      .select('is_admin')
      .eq('id', userData.user.id)
      .single()
    if (!profile?.is_admin) return json({ error: 'admin access required' }, 403)

    const body = await req.json()

    if (body.action === 'create') {
      const { email, password, display_name } = body
      if (!email || !password || password.length < 6) {
        return json({ error: 'email and a password of 6+ characters are required' }, 400)
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email.split('@')[0] }
      })
      if (error) return json({ error: error.message }, 400)
      return json({ user_id: data.user.id })
    }

    if (body.action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id required' }, 400)
      if (user_id === userData.user.id) return json({ error: 'you cannot delete yourself' }, 400)
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
