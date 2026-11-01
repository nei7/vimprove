import { useEffect } from 'react'
import type { Hint } from '../coach/rules'

export function HintCard({ hint, compact }: { hint: Hint; compact?: boolean }) {
  return (
    <div className={`flex gap-3 ${compact ? '' : 'items-start'}`}>
      <span className="mt-0.5 text-lg">💡</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-yellow">{hint.title}</div>
        <div className="text-sm text-subtext">{hint.message}</div>
        {hint.better.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-subtext">
            <span>Try:</span>
            {hint.better.map((b, i) => (
              <code key={i} className="rounded border border-green/40 bg-green/10 px-1.5 py-0.5 font-mono text-[12px] text-green">
                {b}
              </code>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function HintToast({ hint, onClose, ttlMs = 6000 }: { hint: Hint | null; onClose: () => void; ttlMs?: number }) {
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(onClose, ttlMs)
    return () => clearTimeout(t)
  }, [hint, onClose, ttlMs])
  if (!hint) return null
  return (
    <div className="toast-in fixed bottom-6 right-6 z-30 w-[380px] max-w-[calc(100vw-3rem)] rounded-xl border border-yellow/30 bg-surface p-4 shadow-2xl">
      <button onClick={onClose} className="absolute right-2 top-2 text-overlay hover:text-text" aria-label="Dismiss hint">
        ×
      </button>
      <HintCard hint={hint} />
    </div>
  )
}
