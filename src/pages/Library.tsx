import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ALL_LESSONS, parFor } from '../lessons'
import { CATEGORY_DESCRIPTIONS, CATEGORY_LABELS, CATEGORY_ORDER, type Category } from '../lessons/types'
import { useProgress } from '../progress/store'
import { isDue, isMastered, SRS_INTERVALS, todayStr } from '../progress/scheduler'
import { DifficultyDots } from '../components/TaskPanel'
import { RATING_EMOJI } from '../coach/rating'
import { KeySequence } from '../components/KeyStream'
import { parseKeys } from '../engine'

type Filter = 'all' | 'new' | 'due' | 'mastered'

export function LibraryPage() {
  const lessons = useProgress((s) => s.lessons)
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [reveal, setReveal] = useState<Set<string>>(new Set())
  const today = todayStr()

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_LESSONS.filter((l) => {
      if (cat !== 'all' && l.category !== cat) return false
      const lp = lessons[l.id]
      if (filter === 'new' && (lp?.completions ?? 0) > 0) return false
      if (filter === 'due' && !isDue(lp, today)) return false
      if (filter === 'mastered' && !isMastered(lp)) return false
      if (q && !(l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.teaches.some((t) => t.toLowerCase().includes(q)))) return false
      return true
    })
  }, [cat, filter, lessons, query, today])

  const grouped = CATEGORY_ORDER.map((c) => ({ c, items: list.filter((l) => l.category === c) })).filter((g) => g.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Library</h1>
          <p className="text-sm text-subtext">{ALL_LESSONS.length} tasks. Pick anything; your plan adapts to what you practise.</p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks or keys (e.g. ci&quot;)"
          className="w-64 rounded-lg border border-surface-1 bg-surface px-3 py-1.5 text-sm outline-none focus:border-blue/50"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>
          All topics
        </Chip>
        {CATEGORY_ORDER.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
        <span className="mx-2 h-4 w-px bg-surface-2" />
        {(['all', 'new', 'due', 'mastered'] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Any status' : f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </div>

      {grouped.length === 0 && <div className="card p-6 text-sm text-subtext">No tasks match.</div>}
      {grouped.map((g) => (
        <section key={g.c} className="card p-4">
          <div className="mb-3">
            <h2 className="font-semibold">{CATEGORY_LABELS[g.c]}</h2>
            <p className="text-sm text-subtext">{CATEGORY_DESCRIPTIONS[g.c]}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {g.items.map((l) => {
              const lp = lessons[l.id]
              const mastered = isMastered(lp)
              const due = isDue(lp, today)
              const level = lp?.srsLevel ?? 0
              const shown = reveal.has(l.id)
              return (
                <div key={l.id} className="flex flex-col gap-2 rounded-lg bg-mantle p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/practice/${l.id}`} className="font-medium hover:underline">
                        {l.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-overlay">
                        <DifficultyDots level={l.difficulty} />
                        <span className="font-mono">{l.language}</span>
                        <span>par {parFor(l)}</span>
                        {lp?.bestKeys != null && <span>best {lp.bestKeys}</span>}
                        {lp?.lastRating && <span>{RATING_EMOJI[lp.lastRating]}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {mastered ? (
                        <span className="rounded bg-green/15 px-1.5 py-0.5 text-[11px] font-medium text-green">Mastered</span>
                      ) : due ? (
                        <span className="rounded bg-blue/15 px-1.5 py-0.5 text-[11px] font-medium text-blue">Due</span>
                      ) : (lp?.completions ?? 0) === 0 ? (
                        <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[11px] text-subtext">New</span>
                      ) : (
                        <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[11px] text-subtext">Next in {lp?.dueAt ? daysUntil(lp.dueAt, today) : '?'}d</span>
                      )}
                      <SrsDots level={level} />
                    </div>
                  </div>
                  <p className="text-xs text-subtext">{l.description}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {l.teaches.slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-subtext">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {(lp?.completions ?? 0) > 0 && (
                        <button
                          className="btn btn-ghost !px-2 !py-0.5 text-xs"
                          onClick={() =>
                            setReveal((s) => {
                              const n = new Set(s)
                              if (n.has(l.id)) n.delete(l.id)
                              else n.add(l.id)
                              return n
                            })
                          }
                        >
                          {shown ? 'Hide solution' : 'Solution'}
                        </button>
                      )}
                      <Link to={`/practice/${l.id}`} className="btn !py-1 text-xs">
                        Practice
                      </Link>
                    </div>
                  </div>
                  {shown && (
                    <div className="rounded bg-surface p-2">
                      <KeySequence keys={parseKeys(l.optimal[0])} tone="good" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function daysUntil(date: string, today: string): number {
  const a = new Date(today).getTime()
  const b = new Date(date).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? 'bg-text text-base' : 'bg-surface-1 text-subtext hover:text-text'}`}
    >
      {children}
    </button>
  )
}

export function SrsDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Review level ${level}/${SRS_INTERVALS.length - 1}`}>
      {SRS_INTERVALS.slice(1).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < level ? 'bg-green' : 'bg-surface-2'}`} />
      ))}
    </span>
  )
}
