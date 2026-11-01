/**
 * Translation of Vim regular expressions (magic mode) into JavaScript RegExp,
 * plus a compiler for :s replacement strings.
 */

const JS_SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '/'])

function esc(c: string): string {
  return JS_SPECIAL.has(c) ? '\\' + c : c
}

export interface CompiledPattern {
  regex: RegExp
  /** Pattern was explicitly case-insensitive (\c) or via options */
  ignoreCase: boolean
}

export interface PatternOptions {
  ignorecase: boolean
  smartcase: boolean
}

/**
 * Convert a Vim pattern to a RegExp with the global flag.
 * Returns null when the pattern cannot be compiled.
 */
export function vimPatternToRegExp(pattern: string, opts: PatternOptions): RegExp | null {
  let out = ''
  let i = 0
  let forceIgnore: boolean | null = null
  let veryMagic = false
  let zsIndex = -1
  let zeIndex = -1
  let hasUpper = false
  const n = pattern.length
  let atStart = true // for '^'

  const pushGroupOpen = () => {
    out += '('
    atStart = true
  }

  while (i < n) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < n) {
      const d = pattern[i + 1]
      i += 2
      switch (d) {
        case '<':
          out += '\\b(?=\\w)'
          break
        case '>':
          out += '(?<=\\w)\\b'
          break
        case '(':
          pushGroupOpen()
          continue
        case ')':
          out += ')'
          break
        case '|':
          out += '|'
          atStart = true
          continue
        case '+':
          out += '+'
          break
        case '?':
        case '=':
          out += '?'
          break
        case '{': {
          const close = pattern.indexOf('}', i)
          if (close === -1) {
            out += '\\{'
            break
          }
          let body = pattern.slice(i, close)
          i = close + 1
          if (body.endsWith('\\')) body = body.slice(0, -1)
          if (body === '-') out += '*?'
          else if (body.startsWith('-')) out += `{${body.slice(1)}}?`
          else out += `{${body}}`
          break
        }
        case 'c':
          forceIgnore = true
          break
        case 'C':
          forceIgnore = false
          break
        case 'v':
          veryMagic = true
          break
        case 'm':
        case 'M':
        case 'V':
          veryMagic = false
          break
        case 'z':
          if (pattern[i] === 's') {
            zsIndex = out.length
            i++
          } else if (pattern[i] === 'e') {
            zeIndex = out.length
            i++
          } else {
            out += 'z'
          }
          break
        case 'n':
          out += '\\n'
          break
        case 't':
          out += '\\t'
          break
        case 'e':
          out += '\\x1b'
          break
        case 'r':
          out += '\\r'
          break
        case 'd':
        case 'D':
        case 's':
        case 'S':
        case 'w':
        case 'W':
          out += '\\' + d
          break
        case 'a':
          out += '[A-Za-z]'
          break
        case 'A':
          out += '[^A-Za-z]'
          break
        case 'l':
          out += '[a-z]'
          break
        case 'L':
          out += '[^a-z]'
          break
        case 'u':
          out += '[A-Z]'
          break
        case 'U':
          out += '[^A-Z]'
          break
        case 'h':
          out += '[A-Za-z_]'
          break
        case 'k':
        case 'i':
          out += '\\w'
          break
        case 'x':
          out += '[0-9A-Fa-f]'
          break
        case 'o':
          out += '[0-7]'
          break
        case '_':
          if (pattern[i] === '.') {
            out += '[\\s\\S]'
            i++
          } else if (pattern[i] === 's') {
            out += '\\s'
            i++
          } else {
            out += '\\n'
          }
          break
        case '%':
          if (pattern[i] === '(') {
            out += '(?:'
            i++
            atStart = true
            continue
          }
          out += esc('%')
          break
        default:
          out += esc(d)
      }
      atStart = false
      continue
    }

    if (c === '[') {
      // character class: copy verbatim until closing ]
      let j = i + 1
      if (pattern[j] === '^') j++
      if (pattern[j] === ']') j++
      while (j < n && pattern[j] !== ']') {
        if (pattern[j] === '\\') j++
        j++
      }
      if (j < n) {
        out += pattern.slice(i, j + 1)
        i = j + 1
      } else {
        out += '\\['
        i++
      }
      atStart = false
      continue
    }

    if (veryMagic) {
      if (c === '<') {
        out += '\\b(?=\\w)'
      } else if (c === '>') {
        out += '(?<=\\w)\\b'
      } else if (c === '(') {
        pushGroupOpen()
        i++
        continue
      } else if (c === '|') {
        out += '|'
        atStart = true
        i++
        continue
      } else if ('){}+?='.includes(c)) {
        out += c === '=' ? '?' : c
      } else if (c === '^') {
        out += atStart ? '^' : '\\^'
      } else if (c === '$') {
        out += i === n - 1 ? '$' : '\\$'
      } else {
        if (c !== c.toLowerCase()) hasUpper = true
        out += c === '.' || c === '*' ? c : esc(c)
      }
      i++
      atStart = false
      continue
    }

    switch (c) {
      case '^':
        out += atStart ? '^' : '\\^'
        break
      case '$': {
        const next = pattern.slice(i + 1, i + 3)
        out += i === n - 1 || next === '\\|' || next === '\\)' ? '$' : '\\$'
        break
      }
      case '*':
        out += atStart ? '\\*' : '*'
        break
      case '.':
        out += '.'
        break
      case '~':
        out += '~'
        break
      default:
        if (c !== c.toLowerCase()) hasUpper = true
        out += esc(c)
    }
    i++
    atStart = false
  }

  if (zsIndex >= 0 || zeIndex >= 0) {
    const start = zsIndex >= 0 ? zsIndex : 0
    const end = zeIndex >= 0 ? zeIndex : out.length
    const pre = out.slice(0, start)
    const mid = out.slice(start, end)
    const post = out.slice(end)
    out = (pre ? `(?<=${pre})` : '') + mid + (post ? `(?=${post})` : '')
  }

  let ignore: boolean
  if (forceIgnore !== null) ignore = forceIgnore
  else if (opts.ignorecase) ignore = opts.smartcase ? !hasUpper : true
  else ignore = false

  try {
    return new RegExp(out, ignore ? 'gi' : 'g')
  } catch {
    return null
  }
}

/** Escape a literal string so it can be used as a Vim pattern. */
export function escapeVimPattern(s: string): string {
  return s.replace(/[\\/.*$^~[\]]/g, (m) => '\\' + m)
}

type RepToken =
  | { kind: 'lit'; text: string }
  | { kind: 'group'; n: number }
  | { kind: 'case'; op: 'u' | 'l' | 'U' | 'L' | 'E' }

export type Replacer = (match: RegExpExecArray) => string

/** Compile a Vim :s replacement string into a function. */
export function compileReplacement(rep: string): Replacer {
  const tokens: RepToken[] = []
  let lit = ''
  const flush = () => {
    if (lit) tokens.push({ kind: 'lit', text: lit })
    lit = ''
  }
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i]
    if (c === '\\' && i + 1 < rep.length) {
      const d = rep[++i]
      if (/[0-9]/.test(d)) {
        flush()
        tokens.push({ kind: 'group', n: Number(d) })
      } else if (d === 'r' || d === 'n') lit += '\n'
      else if (d === 't') lit += '\t'
      else if ('ulULeE'.includes(d)) {
        flush()
        tokens.push({ kind: 'case', op: (d === 'e' ? 'E' : d) as 'u' | 'l' | 'U' | 'L' | 'E' })
      } else lit += d
    } else if (c === '&') {
      flush()
      tokens.push({ kind: 'group', n: 0 })
    } else {
      lit += c
    }
  }
  flush()

  return (m) => {
    let out = ''
    let oneShot: 'u' | 'l' | null = null
    let sustained: 'U' | 'L' | null = null
    const emit = (text: string) => {
      for (const ch of text) {
        let t = ch
        if (sustained === 'U') t = t.toUpperCase()
        else if (sustained === 'L') t = t.toLowerCase()
        if (oneShot === 'u') t = t.toUpperCase()
        else if (oneShot === 'l') t = t.toLowerCase()
        oneShot = null
        out += t
      }
    }
    for (const tok of tokens) {
      if (tok.kind === 'lit') emit(tok.text)
      else if (tok.kind === 'group') emit(m[tok.n] ?? '')
      else if (tok.op === 'u' || tok.op === 'l') oneShot = tok.op
      else if (tok.op === 'E') sustained = null
      else sustained = tok.op
    }
    return out
  }
}
