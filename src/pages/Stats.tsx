import { useMemo } from 'react'
import { Link } from 'react-router'
import { ALL_LESSONS, LESSON_BY_ID } from '../lessons'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../lessons/types'
import { useProgress } from '../progress/store'
import { addDays, isMastered, todayStr, RULE_TEACHES } from '../progress/scheduler'
import { RULE_BY_ID } from '../coach/rules'
import { Heatmap } from '../components/Heatmap'
import { formatMs } from '../components/ResultModal'
import { SrsDots } from './Library'

export function StatsPage() {
  const store = useProgress()
  const today = todayStr()
  const days = Object.values(store.days).sort((a, b) => a.date.localeCompare(b.date))
  const totals = useMemo(() => {
    let completed = 0
    let keys = 0
    let par = 0
    let time = 0
    let perfect = 0
    for (const d of days) {
      completed += d.completed.length
      keys += d.keys
      par += d.par
      time += d.timeMs
      perfect += d.perfect
    }
    return { completed, keys, par, time, perfect, activeDays: days.filter((d) => d.completed.length > 0).length }
  }, [days])

  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, -(13 - i))).map((d) => {
    const rec = store.days[d]
    return { date: d, count: rec?.completed.length ?? 0, eff: rec && rec.keys > 0 ? rec.par / rec.keys : null }
  })
  const maxCount = Math.max(1, ...last14.map((d) => d.count))

  const habits = Object.entries(store.habits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const perCategory = CATEGORY_ORDER.map((c) => {
    const ls = ALL_LESSONS.filter((l) => l.category === c)
    const started = ls.filter((l) => (store.lessons[l.id]?.completions ?? 0) > 0)
    const mastered = ls.filter((l) => isMastered(store.lessons[l.id]))
    let keys = 0
    let par = 0
    for (const l of started) {
      const lp = store.lessons[l.id]!
      if (lp.bestKeys !== null) {
        keys += lp.bestKeys
        par += Math.min(lp.bestKeys, 999)
      }
    }
    void par
    return { c, total: ls.length, started: started.length, mastered: mastered.length }
  })

  const recent = Object.entries(store.lessons)
    .filter(([, lp]) => lp.lastPlayedAt)
    .sort((a, b) => (b[1].lastPlayedAt ?? '').localeCompare(a[1].lastPlayedAt ?? ''))
    .slice(0, 12)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Statistics</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Tasks completed" value={String(totals.completed)} />
        <Tile label="Perfect runs" value={String(totals.perfect)} sub={totals.completed ? `${Math.round((totals.perfect / totals.completed) * 100)}%` : undefined} />
        <Tile label="Efficiency" value={totals.keys ? `${Math.round((totals.par / totals.keys) * 100)}%` : '–'} sub="par ÷ your keys" />
        <Tile label="Practice time" value={formatMs(totals.time)} />
        <Tile label="Active days" value={String(totals.activeDays)} sub={`streak ${store.streak()}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Last 14 days</h2>
          <div className="flex h-32 items-end gap-1.5">
            {last14.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.count} tasks${d.eff ? `, ${Math.round(d.eff * 100)}% efficiency` : ''}`}>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${d.count >= store.settings.dailyGoal ? 'bg-green' : 'bg-blue/60'}`}
                    style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count ? 4 : 0 }}
                  />
                </div>
                <span className="text-[10px] text-overlay">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Heatmap days={store.days} today={today} goal={store.settings.dailyGoal} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Habits the coach flagged (all time)</h2>
          {habits.length === 0 ? (
            <p className="text-sm text-subtext">Nothing yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {habits.map(([id, n]) => {
                  const rule = RULE_BY_ID.get(id)
                  const drill = ALL_LESSONS.find((l) => l.teaches.some((t) => (RULE_TEACHES[id] ?? []).includes(t)))
                  return (
                    <tr key={id} className="border-t border-surface-1">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{rule?.title ?? id}</div>
                        {drill && (
                          <Link to={`/practice/${drill.id}`} className="text-xs text-blue hover:underline">
                            drill: {drill.title}
                          </Link>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-subtext">×{n}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Progress by topic</h2>
          <div className="space-y-2">
            {perCategory.map((m) => (
              <div key={m.c} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 text-subtext">{CATEGORY_LABELS[m.c]}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-1">
                  <div className="absolute inset-y-0 left-0 bg-blue/50" style={{ width: `${(m.started / m.total) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-green" style={{ width: `${(m.mastered / m.total) * 100}%` }} />
                </div>
                <span className="w-16 text-right font-mono text-xs text-overlay">
                  {m.mastered}/{m.started}/{m.total}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-overlay">mastered / started / total</div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Recently practised</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-subtext">Nothing yet. Start with today's plan.</p>
          ) : (
            <ul className="divide-y divide-surface-1 text-sm">
              {recent.map(([id, lp]) => {
                const l = LESSON_BY_ID.get(id)
                if (!l) return null
                return (
                  <li key={id} className="flex items-center justify-between gap-3 py-2">
                    <Link to={`/practice/${id}`} className="min-w-0 truncate hover:underline">
                      {l.title}
                    </Link>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-overlay">
                      <span>best {lp.bestKeys ?? '–'}</span>
                      <span>×{lp.completions}</span>
                      <SrsDots level={lp.srsLevel} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="font-mono text-2xl font-bold">{value}</div>
      <div className="text-xs text-overlay">
        {label}
        {sub ? ` · ${sub}` : ''}
      </div>
    </div>
  )
}
