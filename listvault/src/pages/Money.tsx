import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import UsMoney from '../components/UsMoney'
import { Page } from '../components/ui'

/** Standalone Money page — the same ledger as the Us tab segment, one tap
 * from the Home balance card and the desktop sidebar. */
export default function Money() {
  const [household, setHousehold] = useState<Profile[]>([])

  useEffect(() => {
    supabase
      .from('lv_profiles')
      .select('*')
      .then(({ data }) => setHousehold((data as Profile[]) ?? []))
  }, [])

  return (
    <Page className="space-y-4">
      <h1 className="text-[26px] font-extrabold tracking-tight">Money 💸</h1>
      <UsMoney household={household} />
    </Page>
  )
}
