import { Vim, type VimOptions } from '../../src/engine'

export interface RunResult {
  vim: Vim
  text: string
  cursor: [number, number]
  mode: string
}

/**
 * Create a Vim with `text`, cursor given as [line, col], feed `keys` (Vim notation)
 * and return the resulting state.
 */
export function run(
  text: string,
  cursor: [number, number],
  keys: string,
  options: Partial<VimOptions> = {},
): RunResult {
  const vim = new Vim(text, { line: cursor[0], col: cursor[1] }, options)
  vim.feedKeys(keys)
  return { vim, text: vim.text, cursor: [vim.cursor.line, vim.cursor.col], mode: vim.mode }
}

/** Build text with a `|` marker for the cursor position; returns text without the marker and the cursor. */
export function withCursor(marked: string): { text: string; cursor: [number, number] } {
  const lines = marked.split('\n')
  for (let l = 0; l < lines.length; l++) {
    const idx = lines[l].indexOf('|')
    if (idx !== -1) {
      lines[l] = lines[l].slice(0, idx) + lines[l].slice(idx + 1)
      return { text: lines.join('\n'), cursor: [l, idx] }
    }
  }
  return { text: marked, cursor: [0, 0] }
}

/** Run keys on a `|`-marked text and return the result text with `|` marking the new cursor. */
export function edit(marked: string, keys: string, options: Partial<VimOptions> = {}): string {
  const { text, cursor } = withCursor(marked)
  const r = run(text, cursor, keys, options)
  const lines = r.text.split('\n')
  const [l, c] = r.cursor
  lines[l] = lines[l].slice(0, c) + '|' + lines[l].slice(c)
  return lines.join('\n')
}
