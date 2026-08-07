import UsMoney from '../components/UsMoney'
import { Page } from '../components/ui'

/** Standalone Money page — the shared ledger of the current space, one tap
 * from the Home balance card and the navigation. */
export default function Money() {
  return (
    <Page className="space-y-4">
      <h1 className="text-[26px] font-extrabold tracking-tight">Money 💸</h1>
      <UsMoney />
    </Page>
  )
}
