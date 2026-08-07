import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
const supa = createClient('https://jxpxwxnrdljqzxxhlhkx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4cHh3eG5yZGxqcXp4eGhsaGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjY5OTYsImV4cCI6MjA4Njc0Mjk5Nn0.LquTvqR8tJUziVdphWqtmsSQUEmNdsYLL961ktTxIII', { auth: { persistSession: false } })
const { data: auth } = await supa.auth.signInWithPassword({ email: 'gohilharshal@gmail.com', password: 'Harshal@17' })
const H = auth.session.user.id
const F = '00000000-0000-4000-8000-00000000000f'
const now = new Date().toISOString()
const dist = '/home/user/Test/listvault/dist'
const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css' }
const srv = createServer((req,res)=>{ let p=join(dist,req.url.split('?')[0]); if(!existsSync(p)||req.url==='/')p=join(dist,'index.html')
  res.setHeader('content-type',types[extname(p)]??'application/octet-stream'); res.end(readFileSync(p)) }).listen(4195)
const prof=(id,n)=>({id,display_name:n,avatar_url:null,email:null,provider:'email',is_admin:false,created_at:now,tastes:null})
const spaces=[
  {id:'c1',name:'Us',emoji:'💜',kind:'couple',invite_code:'X',created_by:H,created_at:'2026-07-01T00:00:00Z'},
  {id:'g1',name:'Goa Trip',emoji:'🏖️',kind:'group',invite_code:'SPFWV5',created_by:H,created_at:'2026-08-01T00:00:00Z'}]
const membersRows=[
  {space_id:'c1',user_id:H,role:'owner',joined_at:now,profile:prof(H,'Harshal Gohil')},
  {space_id:'g1',user_id:H,role:'owner',joined_at:now,profile:prof(H,'Harshal Gohil')},
  {space_id:'g1',user_id:F,role:'member',joined_at:now,profile:prof(F,'Priya')}]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport:{width:390,height:844} })
await ctx.route('**/rest/v1/**', (route) => {
  const t = new URL(route.request().url()).pathname.split('/').pop()
  const body = t==='lv_spaces'?spaces : t==='lv_space_members'?membersRows : []
  route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) })
})
await ctx.route('**/realtime/**', r=>r.abort())
const pg = await ctx.newPage()
await pg.addInitScript((a)=>{ localStorage.setItem('sb-jxpxwxnrdljqzxxhlhkx-auth-token',a.seed); localStorage.setItem('lv-space','g1') }, { seed: JSON.stringify(auth.session) })
const out='/tmp/claude-0/-home-user-Test/201700f5-894c-59d6-b3c2-98ec24ccc827/scratchpad'
await pg.goto('http://localhost:4195/space')
await pg.waitForTimeout(2500)
await pg.screenshot({ path: `${out}/sp-settings.png`, fullPage: true })
await pg.goto('http://localhost:4195/')
await pg.waitForTimeout(2000)
await pg.locator('header button').first().click()
await pg.waitForTimeout(900)
await pg.screenshot({ path: `${out}/sp-switcher.png` })
await browser.close(); srv.close()
console.log('done')
