import { CATEGORY_ORDER, type Lesson } from '../lessons/types'
import { RULE_BY_ID } from '../coach/rules'
import { emptyLessonProgress, type AttemptResult, type DayRecord, type LessonProgress, type ProgressData } from './types'

/** Days until the next review for each SRS level. */
export const SRS_INTERVALS = [0, 1, 3, 7, 14, 30, 60]
export const MASTERY_LEVEL = 4

export function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date)
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

export function daysBetween(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Update a lesson's progress after an attempt (SM-2 lite). */
export function applyAttempt(prev: LessonProgress | undefined, r: AttemptResult): LessonProgress {
  const lp = { ...(prev ?? emptyLessonProgress()) }
  lp.attempts += 1
  lp.completions += 1
  lp.lastKeys = r.keys
  lp.lastRating = r.rating
  lp.lastPlayedAt = new Date().toISOString()
  if (lp.bestKeys === null || r.keys < lp.bestKeys) lp.bestKeys = r.keys
  if (lp.bestTimeMs === null || r.timeMs < lp.bestTimeMs) lp.bestTimeMs = r.timeMs
  if (r.usedSolution) {
    lp.solutionShown = true
    lp.srsLevel = 0
  } else if (r.rating === 'perfect') {
    lp.srsLevel = Math.min(SRS_INTERVALS.length - 1, lp.srsLevel + 1)
  } else if (r.rating === 'good') {
    lp.srsLevel = Math.max(1, lp.srsLevel)
  } else {
    lp.srsLevel = 0
  }
  const interval = Math.max(1, SRS_INTERVALS[lp.srsLevel])
  lp.dueAt = addDays(r.date, interval)
  return lp
}

export function isDue(lp: LessonProgress | undefined, today: string): boolean {
  if (!lp || lp.completions === 0 || !lp.dueAt) return false
  return lp.dueAt <= today
}

export function isMastered(lp: LessonProgress | undefined): boolean {
  return !!lp && lp.srsLevel >= MASTERY_LEVEL
}

export function completedToday(data: ProgressData, today: string, lessonId: string): boolean {
  return !!data.days[today]?.completed.includes(lessonId)
}

export interface PlanItem {
  lessonId: string
  reason: 'review' | 'new' | 'weak-spot' | 'bonus'
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr]
  let s = hashString(seed) || 1
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Habit counts over the last `days` days, most frequent first. */
export function weakSpots(data: ProgressData, today: string, days = 7): { ruleId: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const rec = data.days[addDays(today, -i)]
    if (!rec) continue
    for (const [id, n] of Object.entries(rec.habits)) counts[id] = (counts[id] ?? 0) + n
  }
  return Object.entries(counts)
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
}

/** Lessons sorted in the recommended learning order. */
export function learningOrder(lessons: Lesson[]): Lesson[] {
  const catIndex = new Map(CATEGORY_ORDER.map((c, i) => [c, i]))
  return [...lessons].sort((a, b) => {
    const ca = catIndex.get(a.category) ?? 99
    const cb = catIndex.get(b.category) ?? 99
    if (ca !== cb) return ca - cb
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty
    return 0
  })
}

/**
 * Build today's plan: due reviews first, then new lessons in learning order,
 * then one drill for the most frequent recent habit. Deterministic for a given date.
 */
export function buildDailyPlan(lessons: Lesson[], data: ProgressData, today: string): PlanItem[] {
  const goal = Math.max(1, data.settings.dailyGoal)
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const plan: PlanItem[] = []
  const used = new Set<string>()
  const doneToday = new Set(data.days[today]?.completed ?? [])

  // 1. reviews
  const due = lessons
    .filter((l) => isDue(data.lessons[l.id], today) && !doneToday.has(l.id))
    .sort((a, b) => {
      const da = data.lessons[a.id]!.dueAt!
      const db = data.lessons[b.id]!.dueAt!
      return da.localeCompare(db) || a.id.localeCompare(b.id)
    })
  const reviewCap = Math.max(1, goal - 1)
  for (const l of due.slice(0, reviewCap)) {
    plan.push({ lessonId: l.id, reason: 'review' })
    used.add(l.id)
  }

  // 2. new lessons in learning order, prerequisites first
  const completed = (id: string) => (data.lessons[id]?.completions ?? 0) > 0
  const ordered = learningOrder(lessons)
  const newCandidates = ordered.filter(
    (l) => !completed(l.id) && !used.has(l.id) && (l.prerequisites ?? []).every((p) => completed(p) || !byId.has(p)),
  )
  const roomForNew = Math.max(plan.length < goal ? 1 : 0, goal - plan.length - 1)
  for (const l of newCandidates.slice(0, roomForNew)) {
    plan.push({ lessonId: l.id, reason: 'new' })
    used.add(l.id)
  }

  // 3. weak-spot drill
  const weak = weakSpots(data, today).filter((w) => w.count >= 2)
  for (const w of weak) {
    if (!RULE_BY_ID.has(w.ruleId)) continue
    const teaches = RULE_TEACHES[w.ruleId] ?? []
    const candidates = lessons.filter((l) => !used.has(l.id) && l.teaches.some((t) => teaches.includes(t)))
    if (candidates.length === 0) continue
    const pick = seededShuffle(candidates, today + w.ruleId)[0]
    plan.push({ lessonId: pick.id, reason: 'weak-spot' })
    used.add(pick.id)
    break
  }

  // 4. fill up with more new lessons, then reviews beyond the cap, then bonus practice
  for (const l of newCandidates) {
    if (plan.length >= goal) break
    if (used.has(l.id)) continue
    plan.push({ lessonId: l.id, reason: 'new' })
    used.add(l.id)
  }
  for (const l of due) {
    if (plan.length >= goal) break
    if (used.has(l.id)) continue
    plan.push({ lessonId: l.id, reason: 'review' })
    used.add(l.id)
  }
  if (plan.length < goal) {
    const rest = seededShuffle(
      lessons.filter((l) => !used.has(l.id) && !doneToday.has(l.id)),
      today,
    )
    for (const l of rest) {
      if (plan.length >= goal) break
      plan.push({ lessonId: l.id, reason: 'bonus' })
      used.add(l.id)
    }
  }
  return plan
}

/** Mapping from coach rule to the cheat-sheet ids a drill should practise. */
export const RULE_TEACHES: Record<string, string[]> = {
  'repeated-hl': ['w', 'f', 't', '$', 'e', 'b'],
  'repeated-jk': ['count', '}', '/', 'G', ':N'],
  'arrow-keys': ['hjkl', 'w', 'f'],
  'repeated-x': ['dw', 'diw', 'dt', 'D', 'daw'],
  'd-dollar': ['D', 'C'],
  'zero-i': ['I', 'A'],
  'delete-then-insert': ['cw', 'ciw', 'cc', 's', 'C'],
  'insert-backspace': ['ciw', 'ci"', '<C-w>', 'ct'],
  'empty-insert': ['A', 'I', 'o'],
  'visual-simple': ['dw', 'diw', 'yiw', 'cw', 'dd'],
  'repeat-manually': ['dot'],
  'search-word-under-cursor': ['*'],
  'b-then-cw': ['ciw', 'diw', 'yiw'],
  'repeated-shift': ['>>', '>j'],
  'esc-spam': [],
  'j-then-0': ['+', '-'],
}

export function computeStreak(days: Record<string, DayRecord>, today: string): number {
  let streak = 0
  let d = today
  // today may still be in progress: allow the streak to start yesterday
  if (!days[d] || days[d].completed.length === 0) d = addDays(d, -1)
  while (days[d] && days[d].completed.length > 0) {
    streak++
    d = addDays(d, -1)
  }
  return streak
}
