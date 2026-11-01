/**
 * Key notation: single printable characters are themselves; special keys use
 * Vim's angle-bracket notation: <Esc> <CR> <BS> <Tab> <Space> <Del> <C-x> <Left> ...
 * A literal '<' inside a key string can be written as <lt>.
 */

const SPECIAL_BY_EVENT_KEY: Record<string, string> = {
  Escape: '<Esc>',
  Enter: '<CR>',
  Backspace: '<BS>',
  Tab: '<Tab>',
  ' ': '<Space>',
  Delete: '<Del>',
  ArrowLeft: '<Left>',
  ArrowRight: '<Right>',
  ArrowUp: '<Up>',
  ArrowDown: '<Down>',
  Home: '<Home>',
  End: '<End>',
  PageUp: '<PageUp>',
  PageDown: '<PageDown>',
  Insert: '<Insert>',
}

export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/** Convert a browser KeyboardEvent into Vim key notation. Returns null for keys Vim should ignore. */
export function keyFromEvent(e: KeyEventLike): string | null {
  if (e.metaKey || e.altKey) return null
  const special = SPECIAL_BY_EVENT_KEY[e.key]
  if (e.ctrlKey) {
    if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      if (k === '[') return '<Esc>'
      if (/^[a-z\]\\^_@]$/.test(k)) return `<C-${k}>`
      return null
    }
    return null
  }
  if (special) {
    if (e.key === 'Tab' && e.shiftKey) return '<S-Tab>'
    return special
  }
  if (e.key.length === 1) return e.key
  return null
}

/** Parse a Vim-notation string like 'ci"foo<Esc>' into a list of keys. */
export function parseKeys(notation: string): string[] {
  const keys: string[] = []
  let i = 0
  while (i < notation.length) {
    const c = notation[i]
    if (c === '<') {
      const close = notation.indexOf('>', i + 1)
      if (close !== -1) {
        const token = notation.slice(i, close + 1)
        if (/^<(?:[A-Za-z]+-)?[A-Za-z0-9]+>$/.test(token)) {
          keys.push(normalizeKey(token))
          i = close + 1
          continue
        }
      }
    }
    keys.push(c)
    i++
  }
  return keys
}

export function normalizeKey(key: string): string {
  if (key === ' ') return '<Space>'
  if (key.length <= 1) return key
  const lower = key.toLowerCase()
  switch (lower) {
    case '<lt>':
      return '<'
    case '<esc>':
    case '<c-[>':
      return '<Esc>'
    case '<cr>':
    case '<enter>':
    case '<return>':
    case '<c-m>':
      return '<CR>'
    case '<bs>':
    case '<backspace>':
      return '<BS>'
    case '<tab>':
    case '<c-i>':
      return '<Tab>'
    case '<space>':
      return '<Space>'
    case '<del>':
    case '<delete>':
      return '<Del>'
    case '<left>':
      return '<Left>'
    case '<right>':
      return '<Right>'
    case '<up>':
      return '<Up>'
    case '<down>':
      return '<Down>'
    case '<home>':
      return '<Home>'
    case '<end>':
      return '<End>'
    case '<pageup>':
      return '<PageUp>'
    case '<pagedown>':
      return '<PageDown>'
    case '<s-tab>':
      return '<S-Tab>'
    case '<insert>':
      return '<Insert>'
  }
  const ctrl = /^<c-(.)>$/i.exec(key)
  if (ctrl) return `<C-${ctrl[1].toLowerCase()}>`
  return key
}

/** Convert a list of keys back into a compact notation string. */
export function keysToString(keys: string[]): string {
  return keys.map((k) => (k === '<' ? '<lt>' : k)).join('')
}

/** Human-friendly label for a key badge. */
export function keyLabel(key: string): string {
  switch (key) {
    case '<Esc>':
      return 'Esc'
    case '<CR>':
      return '⏎'
    case '<BS>':
      return '⌫'
    case '<Tab>':
      return 'Tab'
    case '<Space>':
      return '␣'
    case '<Del>':
      return 'Del'
    case '<Left>':
      return '←'
    case '<Right>':
      return '→'
    case '<Up>':
      return '↑'
    case '<Down>':
      return '↓'
  }
  const ctrl = /^<C-(.)>$/.exec(key)
  if (ctrl) return `Ctrl-${ctrl[1]}`
  return key
}

/** Keys that are not idiomatic Vim and indicate a habit worth breaking. */
export const NON_VIM_KEYS = new Set([
  '<Left>',
  '<Right>',
  '<Up>',
  '<Down>',
  '<Home>',
  '<End>',
  '<Del>',
  '<PageUp>',
  '<PageDown>',
  '<Insert>',
])
