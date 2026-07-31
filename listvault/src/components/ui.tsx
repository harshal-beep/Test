/**
 * Shared UI primitives: bottom sheet, toasts, confirm sheet, animated
 * checkbox, page transition, skeletons, empty state. All micro-animations
 * live here so screens stay declarative.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'

/* ---------------------------------- Page ---------------------------------- */

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const stagger = {
  container: {
    animate: { transition: { staggerChildren: 0.045 } }
  },
  item: {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } }
  }
} as const

/* ------------------------------- BottomSheet ------------------------------- */

export function BottomSheet({
  open,
  onClose,
  title,
  children
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 360 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float dark:bg-ink-900"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-200 dark:bg-ink-700" />
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{title}</h2>
                <button onClick={onClose} className="icon-btn" aria-label="Close">
                  <X size={20} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* --------------------------------- Toasts --------------------------------- */

interface ToastItem {
  id: number
  message: string
}

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const push = useCallback((message: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 24, stiffness: 380 }}
              className="max-w-[86vw] truncate rounded-full bg-ink-900/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-float backdrop-blur-sm dark:bg-white/95 dark:text-ink-900"
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/* ------------------------------ Confirm sheet ------------------------------ */

interface ConfirmState {
  title: string
  body?: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

const ConfirmContext = createContext<
  (title: string, opts?: { body?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>
>(() => Promise.resolve(false))

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback(
    (title: string, opts?: { body?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setState({
          title,
          body: opts?.body,
          confirmLabel: opts?.confirmLabel ?? 'Confirm',
          danger: opts?.danger ?? false,
          resolve
        })
      }),
    []
  )

  function close(ok: boolean) {
    state?.resolve(ok)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <BottomSheet open={state !== null} onClose={() => close(false)}>
        {state && (
          <div className="space-y-4 pb-1">
            <div>
              <h2 className="text-lg font-bold">{state.title}</h2>
              {state.body && <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{state.body}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => close(false)}
                className="flex-1 rounded-full bg-ink-100 py-3 font-semibold transition-colors hover:bg-ink-200 active:scale-[0.98] dark:bg-ink-800 dark:hover:bg-ink-700"
              >
                Cancel
              </button>
              <button
                onClick={() => close(true)}
                className={`flex-1 rounded-full py-3 font-semibold text-white transition-all active:scale-[0.98] ${
                  state.danger ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-brand-600 shadow-lg shadow-brand-600/30'
                }`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

/* ----------------------------- Animated checkbox ---------------------------- */

export function AnimatedCheck({
  checked,
  onToggle,
  disabled = false
}: {
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.8 }}
      disabled={disabled}
      onClick={onToggle}
      aria-label={checked ? 'Uncheck' : 'Check'}
      className={`relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
        checked ? 'border-brand-600 bg-brand-600' : 'border-ink-300 dark:border-ink-600'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <AnimatePresence>
        {checked && (
          <motion.span
            key="burst"
            initial={{ scale: 0.4, opacity: 0.7 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand-500"
          />
        )}
        {checked && (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 500 }}
          >
            <Check size={15} strokeWidth={3.5} className="text-white" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/* --------------------------------- Loaders --------------------------------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-ink-200 py-12 text-center dark:border-ink-700"
    >
      <motion.span
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-800/30"
      >
        {icon}
      </motion.span>
      <div className="px-8">
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{hint}</p>}
      </div>
    </motion.div>
  )
}
