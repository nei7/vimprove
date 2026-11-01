import type { Rating } from '../lessons/types'

export interface LessonProgress {
  attempts: number
  completions: number
  bestKeys: number | null
  bestTimeMs: number | null
  lastKeys: number | null
  lastRating: Rating | null
  /** ISO timestamp */
  lastPlayedAt: string | null
  /** Spaced-repetition level 0..6 */
  srsLevel: number
  /** Local date YYYY-MM-DD when the lesson is next due, or null if never completed */
  dueAt: string | null
  solutionShown: boolean
}

export interface DayRecord {
  date: string
  /** Lesson ids completed that day (duplicates allowed) */
  completed: string[]
  keys: number
  par: number
  timeMs: number
  habits: Record<string, number>
  perfect: number
  good: number
}

export interface Settings {
  dailyGoal: number
  relativeNumber: boolean
  /** Show coaching toasts while editing (hints are always available in the result screen). */
  liveHints: boolean
  /** Show a diff between start and target text in the task panel. */
  showTargetDiff: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  dailyGoal: 6,
  relativeNumber: false,
  liveHints: true,
  showTargetDiff: true,
}

export interface ProgressData {
  schemaVersion: number
  createdAt: string
  lessons: Record<string, LessonProgress>
  days: Record<string, DayRecord>
  /** Lifetime habit counters per coach rule */
  habits: Record<string, number>
  settings: Settings
}

export interface AttemptResult {
  lessonId: string
  keys: number
  par: number
  timeMs: number
  rating: Rating
  usedSolution: boolean
  habits: Record<string, number>
  /** Local date YYYY-MM-DD */
  date: string
}

export const SCHEMA_VERSION = 1

export function emptyProgress(now = new Date()): ProgressData {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    lessons: {},
    days: {},
    habits: {},
    settings: { ...DEFAULT_SETTINGS },
  }
}

export function emptyLessonProgress(): LessonProgress {
  return {
    attempts: 0,
    completions: 0,
    bestKeys: null,
    bestTimeMs: null,
    lastKeys: null,
    lastRating: null,
    lastPlayedAt: null,
    srsLevel: 0,
    dueAt: null,
    solutionShown: false,
  }
}
