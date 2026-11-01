import type { Pos } from './types'

const KEYWORD_RE = /[\p{L}\p{N}_]/u

export function isKeywordChar(c: string | undefined): boolean {
  return c !== undefined && c !== '' && KEYWORD_RE.test(c)
}

export function isBlank(c: string | undefined): boolean {
  return c === undefined || c === '' || c === ' ' || c === '\t'
}

/** Vim's cls(): 0 = blank/EOL, 1 = punctuation, 2 = keyword. With `big`, every non-blank is 1. */
export function charClass(c: string | undefined, big = false): number {
  if (isBlank(c)) return 0
  if (big) return 1
  return isKeywordChar(c) ? 2 : 1
}

/** Column of the first non-blank character; for blank lines returns 0 (or last col for whitespace-only). */
export function firstNonBlank(line: string): number {
  const m = /\S/.exec(line)
  if (m) return m.index
  return Math.max(0, line.length - 1)
}

export function indentOf(line: string): string {
  const m = /^[ \t]*/.exec(line)
  return m ? m[0] : ''
}

export function isBlankLine(line: string): boolean {
  return /^\s*$/.test(line)
}

export function comparePos(a: Pos, b: Pos): number {
  if (a.line !== b.line) return a.line - b.line
  return a.col - b.col
}

export function posEq(a: Pos, b: Pos): boolean {
  return a.line === b.line && a.col === b.col
}

export function minPos(a: Pos, b: Pos): Pos {
  return comparePos(a, b) <= 0 ? a : b
}

export function maxPos(a: Pos, b: Pos): Pos {
  return comparePos(a, b) >= 0 ? a : b
}

export function clonePos(p: Pos): Pos {
  return { line: p.line, col: p.col }
}

/** Whether every char before `col` on the line is whitespace (Vim's inindent()). */
export function inIndent(line: string, col: number): boolean {
  return /^[ \t]*$/.test(line.slice(0, col))
}

export function isUpper(c: string): boolean {
  return c !== c.toLowerCase() && c === c.toUpperCase()
}

export function isLower(c: string): boolean {
  return c !== c.toUpperCase() && c === c.toLowerCase()
}

export function toggleCase(s: string): string {
  let out = ''
  for (const c of s) {
    if (isUpper(c)) out += c.toLowerCase()
    else if (isLower(c)) out += c.toUpperCase()
    else out += c
  }
  return out
}

/** Compute the visual width of a leading indentation string. */
export function indentWidth(indent: string, tabstop: number): number {
  let w = 0
  for (const c of indent) {
    if (c === '\t') w += tabstop - (w % tabstop)
    else w++
  }
  return w
}

export function makeIndent(width: number, expandtab: boolean, tabstop: number): string {
  if (width <= 0) return ''
  if (expandtab) return ' '.repeat(width)
  return '\t'.repeat(Math.floor(width / tabstop)) + ' '.repeat(width % tabstop)
}
