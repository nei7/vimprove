import { describe, expect, test } from 'vitest'
import { ALL_LESSONS, createLessonVim, goalReached, parFor } from '../../src/lessons'
import { CHEAT_BY_ID } from '../../src/lessons/cheatsheet'
import { parseKeys } from '../../src/engine'

describe('lesson catalogue', () => {
  test('ids are unique and well-formed', () => {
    const ids = ALL_LESSONS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z-]+\/[a-z0-9-]+$/)
  })

  test('every lesson has at least one optimal solution and a positive par', () => {
    for (const l of ALL_LESSONS) {
      expect(l.optimal.length, l.id).toBeGreaterThan(0)
      expect(parFor(l), l.id).toBeGreaterThan(0)
    }
  })

  test('the start state does not already satisfy the goal', () => {
    for (const l of ALL_LESSONS) {
      const vim = createLessonVim(l)
      expect(goalReached(vim, l), l.id).toBe(false)
    }
  })

  test('teaches ids exist in the cheat sheet', () => {
    for (const l of ALL_LESSONS) {
      for (const t of l.teaches) expect(CHEAT_BY_ID.has(t), `${l.id} teaches ${t}`).toBe(true)
    }
  })

  test('prerequisites reference existing lessons', () => {
    const ids = new Set(ALL_LESSONS.map((l) => l.id))
    for (const l of ALL_LESSONS) for (const p of l.prerequisites ?? []) expect(ids.has(p), `${l.id} -> ${p}`).toBe(true)
  })
})

describe.each(ALL_LESSONS.map((l) => [l.id, l] as const))('%s', (_id, lesson) => {
  test.each(lesson.optimal.map((o, i) => [i, o] as const))('solution %i: %s reaches the goal', (_i, keys) => {
    const vim = createLessonVim(lesson)
    for (const k of parseKeys(keys)) vim.feedKey(k)
    const detail =
      lesson.goal.type === 'text'
        ? `\n--- got ---\n${vim.text}\n--- want ---\n${lesson.goal.text}\nmode=${vim.mode}`
        : `\ncursor=${vim.cursor.line},${vim.cursor.col} want=${lesson.goal.cursor.join(',')} mode=${vim.mode}`
    expect(goalReached(vim, lesson), detail).toBe(true)
  })
})
