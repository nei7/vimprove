import type { VimOptions } from '../engine'

export type Category =
  | 'motions'
  | 'operators'
  | 'text-objects'
  | 'search-replace'
  | 'repeat'
  | 'registers'
  | 'visual'
  | 'insert'
  | 'ex'
  | 'macros'
  | 'refactors'

export const CATEGORY_ORDER: Category[] = [
  'motions',
  'operators',
  'text-objects',
  'insert',
  'repeat',
  'search-replace',
  'visual',
  'registers',
  'ex',
  'macros',
  'refactors',
]

export const CATEGORY_LABELS: Record<Category, string> = {
  motions: 'Motions',
  operators: 'Operators',
  'text-objects': 'Text objects',
  'search-replace': 'Search & replace',
  repeat: 'Repeat & counts',
  registers: 'Registers',
  visual: 'Visual mode',
  insert: 'Insert tricks',
  ex: 'Ex commands',
  macros: 'Macros',
  refactors: 'Real-world refactors',
}

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  motions: 'Get the cursor where you want it in one or two keys.',
  operators: 'Combine d, c, y with motions to edit whole chunks at once.',
  'text-objects': 'Operate on words, quotes, brackets and blocks without moving first.',
  'search-replace': 'Jump with / and *, rewrite with :s.',
  repeat: 'Let . and counts do the boring work.',
  registers: 'Yank, delete and paste without losing anything.',
  visual: 'Select precisely, including columns, then act once.',
  insert: 'Enter insert mode exactly where you need to be.',
  ex: 'Line-oriented power: :m, :t, :g, :sort, :norm.',
  macros: 'Record once, replay everywhere.',
  refactors: 'Mixed drills on realistic code edits.',
}

export type Language =
  | 'ts'
  | 'js'
  | 'tsx'
  | 'py'
  | 'go'
  | 'rust'
  | 'json'
  | 'yaml'
  | 'md'
  | 'css'
  | 'html'
  | 'sh'
  | 'sql'
  | 'txt'

export type LessonGoal = { type: 'text'; text: string } | { type: 'cursor'; cursor: [number, number] }

export interface Lesson {
  /** Stable id, e.g. 'text-objects/change-inside-quotes' */
  id: string
  title: string
  category: Category
  difficulty: 1 | 2 | 3
  /** What to achieve and why it matters in day-to-day work. */
  description: string
  language: Language
  start: {
    text: string
    cursor: [number, number]
    /** Pre-filled registers, e.g. text the user "already yanked". */
    registers?: Record<string, { type: 'char' | 'line'; text: string }>
  }
  goal: LessonGoal
  /** Optimal key sequences in Vim notation. The first one is shown as the reference solution. */
  optimal: string[]
  /** Cheat-sheet ids this lesson teaches, e.g. ['ci"', 'text-objects'] */
  teaches: string[]
  /** Progressive hints revealed on request. */
  hints?: string[]
  options?: Partial<VimOptions>
  prerequisites?: string[]
}

export type Rating = 'perfect' | 'good' | 'ok'
