import type { Vim } from './vim'
import type { Register } from './types'
import { compileReplacement } from './regex'
import { firstNonBlank } from './text'
import { deleteLines, insertLines } from './buffer'
import { matchesOnLine } from './motions'

interface LineRange {
  start: number
  end: number
  given: boolean
}

type AddressResult = { ok: true; line: number | null; next: number } | { ok: false }

function readPatternUntil(s: string, i: number, delim: string): { pattern: string; next: number } {
  let out = ''
  while (i < s.length && s[i] !== delim) {
    if (s[i] === '\\' && i + 1 < s.length) {
      if (s[i + 1] === delim) {
        out += delim
        i += 2
        continue
      }
      out += s[i] + s[i + 1]
      i += 2
      continue
    }
    out += s[i]
    i++
  }
  return { pattern: out, next: i < s.length ? i + 1 : i }
}

function findLineMatching(vim: Vim, pattern: string, fromLine: number, forward: boolean): number | null {
  const re = vim.compilePattern(pattern)
  if (!re) return null
  const n = vim.lines.length
  for (let k = 1; k <= n; k++) {
    const l = forward ? (fromLine + k) % n : (((fromLine - k) % n) + n) % n
    re.lastIndex = 0
    if (re.test(vim.lines[l])) return l
  }
  return null
}

function parseAddress(vim: Vim, s: string, i: number): AddressResult {
  let base: number | null = null
  const last = vim.lines.length - 1
  const c = s[i]
  if (c !== undefined && /[0-9]/.test(c)) {
    let j = i
    while (j < s.length && /[0-9]/.test(s[j])) j++
    base = Number(s.slice(i, j)) - 1
    i = j
  } else if (c === '.') {
    base = vim.cursor.line
    i++
  } else if (c === '$') {
    base = last
    i++
  } else if (c === "'") {
    const mk = s[i + 1]
    const p = mk !== undefined ? vim.marks.get(mk) : undefined
    if (!p) {
      vim.setMessage('E20: Mark not set', true)
      return { ok: false }
    }
    base = p.line
    i += 2
  } else if (c === '/' || c === '?') {
    const { pattern, next } = readPatternUntil(s, i + 1, c)
    const pat = pattern || vim.search?.pattern
    if (!pat) {
      vim.setMessage('E35: No previous regular expression', true)
      return { ok: false }
    }
    vim.search = { pattern: pat, forward: c === '/' }
    const found = findLineMatching(vim, pat, vim.cursor.line, c === '/')
    if (found === null) {
      vim.setMessage(`E486: Pattern not found: ${pat}`, true)
      return { ok: false }
    }
    base = found
    i = next
  }
  while (s[i] === '+' || s[i] === '-') {
    const sign = s[i] === '+' ? 1 : -1
    i++
    let j = i
    while (j < s.length && /[0-9]/.test(s[j])) j++
    const n = j > i ? Number(s.slice(i, j)) : 1
    i = j
    if (base === null) base = vim.cursor.line
    base += sign * n
  }
  return { ok: true, line: base, next: i }
}

function parseRange(vim: Vim, s: string): { range: LineRange | null; rest: string } | null {
  const last = vim.lines.length - 1
  let i = 0
  while (s[i] === ' ') i++
  if (s[i] === '%') {
    return { range: { start: 0, end: last, given: true }, rest: s.slice(i + 1) }
  }
  const a1 = parseAddress(vim, s, i)
  if (!a1.ok) return null
  if (a1.line === null) return { range: null, rest: s.slice(a1.next) }
  i = a1.next
  let start = a1.line
  let end = a1.line
  if (s[i] === ',' || s[i] === ';') {
    if (s[i] === ';') vim.cursor.line = Math.max(0, Math.min(last, start))
    const a2 = parseAddress(vim, s, i + 1)
    if (!a2.ok) return null
    i = a2.next
    end = a2.line ?? vim.cursor.line
  }
  if (start > end) [start, end] = [end, start]
  if (end > last || start < -1) {
    vim.setMessage('E16: Invalid range', true)
    return null
  }
  return { range: { start, end, given: true }, rest: s.slice(i) }
}

const COMMANDS: [string, string][] = [
  ['substitute', 's'],
  ['global', 'g'],
  ['vglobal', 'v'],
  ['delete', 'd'],
  ['yank', 'y'],
  ['move', 'm'],
  ['t', 't'],
  ['copy', 'co'],
  ['join', 'j'],
  ['normal', 'norm'],
  ['sort', 'sor'],
  ['nohlsearch', 'noh'],
  ['write', 'w'],
  ['wq', 'wq'],
  ['wall', 'wa'],
  ['wqall', 'wqa'],
  ['xit', 'x'],
  ['xall', 'xa'],
  ['exit', 'exi'],
  ['update', 'up'],
  ['quit', 'q'],
  ['qall', 'qa'],
  ['undo', 'u'],
  ['redo', 'red'],
  ['put', 'pu'],
  ['set', 'se'],
  ['setlocal', 'setl'],
  ['registers', 'reg'],
  ['display', 'di'],
  ['marks', 'marks'],
  ['help', 'h'],
  ['edit', 'e'],
  ['print', 'p'],
  ['number', 'nu'],
  ['echo', 'ec'],
  ['let', 'let'],
  ['nnoremap', 'nn'],
  ['retab', 'ret'],
  ['center', 'ce'],
  ['left', 'le'],
  ['right', 'ri'],
]

function resolveCommand(name: string): string | null {
  for (const [full, min] of COMMANDS) {
    if (full.startsWith(name) && name.startsWith(min)) return full
  }
  return null
}

export function executeEx(vim: Vim, input: string): void {
  const text = input.replace(/^[\s:]+/, '')
  const parsed = parseRange(vim, text)
  if (!parsed) return
  const { range } = parsed
  let rest = parsed.rest.replace(/^\s+/, '')
  const last = vim.lines.length - 1
  const cur = vim.cursor.line

  if (rest === '') {
    if (range) {
      const ln = Math.max(0, Math.min(last, range.end))
      vim.marks.set("'", { ...vim.cursor })
      vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
    }
    return
  }

  let name: string
  let bang = false
  let args: string
  const sym = /^(&&|&|~|<+|>+|#|=|!|@)/.exec(rest)
  if (sym) {
    name = sym[1]
    args = rest.slice(name.length)
  } else {
    const m = /^([a-zA-Z]+)(!?)([\s\S]*)$/.exec(rest)
    if (!m) {
      vim.setMessage(`E492: Not an editor command: ${text}`, true)
      return
    }
    // `:s` can be followed directly by its delimiter, e.g. `:s/a/b/` or `:s#a#b#`
    const letters = m[1]
    if (/^s[a-zA-Z]/.test(letters) && !resolveCommand(letters)) {
      name = 's'
      bang = false
      args = rest.slice(1)
    } else if (/^(g|v)[a-zA-Z]/.test(letters) && !resolveCommand(letters) && !letters.startsWith('norm')) {
      name = letters[0]
      args = rest.slice(1)
    } else {
      name = letters
      bang = m[2] === '!'
      args = m[3]
    }
  }

  const lineRange: LineRange = range ?? { start: cur, end: cur, given: false }
  const clampedStart = Math.max(0, lineRange.start)
  const full = resolveCommand(name) ?? name

  switch (full) {
    case '&':
    case '&&':
    case 'substitute':
      exSubstitute(vim, lineRange, full === 'substitute' ? args : '&' + (full === '&&' ? '&' : '') + args)
      return
    case 'global':
    case 'vglobal':
      exGlobal(vim, range ?? { start: 0, end: last, given: true }, args, full === 'vglobal' || bang)
      return
    case 'delete':
    case 'yank': {
      const am = /^\s*([a-zA-Z"_+*0-9-])?\s*(\d+)?\s*$/.exec(args)
      const reg = am?.[1]
      const count = am?.[2] ? Number(am[2]) : undefined
      let { start, end } = { start: clampedStart, end: lineRange.end }
      if (count !== undefined) {
        start = end
        end = Math.min(last, start + count - 1)
      }
      const removed: Register = { type: 'line', lines: vim.lines.slice(start, end + 1) }
      vim.storeRegister(reg, removed, full === 'delete')
      if (full === 'delete') {
        vim.mutate()
        deleteLines(vim.lines, start, end)
        const ln = Math.min(start, vim.lines.length - 1)
        vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
        const n = end - start + 1
        if (n > 2) vim.setMessage(`${n} fewer lines`)
      } else {
        vim.cursor = { line: start, col: firstNonBlank(vim.lines[start]) }
        const n = end - start + 1
        if (n > 2) vim.setMessage(`${n} lines yanked`)
      }
      return
    }
    case 'move':
    case 't':
    case 'copy': {
      const a = parseAddress(vim, args.trim(), 0)
      if (!a.ok) return
      if (a.line === null) {
        vim.setMessage('E14: Invalid address', true)
        return
      }
      const dest = Math.max(-1, Math.min(last, a.line))
      const start = clampedStart
      const end = lineRange.end
      const count = end - start + 1
      const block = vim.lines.slice(start, end + 1)
      if (full === 'move') {
        if (dest >= start && dest <= end) {
          if (dest === end) return
          vim.setMessage('E134: Cannot move a range of lines into itself', true)
          return
        }
        vim.mutate()
        vim.lines.splice(start, count)
        const insertAt = dest >= end ? dest - count + 1 : dest + 1
        insertLines(vim.lines, insertAt, block)
        const ln = insertAt + count - 1
        vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
        if (count > 2) vim.setMessage(`${count} lines moved`)
      } else {
        vim.mutate()
        insertLines(vim.lines, dest + 1, block)
        const ln = dest + count
        vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
      }
      return
    }
    case 'join': {
      const cm = /^\s*(\d+)?/.exec(args)
      let start = clampedStart
      let end = lineRange.end
      if (cm?.[1]) {
        start = end
        end = start + Number(cm[1]) - 1
      } else if (!range || start === end) end = start + 1
      end = Math.min(last, end)
      vim.joinLines(start, end, !bang)
      return
    }
    case '>':
    case '<':
    case '>>':
    case '<<':
    case '>>>':
    case '<<<': {
      const times = name.length
      const extra = /^\s*(\d+)/.exec(args)
      let start = clampedStart
      let end = lineRange.end
      if (extra) {
        start = end
        end = Math.min(last, start + Number(extra[1]) - 1)
      }
      vim.mutate()
      vim.shiftLines(start, end, name[0] === '>' ? 1 : -1, times)
      vim.cursor = { line: end, col: firstNonBlank(vim.lines[end]) }
      return
    }
    case 'normal': {
      const keys = [...args.replace(/^\s/, '')].map((c) => (c === ' ' ? '<Space>' : c))
      if (keys.length === 0) return
      if (range) {
        const origLen = vim.lines.length
        for (let l = clampedStart; l <= lineRange.end; l++) {
          const idx = l + (vim.lines.length - origLen)
          if (idx < 0 || idx >= vim.lines.length) break
          vim.cursor = { line: idx, col: 0 }
          runNormalKeys(vim, keys)
        }
      } else runNormalKeys(vim, keys)
      return
    }
    case 'sort': {
      const flags = args.trim()
      const start = range ? clampedStart : 0
      const end = range ? lineRange.end : last
      const slice = vim.lines.slice(start, end + 1)
      const numeric = flags.includes('n')
      const icase = flags.includes('i')
      const keyOf = (s: string): string | number => {
        if (numeric) {
          const m = /-?\d+/.exec(s)
          return m ? Number(m[0]) : -Infinity
        }
        return icase ? s.toLowerCase() : s
      }
      slice.sort((a, b) => {
        const ka = keyOf(a)
        const kb = keyOf(b)
        if (ka < kb) return -1
        if (ka > kb) return 1
        return 0
      })
      if (bang) slice.reverse()
      let out = slice
      if (flags.includes('u')) {
        out = []
        for (const l of slice) {
          const prev = out[out.length - 1]
          if (prev === undefined || keyOf(prev) !== keyOf(l)) out.push(l)
        }
      }
      vim.mutate()
      vim.lines.splice(start, end - start + 1, ...out)
      vim.cursor = { line: start, col: 0 }
      return
    }
    case 'nohlsearch':
      vim.hlsearch = false
      return
    case 'write':
    case 'update':
    case 'wall':
      vim.events.push({ type: 'write' })
      vim.setMessage(`"buffer" ${vim.lines.length}L written`)
      return
    case 'wq':
    case 'xit':
    case 'exit':
    case 'wqall':
    case 'xall':
      vim.events.push({ type: 'write' }, { type: 'quit' })
      vim.setMessage(`"buffer" ${vim.lines.length}L written`)
      return
    case 'quit':
    case 'qall':
      vim.events.push({ type: 'quit' })
      return
    case 'undo':
      vim.undo(1)
      return
    case 'redo':
      vim.redo(1)
      return
    case 'put': {
      const regName = args.trim() || undefined
      const reg = vim.getRegister(regName)
      if (!reg) {
        vim.setMessage(`E353: Nothing in register ${regName ?? '"'}`, true)
        return
      }
      const linesToPut = reg.type === 'block' ? reg.lines : reg.lines
      const at = bang ? Math.max(0, lineRange.end) : lineRange.end + 1
      vim.mutate()
      insertLines(vim.lines, at, linesToPut)
      const ln = at + linesToPut.length - 1
      vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
      return
    }
    case 'set':
    case 'setlocal':
      exSet(vim, args)
      return
    case 'print':
    case 'number':
    case '#':
    case '=': {
      const ln = Math.max(0, Math.min(last, lineRange.end))
      vim.cursor = { line: ln, col: firstNonBlank(vim.lines[ln]) }
      if (full === '=') vim.setMessage(String(lineRange.end + 1))
      return
    }
    case 'registers':
    case 'display':
    case 'marks':
    case 'help':
    case 'echo':
    case 'let':
    case 'nnoremap':
      vim.setMessage(`:${name} is not available in this trainer`)
      return
    case 'edit':
      vim.setMessage('Use the Restart button to reload the task', true)
      return
    case 'retab':
    case 'center':
    case 'left':
    case 'right':
      vim.setMessage(`:${full} is not supported here`, true)
      return
    default:
      vim.setMessage(`E492: Not an editor command: ${text}`, true)
  }
}

function runNormalKeys(vim: Vim, keys: string[]): void {
  vim.pending = []
  vim.runKeys(keys)
  let guard = 0
  while (vim.mode !== 'normal' && guard++ < 3) vim.runKeys(['<Esc>'])
  vim.pending = []
}

function exSubstitute(vim: Vim, range: LineRange, args: string): void {
  let pattern: string
  let replacement: string
  let flags: string
  let a = args
  const keepFlags = a.startsWith('&&')
  if (a.startsWith('&')) {
    const ls = vim.lastSubstitute
    if (!ls) {
      vim.setMessage('E35: No previous regular expression', true)
      return
    }
    pattern = ls.pattern
    replacement = ls.replacement
    a = a.replace(/^&&?/, '')
    flags = (keepFlags ? ls.flags : '') + a.trim()
  } else if (a === '' || /^[\s]*$/.test(a)) {
    const ls = vim.lastSubstitute
    if (!ls) {
      vim.setMessage('E35: No previous regular expression', true)
      return
    }
    pattern = ls.pattern
    replacement = ls.replacement
    flags = ''
  } else {
    const delim = a[0]
    if (/[a-zA-Z0-9\s\\"|]/.test(delim)) {
      vim.setMessage(`E146: Regular expressions can't be delimited by letters`, true)
      return
    }
    const p = readPatternUntil(a, 1, delim)
    pattern = p.pattern
    const r = readPatternUntil(a, p.next, delim)
    replacement = p.next <= a.length ? r.pattern : ''
    flags = a.slice(r.next).trim()
    if (pattern === '') {
      const prev = vim.search?.pattern
      if (!prev) {
        vim.setMessage('E35: No previous regular expression', true)
        return
      }
      pattern = prev
    }
    if (replacement === '~' && vim.lastSubstitute) replacement = vim.lastSubstitute.replacement
  }
  const flagLetters = flags.replace(/[^a-zA-Z&]/g, '')
  vim.lastSubstitute = { pattern, replacement, flags: flagLetters.replace('&', '') }
  vim.search = { pattern, forward: true }
  vim.hlsearch = true

  let effPattern = pattern
  if (flagLetters.includes('i')) effPattern = '\\c' + effPattern
  else if (flagLetters.includes('I')) effPattern = '\\C' + effPattern
  const re = vim.compilePattern(effPattern)
  if (!re) {
    vim.setMessage(`E383: Invalid search string: ${pattern}`, true)
    return
  }
  const replacer = compileReplacement(replacement)
  const global = flagLetters.includes('g')
  let total = 0
  let linesChanged = 0
  let lastLine = -1
  let offset = 0
  let mutated = false
  const start = Math.max(0, range.start)
  for (let l0 = start; l0 <= range.end; l0++) {
    const l = l0 + offset
    const line = vim.lines[l]
    const ms = matchesOnLine(line, re)
    if (ms.length === 0) continue
    re.lastIndex = 0
    let out = ''
    let pos = 0
    let n = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      out += line.slice(pos, m.index) + replacer(m)
      pos = m.index + m[0].length
      n++
      if (m[0].length === 0) {
        if (pos < line.length) out += line[pos]
        pos++
        re.lastIndex = pos
      }
      if (!global) break
    }
    out += line.slice(pos)
    if (!mutated) {
      vim.mutate()
      mutated = true
    }
    const newLines = out.split('\n')
    vim.lines.splice(l, 1, ...newLines)
    offset += newLines.length - 1
    total += n
    linesChanged++
    lastLine = l + newLines.length - 1
  }
  if (total === 0) {
    if (!flagLetters.includes('e')) vim.setMessage(`E486: Pattern not found: ${pattern}`, true)
    return
  }
  vim.cursor = { line: lastLine, col: firstNonBlank(vim.lines[lastLine]) }
  if (linesChanged > 2) {
    vim.setMessage(`${total} substitution${total === 1 ? '' : 's'} on ${linesChanged} lines`)
  }
}

function exGlobal(vim: Vim, range: LineRange, args: string, invert: boolean): void {
  const a = args
  if (a.length === 0) {
    vim.setMessage('E35: No previous regular expression', true)
    return
  }
  const delim = a[0]
  const p = readPatternUntil(a, 1, delim)
  const pattern = p.pattern || vim.search?.pattern
  if (!pattern) {
    vim.setMessage('E35: No previous regular expression', true)
    return
  }
  const cmd = a.slice(p.next).trim() || 'p'
  const re = vim.compilePattern(pattern)
  if (!re) {
    vim.setMessage(`E383: Invalid search string: ${pattern}`, true)
    return
  }
  vim.search = { pattern, forward: true }
  vim.hlsearch = true
  const marked: number[] = []
  for (let l = Math.max(0, range.start); l <= range.end; l++) {
    re.lastIndex = 0
    const hit = re.test(vim.lines[l])
    if (hit !== invert) marked.push(l)
  }
  if (marked.length === 0) {
    vim.setMessage(`E486: Pattern not found: ${pattern}`, true)
    return
  }
  const origLen = vim.lines.length
  for (const idx of marked) {
    const cur = idx + (vim.lines.length - origLen)
    if (cur < 0 || cur >= vim.lines.length) continue
    vim.cursor = { line: cur, col: 0 }
    executeEx(vim, cmd)
  }
}

const OPTION_ALIASES: Record<string, keyof typeof OPTION_TYPES> = {
  ic: 'ignorecase',
  ignorecase: 'ignorecase',
  scs: 'smartcase',
  smartcase: 'smartcase',
  sw: 'shiftwidth',
  shiftwidth: 'shiftwidth',
  ts: 'tabstop',
  tabstop: 'tabstop',
  et: 'expandtab',
  expandtab: 'expandtab',
  ai: 'autoindent',
  autoindent: 'autoindent',
  hls: 'hlsearch',
  hlsearch: 'hlsearch',
  nu: 'number',
  number: 'number',
  rnu: 'relativenumber',
  relativenumber: 'relativenumber',
  ws: 'wrapscan',
  wrapscan: 'wrapscan',
  sol: 'startofline',
  startofline: 'startofline',
}

const OPTION_TYPES = {
  ignorecase: 'bool',
  smartcase: 'bool',
  shiftwidth: 'num',
  tabstop: 'num',
  expandtab: 'bool',
  autoindent: 'bool',
  hlsearch: 'bool',
  number: 'bool',
  relativenumber: 'bool',
  wrapscan: 'bool',
  startofline: 'bool',
} as const

function exSet(vim: Vim, args: string): void {
  for (const tok of args.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(no|inv)?([a-z]+)(?:([!?])|=(.+))?$/.exec(tok)
    if (!m) {
      vim.setMessage(`E518: Unknown option: ${tok}`, true)
      continue
    }
    const [, prefix, rawName, suffix, value] = m
    const name = OPTION_ALIASES[rawName]
    if (!name) {
      vim.setMessage(`E518: Unknown option: ${rawName}`, true)
      continue
    }
    const type = OPTION_TYPES[name]
    const opts = vim.options as unknown as Record<string, boolean | number>
    if (type === 'bool') {
      if (suffix === '?') vim.setMessage(`${opts[name] ? '  ' : 'no'}${name}`)
      else if (prefix === 'inv' || suffix === '!') opts[name] = !opts[name]
      else opts[name] = prefix !== 'no'
    } else {
      if (value === undefined || suffix === '?') vim.setMessage(`  ${name}=${opts[name]}`)
      else if (/^\d+$/.test(value)) opts[name] = Number(value)
      else vim.setMessage(`E521: Number required after =: ${tok}`, true)
    }
    if (name === 'hlsearch') vim.hlsearch = !!opts[name] && !!vim.search
  }
}
