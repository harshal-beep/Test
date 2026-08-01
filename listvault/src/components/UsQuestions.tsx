import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Hourglass, MessageCircleQuestion, Sparkles, Trash2 } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { Profile, Question, QuestionAnswer, QuestionMood, QuestionRound } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { BottomSheet, EmptyState, Skeleton, stagger, useConfirm, useToast } from './ui'

const MOOD_META: Record<QuestionMood, { label: string; emoji: string; tint: string }> = {
  fun: { label: 'Fun', emoji: '😄', tint: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  memories: { label: 'Memories', emoji: '📸', tint: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  preferences: { label: 'Tastes', emoji: '🍜', tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  deeper: { label: 'Deeper', emoji: '🌙', tint: 'bg-brand-100 text-brand-800 dark:bg-brand-800/40 dark:text-brand-200' }
}

const MAX_OPEN = 3

export default function UsQuestions({ household }: { household: Profile[] }) {
  const { session } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const myId = session?.user.id
  const [questions, setQuestions] = useState<Question[]>([])
  const [rounds, setRounds] = useState<QuestionRound[]>([])
  const [answers, setAnswers] = useState<QuestionAnswer[]>([])
  const [progress, setProgress] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [answering, setAnswering] = useState<QuestionRound | null>(null)
  const [draft, setDraft] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('us-questions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_question_rounds' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lv_question_answers' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [])

  async function load() {
    const [q, r, a, p] = await Promise.all([
      supabase.from('lv_questions').select('*'),
      supabase.from('lv_question_rounds').select('*, question:lv_questions(*)').order('opened_at', { ascending: false }),
      supabase.from('lv_question_answers').select('*'),
      supabase.rpc('lv_round_progress')
    ])
    setQuestions((q.data as Question[]) ?? [])
    setRounds((r.data as QuestionRound[]) ?? [])
    setAnswers((a.data as QuestionAnswer[]) ?? [])
    setProgress(
      new Map(((p.data as { round_id: string; answered_by: string[] }[]) ?? []).map((row) => [row.round_id, row.answered_by]))
    )
    setLoading(false)
  }

  const open = rounds.filter((r) => !r.revealed_at)
  const revealed = rounds.filter((r) => r.revealed_at)
  const unused = useMemo(() => {
    const used = new Set(rounds.map((r) => r.question_id))
    return questions.filter((q) => !used.has(q.id))
  }, [questions, rounds])

  async function draw() {
    if (!myId) return
    if (open.length >= MAX_OPEN) {
      toast(`Answer the ${MAX_OPEN} open cards first 😉`)
      return
    }
    if (unused.length === 0) {
      toast('Deck is empty — asking AI for more…')
      await supabase.functions.invoke('lv-us', { body: { action: 'more_questions' } })
      await load()
      return
    }
    const pick = unused[Math.floor(Math.random() * unused.length)]
    const { error } = await supabase.from('lv_question_rounds').insert({ question_id: pick.id, opened_by: myId })
    if (error) toast(error.message)
    // top up quietly when the deck runs low
    if (unused.length <= 5) void supabase.functions.invoke('lv-us', { body: { action: 'more_questions' } })
  }

  async function submitAnswer() {
    if (!myId || !answering) return
    const hasOptions = !!answering.question?.options?.length
    const body = draft.trim() ? draft.trim().slice(0, 2000) : null
    if (hasOptions ? !choice : !body) return
    setBusy(true)
    const { error } = await supabase
      .from('lv_question_answers')
      .insert({ round_id: answering.id, user_id: myId, body, choice: hasOptions ? choice : null })
    setBusy(false)
    if (error) {
      toast(error.message)
      return
    }
    const partnerAnswered = (progress.get(answering.id) ?? []).some((u) => u !== myId)
    setAnswering(null)
    setDraft('')
    setChoice(null)
    if (partnerAnswered) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 }, colors: ['#948ce9', '#ffe0a3', '#f6b6cc'] })
      toast('Revealed! See what you both said 💜')
    } else {
      toast('Saved — hidden until both of you answer 🤫')
    }
    await load()
  }

  async function discard(round: QuestionRound) {
    if (!(await confirm('Put this card back?', { body: 'Any answer already written on it is discarded.', confirmLabel: 'Put back' }))) return
    await supabase.from('lv_question_rounds').delete().eq('id', round.id)
  }

  function answersOf(roundId: string) {
    return answers.filter((a) => a.round_id === roundId)
  }

  const profileOf = (id: string | null) => household.find((p) => p.id === id)
  const partner = household.find((p) => p.id !== myId)

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    )

  return (
    <div className="space-y-5">
      {/* Draw */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => void draw()}
        className="relative w-full overflow-hidden rounded-[24px] bg-gradient-to-br from-brand-200 via-brand-400 to-brand-500 p-5 text-left text-ink-900 shadow-float shadow-brand-600/25"
      >
        <div className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10" />
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
          <Sparkles size={13} /> Question deck
        </p>
        <p className="mt-1 text-[19px] font-bold leading-snug">Draw a card for us</p>
        <p className="mt-0.5 text-sm opacity-80">
          You each answer blind — it unlocks when you've both answered. {revealed.length > 0 && `${revealed.length} answered together so far.`}
        </p>
      </motion.button>

      {/* Open cards */}
      {open.map((r) => {
        const q = r.question
        const answeredBy = progress.get(r.id) ?? []
        const iAnswered = !!myId && answeredBy.includes(myId)
        const partnerAnswered = answeredBy.some((u) => u !== myId)
        const mood = q ? MOOD_META[q.mood] : MOOD_META.fun
        return (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${mood.tint}`}>
                {mood.emoji} {mood.label}
              </span>
              {r.opened_by === myId && (
                <button onClick={() => void discard(r)} aria-label="Put back" className="icon-btn -mr-1 -mt-1 h-8 w-8">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <p className="text-[17px] font-bold leading-snug">{q?.text}</p>
            {iAnswered ? (
              <p className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
                <Hourglass size={15} className="text-brand-500" />
                Waiting for {partner?.display_name?.split(' ')[0] || 'your partner'} 👀
              </p>
            ) : (
              <div className="space-y-2">
                {partnerAnswered && (
                  <p className="text-sm font-semibold text-brand-600">
                    {partner?.display_name?.split(' ')[0] || 'They'} answered — your turn!
                  </p>
                )}
                <button onClick={() => setAnswering(r)} className="btn-primary w-full py-3 text-sm">
                  Write my answer
                </button>
              </div>
            )}
          </motion.div>
        )
      })}

      {/* Revealed history */}
      {revealed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Answered together · {revealed.length}
          </h2>
          <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-3">
            {revealed.map((r) => {
              const q = r.question
              const mood = q ? MOOD_META[q.mood] : MOOD_META.fun
              return (
                <motion.div key={r.id} variants={stagger.item} className="surface space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${mood.tint}`}>
                      {mood.emoji} {mood.label}
                    </span>
                    <span className="text-xs text-ink-400">
                      {r.revealed_at && new Date(r.revealed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="font-bold leading-snug">{q?.text}</p>
                  {(() => {
                    const rows = answersOf(r.id)
                    const matched =
                      rows.length === 2 && rows[0].choice !== null && rows[0].choice === rows[1].choice
                    return (
                      <div className="space-y-2.5">
                        {matched && (
                          <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                            You both picked the same — it's a match! 🎉
                          </p>
                        )}
                        {rows.map((a) => {
                          const who = profileOf(a.user_id)
                          return (
                            <div key={a.user_id} className="flex items-start gap-2.5">
                              <span className="mt-0.5 shrink-0">
                                <Avatar profile={who} size={6} />
                              </span>
                              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-ink-50 px-3 py-2 dark:bg-ink-800/60">
                                <p className="text-xs font-semibold text-ink-400">
                                  {a.user_id === myId ? 'You' : who?.display_name?.split(' ')[0] || 'Partner'}
                                </p>
                                {a.choice && (
                                  <span className="mt-1 inline-block rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-800/40 dark:text-brand-200">
                                    {a.choice}
                                  </span>
                                )}
                                {a.body && <p className="mt-1 text-sm leading-relaxed">{a.body}</p>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      )}

      {open.length === 0 && revealed.length === 0 && (
        <EmptyState
          icon={<MessageCircleQuestion size={24} />}
          title="No questions yet"
          hint="Draw a card — you both answer without seeing each other's answer, then it reveals."
        />
      )}

      {/* Answer sheet */}
      <BottomSheet
        open={answering !== null}
        onClose={() => {
          setAnswering(null)
          setDraft('')
          setChoice(null)
        }}
        title="Your answer"
      >
        {answering && (
          <div className="space-y-4 pb-1">
            <p className="font-bold leading-snug">{answering.question?.text}</p>
            {answering.question?.options?.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {answering.question.options.map((opt) => (
                    <motion.button
                      key={opt}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setChoice((c) => (c === opt ? null : opt))}
                      className={`rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
                        choice === opt
                          ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                          : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                      }`}
                    >
                      {opt}
                    </motion.button>
                  ))}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add a line about it (optional)"
                  rows={2}
                  maxLength={2000}
                  className="field resize-none"
                />
              </>
            ) : (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Honest answers only 😌"
                rows={4}
                maxLength={2000}
                className="field resize-none"
              />
            )}
            <p className="text-xs text-ink-400">
              Hidden from {partner?.display_name?.split(' ')[0] || 'your partner'} until they answer too.
            </p>
            <AnimatePresence>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => void submitAnswer()}
                disabled={busy || (answering.question?.options?.length ? !choice : !draft.trim())}
                className="btn-primary w-full py-3.5"
              >
                {busy ? 'Saving…' : 'Lock in my answer'}
              </motion.button>
            </AnimatePresence>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
