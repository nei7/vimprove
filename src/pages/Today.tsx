import { useMemo } from 'react'
import { Link } from 'react-router'
import { ALL_LESSONS, LESSON_BY_ID, parFor } from '../lessons'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../lessons/types'
import { useProgress } from '../progress/store'
import { buildDailyPlan, isMastered, todayStr, weakSpots, RULE_TEACHES } from '../progress/scheduler'
import { RULE_BY_ID } from '../coach/rules'
import { Heatmap } from '../components/Heatmap'
import { DifficultyDots } from '../components/TaskPanel'
import { RATING_EMOJI } from '../coach/rating'

const REASON_LABEL: Record<string, { label: string; cls: string }> = {
  review: { label: 'Review', cls: 'bg-blue/15 text-blue' },
  new: { label: 'New', cls: 'bg-green/15 text-green' },
  'weak-spot': { label: 'Weak spot', cls: 'bg-yellow/15 text-yellow' },
  bonus: { label: 'Bonus', cls: 'bg-mauve/15 text-mauve' },
}

export function TodayPage() {
  const store = useProgress()
  const today = todayStr()
  const data = useMemo(
    () => ({ lessons: store.lessons, days: store.days, habits: store.habits, settings: store.settings, schemaVersion: store.schemaVersion, createdAt: store.createdAt }),
    [store.lessons, store.days, store.habits, store.settings, store.schemaVersion, store.createdAt],
  )
  const plan = useMemo(() => buildDailyPlan(ALL_LESSONS, data, today), [data, today])
  const dayRec = store.days[today]
  const doneToday = new Set(dayRec?.completed ?? [])
  const doneCount = dayRec?.completed.length ?? 0
  const goal = store.settings.dailyGoal
  const pct = Math.min(100, Math.round((doneCount / goal) * 100))
  const streak = store.streak()
  const weak = weakSpots(data, today).slice(0, 3)
  const firstOpen = plan.find((p) => !doneToday.has(p.lessonId))
  const mastery = CATEGORY_ORDER.map((c) => {
    const ls = ALL_LESSONS.filter((l) => l.category === c)
    const mastered = ls.filter((l) => isMastered(store.lessons[l.id])).length
    const started = ls.filter((l) => (store.lessons[l.id]?.completions ?? 0) > 0).length
    return { c, total: ls.length, mastered, started }
  })
  const totalMastered = mastery.reduce((a, m) => a + m.mastered, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div className="card flex flex-wrap items-center gap-6 p-5">
          <ProgressRing pct={pct} label={`${doneCount}/${goal}`} />
          <div className="flex-1">
            <h1 className="text-xl font-semibold">
              {doneCount >= goal ? 'Daily goal reached 🎉' : doneCount === 0 ? "Today's practice" : 'Keep going'}
            </h1>
            <p className="mt-1 text-sm text-subtext">
              {doneCount >= goal
                ? 'Extra tasks still count towards mastery and your streak.'
                : `${goal - doneCount} more task${goal - doneCount === 1 ? '' : 's'} to hit today's goal. Short, focused drills beat long sessions.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <Fact label="Streak" value={`🔥 ${streak} day${streak === 1 ? '' : 's'}`} />
              <Fact label="Mastered" value={`${totalMastered}/${ALL_LESSONS.length}`} />
              {dayRec && dayRec.keys > 0 && <Fact label="Efficiency today" value={`${Math.round((dayRec.par / dayRec.keys) * 100)}%`} />}
            </div>
          </div>
          {firstOpen && (
            <Link to={`/practice/${firstOpen.lessonId}`} className="btn btn-primary text-base">
              ▶ Start
            </Link>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Today's plan</h2>
            <span className="text-xs text-overlay">reviews due first · then new material · then a drill for your weak spot</span>
          </div>
          <ol className="divide-y divide-surface-1">
            {plan.map((item, i) => {
              const l = LESSON_BY_ID.get(item.lessonId)!
              const done = doneToday.has(l.id)
              const lp = store.lessons[l.id]
              const r = REASON_LABEL[item.reason]
              return (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? 'bg-green text-base' : 'bg-surface-1 text-subtext'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/practice/${l.id}`} className={`font-medium hover:underline ${done ? 'text-subtext line-through' : ''}`}>
                      {l.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-overlay">
                      <span>{CATEGORY_LABELS[l.category]}</span>
                      <DifficultyDots level={l.difficulty} />
                      <span>par {parFor(l)}</span>
                      {lp?.bestKeys !== null && lp?.bestKeys !== undefined && <span>best {lp.bestKeys}</span>}
                      {done && lp?.lastRating && <span>{RATING_EMOJI[lp.lastRating]}</span>}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${r.cls}`}>{r.label}</span>
                  <Link to={`/practice/${l.id}`} className="btn !py-1 text-xs">
                    {done ? 'Again' : 'Go'}
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Mastery by topic</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {mastery.map((m) => (
              <div key={m.c} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-subtext">{CATEGORY_LABELS[m.c]}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-1">
                  <div className="absolute inset-y-0 left-0 bg-blue/50" style={{ width: `${(m.started / m.total) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-green" style={{ width: `${(m.mastered / m.total) * 100}%` }} />
                </div>
                <span className="w-12 text-right font-mono text-xs text-overlay">
                  {m.mastered}/{m.total}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-overlay">green = mastered (3+ perfect reviews spaced out) · blue = started</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Activity</h2>
          <Heatmap days={store.days} today={today} goal={goal} />
        </div>
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Weak spots (last 7 days)</h2>
          {weak.length === 0 ? (
            <p className="text-sm text-subtext">No inefficient patterns spotted recently. Keep practising to find them.</p>
          ) : (
            <ul className="space-y-2">
              {weak.map((w) => {
                const rule = RULE_BY_ID.get(w.ruleId)
                const drill = ALL_LESSONS.find((l) => l.teaches.some((t) => (RULE_TEACHES[w.ruleId] ?? []).includes(t)))
                return (
                  <li key={w.ruleId} className="rounded-lg bg-mantle p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-yellow">{rule?.title ?? w.ruleId}</span>
                      <span className="font-mono text-xs text-overlay">×{w.count}</span>
                    </div>
                    {drill && (
                      <Link to={`/practice/${drill.id}`} className="text-xs text-blue hover:underline">
                        Drill: {drill.title} →
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="card p-5 text-sm text-subtext">
          <h2 className="mb-2 font-semibold text-text">How it works</h2>
          <ul className="list-disc space-y-1 pl-4">
            <li>Each task is a real editing situation with a known optimal keystroke sequence (par).</li>
            <li>Finish at or under par for a Perfect; Perfects push a task further into the future (1, 3, 7, 14, 30, 60 days).</li>
            <li>The coach watches for wasteful habits (hhhh, xxxx, 0i, dw+i…) and tells you the better key.</li>
            <li>Come back daily: due reviews come first, then something new.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-overlay">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}

function ProgressRing({ pct, label }: { pct: number; label: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} stroke="var(--color-surface-1)" strokeWidth="8" fill="none" />
      <circle
        cx="44"
        cy="44"
        r={r}
        stroke="var(--color-green)"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 400ms ease' }}
      />
      <text x="44" y="49" textAnchor="middle" className="fill-text font-mono text-[15px] font-bold">
        {label}
      </text>
    </svg>
  )
}
