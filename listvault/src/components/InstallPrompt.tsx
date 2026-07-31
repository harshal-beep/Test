import { useEffect, useState } from 'react'

// PRD 4 (notifications) + 10: guided "Add to Home Screen" flow on first visit
// from iOS Safari — web push on iOS only works after install.
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

  if (!show) return null

  return (
    <div className="mx-4 mb-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
      <p className="mb-1 font-semibold">Install ListVault for the best experience</p>
      <p className="text-slate-600">
        Tap the <span aria-label="share icon">Share</span> button in Safari, then{' '}
        <strong>Add to Home Screen</strong>. Notifications only work after installing.
      </p>
      <button
        className="mt-2 text-xs font-medium text-brand-700 underline"
        onClick={() => {
          localStorage.setItem('lv-a2hs-dismissed', '1')
          setShow(false)
        }}
      >
        Maybe later
      </button>
    </div>
  )
}
