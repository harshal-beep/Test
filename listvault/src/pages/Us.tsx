import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Profile } from '../lib/types'
import MemoriesSection from './Memories'
import UsQuestions from '../components/UsQuestions'
import UsDiscover from '../components/UsDiscover'
import UsMoney from '../components/UsMoney'
import { Page } from '../components/ui'

type Segment = 'questions' | 'discover' | 'money' | 'memories'

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'questions', label: 'Questions' },
  { key: 'discover', label: 'Discover' },
  { key: 'money', label: 'Money' },
  { key: 'memories', label: 'Memories' }
]

/** The emotional center of the app: know each other, plan, remember. */
export default function Us() {
  const [segment, setSegment] = useState<Segment>(
    () => (sessionStorage.getItem('lv-us-segment') as Segment) || 'questions'
  )
  const [household, setHousehold] = useState<Profile[]>([])

  useEffect(() => {
    supabase
      .from('lv_profiles')
      .select('*')
      .then(({ data }) => setHousehold((data as Profile[]) ?? []))
  }, [])

  function switchTo(s: Segment) {
    setSegment(s)
    sessionStorage.setItem('lv-us-segment', s)
  }

  return (
    <Page className="space-y-4">
      <h1 className="text-[26px] font-extrabold tracking-tight">Us 💜</h1>

      {/* Segmented control */}
      <div className="flex rounded-full bg-ink-100 p-1 dark:bg-ink-800">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => switchTo(s.key)}
            className={`relative flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors ${
              segment === s.key ? 'text-ink-900 dark:text-ink-900' : 'text-ink-500 dark:text-ink-400'
            }`}
          >
            {segment === s.key && (
              <motion.span
                layoutId="us-segment"
                transition={{ type: 'spring', damping: 28, stiffness: 400 }}
                className="absolute inset-0 rounded-full bg-white shadow-card dark:bg-ink-100"
              />
            )}
            <span className="relative z-10">{s.label}</span>
          </button>
        ))}
      </div>

      {segment === 'questions' && <UsQuestions household={household} />}
      {segment === 'discover' && <UsDiscover household={household} />}
      {segment === 'money' && <UsMoney household={household} />}
      {segment === 'memories' && <MemoriesSection />}
    </Page>
  )
}
