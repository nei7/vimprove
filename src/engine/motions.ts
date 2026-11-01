import type { Pos } from './types'
import { charClass, isKeywordChar, isBlank } from './text'

export interface MotionResult {
  pos: Pos
  linewise?: boolean
  inclusive?: boolean
  /** The motion failed; the operator is cancelled and the cursor does not move. */
  fail?: boolean
  /** j/k: keep the remembered column instead of updating it. */
  keepDesiredCol?: boolean
  /** `$`: remember "end of line" as desired column. */
  toEol?: boolean
  /** Message to display (e.g. search wrapped). */
  message?: string
}

/**
 * Vim's inc(): advance one character. Returns 0 while inside the line, 2 when moving onto the
 * virtual end-of-line position (col === length), 1 when crossing to the next line, -1 at buffer end.
 */
export function inc(lines: string[], p: Pos): number {
  const len = lines[p.line].length
  if (p.col < len) {
    p.col++
    return p.col < len ? 0 : 2
  }
  if (p.line < lines.length - 1) {
    p.line++
    p.col = 0
    return 1
  }
  return -1
}

/** Vim's dec(): go back one character. Crossing a line lands on its end-of-line position. */
export function dec(lines: string[], p: Pos): number {
  if (p.col > 0) {
    p.col--
    return 0
  }
  if (p.line > 0) {
    p.line--
    p.col = lines[p.line].length
    return 1
  }
  return -1
}

/** inc() that skips the end-of-line position. */
export function incl(lines: string[], p: Pos): number {
  let r = inc(lines, p)
  if (r >= 1 && p.col) r = inc(lines, p)
  return r
}

/** dec() that skips the end-of-line position. */
export function decl(lines: string[], p: Pos): number {
  let r = dec(lines, p)
  if (r === 1 && p.col) r = dec(lines, p)
  return r
}

function cls(lines: string[], p: Pos, big: boolean): number {
  return charClass(lines[p.line][p.col], big)
}

function lineEmpty(lines: string[], p: Pos): boolean {
  return p.col === 0 && lines[p.line].length === 0
}

function skipChars(lines: string[], p: Pos, cclass: number, big: boolean, dir: 1 | -1): boolean {
  while (cls(lines, p, big) === cclass) {
    if ((dir === 1 ? inc(lines, p) : dec(lines, p)) === -1) return true
  }
  return false
}

/** `w` / `W`. With `eol` (operator pending) stops at the end of the line for the last count. */
export function fwdWord(
  lines: string[],
  start: Pos,
  count: number,
  big: boolean,
  eol: boolean,
): { pos: Pos; fail: boolean } {
  const p = { ...start }
  const lastIdx = lines.length - 1
  while (count-- > 0) {
    const sclass = cls(lines, p, big)
    const lastLine = p.line === lastIdx
    let i = inc(lines, p)
    if (i === -1 || (i >= 1 && lastLine)) return { pos: p, fail: true }
    if (i >= 1 && eol && count === 0) return { pos: p, fail: false }
    if (sclass !== 0) {
      while (cls(lines, p, big) === sclass) {
        i = inc(lines, p)
        if (i === -1 || (i >= 1 && eol && count === 0)) return { pos: p, fail: false }
      }
    }
    while (cls(lines, p, big) === 0) {
      if (lineEmpty(lines, p)) break
      i = inc(lines, p)
      if (i === -1 || (i >= 1 && eol && count === 0)) return { pos: p, fail: false }
    }
  }
  return { pos: p, fail: false }
}

/** `e` / `E` */
export function endWord(
  lines: string[],
  start: Pos,
  count: number,
  big: boolean,
  stop = false,
): { pos: Pos; fail: boolean } {
  const p = { ...start }
  while (count-- > 0) {
    const sclass = cls(lines, p, big)
    if (inc(lines, p) === -1) return { pos: p, fail: true }
    if (cls(lines, p, big) === sclass && sclass !== 0) {
      if (skipChars(lines, p, sclass, big, 1)) return { pos: p, fail: true }
    } else if (!stop || sclass === 0) {
      while (cls(lines, p, big) === 0) {
        if (lineEmpty(lines, p) && stop) break
        if (inc(lines, p) === -1) return { pos: p, fail: true }
      }
      if (skipChars(lines, p, cls(lines, p, big), big, 1)) return { pos: p, fail: true }
    }
    dec(lines, p)
  }
  return { pos: p, fail: false }
}

/** `b` / `B` */
export function bckWord(
  lines: string[],
  start: Pos,
  count: number,
  big: boolean,
): { pos: Pos; fail: boolean } {
  const p = { ...start }
  while (count-- > 0) {
    if (dec(lines, p) === -1) return { pos: p, fail: true }
    let finished = false
    while (cls(lines, p, big) === 0) {
      if (lineEmpty(lines, p)) {
        finished = true
        break
      }
      if (dec(lines, p) === -1) return { pos: p, fail: false }
    }
    if (finished) continue
    if (skipChars(lines, p, cls(lines, p, big), big, -1)) return { pos: p, fail: false }
    inc(lines, p)
  }
  return { pos: p, fail: false }
}

/** `ge` / `gE` */
export function bckEndWord(
  lines: string[],
  start: Pos,
  count: number,
  big: boolean,
): { pos: Pos; fail: boolean } {
  const p = { ...start }
  while (count-- > 0) {
    const sclass = cls(lines, p, big)
    if (dec(lines, p) === -1) return { pos: p, fail: true }
    if (sclass !== 0) {
      while (cls(lines, p, big) === sclass) {
        if (dec(lines, p) === -1) return { pos: p, fail: false }
      }
    }
    while (cls(lines, p, big) === 0) {
      if (lineEmpty(lines, p)) break
      if (dec(lines, p) === -1) return { pos: p, fail: false }
    }
  }
  return { pos: p, fail: false }
}

/** f / F / t / T on the current line. Returns the target column or null. */
export function findCharOnLine(
  line: string,
  col: number,
  ch: string,
  count: number,
  cmd: 'f' | 'F' | 't' | 'T',
  repeat = false,
): number | null {
  const forward = cmd === 'f' || cmd === 't'
  const till = cmd === 't' || cmd === 'T'
  let pos = col
  if (forward) {
    if (till && repeat && line[col + 1] === ch) pos = col + 1
    for (let n = 0; n < count; n++) {
      const idx = line.indexOf(ch, pos + 1)
      if (idx === -1) return null
      pos = idx
    }
    return till ? pos - 1 : pos
  }
  if (till && repeat && line[col - 1] === ch) pos = col - 1
  for (let n = 0; n < count; n++) {
    if (pos <= 0) return null
    const idx = line.lastIndexOf(ch, pos - 1)
    if (idx === -1) return null
    pos = idx
  }
  return till ? pos + 1 : pos
}

/** `}` */
export function paragraphForward(lines: string[], pos: Pos, count: number): MotionResult {
  let l = pos.line
  const last = lines.length - 1
  for (let n = 0; n < count; n++) {
    while (l < last && lines[l] === '') l++
    while (l < last && lines[l] !== '') l++
  }
  if (l === last && lines[l] !== '') {
    return { pos: { line: last, col: Math.max(0, lines[last].length - 1) }, inclusive: true }
  }
  return { pos: { line: l, col: 0 } }
}

/** `{` */
export function paragraphBackward(lines: string[], pos: Pos, count: number): MotionResult {
  let l = pos.line
  for (let n = 0; n < count; n++) {
    while (l > 0 && lines[l] === '') l--
    while (l > 0 && lines[l] !== '') l--
  }
  return { pos: { line: l, col: 0 } }
}

function offsetOf(lines: string[], p: Pos): number {
  let off = 0
  for (let l = 0; l < p.line; l++) off += lines[l].length + 1
  return off + p.col
}

function posOf(lines: string[], off: number): Pos {
  let l = 0
  while (l < lines.length - 1 && off > lines[l].length) {
    off -= lines[l].length + 1
    l++
  }
  return { line: l, col: Math.min(off, Math.max(0, lines[l].length)) }
}

function sentenceStarts(lines: string[]): number[] {
  const text = lines.join('\n')
  const starts = new Set<number>()
  // first non-blank of the text
  const first = /\S/.exec(text)
  if (first) starts.add(first.index)
  // after sentence terminators followed by whitespace
  const re = /[.!?][)\]"']*(\s+)(?=\S)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) starts.add(m.index + m[0].length)
  // paragraph boundaries: empty lines and the first non-blank after them
  let off = 0
  for (let l = 0; l < lines.length; l++) {
    if (lines[l] === '') {
      starts.add(off)
      let k = l + 1
      let o = off + 1
      while (k < lines.length && lines[k] === '') {
        o += 1
        k++
      }
      if (k < lines.length) {
        const fm = /\S/.exec(lines[k])
        if (fm) starts.add(o + fm.index)
      }
    }
    off += lines[l].length + 1
  }
  return [...starts].sort((a, b) => a - b)
}

/** `)` */
export function sentenceForward(lines: string[], pos: Pos, count: number): MotionResult {
  const starts = sentenceStarts(lines)
  let off = offsetOf(lines, pos)
  for (let n = 0; n < count; n++) {
    const next = starts.find((s) => s > off)
    if (next === undefined) {
      const last = lines.length - 1
      return { pos: { line: last, col: Math.max(0, lines[last].length - 1) }, inclusive: true }
    }
    off = next
  }
  return { pos: posOf(lines, off) }
}

/** `(` */
export function sentenceBackward(lines: string[], pos: Pos, count: number): MotionResult {
  const starts = sentenceStarts(lines)
  let off = offsetOf(lines, pos)
  for (let n = 0; n < count; n++) {
    const prev = [...starts].reverse().find((s) => s < off)
    if (prev === undefined) return { pos: { line: 0, col: 0 } }
    off = prev
  }
  return { pos: posOf(lines, off) }
}

const PAIRS: Record<string, { match: string; dir: 1 | -1 }> = {
  '(': { match: ')', dir: 1 },
  ')': { match: '(', dir: -1 },
  '[': { match: ']', dir: 1 },
  ']': { match: '[', dir: -1 },
  '{': { match: '}', dir: 1 },
  '}': { match: '{', dir: -1 },
}

/** `%`: jump to the matching bracket of the first bracket at or after the cursor on this line. */
export function matchPair(lines: string[], pos: Pos): Pos | null {
  const line = lines[pos.line]
  let col = pos.col
  while (col < line.length && !(line[col] in PAIRS)) col++
  if (col >= line.length) return null
  const open = line[col]
  const { match, dir } = PAIRS[open]
  const p = { line: pos.line, col }
  let depth = 0
  for (;;) {
    const c = lines[p.line][p.col]
    if (c === open) depth++
    else if (c === match) {
      depth--
      if (depth === 0) return p
    }
    const r = dir === 1 ? incl(lines, p) : decl(lines, p)
    if (r === -1) return null
    if (lines[p.line].length === 0 && dir === -1 && p.line === 0) return null
  }
}

export interface LineMatch {
  start: number
  end: number
}

export function matchesOnLine(line: string, re: RegExp): LineMatch[] {
  const out: LineMatch[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

/** Find the first match strictly after `from`, wrapping around if allowed. */
export function searchForward(
  lines: string[],
  re: RegExp,
  from: Pos,
  wrap: boolean,
): { pos: Pos; wrapped: boolean } | null {
  const n = lines.length
  for (let k = 0; k <= n; k++) {
    const l = (from.line + k) % n
    if (k === n && !wrap) break
    if (k > 0 && l === from.line && !wrap) break
    const wrapped = from.line + k >= n
    if (wrapped && !wrap) return null
    const ms = matchesOnLine(lines[l], re)
    for (const m of ms) {
      if (k === 0 && m.start <= from.col) continue
      if (k === n && m.start > from.col) continue
      return { pos: { line: l, col: m.start }, wrapped }
    }
  }
  return null
}

/** Find the last match strictly before `from`, wrapping around if allowed. */
export function searchBackward(
  lines: string[],
  re: RegExp,
  from: Pos,
  wrap: boolean,
): { pos: Pos; wrapped: boolean } | null {
  const n = lines.length
  for (let k = 0; k <= n; k++) {
    const l = (((from.line - k) % n) + n) % n
    const wrapped = from.line - k < 0
    if (wrapped && !wrap) return null
    const ms = matchesOnLine(lines[l], re).reverse()
    for (const m of ms) {
      if (k === 0 && m.start >= from.col) continue
      if (k === n && m.start < from.col) continue
      return { pos: { line: l, col: m.start }, wrapped }
    }
  }
  return null
}

/** Word under or after the cursor, for `*` and `#`. */
export function wordUnderCursor(
  line: string,
  col: number,
): { word: string; start: number; keyword: boolean } | null {
  let c = col
  if (!isKeywordChar(line[c])) {
    let k = c
    while (k < line.length && !isKeywordChar(line[k])) k++
    if (k < line.length) c = k
    else {
      // fall back to the non-blank run under/after the cursor
      let s = col
      while (s < line.length && isBlank(line[s])) s++
      if (s >= line.length) return null
      let e = s
      while (e < line.length && !isBlank(line[e])) e++
      return { word: line.slice(s, e), start: s, keyword: false }
    }
  }
  let s = c
  while (s > 0 && isKeywordChar(line[s - 1])) s--
  let e = c
  while (e < line.length && isKeywordChar(line[e])) e++
  return { word: line.slice(s, e), start: s, keyword: true }
}
