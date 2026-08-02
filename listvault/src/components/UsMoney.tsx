import { FormEvent, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Plus, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { Expense, Profile, Settlement } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { BottomSheet, EmptyState, Skeleton, stagger, useConfirm, useToast } from './ui'

const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

type Split = 'half' | 'full' | 'custom'

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
  const [busy, setBusy] = useState(false)

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

  /** Positive → partner owes me; negative → I owe partner. */
  const balance = useMemo(() => {
    if (!myId) return 0
    let b = 0
    for (const e of expenses) b += e.paid_by === myId ? e.owed_amount : -e.owed_amount
    for (const s of settlements) {
      if (s.to_user === myId) b -= s.amount
      else if (s.from_user === myId) b += s.amount
    }
    return Math.round(b * 100) / 100
  }, [expenses, settlements, myId])

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

      {/* Expense list */}
      {expenses.length === 0 && settlements.length === 0 ? (
        <EmptyState
          icon={<span className="text-xl">💸</span>}
          title="No expenses yet"
          hint="Dinner, tickets, that cab — add it here and settle up whenever."
        />
      ) : (
        <motion.ul variants={stagger.container} initial="initial" animate="animate" className="space-y-2.5">
          {expenses.map((ex) => {
            const payer = profileOf(ex.paid_by)
            const paidByMe = ex.paid_by === myId
            return (
              <motion.li key={ex.id} variants={stagger.item} className="surface flex items-center gap-3 p-3.5">
                <Avatar profile={payer} size={8} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ex.description}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {paidByMe ? 'You' : partnerName} paid {inr(ex.amount)} ·{' '}
                    {new Date(ex.spent_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
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
        <form onSubmit={(e) => void addExpense(e)} className="space-y-4 pb-1">
          <input
            autoFocus
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
