import { Vim, parseKeys, type Pos } from '../engine'
import type { Lesson } from './types'
import { motionLessons } from './content/motions'
import { operatorLessons } from './content/operators'
import { textObjectLessons } from './content/text-objects'
import { insertLessons } from './content/insert'
import { repeatLessons } from './content/repeat'
import { searchReplaceLessons } from './content/search-replace'
import { visualLessons } from './content/visual'
import { registerLessons } from './content/registers'
import { exLessons } from './content/ex'
import { macroLessons } from './content/macros'
import { refactorLessons } from './content/refactors'

export const ALL_LESSONS: Lesson[] = [
  ...motionLessons,
  ...operatorLessons,
  ...textObjectLessons,
  ...insertLessons,
  ...repeatLessons,
  ...searchReplaceLessons,
  ...visualLessons,
  ...registerLessons,
  ...exLessons,
  ...macroLessons,
  ...refactorLessons,
]

export const LESSON_BY_ID = new Map(ALL_LESSONS.map((l) => [l.id, l]))

export function keyCount(notation: string): number {
  return parseKeys(notation).length
}

/** Par: the shortest known solution. */
export function parFor(lesson: Lesson): number {
  return Math.min(...lesson.optimal.map(keyCount))
}

/** Create a fresh engine in the lesson's start state. */
export function createLessonVim(lesson: Lesson): Vim {
  const vim = new Vim(lesson.start.text, { line: lesson.start.cursor[0], col: lesson.start.cursor[1] }, lesson.options)
  applyLessonRegisters(vim, lesson)
  return vim
}

export function applyLessonRegisters(vim: Vim, lesson: Lesson): void {
  if (!lesson.start.registers) return
  for (const [name, reg] of Object.entries(lesson.start.registers)) {
    vim.registers.set(name, { type: reg.type, lines: reg.text.split('\n') })
  }
}

/** Whether the engine state satisfies the lesson goal. Requires normal mode (Esc counts, like VimGolf). */
export function goalReached(vim: Vim, lesson: Lesson): boolean {
  if (vim.mode !== 'normal') return false
  if (lesson.goal.type === 'text') return vim.text === lesson.goal.text
  const c: Pos = { line: lesson.goal.cursor[0], col: lesson.goal.cursor[1] }
  return vim.cursor.line === c.line && vim.cursor.col === c.col && vim.text === lesson.start.text
}

export type { Lesson } from './types'
