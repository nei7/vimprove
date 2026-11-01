import type { Mode } from './types'

export interface ParsedMotion {
  key: string
  arg?: string
}

export interface ParsedTextObject {
  inner: boolean
  obj: string
}

export type ParsedType =
  | 'motion'
  | 'operator'
  | 'operator-line'
  | 'operator-search'
  | 'action'
  | 'search'

export interface ParsedCommand {
  keys: string[]
  /** keys without the leading count (for dot-repeat) */
  countless: string[]
  register?: string
  count?: number
  type: ParsedType
  operator?: string
  motion?: ParsedMotion
  textObject?: ParsedTextObject
  action?: { key: string; arg?: string }
  searchDir?: '/' | '?'
  /** Normalised name, e.g. 'dw', 'ci"', 'l', 'dd', 'r', '/' */
  name: string
}

export type ParseResult =
  | { status: 'incomplete' }
  | { status: 'invalid' }
  | { status: 'complete'; cmd: ParsedCommand }

const INCOMPLETE: ParseResult = { status: 'incomplete' }
const INVALID: ParseResult = { status: 'invalid' }

export const OPERATORS = new Set(['d', 'c', 'y', '>', '<', 'gu', 'gU', 'g~', 'g?'])

const OPERATOR_DOUBLES: Record<string, string[]> = {
  d: ['d'],
  c: ['c'],
  y: ['y'],
  '>': ['>'],
  '<': ['<'],
  gu: ['u', 'gu'],
  gU: ['U', 'gU'],
  'g~': ['~', 'g~'],
  'g?': ['?', 'g?'],
}

export const SIMPLE_MOTIONS = new Set([
  'h',
  'j',
  'k',
  'l',
  'w',
  'W',
  'b',
  'B',
  'e',
  'E',
  'ge',
  'gE',
  '0',
  '^',
  '$',
  'g_',
  '|',
  'gg',
  'G',
  '{',
  '}',
  '(',
  ')',
  '%',
  'H',
  'M',
  'L',
  '+',
  '-',
  '_',
  '<CR>',
  '<Space>',
  '<BS>',
  '<Left>',
  '<Right>',
  '<Up>',
  '<Down>',
  '<Home>',
  '<End>',
  'n',
  'N',
  '*',
  '#',
  'g*',
  'g#',
  ';',
  ',',
  'gj',
  'gk',
])

export const CHAR_MOTIONS = new Set(['f', 'F', 't', 'T', "'", '`'])

export const TEXT_OBJECT_CHARS = new Set([
  'w',
  'W',
  's',
  'p',
  '(',
  ')',
  'b',
  '[',
  ']',
  '{',
  '}',
  'B',
  '<',
  '>',
  '"',
  "'",
  '`',
  't',
])

export const NORMAL_ACTIONS = new Set([
  'x',
  'X',
  's',
  'S',
  'D',
  'C',
  'Y',
  'p',
  'P',
  'gp',
  'gP',
  'J',
  'gJ',
  'u',
  '<C-r>',
  'i',
  'I',
  'gI',
  'a',
  'A',
  'o',
  'O',
  'R',
  'v',
  'V',
  '<C-v>',
  '.',
  '~',
  ':',
  '<Esc>',
  '<C-c>',
  '<C-a>',
  '<C-x>',
  '<Del>',
  '&',
  'g&',
  'gv',
  'gi',
  'zz',
  'zt',
  'zb',
  'ZZ',
  'ZQ',
  '<C-l>',
  '<C-g>',
  '<C-e>',
  '<C-y>',
  '<C-d>',
  '<C-u>',
  '<C-f>',
  '<C-b>',
  '<PageUp>',
  '<PageDown>',
  '<Insert>',
])

export const CHAR_ACTIONS = new Set(['r', 'm', 'q', '@', 'gr'])

export const VISUAL_ACTIONS = new Set([
  'd',
  'x',
  'X',
  'D',
  'c',
  's',
  'S',
  'C',
  'R',
  'y',
  'Y',
  'J',
  'gJ',
  '>',
  '<',
  '~',
  'u',
  'U',
  'gu',
  'gU',
  'g~',
  'p',
  'P',
  'I',
  'A',
  'o',
  'O',
  ':',
  'v',
  'V',
  '<C-v>',
  '<Esc>',
  '<C-c>',
  'gv',
  '<Del>',
  '<C-a>',
  '<C-x>',
  'g<C-a>',
  'g<C-x>',
])

const PREFIX_KEYS = new Set(['g', 'z', 'Z'])

function readToken(keys: string[], i: number): { status: 'ok'; tok: string; next: number } | { status: 'incomplete' } {
  const k = keys[i]
  if (k === undefined) return { status: 'incomplete' }
  if (PREFIX_KEYS.has(k)) {
    if (i + 1 >= keys.length) return { status: 'incomplete' }
    return { status: 'ok', tok: k + keys[i + 1], next: i + 2 }
  }
  return { status: 'ok', tok: k, next: i + 1 }
}

export function isValidRegister(r: string): boolean {
  return /^[a-zA-Z0-9"_+*\-.:/%#=]$/.test(r)
}

function readCount(keys: string[], i: number): { count: number | undefined; next: number } {
  let count = 0
  let has = false
  while (i < keys.length && /^[0-9]$/.test(keys[i]) && !(keys[i] === '0' && !has)) {
    count = count * 10 + Number(keys[i])
    has = true
    i++
  }
  return { count: has ? count : undefined, next: i }
}

export function parseCommand(keys: string[], mode: Mode, recording: boolean): ParseResult {
  let i = 0
  let register: string | undefined
  if (keys[i] === '"') {
    if (i + 1 >= keys.length) return INCOMPLETE
    if (!isValidRegister(keys[i + 1])) return INVALID
    register = keys[i + 1]
    i += 2
  }
  const countStart = i
  const c1 = readCount(keys, i)
  i = c1.next
  const countEnd = i
  if (register === undefined && keys[i] === '"') {
    if (i + 1 >= keys.length) return INCOMPLETE
    if (!isValidRegister(keys[i + 1])) return INVALID
    register = keys[i + 1]
    i += 2
  }
  const countless = [...keys.slice(0, countStart), ...keys.slice(countEnd)]
  const tokRes = readToken(keys, i)
  if (tokRes.status === 'incomplete') return INCOMPLETE
  const tok = tokRes.tok
  i = tokRes.next
  const visual = mode.startsWith('visual')

  const finish = (partial: Omit<ParsedCommand, 'keys' | 'countless' | 'register' | 'count'>, count2?: number): ParseResult => {
    let count: number | undefined
    if (c1.count !== undefined || count2 !== undefined) count = (c1.count ?? 1) * (count2 ?? 1)
    if (i !== keys.length) return INVALID
    return { status: 'complete', cmd: { keys, countless, register, count, ...partial } }
  }

  const parseMotionAt = (
    t: string,
  ): { status: 'incomplete' } | { status: 'invalid' } | { status: 'ok'; motion: ParsedMotion } | null => {
    if (SIMPLE_MOTIONS.has(t)) return { status: 'ok', motion: { key: t } }
    if (CHAR_MOTIONS.has(t)) {
      if (i >= keys.length) return { status: 'incomplete' }
      const arg = keys[i++]
      if (arg === '<Esc>') return { status: 'invalid' }
      return { status: 'ok', motion: { key: t, arg } }
    }
    return null
  }

  // ---- operator (normal mode only) ----
  if (!visual && OPERATORS.has(tok)) {
    const c2 = readCount(keys, i)
    i = c2.next
    const t2 = readToken(keys, i)
    if (t2.status === 'incomplete') return INCOMPLETE
    i = t2.next
    const tok2 = t2.tok
    if (OPERATOR_DOUBLES[tok].includes(tok2)) {
      return finish({ type: 'operator-line', operator: tok, name: tok + OPERATOR_DOUBLES[tok][0] }, c2.count)
    }
    if (tok2 === 'i' || tok2 === 'a') {
      if (i >= keys.length) return INCOMPLETE
      const obj = keys[i++]
      if (!TEXT_OBJECT_CHARS.has(obj)) return INVALID
      return finish(
        { type: 'operator', operator: tok, textObject: { inner: tok2 === 'i', obj }, name: tok + tok2 + obj },
        c2.count,
      )
    }
    if (tok2 === '/' || tok2 === '?') {
      return finish({ type: 'operator-search', operator: tok, searchDir: tok2, name: tok + tok2 }, c2.count)
    }
    const m = parseMotionAt(tok2)
    if (m === null) return INVALID
    if (m.status === 'incomplete') return INCOMPLETE
    if (m.status === 'invalid') return INVALID
    return finish({ type: 'operator', operator: tok, motion: m.motion, name: tok + m.motion.key }, c2.count)
  }

  // ---- visual-mode actions and text objects ----
  if (visual) {
    if (tok === 'i' || tok === 'a') {
      if (i >= keys.length) return INCOMPLETE
      const obj = keys[i++]
      if (!TEXT_OBJECT_CHARS.has(obj)) return INVALID
      return finish({ type: 'action', textObject: { inner: tok === 'i', obj }, name: tok + obj })
    }
    if (tok === 'r') {
      if (i >= keys.length) return INCOMPLETE
      const arg = keys[i++]
      if (arg === '<Esc>') return INVALID
      return finish({ type: 'action', action: { key: 'r', arg }, name: 'r' })
    }
    if (VISUAL_ACTIONS.has(tok)) return finish({ type: 'action', action: { key: tok }, name: tok })
  }

  // ---- motions ----
  if (tok === '/' || tok === '?') return finish({ type: 'search', searchDir: tok, name: tok })
  const m = parseMotionAt(tok)
  if (m !== null) {
    if (m.status === 'incomplete') return INCOMPLETE
    if (m.status === 'invalid') return INVALID
    return finish({ type: 'motion', motion: m.motion, name: m.motion.key })
  }

  if (visual) return INVALID

  // ---- normal-mode actions ----
  if (tok === 'q' && recording) return finish({ type: 'action', action: { key: 'q' }, name: 'q' })
  if (CHAR_ACTIONS.has(tok)) {
    if (i >= keys.length) return INCOMPLETE
    const arg = keys[i++]
    if (arg === '<Esc>') return INVALID
    return finish({ type: 'action', action: { key: tok, arg }, name: tok })
  }
  if (NORMAL_ACTIONS.has(tok)) return finish({ type: 'action', action: { key: tok }, name: tok })

  return INVALID
}
