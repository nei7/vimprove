import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  emptyLessonProgress,
  emptyProgress,
  SCHEMA_VERSION,
  type AttemptResult,
  type DayRecord,
  type ProgressData,
  type Settings,
} from './types'
import { applyAttempt, computeStreak, todayStr } from './scheduler'

export interface ProgressStore extends ProgressData {
  recordAttempt(r: AttemptResult): void
  recordAbandon(lessonId: string): void
  markSolutionShown(lessonId: string): void
  updateSettings(patch: Partial<Settings>): void
  resetAll(): void
  importData(data: ProgressData): void
  exportData(): ProgressData
  streak(): number
  today(): DayRecord
}

function emptyDay(date: string): DayRecord {
  return { date, completed: [], keys: 0, par: 0, timeMs: 0, habits: {}, perfect: 0, good: 0 }
}

export function migrate(raw: unknown): ProgressData {
  const base = emptyProgress()
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<ProgressData>
  return {
    ...base,
    ...data,
    schemaVersion: SCHEMA_VERSION,
    lessons: data.lessons ?? {},
    days: data.days ?? {},
    habits: data.habits ?? {},
    settings: { ...base.settings, ...(data.settings ?? {}) },
  }
}

export const useProgress = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...emptyProgress(),

      recordAttempt(r) {
        set((s) => {
          const lessons = { ...s.lessons, [r.lessonId]: applyAttempt(s.lessons[r.lessonId], r) }
          const day = { ...(s.days[r.date] ?? emptyDay(r.date)) }
          day.completed = [...day.completed, r.lessonId]
          day.keys += r.keys
          day.par += r.par
          day.timeMs += r.timeMs
          if (r.rating === 'perfect') day.perfect += 1
          if (r.rating === 'good') day.good += 1
          day.habits = { ...day.habits }
          const habits = { ...s.habits }
          for (const [id, n] of Object.entries(r.habits)) {
            day.habits[id] = (day.habits[id] ?? 0) + n
            habits[id] = (habits[id] ?? 0) + n
          }
          return { lessons, days: { ...s.days, [r.date]: day }, habits }
        })
      },

      recordAbandon(lessonId) {
        set((s) => {
          const lp = { ...(s.lessons[lessonId] ?? emptyLessonProgress()) }
          lp.attempts += 1
          lp.lastPlayedAt = new Date().toISOString()
          return { lessons: { ...s.lessons, [lessonId]: lp } }
        })
      },

      markSolutionShown(lessonId) {
        set((s) => {
          const lp = { ...(s.lessons[lessonId] ?? emptyLessonProgress()), solutionShown: true }
          return { lessons: { ...s.lessons, [lessonId]: lp } }
        })
      },

      updateSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch } }))
      },

      resetAll() {
        set({ ...emptyProgress() })
      },

      importData(data) {
        const m = migrate(data)
        set({ ...m })
      },

      exportData() {
        const s = get()
        return {
          schemaVersion: s.schemaVersion,
          createdAt: s.createdAt,
          lessons: s.lessons,
          days: s.days,
          habits: s.habits,
          settings: s.settings,
        }
      },

      streak() {
        return computeStreak(get().days, todayStr())
      },

      today() {
        const t = todayStr()
        return get().days[t] ?? emptyDay(t)
      },
    }),
    {
      name: 'vimprove-progress',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        createdAt: s.createdAt,
        lessons: s.lessons,
        days: s.days,
        habits: s.habits,
        settings: s.settings,
      }),
      migrate: (persisted) => migrate(persisted) as unknown as ProgressStore,
    },
  ),
)
