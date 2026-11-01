import type { Pos } from './types'
import { charClass, isBlank, isBlankLine, comparePos, inIndent } from './text'
import { incl, decl } from './motions'

export interface TextObjectRange {
  start: Pos
  /** Inclusive end unless `exclusive` is set. */
  end: Pos
  exclusive?: boolean
  linewise?: boolean
}

/** iw / aw / iW / aW (count 1, within the current line) */
export function wordObject(lines: string[], pos: Pos, inner: boolean, big: boolean): TextObjectRange | null {
  const line = lines[pos.line]
  if (line.length === 0) return null
  const col = Math.min(pos.col, line.length - 1)
  const c0 = charClass(line[col], big)
  let s = col
  let e = col
  while (s > 0 && charClass(line[s - 1], big) === c0) s--
  while (e + 1 < line.length && charClass(line[e + 1], big) === c0) e++
  if (c0 === 0) {
    if (!inner && e + 1 < line.length) {
      const c1 = charClass(line[e + 1], big)
      e++
      while (e + 1 < line.length && charClass(line[e + 1], big) === c1) e++
    }
  } else if (!inner) {
    if (e + 1 < line.length && isBlank(line[e + 1])) {
      while (e + 1 < line.length && isBlank(line[e + 1])) e++
    } else {
      while (s > 0 && isBlank(line[s - 1])) s--
    }
  }
  return { start: { line: pos.line, col: s }, end: { line: pos.line, col: e } }
}

/** ip / ap */
export function paragraphObject(lines: string[], pos: Pos, inner: boolean): TextObjectRange {
  const blank = isBlankLine(lines[pos.line])
  let s = pos.line
  let e = pos.line
  while (s > 0 && isBlankLine(lines[s - 1]) === blank) s--
  while (e + 1 < lines.length && isBlankLine(lines[e + 1]) === blank) e++
  if (!inner) {
    if (e + 1 < lines.length) {
      const next = isBlankLine(lines[e + 1])
      e++
      while (e + 1 < lines.length && isBlankLine(lines[e + 1]) === next) e++
    } else if (!blank) {
      while (s > 0 && isBlankLine(lines[s - 1])) s--
    }
  }
  return { start: { line: s, col: 0 }, end: { line: e, col: 0 }, linewise: true }
}

/** is / as — sentence on the current line (approximation). */
export function sentenceObject(lines: string[], pos: Pos, inner: boolean): TextObjectRange | null {
  const line = lines[pos.line]
  if (line.length === 0) return null
  const bounds: number[] = [0]
  const re = /[.!?][)\]"']*\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) bounds.push(m.index + m[0].length)
  bounds.push(line.length)
  let s = 0
  let e = line.length - 1
  for (let i = 0; i < bounds.length - 1; i++) {
    if (pos.col >= bounds[i] && pos.col < bounds[i + 1]) {
      s = bounds[i]
      e = bounds[i + 1] - 1
      break
    }
  }
  while (s < e && isBlank(line[s])) s++
  if (inner) {
    while (e > s && isBlank(line[e])) e--
  } else if (!isBlank(line[e])) {
    while (s > 0 && isBlank(line[s - 1])) s--
  }
  return { start: { line: pos.line, col: s }, end: { line: pos.line, col: e } }
}

function findEnclosingBrackets(
  lines: string[],
  pos: Pos,
  open: string,
  close: string,
): { open: Pos; close: Pos } | null {
  const line = lines[pos.line]
  let openPos: Pos | null = null
  const ch = line[pos.col]
  if (ch === open) {
    openPos = { ...pos }
  } else {
    // scan backward for an unmatched open bracket (if on a close bracket, start just before it)
    const p = { ...pos }
    let depth = 0
    if (ch === close) {
      if (decl(lines, p) === -1) return null
    }
    for (;;) {
      const c = lines[p.line][p.col]
      if (c === close) depth++
      else if (c === open) {
        if (depth === 0) {
          openPos = { ...p }
          break
        }
        depth--
      }
      if (decl(lines, p) === -1) return null
    }
  }
  // scan forward for the matching close bracket
  const q = { ...openPos }
  let depth = 0
  for (;;) {
    const c = lines[q.line][q.col]
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return { open: openPos, close: q }
    }
    if (incl(lines, q) === -1) return null
  }
}

/** i( a( i[ a[ i{ a{ i< a< (and b/B aliases) */
export function bracketObject(
  lines: string[],
  pos: Pos,
  open: string,
  close: string,
  inner: boolean,
): TextObjectRange | null {
  const found = findEnclosingBrackets(lines, pos, open, close)
  if (!found) return null
  if (!inner) return { start: found.open, end: found.close }

  const start = { ...found.open }
  incl(lines, start)
  const end = { ...found.close }
  let sol = end.col === 0
  decl(lines, end)
  while (inIndent(lines[end.line], end.col + 1)) {
    sol = true
    if (decl(lines, end) !== 0) break
  }
  if (comparePos(start, end) > 0 || (start.line === found.close.line && start.col === found.close.col)) {
    // empty inner block: operate on nothing, cursor goes to start
    return { start, end: start, exclusive: true }
  }
  if (sol) {
    incl(lines, end)
    return { start, end, exclusive: true }
  }
  return { start, end }
}

/** i" a" i' a' i` a` on the current line */
export function quoteObject(lines: string[], pos: Pos, q: string, inner: boolean): TextObjectRange | null {
  const line = lines[pos.line]
  const quotes: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      i++
      continue
    }
    if (line[i] === q) quotes.push(i)
  }
  let pair: [number, number] | null = null
  for (let k = 0; k + 1 < quotes.length; k += 2) {
    if (quotes[k] <= pos.col && pos.col <= quotes[k + 1]) {
      pair = [quotes[k], quotes[k + 1]]
      break
    }
  }
  if (!pair) {
    for (let k = 0; k + 1 < quotes.length; k += 2) {
      if (quotes[k] > pos.col) {
        pair = [quotes[k], quotes[k + 1]]
        break
      }
    }
  }
  if (!pair) return null
  const [a, b] = pair
  if (inner) {
    if (b === a + 1) return { start: { line: pos.line, col: a + 1 }, end: { line: pos.line, col: a + 1 }, exclusive: true }
    return { start: { line: pos.line, col: a + 1 }, end: { line: pos.line, col: b - 1 } }
  }
  let s = a
  let e = b
  if (e + 1 < line.length && isBlank(line[e + 1])) {
    while (e + 1 < line.length && isBlank(line[e + 1])) e++
  } else {
    while (s > 0 && isBlank(line[s - 1])) s--
  }
  return { start: { line: pos.line, col: s }, end: { line: pos.line, col: e } }
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
  return { line: l, col: off }
}

/** it / at */
export function tagObject(lines: string[], pos: Pos, inner: boolean): TextObjectRange | null {
  const text = lines.join('\n')
  const re = /<(\/?)([A-Za-z][\w.:-]*)(?:\s[^<>]*?)?(\/?)>/g
  const stack: { name: string; start: number; end: number }[] = []
  const pairs: { os: number; oe: number; cs: number; ce: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [full, closing, name, selfClose] = m
    if (selfClose) continue
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          const o = stack[i]
          pairs.push({ os: o.start, oe: o.end, cs: m.index, ce: m.index + full.length })
          stack.length = i
          break
        }
      }
    } else {
      stack.push({ name, start: m.index, end: m.index + full.length })
    }
  }
  const off = offsetOf(lines, pos)
  const enclosing = pairs.filter((p) => p.os <= off && off < p.ce).sort((a, b) => b.os - a.os)
  const p = enclosing[0]
  if (!p) return null
  if (inner) {
    if (p.cs === p.oe) {
      const s = posOf(lines, p.oe)
      return { start: s, end: s, exclusive: true }
    }
    return { start: posOf(lines, p.oe), end: posOf(lines, p.cs - 1) }
  }
  return { start: posOf(lines, p.os), end: posOf(lines, p.ce - 1) }
}

const BRACKETS: Record<string, [string, string]> = {
  '(': ['(', ')'],
  ')': ['(', ')'],
  b: ['(', ')'],
  '[': ['[', ']'],
  ']': ['[', ']'],
  '{': ['{', '}'],
  '}': ['{', '}'],
  B: ['{', '}'],
  '<': ['<', '>'],
  '>': ['<', '>'],
}

export function textObject(lines: string[], pos: Pos, inner: boolean, obj: string): TextObjectRange | null {
  switch (obj) {
    case 'w':
      return wordObject(lines, pos, inner, false)
    case 'W':
      return wordObject(lines, pos, inner, true)
    case 's':
      return sentenceObject(lines, pos, inner)
    case 'p':
      return paragraphObject(lines, pos, inner)
    case '"':
    case "'":
    case '`':
      return quoteObject(lines, pos, obj, inner)
    case 't':
      return tagObject(lines, pos, inner)
    default: {
      const br = BRACKETS[obj]
      if (!br) return null
      return bracketObject(lines, pos, br[0], br[1], inner)
    }
  }
}
