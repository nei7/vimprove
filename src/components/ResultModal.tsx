import type { Lesson, Rating } from '../lessons/types'
import type { Hint } from '../coach/rules'
import { RATING_EMOJI, RATING_LABEL } from '../coach/rating'
import { KeySequence } from './KeyStream'
import { HintCard } from './HintToast'
import { parseKeys } from '../engine'

export interface ResultModalProps {
  lesson: Lesson
  keys: string[]
  par: number
  timeMs: number
  rating: Rating
  hints: Hint[]
  usedSolution: boolean
  nextLessonId: string | null
  isNew: boolean
  onRetry: () => void
  onNext: () => void
  onReplay: (keys: string) => void
  onClose: () => void
}

export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ResultModal(p: ResultModalProps) {
  const tone = p.rating === 'perfect' ? 'text-green' : p.rating === 'good' ? 'text-blue' : 'text-subtext'
  const uniqueHints = dedupe(p.hints)
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-base/70 p-4 backdrop-blur-sm" onClick={p.onClose}>
      <div
        className="pop-in card max-h-[90vh] w-full max-w-2xl overflow-auto p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-2xl font-bold ${tone}`}>
              {RATING_EMOJI[p.rating]} {RATING_LABEL[p.rating]}
              {p.usedSolution && <span className="ml-2 text-sm font-normal text-overlay">(solution shown)</span>}
            </div>
            <div className="text-sm text-subtext">{p.lesson.title}</div>
          </div>
          <button className="btn-ghost btn" onClick={p.onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Your keys" value={String(p.keys.length)} tone={p.keys.length <= p.par ? 'text-green' : 'text-text'} />
          <Stat label="Par" value={String(p.par)} />
          <Stat label="Time" value={formatMs(p.timeMs)} />
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-overlay">You typed</div>
            <div className="rounded-lg bg-mantle p-2">
              <KeySequence keys={p.keys} tone={p.keys.length <= p.par ? 'good' : 'default'} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-overlay">
              <span>Optimal solution{p.lesson.optimal.length > 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-1.5">
              {p.lesson.optimal.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-mantle p-2">
                  <KeySequence keys={parseKeys(o)} tone="good" />
                  <div className="flex shrink-0 items-center gap-2 text-xs text-subtext">
                    <span>{parseKeys(o).length} keys</span>
                    <button className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => p.onReplay(o)}>
                      ▶ Replay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {uniqueHints.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-overlay">Habits spotted</div>
              <div className="space-y-2">
                {uniqueHints.map((h, i) => (
                  <div key={i} className="rounded-lg border border-yellow/20 bg-mantle p-3">
                    <HintCard hint={h} compact />
                  </div>
                ))}
              </div>
            </div>
          )}
          {p.lesson.hints && p.lesson.hints.length > 0 && (
            <div className="rounded-lg bg-mantle p-3 text-sm text-subtext">
              <span className="font-semibold text-text">Why it works: </span>
              {p.lesson.hints.join(' ')}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button className="btn" onClick={p.onRetry}>
            ↺ Try again
          </button>
          {p.nextLessonId && (
            <button className="btn btn-primary" onClick={p.onNext} autoFocus>
              Next task →
            </button>
          )}
          {!p.nextLessonId && (
            <button className="btn btn-primary" onClick={p.onClose} autoFocus>
              Done
            </button>
          )}
        </div>
        {p.isNew && <div className="mt-2 text-right text-xs text-overlay">Press Enter for the next task</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-mantle p-3">
      <div className={`font-mono text-2xl font-bold ${tone ?? 'text-text'}`}>{value}</div>
      <div className="text-xs text-overlay">{label}</div>
    </div>
  )
}

function dedupe(hints: Hint[]): Hint[] {
  const seen = new Set<string>()
  const out: Hint[] = []
  for (const h of hints) {
    if (seen.has(h.ruleId)) continue
    seen.add(h.ruleId)
    out.push(h)
  }
  return out
}
