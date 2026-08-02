import { Expense, Settlement } from './types'

export const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Net balance from `myId`'s perspective: positive → partner owes me. */
export function computeBalance(expenses: Expense[], settlements: Settlement[], myId: string | undefined): number {
  if (!myId) return 0
  let b = 0
  for (const e of expenses) b += e.paid_by === myId ? Number(e.owed_amount) : -Number(e.owed_amount)
  for (const s of settlements) {
    if (s.to_user === myId) b -= Number(s.amount)
    else if (s.from_user === myId) b += Number(s.amount)
  }
  return Math.round(b * 100) / 100
}
