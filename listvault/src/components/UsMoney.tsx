import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Camera, ExternalLink, Plus, Search, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { processPhoto } from '../lib/images'
import { computeBalance, inr } from '../lib/money'
import { EXPENSE_CATEGORIES, Expense, Profile, Settlement } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { BottomSheet, EmptyState, Skeleton, stagger, useConfirm, useToast } from './ui'

type Split = 'half' | 'full' | 'custom'

const catMeta = (key: string | null) => EXPENSE_CATEGORIES.find((c) => c.key === key)

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Could not read image'))
    r.readAsDataURL(blob)
  })

/** Splitwise for two: who paid, what's owed, one balance, settle up. */
export default function UsMoney({ household }: { household: Profile[] }) {
  const { session } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const myId = session?.user.id
  const partner = household.find((p) => p.id !== myId)
  const partnerName = partner?.display_name?.split(' ')[0] || 'Partner'

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)

  // add-expense form
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<'me' | 'partner'>('me')
  const [split, setSplit] = useState<Split>('half')
  const [customOwed, setCustomOwed] = useState('')
  const [category, setCategory] = useState<string>('food')
  const [items, setItems] = useState<{ name: string; price: number }[]>([])
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('us-money')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_expenses' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_settlements' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const [e, st] = await Promise.all([
      supabase.from('lv_expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('lv_settlements').select('*').order('created_at', { ascending: false }).limit(100)
    ])
    setExpenses(((e.data as Expense[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount), owed_amount: Number(x.owed_amount) })))
    setSettlements(((st.data as Settlement[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })))
    setLoading(false)
  }

  const balance = useMemo(() => computeBalance(expenses, settlements, myId), [expenses, settlements, myId])

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

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    if (!myId || !partner) return
    const amt = parseFloat(amount)
    if (!desc.trim() || !isFinite(amt) || amt <= 0) return
    const owed =
      split === 'half' ? Math.round((amt / 2) * 100) / 100 : split === 'full' ? amt : Math.min(amt, parseFloat(customOwed) || 0)
    if (split === 'custom' && !(owed > 0)) {
      toast('Enter what the other person owes')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('lv_expenses').insert({
      description: desc.trim().slice(0, 200),
      amount: amt,
      paid_by: paidBy === 'me' ? myId : partner.id,
      owed_amount: owed,
      category,
      receipt_url: receiptUrl,
      items: items.length ? items : null,
      created_by: myId
    })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setAddOpen(false)
      setDesc('')
      setAmount('')
      setCustomOwed('')
      setSplit('half')
      setPaidBy('me')
      setCategory('food')
      setItems([])
      setReceiptUrl(null)
      toast('Expense added 💸')
    }
  }

  async function settleUp() {
    if (!myId || !partner || balance === 0) return
    const debtor = balance > 0 ? partner.id : myId
    const creditor = balance > 0 ? myId : partner.id
    setBusy(true)
    const { error } = await supabase.from('lv_settlements').insert({
      from_user: debtor,
      to_user: creditor,
      amount: Math.abs(balance),
      created_by: myId
    })
    setBusy(false)
    if (error) toast(error.message)
    else {
      setSettleOpen(false)
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#aba3f0', '#a8e6c9', '#ffe0a3'] })
      toast('All settled ✅')
    }
  }

  async function removeExpense(ex: Expense) {
    if (!(await confirm(`Delete "${ex.description}"?`, { confirmLabel: 'Delete', danger: true }))) return
    await supabase.from('lv_expenses').delete().eq('id', ex.id)
  }

  const profileOf = (id: string) => household.find((p) => p.id === id)

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )

  return (
    <div className="space-y-5">
      {/* Balance card */}
      <div className="surface space-y-3 p-5 text-center">
        {balance === 0 ? (
          <>
            <p className="text-[22px] font-extrabold">All settled ✅</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">No one owes anyone. Peak romance.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
              {balance > 0 ? `${partnerName} owes you` : `You owe ${partnerName}`}
            </p>
            <p className={`text-[34px] font-extrabold leading-none ${balance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {inr(balance)}
            </p>
            <button onClick={() => setSettleOpen(true)} className="btn-ghost mx-auto border border-brand-200 px-5 py-2 text-sm dark:border-brand-800">
              Settle up
            </button>
          </>
        )}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setAddOpen(true)}
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
            You paid {inr(insights.mine)} · {partnerName} paid {inr(insights.theirs)}
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
            const paidByMe = ex.paid_by === myId
            return (
              <motion.li key={ex.id} variants={stagger.item} className="surface flex items-center gap-3 p-3.5">
                <span className="text-xl leading-none">{catMeta(ex.category)?.emoji ?? '📦'}</span>
                <Avatar profile={payer} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ex.description}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {paidByMe ? 'You' : partnerName} paid {inr(ex.amount)} ·{' '}
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
                <div className="text-right">
                  <p className={`text-sm font-bold ${paidByMe ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {paidByMe ? '+' : '−'}
                    {inr(ex.owed_amount)}
                  </p>
                  <p className="text-[10px] text-ink-400">{paidByMe ? `${partnerName} owes` : 'you owe'}</p>
                </div>
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
                {s.from_user === myId ? 'You' : partnerName} paid {s.to_user === myId ? 'you' : partnerName} {inr(s.amount)} · settled
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
            <div className="flex gap-2">
              {(
                [
                  { key: 'me', label: 'You' },
                  { key: 'partner', label: partnerName }
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPaidBy(o.key)}
                  className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold transition-all active:scale-95 ${
                    paidBy === o.key
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Split</p>
            <div className="flex gap-2">
              {(
                [
                  { key: 'half', label: '50 / 50' },
                  { key: 'full', label: `${paidBy === 'me' ? partnerName : 'You'} owe${paidBy === 'me' ? 's' : ''} all` },
                  { key: 'custom', label: 'Custom' }
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSplit(o.key)}
                  className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold transition-all active:scale-95 ${
                    split === o.key
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {split === 'custom' && (
              <input
                value={customOwed}
                onChange={(e) => setCustomOwed(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder={`${paidBy === 'me' ? partnerName : 'You'} owe${paidBy === 'me' ? 's' : ''} ₹…`}
                inputMode="decimal"
                className="field"
              />
            )}
          </div>
          <button disabled={busy || !desc.trim() || !amount} className="btn-primary w-full py-3.5">
            {busy ? 'Saving…' : 'Add expense'}
          </button>
        </form>
      </BottomSheet>

      {/* Settle up */}
      <BottomSheet open={settleOpen} onClose={() => setSettleOpen(false)} title="Settle up">
        <div className="space-y-4 pb-1 text-center">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Record that {balance > 0 ? partnerName : 'you'} paid {balance > 0 ? 'you' : partnerName}{' '}
            <strong className="text-ink-900 dark:text-ink-100">{inr(balance)}</strong> (outside the app — UPI, cash, love).
          </p>
          <div className="flex gap-3">
            <button onClick={() => setSettleOpen(false)} className="flex-1 rounded-full bg-ink-100 py-3 font-semibold dark:bg-ink-800">
              Cancel
            </button>
            <button onClick={() => void settleUp()} disabled={busy} className="btn-primary flex-1 py-3">
              {busy ? 'Saving…' : 'Mark settled'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
