import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

// Guided "Add to Home Screen" nudge on iOS. Floats above the bottom nav as a
// dismissible card; the full instructions live permanently in Settings.
export default function InstallPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const dismissed = localStorage.getItem('lv-a2hs-dismissed') === '1'
    if (isIos && !standalone && !dismissed) setShow(true)
  }, [])

  function dismiss() {
    localStorage.setItem('lv-a2hs-dismissed', '1')
    setShow(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300, delay: 0.8 }}
          className="fixed inset-x-4 z-20 mx-auto max-w-md rounded-2xl bg-white p-4 pr-10 shadow-float ring-1 ring-brand-100 dark:bg-ink-900 dark:ring-brand-800"
          style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        >
          <button onClick={dismiss} aria-label="Dismiss" className="icon-btn absolute right-1.5 top-1.5 h-8 w-8">
            <X size={15} />
          </button>
          <p className="mb-1 text-sm font-semibold">Install HaMaara 📲</p>
          <p className="text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">
            Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to get the
            full-screen app. These steps are always in Settings too.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
