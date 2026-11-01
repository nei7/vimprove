import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CHEAT_GROUPS, CHEATSHEET } from '../lessons/cheatsheet'
import { ALL_LESSONS } from '../lessons'
import { useProgress } from '../progress/store'
import { isMastered } from '../progress/scheduler'

export function CheatsheetPage() {
  const lessons = useProgress((s) => s.lessons)
  const [q, setQ] = useState('')
  const [onlyUnlearned, setOnlyUnlearned] = useState(false)

  const status = useMemo(() => {
    const map = new Map<string, { learned: boolean; mastered: boolean; lessonId: string | null }>()
    for (const c of CHEATSHEET) {
      const ids = new Set([c.id, ...(c.aliases ?? [])])
      const teaching = ALL_LESSONS.filter((l) => l.teaches.some((t) => ids.has(t)))
      const learned = teaching.some((l) => (lessons[l.id]?.completions ?? 0) > 0)
      const mastered = teaching.length > 0 && teaching.some((l) => isMastered(lessons[l.id]))
      const next = teaching.find((l) => (lessons[l.id]?.completions ?? 0) === 0) ?? teaching[0] ?? null
      map.set(c.id, { learned, mastered, lessonId: next?.id ?? null })
    }
    return map
  }, [lessons])

  const query = q.trim().toLowerCase()
  const visible = CHEATSHEET.filter((c) => {
    if (onlyUnlearned && status.get(c.id)?.learned) return false
    if (!query) return true
    return (
      c.keys.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query)
    )
  })
  const learnedCount = [...status.values()].filter((s) => s.learned).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Cheat sheet</h1>
          <p className="text-sm text-subtext">
            {learnedCount}/{CHEATSHEET.length} commands practised. Green = mastered, blue = practised, grey = not yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-subtext">
            <input type="checkbox" checked={onlyUnlearned} onChange={(e) => setOnlyUnlearned(e.target.checked)} />
            Only unpractised
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search keys or names"
            className="w-56 rounded-lg border border-surface-1 bg-surface px-3 py-1.5 text-sm outline-none focus:border-blue/50"
          />
        </div>
      </div>
      {CHEAT_GROUPS.map((g) => {
        const items = visible.filter((c) => c.group === g)
        if (items.length === 0) return null
        return (
          <section key={g} className="card p-4">
            <h2 className="mb-3 font-semibold">{g}</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => {
                const s = status.get(c.id)!
                const dot = s.mastered ? 'bg-green' : s.learned ? 'bg-blue' : 'bg-surface-2'
                return (
                  <div key={c.id} className="flex gap-3 rounded-lg bg-mantle p-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} title={s.mastered ? 'Mastered' : s.learned ? 'Practised' : 'Not practised yet'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <code className="font-mono text-sm font-semibold text-yellow">{c.keys}</code>
                        {s.lessonId && (
                          <Link to={`/practice/${s.lessonId}`} className="shrink-0 text-xs text-blue hover:underline">
                            practise →
                          </Link>
                        )}
                      </div>
                      <div className="text-sm">{c.name}</div>
                      <div className="text-xs text-subtext">{c.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
