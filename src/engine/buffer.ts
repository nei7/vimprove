import type { Pos } from './types'

/** Text between start (inclusive) and end (exclusive). Positions may span lines. */
export function getText(lines: string[], start: Pos, end: Pos): string {
  if (start.line === end.line) return lines[start.line].slice(start.col, end.col)
  const parts: string[] = [lines[start.line].slice(start.col)]
  for (let l = start.line + 1; l < end.line; l++) parts.push(lines[l])
  parts.push(lines[end.line]?.slice(0, end.col) ?? '')
  return parts.join('\n')
}

/** Delete [start, end) in place and return the deleted text. */
export function deleteRange(lines: string[], start: Pos, end: Pos): string {
  const text = getText(lines, start, end)
  const head = lines[start.line].slice(0, start.col)
  const tail = lines[end.line]?.slice(end.col) ?? ''
  lines.splice(start.line, end.line - start.line + 1, head + tail)
  return text
}

/** Insert text (may contain newlines) at pos in place; returns the position just after the inserted text. */
export function insertText(lines: string[], pos: Pos, text: string): Pos {
  const line = lines[pos.line] ?? ''
  const head = line.slice(0, pos.col)
  const tail = line.slice(pos.col)
  const parts = text.split('\n')
  if (parts.length === 1) {
    lines[pos.line] = head + text + tail
    return { line: pos.line, col: pos.col + text.length }
  }
  const newLines = [head + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail]
  lines.splice(pos.line, 1, ...newLines)
  const lastIdx = pos.line + parts.length - 1
  return { line: lastIdx, col: parts[parts.length - 1].length }
}

export function replaceRange(lines: string[], start: Pos, end: Pos, text: string): Pos {
  deleteRange(lines, start, end)
  return insertText(lines, start, text)
}

/** Delete whole lines [from, to] inclusive; always leaves at least one (empty) line. Returns removed lines. */
export function deleteLines(lines: string[], from: number, to: number): string[] {
  const removed = lines.splice(from, to - from + 1)
  if (lines.length === 0) lines.push('')
  return removed
}

export function insertLines(lines: string[], at: number, newLines: string[]): void {
  lines.splice(at, 0, ...newLines)
}

export function clampCol(line: string, col: number, allowEnd = false): number {
  const max = allowEnd ? line.length : Math.max(0, line.length - 1)
  return Math.max(0, Math.min(col, max))
}
