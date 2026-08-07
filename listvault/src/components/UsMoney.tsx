/**
 * The shared ledger — Splitwise-style for any space size. The couple space is
 * just a two-member group: same shares engine, same UI, friendlier copy.
 */
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Camera, ExternalLink, Plus, Search, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { processPhoto } from '../lib/images'
import { computeNets, equalShares, inr, myExpenseDelta, simplifyDebts } from '../lib/money'
import { EXPENSE_CATEGORIES, Expense, Settlement } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useSpace } from '../context/SpaceContext'
import Avatar from './Avatar'
import { BottomSheet, EmptyState, Skeleton, stagger, useConfirm, useToast } from './ui'

const catMeta = (key: string | null) => EXPENSE_CATEGORIES.find((c) => c.key === key)

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Could not read image'))
    r.readAsDataURL(blob)
  })

export default function UsMoney() {
  const { session } = useAuth()
  const { space, members, isCouple } = useSpace()
  const sid = space!.id
  const toast = useToast()
  const confirm = useConfirm()
  const myId = session?.user.id
  const two = members.length === 2
  const partner = two ? members.find((p) => p.id !== myId) : undefined
  const partnerName = partner?.display_name?.split(' ')[0] || 'Partner'
  const firstNameOf = (id: string | null | undefined) =>
    id === myId ? 'You' : members.find((p) => p.id === id)?.display_name?.split(' ')[0] || 'Someone'

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [settle, setSettle] = useState<{ from: string; to: string; amount: number } | null>(null)

  // add-expense form
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<string | null>(null)
  const [inSplit, setInSplit] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'equal' | 'custom'>('equal')
  const [customAmts, setCustomAmts] = useState<Record<string, string>>({})
  const [category, setCategory] = useState<string>('food')
  const [items, setItems] = useState<{ name: string; price: number }[]>([])
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    void load()
    const channel = supabase
      .channel(`money-${sid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_expenses' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_expense_shares' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_settlements' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [sid])

  async function load() {
    const [e, st] = await Promise.all([
      supabase
        .from('lv_expenses')
        .select('*, shares:lv_expense_shares(*)')
        .eq('space_id', sid)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.from('lv_settlements').select('*').eq('space_id', sid).order('created_at', { ascending: false }).limit(100)
    ])
    setExpenses(((e.data as Expense[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })))
    setSettlements(((st.data as Settlement[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })))
    setLoading(false)
  }

  const nets = useMemo(() => computeNets(expenses, settlements), [expenses, settlements])
  const myNet = myId ? (nets.get(myId) ?? 0) : 0
  const transfers = useMemo(() => simplifyDebts(nets), [nets])

  /** Splitwise-Pro-style "charts": this month's totals and category split. */
  const insights = useMemo(() => {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = expenses.filter((e) => e.spent_on.startsWith(monthKey))
    const total = month.reduce((s, e) => s + e.amount, 0)
    const mine = month.filter((e) => e.paid_by === myId).reduce((s, e) => s + e.amount, 0)
    const byCat = new Map<string, number>()
    for (const e of month) {
      const k = e.category ?? 'other'
      byCat.set(k, (byCat.get(k) ?? 0) + e.amount)
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
    return { total, mine, theirs: total - mine, cats, count: month.length }
  }, [expenses, myId])

  const visibleExpenses = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter(
      (e) => e.description.toLowerCase().includes(q) || (e.category ?? '').includes(q)
    )
  }, [expenses, query])

  function openAdd() {
    setPaidBy(myId ?? null)
    setInSplit(new Set(members.map((m) => m.id)))
    setMode('equal')
    setCustomAmts({})
    setAddOpen(true)
  }

  /** Photo of the bill → AI fills the form; original stored as the receipt. */
  async function scanReceipt(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !myId) return
    setScanning(true)
    try {
      const blob = await processPhoto(file)
      const dataUrl = await blobToDataUrl(blob)
      const { data, error } = await supabase.functions.invoke('lv-us', {
        body: { action: 'scan_receipt', image: dataUrl }
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const r = data.result as { description: string; amount: number; category: string; items: { name: string; price: number }[] }
      setDesc(r.description)
      setAmount(String(r.amount))
      setCategory(r.category)
      setItems(r.items)
      // keep the original photo as the receipt
      const path = `${myId}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('lv-receipts')
        .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('lv-receipts').getPublicUrl(path)
        setReceiptUrl(pub.publicUrl)
      }
      toast('Bill read ✨ — check the numbers')
    } catch (err) {
      toast((err as Error).message)
    }
    setScanning(false)
  }

  const amt = parseFloat(amount) || 0
  const splitIds = members.filter((m) => inSplit.has(m.id)).map((m) => m.id)
  const customTotal = splitIds.reduce((s, id) => s + (parseFloat(customAmts[id] ?? '') || 0), 0)
  const remaining = Math.round((amt - customTotal) * 100) / 100
  const splitOk = mode === 'equal' ? splitIds.length > 0 : splitIds.length > 0 && Math.abs(remaining) < 0.01

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    if (!myId || !paidBy) return
    if (!desc.trim() || !isFinite(amt) || amt <= 0 || !splitOk) return
    const shareMap =
      mode === 'equal'
        ? equalShares(amt, splitIds)
        : new Map(splitIds.map((id) => [id, parseFloat(customAmts[id] ?? '') || 0]))
    setBusy(true)
    const { data: created, error } = await supabase
      .from('lv_expenses')
      .insert({
        space_id: sid,
        description: desc.trim().slice(0, 200),
        amount: amt,
        paid_by: paidBy,
        category,
        receipt_url: receiptUrl,
        items: items.length ? items : null,
        created_by: myId
      })
      .select()
      .single()
    if (error || !created) {
      setBusy(false)
      toast(error?.message ?? 'Could not save')
      return
    }
    const shareRows = [...shareMap.entries()]
      .filter(([, v]) => v > 0)
      .map(([user_id, v]) => ({ expense_id: (created as Expense).id, user_id, amount: v }))
    const { error: shareErr } = await supabase.from('lv_expense_shares').insert(shareRows)
    setBusy(false)
    if (shareErr) {
      await supabase.from('lv_expenses').delete().eq('id', (created as Expense).id)
      toast(shareErr.message)
      return
    }
    setAddOpen(false)
    setDesc('')
    setAmount('')
    setCategory('food')
    setItems([])
    setReceiptUrl(null)
    toast('Expense added 💸')
  }

  async function recordSettlement() {
    if (!myId || !settle) return
    setBusy(true)
    const { error } = await supabase.from('lv_settlements').insert({
      space_id: sid,
      from_user: settle.from,
      to_user: settle.to,
      amount: settle.amount,
      created_by: myId
    })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setSettle(null)
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#aba3f0', '#a8e6c9', '#ffe0a3'] })
      toast('Settled ✅')
    }
  }

  async function removeExpense(ex: Expense) {
    if (!(await confirm(`Delete "${ex.description}"?`, { confirmLabel: 'Delete', danger: true }))) return
    await supabase.from('lv_expenses').delete().eq('id', ex.id)
  }

  const profileOf = (id: string) => members.find((p) => p.id === id)

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )

  const settled = Math.abs(myNet) < 0.01 && transfers.length === 0

  return (
    <div className="space-y-5">
      {/* Balance card */}
      <div className="surface space-y-3 p-5 text-center">
        {settled ? (
          <>
            <p className="text-[22px] font-extrabold">All settled ✅</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {isCouple ? 'No one owes anyone. Peak romance.' : 'No one owes anyone. Group goals.'}
            </p>
          </>
        ) : two ? (
          <>
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
              {myNet > 0 ? `${partnerName} owes you` : `You owe ${partnerName}`}
            </p>
            <p className={`text-[34px] font-extrabold leading-none ${myNet > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {inr(myNet)}
            </p>
            <button
              onClick={() =>
                setSettle(
                  myNet > 0
                    ? { from: partner!.id, to: myId!, amount: Math.abs(myNet) }
                    : { from: myId!, to: partner!.id, amount: Math.abs(myNet) }
                )
              }
              className="btn-ghost mx-auto border border-brand-200 px-5 py-2 text-sm dark:border-brand-800"
            >
              Settle up
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
              {Math.abs(myNet) < 0.01 ? "You're square" : myNet > 0 ? "You're owed" : 'You owe'}
            </p>
            <p
              className={`text-[34px] font-extrabold leading-none ${
                Math.abs(myNet) < 0.01 ? '' : myNet > 0 ? 'text-emerald-600' : 'text-rose-500'
              }`}
            >
              {inr(myNet)}
            </p>
            <div className="space-y-1 pt-1 text-left">
              {members
                .filter((m) => m.id !== myId && Math.abs(nets.get(m.id) ?? 0) >= 0.01)
                .map((m) => {
                  const n = nets.get(m.id) ?? 0
                  return (
                    <p key={m.id} className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                      <Avatar profile={m} size={5} />
                      <span className="flex-1 truncate">{m.display_name?.split(' ')[0]}</span>
                      <span className={n > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-500'}>
                        {n > 0 ? 'is owed' : 'owes'} {inr(n)}
                      </span>
                    </p>
                  )
                })}
            </div>
          </>
        )}
      </div>

      {/* Simplify debts — the minimum payments that clear the group */}
      {!two && transfers.length > 0 && (
        <div className="surface space-y-2 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Settle with fewest payments</p>
          {transfers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <strong>{firstNameOf(t.from)}</strong> pays <strong>{firstNameOf(t.to)}</strong>
              </span>
              <span className="font-bold">{inr(t.amount)}</span>
              {(t.from === myId || t.to === myId) && (
                <button
                  onClick={() => setSettle({ from: t.from, to: t.to, amount: t.amount })}
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800/30 dark:text-brand-200"
                >
                  Mark paid
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={openAdd}
        className="btn-primary flex w-full items-center justify-center gap-2 py-3.5"
      >
        <Plus size={18} /> Add an expense
      </motion.button>

      {/* This-month insights */}
      {insights.count > 0 && (
        <div className="surface space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
              {new Date().toLocaleDateString(undefined, { month: 'long' })} together
            </p>
            <p className="text-lg font-extrabold">{inr(insights.total)}</p>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            You paid {inr(insights.mine)} · {two ? partnerName : 'others'} paid {inr(insights.theirs)}
          </p>
          <div className="space-y-1.5">
            {insights.cats.map(([k, v]) => {
              const meta = catMeta(k)
              const pct = insights.total ? Math.round((v / insights.total) * 100) : 0
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-center">{meta?.emoji ?? '📦'}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                      className="h-full rounded-full bg-brand-400"
                    />
                  </div>
                  <span className="w-16 text-right font-semibold">{inr(v)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Search */}
      {expenses.length > 3 && (
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses…"
            className="field py-2.5 pl-11"
          />
        </div>
      )}

      {/* Expense list */}
      {expenses.length === 0 && settlements.length === 0 ? (
        <EmptyState
          icon={<span className="text-xl">💸</span>}
          title="No expenses yet"
          hint="Dinner, tickets, that cab — add it here and settle up whenever."
        />
      ) : (
        <motion.ul variants={stagger.container} initial="initial" animate="animate" className="space-y-2.5">
          {visibleExpenses.map((ex) => {
            const payer = profileOf(ex.paid_by)
            const delta = myExpenseDelta(ex, myId)
            const ways = ex.shares?.length ?? 0
            return (
              <motion.li key={ex.id} variants={stagger.item} className="surface flex items-center gap-3 p-3.5">
                <span className="text-xl leading-none">{catMeta(ex.category)?.emoji ?? '📦'}</span>
                <Avatar profile={payer} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ex.description}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {firstNameOf(ex.paid_by)} paid {inr(ex.amount)}
                    {ways > 1 && !two ? ` · split ${ways} ways` : ''} ·{' '}
                    {new Date(ex.spent_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    {ex.receipt_url && (
                      <>
                        {' · '}
                        <a href={ex.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600" onClick={(e) => e.stopPropagation()}>
                          bill <ExternalLink size={10} />
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {Math.abs(delta) >= 0.01 && (
                  <div className="text-right">
                    <p className={`text-sm font-bold ${delta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {delta > 0 ? '+' : '−'}
                      {inr(delta)}
                    </p>
                    <p className="text-[10px] text-ink-400">{delta > 0 ? "you're owed" : 'you owe'}</p>
                  </div>
                )}
                {ex.created_by === myId && (
                  <button onClick={() => void removeExpense(ex)} aria-label="Delete" className="icon-btn h-8 w-8 text-ink-300">
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.li>
            )
          })}
          {settlements.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-1 text-xs text-ink-400">
              <span className="flex-1">
                {firstNameOf(s.from_user)} paid {firstNameOf(s.to_user) === 'You' ? 'you' : firstNameOf(s.to_user)}{' '}
                {inr(s.amount)} · settled
              </span>
              <span>{new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </li>
          ))}
        </motion.ul>
      )}

      {/* Add expense */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add an expense">
        <form onSubmit={(e) => void addExpense(e)} className="max-h-[70dvh] space-y-4 overflow-y-auto pb-1">
          <input ref={scanRef} type="file" accept="image/*" hidden onChange={(e) => void scanReceipt(e)} />
          <button
            type="button"
            onClick={() => scanRef.current?.click()}
            disabled={scanning}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-300 py-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:hover:bg-brand-800/20"
          >
            <Camera size={16} />
            {scanning ? 'Reading the bill…' : 'Scan a bill — AI fills this in'}
          </button>
          {receiptUrl && (
            <p className="text-center text-xs text-emerald-600">Receipt photo attached ✓</p>
          )}
          {items.length > 0 && (
            <div className="rounded-2xl bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800/60">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 font-semibold">{it.price ? inr(it.price) : ''}</span>
                </div>
              ))}
            </div>
          )}
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What was it? e.g. Dinner at Jai Hind"
            maxLength={200}
            className="field"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Amount ₹"
            inputMode="decimal"
            className="field"
          />
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Category</p>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full px-3 py-2 text-[13px] font-semibold transition-all active:scale-95 ${
                    category === c.key
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Paid by</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaidBy(m.id)}
                  className={`rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-all active:scale-95 ${
                    paidBy === m.id
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                  }`}
                >
                  {m.id === myId ? 'You' : m.display_name?.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Split between</p>
              <div className="flex rounded-full bg-ink-100 p-0.5 dark:bg-ink-800">
                {(['equal', 'custom'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
                      mode === k ? 'bg-white shadow-card dark:bg-ink-600' : 'text-ink-400'
                    }`}
                  >
                    {k === 'equal' ? 'Equally' : 'Unequal'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {members.map((m) => {
                const on = inSplit.has(m.id)
                const equal = mode === 'equal' && on && splitIds.length > 0 ? equalShares(amt, splitIds).get(m.id) : undefined
                return (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setInSplit((prev) => {
                          const next = new Set(prev)
                          if (next.has(m.id)) next.delete(m.id)
                          else next.add(m.id)
                          return next
                        })
                      }
                      className={`flex flex-1 items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                        on ? 'bg-brand-50 dark:bg-brand-800/25' : 'bg-ink-50 opacity-60 dark:bg-ink-800/40'
                      }`}
                    >
                      <Avatar profile={m} size={6} />
                      <span className="flex-1 truncate font-semibold">
                        {m.id === myId ? 'You' : m.display_name?.split(' ')[0]}
                      </span>
                      {mode === 'equal' && on && amt > 0 && (
                        <span className="text-xs font-bold text-brand-600">{inr(equal ?? 0)}</span>
                      )}
                    </button>
                    {mode === 'custom' && on && (
                      <input
                        value={customAmts[m.id] ?? ''}
                        onChange={(e) =>
                          setCustomAmts((prev) => ({ ...prev, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))
                        }
                        placeholder="₹"
                        inputMode="decimal"
                        className="field w-24 py-2 text-right text-sm"
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {mode === 'custom' && amt > 0 && (
              <p className={`text-right text-xs font-semibold ${Math.abs(remaining) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {Math.abs(remaining) < 0.01
                  ? 'Adds up ✓'
                  : remaining > 0
                    ? `${inr(remaining)} left to assign`
                    : `${inr(remaining)} over the total`}
              </p>
            )}
          </div>
          <button disabled={busy || !desc.trim() || !amount || !splitOk || !paidBy} className="btn-primary w-full py-3.5">
            {busy ? 'Saving…' : 'Add expense'}
          </button>
        </form>
      </BottomSheet>

      {/* Settle up */}
      <BottomSheet open={!!settle} onClose={() => setSettle(null)} title="Settle up">
        {settle && (
          <div className="space-y-4 pb-1 text-center">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Record that {firstNameOf(settle.from) === 'You' ? 'you' : firstNameOf(settle.from)} paid{' '}
              {firstNameOf(settle.to) === 'You' ? 'you' : firstNameOf(settle.to)}{' '}
              <strong className="text-ink-900 dark:text-ink-100">{inr(settle.amount)}</strong> (outside the app — UPI, cash,
              love).
            </p>
            <div className="flex gap-3">
              <button onClick={() => setSettle(null)} className="flex-1 rounded-full bg-ink-100 py-3 font-semibold dark:bg-ink-800">
                Cancel
              </button>
              <button onClick={() => void recordSettlement()} disabled={busy} className="btn-primary flex-1 py-3">
                {busy ? 'Saving…' : 'Mark settled'}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
