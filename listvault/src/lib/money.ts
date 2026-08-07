import { Expense, Settlement } from './types'

export const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Net position per member from the shares ledger.
 * Positive → the group owes them; negative → they owe the group.
 * A settlement (from → to) is cash handed over, so it raises `from` and lowers `to`.
 */
export function computeNets(expenses: Expense[], settlements: Settlement[]): Map<string, number> {
  const nets = new Map<string, number>()
  const add = (u: string, v: number) => nets.set(u, (nets.get(u) ?? 0) + v)
  for (const e of expenses) {
    add(e.paid_by, Number(e.amount))
    for (const s of e.shares ?? []) add(s.user_id, -Number(s.amount))
  }
  for (const s of settlements) {
    add(s.from_user, Number(s.amount))
    add(s.to_user, -Number(s.amount))
  }
  for (const [k, v] of nets) nets.set(k, r2(v))
  return nets
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

/** Minimal set of payments that zeroes everyone: biggest debtor pays biggest creditor. */
export function simplifyDebts(nets: Map<string, number>): Transfer[] {
  const debtors = [...nets.entries()].filter(([, v]) => v < -0.004).map(([u, v]) => ({ u, v: -v }))
  const creditors = [...nets.entries()].filter(([, v]) => v > 0.004).map(([u, v]) => ({ u, v }))
  debtors.sort((a, b) => b.v - a.v)
  creditors.sort((a, b) => b.v - a.v)
  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = r2(Math.min(debtors[i].v, creditors[j].v))
    if (pay > 0.004) out.push({ from: debtors[i].u, to: creditors[j].u, amount: pay })
    debtors[i].v = r2(debtors[i].v - pay)
    creditors[j].v = r2(creditors[j].v - pay)
    if (debtors[i].v <= 0.004) i++
    if (creditors[j].v <= 0.004) j++
  }
  return out
}

/** Equal split that lands on the total to the paisa (first members absorb the spare paise). */
export function equalShares(amount: number, memberIds: string[]): Map<string, number> {
  const n = memberIds.length
  const out = new Map<string, number>()
  if (n === 0) return out
  const totalPaise = Math.round(amount * 100)
  const base = Math.floor(totalPaise / n)
  let spare = totalPaise - base * n
  for (const id of memberIds) {
    out.set(id, (base + (spare > 0 ? 1 : 0)) / 100)
    if (spare > 0) spare--
  }
  return out
}

/** My delta on one expense: + I'm owed for it, − I owe on it. */
export function myExpenseDelta(e: Expense, myId: string | undefined): number {
  if (!myId) return 0
  const myShare = Number(e.shares?.find((s) => s.user_id === myId)?.amount ?? 0)
  return r2(e.paid_by === myId ? Number(e.amount) - myShare : -myShare)
}
