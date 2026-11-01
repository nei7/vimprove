import type { DayRecord } from '../progress/types'
import { addDays, parseDate } from '../progress/scheduler'

const WEEKS = 16

export function Heatmap({ days, today, goal }: { days: Record<string, DayRecord>; today: string; goal: number }) {
  const todayDate = parseDate(today)
  const dow = (todayDate.getDay() + 6) % 7 // Monday = 0
  const end = addDays(today, 6 - dow)
  const start = addDays(end, -(WEEKS * 7 - 1))
  const cells: { date: string; count: number; future: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const date = addDays(start, i)
    cells.push({ date, count: days[date]?.completed.length ?? 0, future: date > today })
  }
  const level = (count: number) => {
    if (count === 0) return 'bg-surface-1'
    const r = count / Math.max(1, goal)
    if (r < 0.34) return 'bg-green/30'
    if (r < 0.67) return 'bg-green/55'
    if (r < 1) return 'bg-green/80'
    return 'bg-green'
  }
  const months: { label: string; col: number }[] = []
  for (let w = 0; w < WEEKS; w++) {
    const d = parseDate(cells[w * 7].date)
    if (d.getDate() <= 7) months.push({ label: d.toLocaleString('en', { month: 'short' }), col: w })
  }
  return (
    <div className="inline-block">
      <div className="relative mb-1 h-4 text-[10px] text-overlay">
        {months.map((m) => (
          <span key={m.col} className="absolute" style={{ left: `${m.col * 14}px` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 11px)' }}>
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${c.date}: ${c.count} task${c.count === 1 ? '' : 's'}`}
            className={`h-[11px] w-[11px] rounded-[2px] ${c.future ? 'bg-transparent' : level(c.count)} ${
              c.date === today ? 'ring-1 ring-text/60' : ''
            }`}
          />
        ))}
      </div>
    </div>
  )
}
