import {
  DEFAULT_OPTIONS,
  type CmdlineState,
  type CommandKind,
  type Mode,
  type Pos,
  type Register,
  type SearchState,
  type Snapshot,
  type VimEvent,
  type VimOptions,
  type VimView,
  type VisualState,
} from './types'
import { normalizeKey, parseKeys, keysToString } from './keys'
import {
  charClass,
  clonePos,
  comparePos,
  firstNonBlank,
  indentOf,
  indentWidth,
  inIndent,
  isBlank,
  makeIndent,
  posEq,
  toggleCase,
} from './text'
import { deleteLines, deleteRange, insertLines, insertText } from './buffer'
import {
  bckEndWord,
  bckWord,

  decl,
  endWord,
  findCharOnLine,
  fwdWord,
  incl,
  matchPair,
  paragraphBackward,
  paragraphForward,
  searchBackward,
  searchForward,
  sentenceBackward,
  sentenceForward,
  wordUnderCursor,
  type MotionResult,
} from './motions'
import { textObject, type TextObjectRange } from './textobjects'
import { parseCommand, type ParsedCommand, type ParsedMotion } from './parser'
import { escapeVimPattern, vimPatternToRegExp } from './regex'
import { executeEx } from './ex'

export interface Region {
  start: Pos
  /** exclusive end for charwise regions; for linewise, end.line is the last line */
  end: Pos
  linewise: boolean
  block?: { left: number; right: number; toEol: boolean }
}

interface VisualRepeat {
  mode: Mode
  lines: number
  cols: number
  endCol: number
  toEol: boolean
}

interface LastChange {
  keys: string[]
  count?: number
  visual?: VisualRepeat
}

interface InsertSession {
  kind: string
  count: number
  keys: string[]
  enteredWith: string[]
  countless: string[]
  enterCount?: number
  startPos: Pos
  origLine: string
  origLineCount: number
  typed: string
  simple: boolean
  ctrlO: boolean
  ctrlOAtEnd: boolean
  ctrlOPos: Pos | null
  pendingCtrlR: boolean
  changedBefore: boolean
  autoIndented: { line: number; indent: string } | null
  block: { startLine: number; endLine: number; col: number; append: boolean; toEol: boolean } | null
  visualRepeat?: VisualRepeat
}

interface CmdlinePending {
  cmd: ParsedCommand
  fromMode: Mode
}

const JUMP_MOTIONS = new Set(['G', 'gg', '%', '{', '}', '(', ')', 'n', 'N', '*', '#', 'g*', 'g#', "'", '`', 'H', 'M', 'L'])
const MAX_UNDO = 200

export class Vim {
  lines: string[]
  cursor: Pos = { line: 0, col: 0 }
  desiredCol = 0
  mode: Mode = 'normal'
  visual: VisualState | null = null
  lastVisual: { mode: Mode; anchor: Pos; cursor: Pos; toEol: boolean } | null = null
  cmdline: CmdlineState | null = null
  pending: string[] = []
  registers = new Map<string, Register>()
  undoStack: Snapshot[] = []
  redoStack: Snapshot[] = []
  marks = new Map<string, Pos>()
  search: SearchState | null = null
  hlsearch = false
  lastFind: { ch: string; cmd: 'f' | 'F' | 't' | 'T' } | null = null
  lastChange: LastChange | null = null
  lastSubstitute: { pattern: string; replacement: string; flags: string } | null = null
  lastEx: string | null = null
  recording: { reg: string; keys: string[] } | null = null
  lastMacro: string | null = null
  message: string | null = null
  messageIsError = false
  options: VimOptions
  insert: InsertSession | null = null
  events: VimEvent[] = []
  changeTick = 0

  private cmdlinePending: CmdlinePending | null = null
  private depth = 0
  private snapshotTaken = false
  private undoGrouping = false
  private dotReplaying = false
  private keepDesired = false
  private visualRepeat: VisualRepeat | null = null
  private abortMacro = false

  constructor(text = '', cursor: Pos = { line: 0, col: 0 }, options: Partial<VimOptions> = {}) {
    this.lines = text.split('\n')
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.cursor = clonePos(cursor)
    this.clampCursor()
    this.desiredCol = this.cursor.col
  }

  // ------------------------------------------------------------------ public API

  get text(): string {
    return this.lines.join('\n')
  }

  /** Replace buffer content (used for restarting a lesson / playground). */
  setText(text: string, cursor: Pos = { line: 0, col: 0 }): void {
    this.lines = text.split('\n')
    this.cursor = clonePos(cursor)
    this.mode = 'normal'
    this.visual = null
    this.cmdline = null
    this.pending = []
    this.insert = null
    this.undoStack = []
    this.redoStack = []
    this.marks.clear()
    this.message = null
    this.clampCursor()
    this.desiredCol = this.cursor.col
  }

  view(): VimView {
    return {
      lines: this.lines,
      cursor: this.cursor,
      mode: this.mode,
      visual: this.visual,
      cmdline: this.cmdline,
      pendingKeys: this.pending,
      message: this.message,
      messageIsError: this.messageIsError,
      recording: this.recording?.reg ?? null,
      search: this.search,
      hlsearch: this.hlsearch,
      options: this.options,
    }
  }

  /** Feed one key (Vim notation). Returns the events produced. */
  feedKey(rawKey: string): VimEvent[] {
    const key = normalizeKey(rawKey)
    const top = this.depth === 0
    if (top) {
      this.events = []
      if (this.recording) this.recording.keys.push(key)
    }
    this.handleKey(key)
    return top ? this.events : []
  }

  /** Feed a sequence of keys written in Vim notation, e.g. 'ci"foo<Esc>'. */
  feedKeys(notation: string): VimEvent[] {
    const all: VimEvent[] = []
    for (const k of parseKeys(notation)) all.push(...this.feedKey(k))
    return all
  }

  /** Compile a Vim pattern using current options. */
  compilePattern(pattern: string): RegExp | null {
    return vimPatternToRegExp(pattern, {
      ignorecase: this.options.ignorecase,
      smartcase: this.options.smartcase,
    })
  }

  setMessage(text: string, error = false): void {
    this.message = text
    this.messageIsError = error
    this.events.push({ type: 'message', text, error })
  }

  // ------------------------------------------------------------------ key dispatch

  private handleKey(key: string): void {
    switch (this.mode) {
      case 'insert':
      case 'replace':
        this.handleInsertKey(key)
        break
      case 'cmdline':
        this.handleCmdlineKey(key)
        break
      default:
        this.handleNormalKey(key)
    }
  }

  private handleNormalKey(key: string): void {
    this.pending.push(key)
    const res = parseCommand(this.pending, this.mode, !!this.recording)
    if (res.status === 'incomplete') return
    const keys = this.pending
    this.pending = []
    if (res.status === 'invalid') {
      if (this.depth > 0) this.abortMacro = true
      if (this.depth === 0) this.events.push({ type: 'invalid', keys, mode: this.mode })
      if (this.insert?.ctrlO) this.returnFromCtrlO()
      return
    }
    this.executeCommand(res.cmd)
  }

  private beginCommand(): void {
    if (!this.undoGrouping) this.snapshotTaken = false
    this.keepDesired = false
    this.visualRepeat = null
  }

  private executeCommand(cmd: ParsedCommand): void {
    const modeBefore = this.mode
    const tick = this.changeTick
    this.beginCommand()
    if (cmd.name !== ':' && cmd.name !== '/' && cmd.name !== '?') this.message = null
    const count = cmd.count ?? 1
    const hasCount = cmd.count !== undefined
    let kind: CommandKind = 'other'
    switch (cmd.type) {
      case 'motion':
        kind = 'motion'
        this.doMotionCommand(cmd, count, hasCount)
        break
      case 'search':
        kind = 'search'
        this.enterCmdline(cmd.searchDir!, cmd)
        break
      case 'operator':
        kind = 'operator'
        this.doOperatorCommand(cmd, count, hasCount)
        break
      case 'operator-line':
        kind = 'operator'
        this.doOperatorLine(cmd, count)
        break
      case 'operator-search':
        kind = 'operator'
        this.enterCmdline(cmd.searchDir!, cmd)
        break
      case 'action':
        kind = modeBefore.startsWith('visual')
          ? this.doVisualAction(cmd, count, hasCount)
          : this.doNormalAction(cmd, count, hasCount)
        break
    }
    this.afterCommand(cmd, modeBefore, kind, this.changeTick !== tick)
  }

  private afterCommand(cmd: ParsedCommand, modeBefore: Mode, kind: CommandKind, changed: boolean): void {
    if (this.mode === 'normal' || this.mode.startsWith('visual')) this.clampCursor()
    if (!this.keepDesired) this.desiredCol = this.cursor.col
    if (this.depth === 0) {
      this.events.push({
        type: 'command',
        keys: cmd.keys,
        name: cmd.name,
        kind,
        count: cmd.count ?? 1,
        hasCount: cmd.count !== undefined,
        register: cmd.register,
        mode: modeBefore,
        changed,
      })
    }
    const inInsert = this.mode === 'insert' || this.mode === 'replace'
    const excluded = new Set(['.', 'u', '<C-r>', '@', 'q', ':', 'U'])
    if (changed && !inInsert && !this.dotReplaying && !excluded.has(cmd.name) && !(this.insert?.ctrlO)) {
      this.lastChange = { keys: cmd.countless, count: cmd.count, visual: this.visualRepeat ?? undefined }
    }
    if (this.insert?.ctrlO && this.mode === 'normal') this.returnFromCtrlO()
  }

  private returnFromCtrlO(): void {
    const s = this.insert!
    s.ctrlO = false
    this.mode = s.kind === 'R' ? 'replace' : 'insert'
    const unmoved = s.ctrlOPos !== null && posEq(s.ctrlOPos, this.cursor)
    if ((s.ctrlOAtEnd && unmoved) || this.desiredCol === Infinity) {
      this.cursor.col = this.lines[this.cursor.line].length
    }
    s.ctrlOAtEnd = false
    s.ctrlOPos = null
  }

  // ------------------------------------------------------------------ undo / change tracking

  /** Call before mutating the buffer from normal/visual/cmdline mode. */
  mutate(): void {
    this.changeTick++
    if (this.mode === 'insert' || this.mode === 'replace') return
    this.ensureSnapshot()
  }

  private ensureSnapshot(): void {
    if (this.snapshotTaken) return
    this.snapshotTaken = true
    this.undoStack.push({ lines: [...this.lines], cursor: clonePos(this.cursor) })
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
    this.redoStack = []
  }

  undo(count: number): void {
    for (let i = 0; i < count; i++) {
      const snap = this.undoStack.pop()
      if (!snap) {
        this.setMessage('Already at oldest change', true)
        return
      }
      this.redoStack.push({ lines: [...this.lines], cursor: clonePos(this.cursor) })
      this.lines = snap.lines
      this.cursor = clonePos(snap.cursor)
      this.changeTick++
    }
    this.clampCursor()
  }

  redo(count: number): void {
    for (let i = 0; i < count; i++) {
      const snap = this.redoStack.pop()
      if (!snap) {
        this.setMessage('Already at newest change', true)
        return
      }
      this.undoStack.push({ lines: [...this.lines], cursor: clonePos(this.cursor) })
      this.lines = snap.lines
      this.cursor = clonePos(snap.cursor)
      this.changeTick++
    }
    this.clampCursor()
  }

  clampCursor(): void {
    if (this.lines.length === 0) this.lines.push('')
    this.cursor.line = Math.max(0, Math.min(this.cursor.line, this.lines.length - 1))
    const len = this.lines[this.cursor.line].length
    const max = this.mode === 'insert' || this.mode === 'replace' ? len : Math.max(0, len - 1)
    this.cursor.col = Math.max(0, Math.min(this.cursor.col, max))
  }

  // ------------------------------------------------------------------ registers

  private regName(name: string | undefined): string {
    if (!name || name === '"' || name === '+' || name === '*') return '"'
    return name
  }

  getRegister(name: string | undefined): Register | null {
    const n = this.regName(name)
    if (n === '_') return null
    if (n === '/') return this.search ? { type: 'char', lines: [this.search.pattern] } : null
    if (n === ':') return this.lastEx !== null ? { type: 'char', lines: [this.lastEx] } : null
    const key = /^[A-Z]$/.test(n) ? n.toLowerCase() : n
    const r = this.registers.get(key)
    return r ? { type: r.type, lines: [...r.lines] } : null
  }

  storeRegister(name: string | undefined, reg: Register, isDelete: boolean): void {
    const n = this.regName(name)
    if (n === '_') return
    if (n !== '"') {
      if (/^[A-Z]$/.test(n)) {
        const key = n.toLowerCase()
        const prev = this.registers.get(key)
        if (prev) {
          if (prev.type === 'line' || reg.type === 'line') {
            this.registers.set(key, { type: 'line', lines: [...prev.lines, ...reg.lines] })
          } else {
            const joined = [...prev.lines]
            joined[joined.length - 1] += reg.lines[0]
            joined.push(...reg.lines.slice(1))
            this.registers.set(key, { type: prev.type, lines: joined })
          }
        } else this.registers.set(key, reg)
        this.registers.set('"', this.registers.get(key)!)
      } else {
        this.registers.set(n, reg)
        this.registers.set('"', reg)
      }
      return
    }
    this.registers.set('"', reg)
    if (isDelete) {
      if (reg.type === 'line' || reg.lines.length > 1) {
        for (let i = 9; i > 1; i--) {
          const prev = this.registers.get(String(i - 1))
          if (prev) this.registers.set(String(i), prev)
        }
        this.registers.set('1', reg)
      } else this.registers.set('-', reg)
    } else this.registers.set('0', reg)
  }

  // ------------------------------------------------------------------ motions

  private computeMotion(m: ParsedMotion, count: number, hasCount: boolean, op?: string): MotionResult {
    const { lines, cursor } = this
    const line = lines[cursor.line]
    const last = lines.length - 1
    const at = (l: number, c: number): Pos => ({ line: l, col: c })
    const lineTo = (l: number): MotionResult => {
      const ln = Math.max(0, Math.min(last, l))
      const col = this.options.startofline ? firstNonBlank(lines[ln]) : Math.min(this.desiredColFor(ln), 1e9)
      return { pos: at(ln, col), linewise: true, keepDesiredCol: !this.options.startofline }
    }
    switch (m.key) {
      case 'h':
      case '<Left>': {
        if (cursor.col === 0) return { pos: cursor, fail: true }
        return { pos: at(cursor.line, Math.max(0, cursor.col - count)) }
      }
      case 'l':
      case '<Right>': {
        if (op) return { pos: at(cursor.line, Math.min(line.length, cursor.col + count)) }
        if (cursor.col >= line.length - 1) return { pos: cursor, fail: true }
        return { pos: at(cursor.line, Math.min(line.length - 1, cursor.col + count)) }
      }
      case '<BS>': {
        const p = clonePos(cursor)
        for (let i = 0; i < count; i++) if (decl(lines, p) === -1) break
        return { pos: p, fail: posEq(p, cursor) }
      }
      case '<Space>': {
        const p = clonePos(cursor)
        for (let i = 0; i < count; i++) if (incl(lines, p) === -1) break
        if (p.col >= lines[p.line].length && !op) p.col = Math.max(0, lines[p.line].length - 1)
        return { pos: p, fail: posEq(p, cursor) }
      }
      case 'j':
      case '<Down>':
      case 'gj': {
        if (cursor.line === last) return { pos: cursor, fail: true }
        const ln = Math.min(last, cursor.line + count)
        return { pos: at(ln, this.desiredColFor(ln)), linewise: true, keepDesiredCol: true }
      }
      case 'k':
      case '<Up>':
      case 'gk': {
        if (cursor.line === 0) return { pos: cursor, fail: true }
        const ln = Math.max(0, cursor.line - count)
        return { pos: at(ln, this.desiredColFor(ln)), linewise: true, keepDesiredCol: true }
      }
      case 'w':
      case 'W': {
        const big = m.key === 'W'
        if (op === 'c' && !isBlank(line[cursor.col]) && line.length > 0) {
          const r = endWord(lines, cursor, count, big, true)
          return { pos: r.pos, inclusive: true }
        }
        const r = fwdWord(lines, cursor, count, big, !!op)
        if (!op && r.pos.col >= lines[r.pos.line].length) r.pos.col = Math.max(0, lines[r.pos.line].length - 1)
        return { pos: r.pos, fail: r.fail && posEq(r.pos, cursor) }
      }
      case 'b':
      case 'B': {
        const r = bckWord(lines, cursor, count, m.key === 'B')
        return { pos: r.pos, fail: r.fail && posEq(r.pos, cursor) }
      }
      case 'e':
      case 'E': {
        const r = endWord(lines, cursor, count, m.key === 'E')
        if (r.pos.col >= lines[r.pos.line].length) r.pos.col = Math.max(0, lines[r.pos.line].length - 1)
        return { pos: r.pos, inclusive: true, fail: r.fail && posEq(r.pos, cursor) }
      }
      case 'ge':
      case 'gE': {
        const r = bckEndWord(lines, cursor, count, m.key === 'gE')
        if (r.pos.col >= lines[r.pos.line].length) r.pos.col = Math.max(0, lines[r.pos.line].length - 1)
        return { pos: r.pos, inclusive: true, fail: r.fail && posEq(r.pos, cursor) }
      }
      case '0':
      case '<Home>':
        return { pos: at(cursor.line, 0) }
      case '^':
        return { pos: at(cursor.line, firstNonBlank(line)) }
      case '$':
      case '<End>': {
        const ln = Math.min(last, cursor.line + count - 1)
        return { pos: at(ln, Math.max(0, lines[ln].length - 1)), inclusive: true, toEol: true }
      }
      case 'g_': {
        const ln = Math.min(last, cursor.line + count - 1)
        const t = lines[ln].replace(/\s+$/, '')
        return { pos: at(ln, Math.max(0, t.length - 1)), inclusive: true }
      }
      case '|':
        return { pos: at(cursor.line, Math.min(Math.max(0, line.length - 1), count - 1)) }
      case 'gg':
        return lineTo(hasCount ? count - 1 : 0)
      case 'G':
        return lineTo(hasCount ? count - 1 : last)
      case '{':
        return paragraphBackward(lines, cursor, count)
      case '}':
        return paragraphForward(lines, cursor, count)
      case '(':
        return sentenceBackward(lines, cursor, count)
      case ')':
        return sentenceForward(lines, cursor, count)
      case '%': {
        if (hasCount) return lineTo(Math.round((count * lines.length + 99) / 100) - 1)
        const p = matchPair(lines, cursor)
        if (!p) return { pos: cursor, fail: true }
        return { pos: p, inclusive: true }
      }
      case 'H':
        return lineTo(count - 1)
      case 'L':
        return lineTo(last - (count - 1))
      case 'M':
        return lineTo(Math.floor(last / 2))
      case '+':
      case '<CR>': {
        if (cursor.line === last) return { pos: cursor, fail: true }
        const ln = Math.min(last, cursor.line + count)
        return { pos: at(ln, firstNonBlank(lines[ln])), linewise: true }
      }
      case '-': {
        if (cursor.line === 0) return { pos: cursor, fail: true }
        const ln = Math.max(0, cursor.line - count)
        return { pos: at(ln, firstNonBlank(lines[ln])), linewise: true }
      }
      case '_': {
        const ln = Math.min(last, cursor.line + count - 1)
        return { pos: at(ln, firstNonBlank(lines[ln])), linewise: true }
      }
      case 'f':
      case 'F':
      case 't':
      case 'T': {
        const ch = m.arg === '<Space>' ? ' ' : m.arg === '<Tab>' ? '\t' : m.arg!
        this.lastFind = { ch, cmd: m.key }
        const col = findCharOnLine(line, cursor.col, ch, count, m.key)
        if (col === null) return { pos: cursor, fail: true }
        return { pos: at(cursor.line, col), inclusive: m.key === 'f' || m.key === 't' }
      }
      case ';':
      case ',': {
        if (!this.lastFind) return { pos: cursor, fail: true }
        let cmd = this.lastFind.cmd
        if (m.key === ',') cmd = ({ f: 'F', F: 'f', t: 'T', T: 't' } as const)[cmd]
        const col = findCharOnLine(line, cursor.col, this.lastFind.ch, count, cmd, true)
        if (col === null) return { pos: cursor, fail: true }
        return { pos: at(cursor.line, col), inclusive: cmd === 'f' || cmd === 't' }
      }
      case 'n':
      case 'N': {
        if (!this.search) {
          this.setMessage('E35: No previous regular expression', true)
          return { pos: cursor, fail: true }
        }
        const forward = m.key === 'n' ? this.search.forward : !this.search.forward
        return this.searchMotion(this.search.pattern, forward, count)
      }
      case '*':
      case '#':
      case 'g*':
      case 'g#': {
        const w = wordUnderCursor(line, cursor.col)
        if (!w) {
          this.setMessage('E348: No string under cursor', true)
          return { pos: cursor, fail: true }
        }
        const esc = escapeVimPattern(w.word)
        const pattern = w.keyword && !m.key.startsWith('g') ? `\\<${esc}\\>` : esc
        const forward = m.key === '*' || m.key === 'g*'
        this.search = { pattern, forward }
        this.hlsearch = true
        // start from the beginning of the word so that `*` finds the next occurrence
        const from = at(cursor.line, w.start)
        const r = this.searchMotion(pattern, forward, count, from)
        return r
      }
      case "'":
      case '`': {
        const mk = m.arg!
        let p = this.marks.get(mk) ?? null
        if ((mk === "'" || mk === '`') && !p) p = at(0, 0)
        if (!p) {
          this.setMessage('E20: Mark not set', true)
          return { pos: cursor, fail: true }
        }
        const ln = Math.min(last, p.line)
        if (m.key === "'") return { pos: at(ln, firstNonBlank(lines[ln])), linewise: true }
        return { pos: at(ln, Math.min(p.col, Math.max(0, lines[ln].length - 1))) }
      }
    }
    return { pos: cursor, fail: true }
  }

  /** A motion or object failed: abort a running macro (Vim beeps and stops). */
  private failCommand(): void {
    if (this.depth > 0) this.abortMacro = true
  }

  private desiredColFor(ln: number): number {
    const len = this.lines[ln].length
    if (this.desiredCol === Infinity) return Math.max(0, len - 1)
    return Math.min(this.desiredCol, Math.max(0, len - 1))
  }

  private searchMotion(pattern: string, forward: boolean, count: number, from?: Pos): MotionResult {
    const re = this.compilePattern(pattern)
    if (!re) {
      this.setMessage(`E383: Invalid search string: ${pattern}`, true)
      return { pos: this.cursor, fail: true }
    }
    let p = from ?? this.cursor
    let wrapped = false
    for (let i = 0; i < count; i++) {
      const r = forward
        ? searchForward(this.lines, re, p, this.options.wrapscan)
        : searchBackward(this.lines, re, p, this.options.wrapscan)
      if (!r) {
        this.setMessage(`E486: Pattern not found: ${pattern}`, true)
        return { pos: this.cursor, fail: true }
      }
      wrapped = wrapped || r.wrapped
      p = r.pos
    }
    if (wrapped) {
      this.setMessage(forward ? 'search hit BOTTOM, continuing at TOP' : 'search hit TOP, continuing at BOTTOM')
    }
    return { pos: p }
  }

  private doMotionCommand(cmd: ParsedCommand, count: number, hasCount: boolean): void {
    const m = cmd.motion!
    const r = this.computeMotion(m, count, hasCount)
    if (r.fail) {
      this.failCommand()
      return
    }
    if (JUMP_MOTIONS.has(m.key)) this.marks.set("'", clonePos(this.cursor))
    this.cursor = clonePos(r.pos)
    if (r.keepDesiredCol) this.keepDesired = true
    if (r.toEol) {
      this.desiredCol = Infinity
      this.keepDesired = true
    }
    if (this.visual) {
      if (r.toEol) this.visual.toEol = true
      else if (!r.keepDesiredCol) this.visual.toEol = false
    }
    if (m.key === 'n' || m.key === 'N' || m.key === '*' || m.key === '#') this.hlsearch = true
  }

  // ------------------------------------------------------------------ regions & operators

  private charRegion(a: Pos, b: Pos, inclusive: boolean): Region {
    let s = a
    let e = b
    if (comparePos(e, s) < 0) [s, e] = [e, s]
    s = clonePos(s)
    let endEx: Pos = clonePos(e)
    if (inclusive) endEx.col = Math.min(endEx.col + 1, this.lines[endEx.line].length)
    if (!inclusive && endEx.col === 0 && endEx.line > s.line) {
      if (inIndent(this.lines[s.line], s.col)) {
        return { start: { line: s.line, col: 0 }, end: { line: endEx.line - 1, col: 0 }, linewise: true }
      }
      endEx = { line: endEx.line - 1, col: this.lines[endEx.line - 1].length }
    }
    return { start: s, end: endEx, linewise: false }
  }

  private regionFromMotion(r: MotionResult): Region {
    if (r.linewise) {
      const a = Math.min(this.cursor.line, r.pos.line)
      const b = Math.max(this.cursor.line, r.pos.line)
      return { start: { line: a, col: 0 }, end: { line: b, col: 0 }, linewise: true }
    }
    return this.charRegion(this.cursor, r.pos, !!r.inclusive)
  }

  private regionFromTextObject(to: TextObjectRange): Region {
    if (to.linewise) return { start: { line: to.start.line, col: 0 }, end: { line: to.end.line, col: 0 }, linewise: true }
    if (to.exclusive) return this.charRegion(to.start, to.end, false)
    return this.charRegion(to.start, to.end, true)
  }

  private doOperatorCommand(cmd: ParsedCommand, count: number, hasCount: boolean): void {
    const op = cmd.operator!
    let region: Region
    if (cmd.textObject) {
      const to = textObject(this.lines, this.cursor, cmd.textObject.inner, cmd.textObject.obj, count)
      if (!to) {
        this.failCommand()
        return
      }
      region = this.regionFromTextObject(to)
    } else {
      const r = this.computeMotion(cmd.motion!, count, hasCount, op)
      if (r.fail && posEq(r.pos, this.cursor)) {
        this.failCommand()
        return
      }
      if (JUMP_MOTIONS.has(cmd.motion!.key)) this.marks.set("'", clonePos(this.cursor))
      region = this.regionFromMotion(r)
    }
    this.applyOperator(op, region, cmd.register, 1, false, cmd)
  }

  private doOperatorLine(cmd: ParsedCommand, count: number): void {
    const op = cmd.operator!
    const from = this.cursor.line
    const to = from + count - 1
    if (to > this.lines.length - 1) return
    const region: Region = { start: { line: from, col: 0 }, end: { line: to, col: 0 }, linewise: true }
    this.applyOperator(op, region, cmd.register, 1, true, cmd)
  }

  regionText(region: Region): Register {
    if (region.linewise) {
      return { type: 'line', lines: this.lines.slice(region.start.line, region.end.line + 1) }
    }
    if (region.block) {
      const rows: string[] = []
      for (let l = region.start.line; l <= region.end.line; l++) {
        const line = this.lines[l]
        const r = region.block.toEol ? line.length : region.block.right + 1
        rows.push(line.slice(region.block.left, r))
      }
      return { type: 'block', lines: rows }
    }
    const text =
      region.start.line === region.end.line
        ? this.lines[region.start.line].slice(region.start.col, region.end.col)
        : [
            this.lines[region.start.line].slice(region.start.col),
            ...this.lines.slice(region.start.line + 1, region.end.line),
            this.lines[region.end.line].slice(0, region.end.col),
          ].join('\n')
    return { type: 'char', lines: text.split('\n') }
  }

  applyOperator(
    op: string,
    region: Region,
    register: string | undefined,
    times: number,
    lineOp: boolean,
    cmd?: ParsedCommand,
  ): void {
    switch (op) {
      case 'd':
        this.opDelete(region, register)
        break
      case 'c':
        this.opChange(region, register, cmd)
        break
      case 'y':
        this.opYank(region, register, lineOp)
        break
      case '>':
      case '<':
        this.mutate()
        this.shiftLines(region.start.line, region.end.line, op === '>' ? 1 : -1, times)
        this.cursor = { line: region.start.line, col: firstNonBlank(this.lines[region.start.line]) }
        break
      case 'gu':
      case 'gU':
      case 'g~':
      case 'g?':
        this.opCase(region, op, lineOp)
        break
    }
  }

  private isEmptyRegion(region: Region): boolean {
    return !region.linewise && !region.block && comparePos(region.start, region.end) >= 0
  }

  opDelete(region: Region, register: string | undefined): void {
    if (this.isEmptyRegion(region)) return
    const reg = this.regionText(region)
    this.storeRegister(register, reg, true)
    this.mutate()
    if (region.linewise) {
      const n = region.end.line - region.start.line + 1
      deleteLines(this.lines, region.start.line, region.end.line)
      const ln = Math.min(region.start.line, this.lines.length - 1)
      this.cursor = { line: ln, col: firstNonBlank(this.lines[ln]) }
      if (n > 2) this.setMessage(`${n} fewer lines`)
    } else if (region.block) {
      for (let l = region.start.line; l <= region.end.line; l++) {
        const line = this.lines[l]
        const r = region.block.toEol ? line.length : region.block.right + 1
        this.lines[l] = line.slice(0, region.block.left) + line.slice(r)
      }
      this.cursor = { line: region.start.line, col: region.block.left }
    } else {
      deleteRange(this.lines, region.start, region.end)
      this.cursor = clonePos(region.start)
    }
  }

  opChange(region: Region, register: string | undefined, cmd?: ParsedCommand): void {
    if (region.linewise) {
      const reg = this.regionText(region)
      this.storeRegister(register, reg, true)
      this.mutate()
      const indent = this.options.autoindent ? indentOf(this.lines[region.start.line]) : ''
      this.lines.splice(region.start.line, region.end.line - region.start.line + 1, indent)
      this.cursor = { line: region.start.line, col: indent.length }
      this.enterInsert('c', cmd)
      if (indent) this.insert!.autoIndented = { line: region.start.line, indent }
      return
    }
    if (region.block) {
      this.opDelete(region, register)
      this.cursor = { line: region.start.line, col: region.block.left }
      this.enterInsert('c', cmd)
      this.insert!.block = {
        startLine: region.start.line,
        endLine: region.end.line,
        col: region.block.left,
        append: false,
        toEol: false,
      }
      return
    }
    if (!this.isEmptyRegion(region)) this.opDelete(region, register)
    this.cursor = clonePos(region.start)
    this.enterInsert('c', cmd)
  }

  opYank(region: Region, register: string | undefined, lineOp: boolean): void {
    if (this.isEmptyRegion(region)) return
    const reg = this.regionText(region)
    this.storeRegister(register, reg, false)
    if (region.linewise) {
      if (!lineOp) this.cursor = { line: region.start.line, col: Math.min(this.cursor.col, this.lines[region.start.line].length) }
      const n = region.end.line - region.start.line + 1
      if (n > 2) this.setMessage(`${n} lines yanked`)
    } else if (region.block) {
      this.cursor = { line: region.start.line, col: region.block.left }
    } else {
      this.cursor = clonePos(region.start)
    }
  }

  private opCase(region: Region, op: string, lineOp: boolean): void {
    const fn =
      op === 'gu'
        ? (s: string) => s.toLowerCase()
        : op === 'gU'
          ? (s: string) => s.toUpperCase()
          : op === 'g?'
            ? rot13
            : toggleCase
    this.mutate()
    this.mapRegion(region, fn)
    if (region.linewise) {
      this.cursor = {
        line: region.start.line,
        col: lineOp ? firstNonBlank(this.lines[region.start.line]) : this.cursor.col,
      }
    } else if (region.block) {
      this.cursor = { line: region.start.line, col: region.block.left }
    } else this.cursor = clonePos(region.start)
  }

  private mapRegion(region: Region, fn: (s: string) => string): void {
    if (region.linewise) {
      for (let l = region.start.line; l <= region.end.line; l++) this.lines[l] = fn(this.lines[l])
      return
    }
    if (region.block) {
      for (let l = region.start.line; l <= region.end.line; l++) {
        const line = this.lines[l]
        const r = region.block.toEol ? line.length : region.block.right + 1
        this.lines[l] = line.slice(0, region.block.left) + fn(line.slice(region.block.left, r)) + line.slice(r)
      }
      return
    }
    for (let l = region.start.line; l <= region.end.line; l++) {
      const line = this.lines[l]
      const a = l === region.start.line ? region.start.col : 0
      const b = l === region.end.line ? region.end.col : line.length
      this.lines[l] = line.slice(0, a) + fn(line.slice(a, b)) + line.slice(b)
    }
  }

  shiftLines(from: number, to: number, dir: 1 | -1, times: number): void {
    const { shiftwidth, expandtab, tabstop } = this.options
    for (let l = from; l <= to; l++) {
      const line = this.lines[l]
      if (line.length === 0) continue
      const ind = indentOf(line)
      const w = indentWidth(ind, tabstop)
      let nw: number
      if (dir === 1) nw = w + shiftwidth * times
      else nw = Math.max(0, w - shiftwidth * times)
      // round to a multiple of shiftwidth (shiftround-like behaviour only when already aligned)
      this.lines[l] = makeIndent(nw, expandtab, tabstop) + line.slice(ind.length)
    }
  }

  joinLines(from: number, to: number, spaces: boolean): void {
    if (to <= from) return
    this.mutate()
    let cur = this.lines[from]
    let joinCol = cur.length
    for (let l = from + 1; l <= to; l++) {
      const next = this.lines[l]
      if (spaces) {
        const trimmed = next.replace(/^\s+/, '')
        const curTrim = cur.replace(/\s+$/, '')
        if (trimmed.length === 0) {
          joinCol = curTrim.length
          cur = curTrim
        } else if (curTrim.length === 0 || trimmed.startsWith(')')) {
          joinCol = curTrim.length
          cur = curTrim + trimmed
        } else if (/\s$/.test(cur)) {
          joinCol = cur.length - 1
          cur = cur + trimmed
        } else {
          joinCol = curTrim.length
          cur = curTrim + ' ' + trimmed
        }
      } else {
        joinCol = cur.length
        cur = cur + next
      }
    }
    this.lines.splice(from, to - from + 1, cur)
    this.cursor = { line: from, col: Math.max(0, Math.min(joinCol, cur.length - 1)) }
  }

  // ------------------------------------------------------------------ put

  put(reg: Register, after: boolean, count: number, gMode: boolean): void {
    this.mutate()
    const { cursor, lines } = this
    if (reg.type === 'line') {
      const at = after ? cursor.line + 1 : cursor.line
      const newLines: string[] = []
      for (let i = 0; i < count; i++) newLines.push(...reg.lines)
      insertLines(lines, at, newLines)
      if (gMode) this.cursor = { line: Math.min(at + newLines.length, lines.length - 1), col: 0 }
      else this.cursor = { line: at, col: firstNonBlank(lines[at]) }
      if (newLines.length > 2) this.setMessage(`${newLines.length} more lines`)
      return
    }
    if (reg.type === 'block') {
      const line = lines[cursor.line]
      const startCol = after && line.length > 0 ? cursor.col + 1 : cursor.col
      const width = Math.max(...reg.lines.map((r) => r.length))
      for (let i = 0; i < reg.lines.length; i++) {
        const li = cursor.line + i
        if (li >= lines.length) lines.push('')
        let target = lines[li]
        if (target.length < startCol) target = target.padEnd(startCol)
        const tail = target.slice(startCol)
        const row = tail.length > 0 ? reg.lines[i].padEnd(width) : reg.lines[i]
        lines[li] = target.slice(0, startCol) + row + tail
      }
      this.cursor = { line: cursor.line, col: startCol }
      return
    }
    const single = reg.lines.join('\n')
    let text = ''
    for (let i = 0; i < count; i++) text += single
    const line = lines[cursor.line]
    const pos: Pos = { line: cursor.line, col: after && line.length > 0 ? cursor.col + 1 : cursor.col }
    const end = insertText(lines, pos, text)
    if (gMode) this.cursor = end
    else if (text.includes('\n')) this.cursor = pos
    else this.cursor = { line: end.line, col: Math.max(0, end.col - 1) }
  }

  // ------------------------------------------------------------------ normal actions

  private doNormalAction(cmd: ParsedCommand, count: number, hasCount: boolean): CommandKind {
    const key = cmd.action!.key
    const arg = cmd.action!.arg
    const { cursor, lines } = this
    const line = lines[cursor.line]
    const opWithMotion = (op: string, motion: string) => {
      const r = this.computeMotion({ key: motion }, count, hasCount, op)
      if (r.fail && posEq(r.pos, cursor)) return
      this.applyOperator(op, this.regionFromMotion(r), cmd.register, 1, false, cmd)
    }
    switch (key) {
      case 'x':
      case '<Del>':
        if (line.length === 0) return 'action'
        opWithMotion('d', 'l')
        return 'action'
      case 'X':
        opWithMotion('d', 'h')
        return 'action'
      case 's':
        if (line.length === 0) {
          this.enterInsert('s')
          return 'insert-enter'
        }
        opWithMotion('c', 'l')
        return 'insert-enter'
      case 'S':
        this.doOperatorLine({ ...cmd, operator: 'c' }, count)
        return 'insert-enter'
      case 'D':
        opWithMotion('d', '$')
        return 'action'
      case 'C':
        opWithMotion('c', '$')
        return 'insert-enter'
      case 'Y':
        this.doOperatorLine({ ...cmd, operator: 'y' }, count)
        return 'action'
      case 'p':
      case 'P':
      case 'gp':
      case 'gP': {
        const reg = this.getRegister(cmd.register)
        if (!reg) {
          this.setMessage(`E353: Nothing in register ${cmd.register ?? '"'}`, true)
          return 'action'
        }
        this.put(reg, key === 'p' || key === 'gp', count, key.startsWith('g'))
        return 'action'
      }
      case 'J':
      case 'gJ': {
        const n = Math.max(2, count)
        const to = Math.min(lines.length - 1, cursor.line + n - 1)
        if (to === cursor.line) return 'action'
        this.joinLines(cursor.line, to, key === 'J')
        return 'action'
      }
      case 'u':
        this.undo(count)
        return 'undo'
      case '<C-r>':
        this.redo(count)
        return 'undo'
      case 'i':
      case '<Insert>':
        this.enterInsert('i', cmd)
        return 'insert-enter'
      case 'a':
        if (line.length > 0) this.cursor.col++
        this.enterInsert('a', cmd)
        return 'insert-enter'
      case 'I':
        this.cursor.col = firstNonBlank(line)
        if (/^\s*$/.test(line)) this.cursor.col = line.length
        this.enterInsert('I', cmd)
        return 'insert-enter'
      case 'gI':
        this.cursor.col = 0
        this.enterInsert('I', cmd)
        return 'insert-enter'
      case 'A':
        this.cursor.col = line.length
        this.enterInsert('A', cmd)
        return 'insert-enter'
      case 'gi': {
        const p = this.marks.get('^')
        if (p) {
          this.cursor = { line: Math.min(p.line, lines.length - 1), col: p.col }
          this.cursor.col = Math.min(this.cursor.col, lines[this.cursor.line].length)
        }
        this.enterInsert('i', cmd)
        return 'insert-enter'
      }
      case 'o':
      case 'O': {
        this.mutate()
        const indent = this.options.autoindent ? indentOf(line) : ''
        const at = key === 'o' ? cursor.line + 1 : cursor.line
        insertLines(lines, at, [indent])
        this.cursor = { line: at, col: indent.length }
        this.enterInsert(key, cmd)
        if (indent) this.insert!.autoIndented = { line: at, indent }
        return 'insert-enter'
      }
      case 'R':
        this.enterInsert('R', cmd)
        return 'insert-enter'
      case 'v':
      case 'V':
      case '<C-v>':
        this.enterVisual(key === 'v' ? 'visual' : key === 'V' ? 'visual-line' : 'visual-block')
        return 'visual'
      case 'gv':
        if (this.lastVisual) {
          const lv = this.lastVisual
          this.mode = lv.mode
          this.visual = { anchor: clonePos(lv.anchor), toEol: lv.toEol }
          this.cursor = clonePos(lv.cursor)
          this.clampCursor()
          this.events.push({ type: 'mode', from: 'normal', to: lv.mode })
        }
        return 'visual'
      case '.':
        this.dotRepeat(count, hasCount)
        return 'action'
      case '~': {
        if (line.length === 0) return 'action'
        this.mutate()
        const end = Math.min(line.length, cursor.col + count)
        lines[cursor.line] = line.slice(0, cursor.col) + toggleCase(line.slice(cursor.col, end)) + line.slice(end)
        this.cursor.col = Math.min(end, line.length - 1)
        return 'action'
      }
      case ':':
        this.enterCmdline(':', cmd, hasCount ? (count === 1 ? '.' : `.,.+${count - 1}`) : '')
        return 'ex'
      case '<Esc>':
      case '<C-c>':
        return 'other'
      case '<C-a>':
      case '<C-x>':
        this.incrementNumber(cursor.line, cursor.col, key === '<C-a>' ? count : -count, true)
        return 'action'
      case '&':
      case 'g&':
        this.repeatSubstitute(key === 'g&')
        return 'ex'
      case 'r':
      case 'gr': {
        const ch = arg === '<Space>' ? ' ' : arg === '<Tab>' ? '\t' : arg!
        if (ch === '<CR>') {
          if (cursor.col + count > line.length) return 'action'
          this.mutate()
          const indent = this.options.autoindent ? indentOf(line) : ''
          const rest = line.slice(cursor.col + count).replace(/^\s+/, '')
          lines.splice(cursor.line, 1, line.slice(0, cursor.col).replace(/\s+$/, ''), indent + rest)
          this.cursor = { line: cursor.line + 1, col: indent.length }
          return 'action'
        }
        if (ch.length !== 1 || cursor.col + count > line.length) return 'action'
        this.mutate()
        lines[cursor.line] = line.slice(0, cursor.col) + ch.repeat(count) + line.slice(cursor.col + count)
        this.cursor.col = cursor.col + count - 1
        return 'action'
      }
      case 'm':
        if (/^[a-zA-Z'`[\]<>]$/.test(arg!)) this.marks.set(arg === '`' ? "'" : arg!, clonePos(cursor))
        return 'other'
      case 'q':
        if (this.recording) {
          const rec = this.recording
          this.recording = null
          // drop the trailing 'q' that stopped the recording
          const keys = rec.keys.slice(0, -1)
          this.registers.set(rec.reg.toLowerCase(), { type: 'char', lines: [keysToString(keys)] })
          this.message = null
          return 'macro'
        }
        if (/^[a-zA-Z0-9"]$/.test(arg!)) {
          this.recording = { reg: arg!, keys: [] }
          this.setMessage(`recording @${arg}`)
        }
        return 'macro'
      case '@': {
        let reg = arg!
        if (reg === '@') {
          if (!this.lastMacro) return 'macro'
          reg = this.lastMacro
        }
        if (reg === ':') {
          if (this.lastEx) this.runNested(() => executeEx(this, this.lastEx!), true)
          return 'macro'
        }
        const r = this.getRegister(reg)
        if (!r) return 'macro'
        this.lastMacro = reg
        this.runMacro(r.lines.join('\n'), count)
        return 'macro'
      }
      case 'ZZ':
        this.events.push({ type: 'write' }, { type: 'quit' })
        return 'ex'
      case 'ZQ':
        this.events.push({ type: 'quit' })
        return 'ex'
      case '<C-d>':
      case '<C-u>':
      case '<C-f>':
      case '<C-b>':
      case '<PageUp>':
      case '<PageDown>': {
        const amount = key === '<C-d>' || key === '<C-u>' ? 10 : 20
        const down = key === '<C-d>' || key === '<C-f>' || key === '<PageDown>'
        const ln = Math.max(0, Math.min(lines.length - 1, cursor.line + (down ? amount : -amount)))
        this.cursor = { line: ln, col: firstNonBlank(lines[ln]) }
        return 'motion'
      }
      default:
        // zz zt zb <C-l> <C-g> <C-e> <C-y>: view-only commands, no effect here
        return 'other'
    }
  }

  private incrementNumber(ln: number, col: number, delta: number, moveCursor: boolean): boolean {
    const line = this.lines[ln]
    const re = /-?\d+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      const start = m.index
      const end = start + m[0].length
      if (end > col) {
        // a '-' is only part of the number when the cursor is not after it
        let numStr = m[0]
        let s = start
        if (numStr.startsWith('-') && col > start) {
          numStr = numStr.slice(1)
          s = start + 1
        }
        const n = parseInt(numStr, 10) + delta
        const digits = numStr.replace('-', '')
        let out = String(Math.abs(n))
        if (digits.length > 1 && digits.startsWith('0')) out = out.padStart(digits.length, '0')
        const repl = (n < 0 ? '-' : '') + out
        this.mutate()
        this.lines[ln] = line.slice(0, s) + repl + line.slice(end)
        if (moveCursor) this.cursor = { line: ln, col: s + repl.length - 1 }
        return true
      }
    }
    return false
  }

  private repeatSubstitute(all: boolean): void {
    const ls = this.lastSubstitute
    if (!ls) return
    const flags = all ? ls.flags : ''
    const cmd = `${all ? '%' : ''}s/${ls.pattern}/${ls.replacement}/${flags}`
    this.runNested(() => executeEx(this, cmd), true)
  }

  // ------------------------------------------------------------------ visual mode

  private enterVisual(mode: Mode): void {
    const from = this.mode
    this.mode = mode
    this.visual = { anchor: clonePos(this.cursor), toEol: false }
    this.events.push({ type: 'mode', from, to: mode })
  }

  exitVisual(): void {
    if (!this.visual) return
    const from = this.mode
    const a = this.visual.anchor
    const c = this.cursor
    const s = comparePos(a, c) <= 0 ? a : c
    const e = comparePos(a, c) <= 0 ? c : a
    if (this.mode === 'visual-line') {
      this.marks.set('<', { line: s.line, col: 0 })
      this.marks.set('>', { line: e.line, col: Math.max(0, this.lines[e.line].length - 1) })
    } else {
      this.marks.set('<', clonePos(s))
      this.marks.set('>', clonePos(e))
    }
    this.lastVisual = { mode: this.mode, anchor: clonePos(a), cursor: clonePos(c), toEol: this.visual.toEol }
    this.visual = null
    this.mode = 'normal'
    this.events.push({ type: 'mode', from, to: 'normal' })
  }

  visualRegion(): Region {
    const v = this.visual!
    const a = v.anchor
    const c = this.cursor
    const s = comparePos(a, c) <= 0 ? clonePos(a) : clonePos(c)
    const e = comparePos(a, c) <= 0 ? clonePos(c) : clonePos(a)
    if (this.mode === 'visual-line') {
      return { start: { line: s.line, col: 0 }, end: { line: e.line, col: 0 }, linewise: true }
    }
    if (this.mode === 'visual-block') {
      return {
        start: { line: s.line, col: 0 },
        end: { line: e.line, col: 0 },
        linewise: false,
        block: { left: Math.min(a.col, c.col), right: Math.max(a.col, c.col), toEol: v.toEol },
      }
    }
    const endLine = this.lines[e.line]
    let endEx: Pos
    if (v.toEol || endLine.length === 0) {
      endEx = e.line + 1 < this.lines.length ? { line: e.line + 1, col: 0 } : { line: e.line, col: endLine.length }
    } else endEx = { line: e.line, col: Math.min(e.col + 1, endLine.length) }
    return { start: s, end: endEx, linewise: false }
  }

  private recordVisualRepeat(region: Region): void {
    const lines = region.end.line - region.start.line
    const endCol = region.block ? region.block.right : region.linewise ? 0 : Math.max(0, region.end.col - 1)
    const cols = region.block
      ? region.block.right - region.block.left
      : lines === 0 && !region.linewise
        ? Math.max(0, region.end.col - 1 - region.start.col)
        : 0
    this.visualRepeat = { mode: this.mode, lines, cols, endCol, toEol: !!(region.block?.toEol || this.visual?.toEol) }
  }

  private doVisualAction(cmd: ParsedCommand, count: number, hasCount: boolean): CommandKind {
    const key = cmd.action?.key
    const vmode = this.mode
    if (cmd.textObject) {
      const to = textObject(this.lines, this.cursor, cmd.textObject.inner, cmd.textObject.obj, count)
      if (!to) return 'visual'
      let end = clonePos(to.end)
      let toEol = false
      if (to.exclusive) {
        if (end.col === 0 && end.line > to.start.line) {
          end = { line: end.line - 1, col: Math.max(0, this.lines[end.line - 1].length - 1) }
          toEol = true
        } else decl(this.lines, end)
      }
      if (to.linewise && vmode === 'visual') this.mode = 'visual-line'
      if (to.linewise) end = { line: to.end.line, col: Math.max(0, this.lines[to.end.line].length - 1) }
      this.visual!.anchor = clonePos(to.start)
      this.visual!.toEol = toEol
      this.cursor = end
      return 'visual'
    }
    const region = this.visualRegion()
    const changeKeys = new Set(['d', 'x', 'X', 'D', 'c', 's', 'S', 'C', 'R', 'J', 'gJ', '>', '<', '~', 'u', 'U', 'gu', 'gU', 'g~', 'p', 'P', 'I', 'A', 'r', '<Del>', '<C-a>', '<C-x>', 'g<C-a>', 'g<C-x>'])
    if (key && changeKeys.has(key)) this.recordVisualRepeat(region)
    const linewiseRegion = (): Region => ({ start: { line: region.start.line, col: 0 }, end: { line: region.end.line, col: 0 }, linewise: true })
    switch (key) {
      case 'd':
      case 'x':
      case '<Del>':
        this.exitVisual()
        this.opDelete(region, cmd.register)
        return 'operator'
      case 'X':
      case 'D': {
        this.exitVisual()
        if (region.block && key === 'D') {
          this.opDelete({ ...region, block: { ...region.block!, toEol: true } }, cmd.register)
        } else this.opDelete(linewiseRegion(), cmd.register)
        return 'operator'
      }
      case 'y':
        this.exitVisual()
        this.opYank(region, cmd.register, false)
        return 'operator'
      case 'Y':
        this.exitVisual()
        this.opYank(linewiseRegion(), cmd.register, false)
        return 'operator'
      case 'c':
      case 's': {
        const rep = this.visualRepeat!
        this.exitVisual()
        this.opChange(region, cmd.register)
        this.attachVisualInsert(rep, cmd)
        return 'insert-enter'
      }
      case 'C':
      case 'S':
      case 'R': {
        const rep = this.visualRepeat!
        this.exitVisual()
        if (region.block && key === 'C') {
          this.opChange({ ...region, block: { ...region.block!, toEol: true } }, cmd.register)
        } else this.opChange(linewiseRegion(), cmd.register)
        this.attachVisualInsert(rep, cmd)
        return 'insert-enter'
      }
      case 'J':
      case 'gJ': {
        this.exitVisual()
        const to = Math.max(region.end.line, region.start.line + 1)
        if (to < this.lines.length) this.joinLines(region.start.line, to, key === 'J')
        return 'operator'
      }
      case '>':
      case '<':
        this.exitVisual()
        this.applyOperator(key, linewiseRegion(), cmd.register, count, false)
        return 'operator'
      case '~':
      case 'g~':
        this.exitVisual()
        this.opCase(region, 'g~', false)
        return 'operator'
      case 'u':
      case 'gu':
        this.exitVisual()
        this.opCase(region, 'gu', false)
        return 'operator'
      case 'U':
      case 'gU':
        this.exitVisual()
        this.opCase(region, 'gU', false)
        return 'operator'
      case 'p':
      case 'P':
        this.visualPut(region, cmd.register, count, key === 'P')
        return 'operator'
      case 'I':
      case 'A': {
        const rep = this.visualRepeat!
        this.exitVisual()
        if (region.block) {
          const b = region.block
          const append = key === 'A'
          const first = this.lines[region.start.line]
          const col = append ? (b.toEol ? first.length : Math.min(b.right + 1, first.length)) : b.left
          this.cursor = { line: region.start.line, col }
          if (append && !b.toEol && first.length < b.right + 1) {
            this.mutate()
            this.lines[region.start.line] = first.padEnd(b.right + 1)
            this.cursor.col = b.right + 1
          }
          this.enterInsert(append ? 'A' : 'I')
          this.insert!.block = { startLine: region.start.line, endLine: region.end.line, col: append ? b.right : b.left, append, toEol: b.toEol }
        } else if (key === 'I') {
          this.cursor = { line: region.start.line, col: firstNonBlank(this.lines[region.start.line]) }
          this.enterInsert('I')
        } else {
          this.cursor = { line: region.end.line, col: this.lines[region.end.line].length }
          this.enterInsert('A')
        }
        this.attachVisualInsert(rep, cmd)
        return 'insert-enter'
      }
      case 'o': {
        const a = this.visual!.anchor
        this.visual!.anchor = clonePos(this.cursor)
        this.cursor = clonePos(a)
        return 'visual'
      }
      case 'O': {
        const a = this.visual!.anchor
        if (vmode === 'visual-block') {
          const ac = a.col
          a.col = this.cursor.col
          this.cursor.col = ac
        } else {
          this.visual!.anchor = clonePos(this.cursor)
          this.cursor = clonePos(a)
        }
        return 'visual'
      }
      case ':':
        this.enterCmdline(':', cmd, "'<,'>")
        return 'ex'
      case 'v':
      case 'V':
      case '<C-v>': {
        const target: Mode = key === 'v' ? 'visual' : key === 'V' ? 'visual-line' : 'visual-block'
        if (target === vmode) this.exitVisual()
        else {
          this.mode = target
          this.events.push({ type: 'mode', from: vmode, to: target })
        }
        return 'visual'
      }
      case '<Esc>':
      case '<C-c>':
        this.exitVisual()
        return 'visual'
      case 'gv': {
        const lv = this.lastVisual
        const cur = { mode: this.mode, anchor: clonePos(this.visual!.anchor), cursor: clonePos(this.cursor), toEol: this.visual!.toEol }
        if (lv) {
          this.mode = lv.mode
          this.visual = { anchor: clonePos(lv.anchor), toEol: lv.toEol }
          this.cursor = clonePos(lv.cursor)
          this.clampCursor()
        }
        this.lastVisual = cur
        return 'visual'
      }
      case 'r': {
        const arg = cmd.action!.arg!
        const ch = arg === '<Space>' ? ' ' : arg === '<CR>' ? '\n' : arg
        this.exitVisual()
        if (ch.length !== 1) return 'operator'
        this.mutate()
        this.mapRegion(region, (s) => s.replace(/[^\n]/g, ch))
        this.cursor = region.block ? { line: region.start.line, col: region.block.left } : clonePos(region.start)
        return 'operator'
      }
      case '<C-a>':
      case '<C-x>':
      case 'g<C-a>':
      case 'g<C-x>': {
        this.exitVisual()
        const delta = key.endsWith('a>') ? count : -count
        const progressive = key.startsWith('g')
        let i = 1
        for (let l = region.start.line; l <= region.end.line; l++) {
          const col = region.block ? region.block.left : l === region.start.line && !region.linewise ? region.start.col : 0
          if (this.incrementNumber(l, col, progressive ? delta * i : delta, false)) i++
        }
        this.cursor = clonePos(region.start)
        return 'operator'
      }
    }
    void hasCount
    return 'visual'
  }

  private attachVisualInsert(rep: VisualRepeat, cmd: ParsedCommand): void {
    if (!this.insert) return
    this.insert.visualRepeat = rep
    this.insert.countless = cmd.countless
    this.insert.enterCount = cmd.count
  }

  private visualPut(region: Region, register: string | undefined, count: number, keepRegister: boolean): void {
    const reg = this.getRegister(register)
    this.exitVisual()
    if (!reg) return
    const removed = this.regionText(region)
    this.mutate()
    if (region.linewise) {
      const at = region.start.line
      deleteLines(this.lines, region.start.line, region.end.line)
      const newLines: string[] = []
      for (let i = 0; i < count; i++) newLines.push(...reg.lines)
      if (this.lines.length === 1 && this.lines[0] === '' && at === 0) this.lines.splice(0, 1, ...newLines)
      else insertLines(this.lines, at, newLines)
      this.cursor = { line: at, col: firstNonBlank(this.lines[at]) }
    } else if (region.block) {
      this.opDelete(region, '_')
      this.cursor = { line: region.start.line, col: region.block.left }
      const line = this.lines[this.cursor.line]
      if (reg.type === 'line') this.put(reg, false, count, false)
      else if (line.length <= this.cursor.col) {
        this.cursor.col = Math.max(0, line.length - 1)
        this.put(reg, line.length > 0, count, false)
      } else this.put(reg, false, count, false)
    } else {
      deleteRange(this.lines, region.start, region.end)
      const line = this.lines[region.start.line]
      if (reg.type === 'line') {
        const text = '\n' + reg.lines.join('\n') + '\n'
        insertText(this.lines, region.start, text)
        const ln = region.start.line + 1
        this.cursor = { line: ln, col: firstNonBlank(this.lines[ln]) }
      } else {
        this.cursor = clonePos(region.start)
        if (line.length <= region.start.col && line.length > 0) {
          this.cursor.col = line.length - 1
          this.put(reg, true, count, false)
        } else this.put(reg, false, count, false)
      }
    }
    if (!keepRegister) this.storeRegister(undefined, removed, true)
  }

  // ------------------------------------------------------------------ insert mode

  enterInsert(kind: string, cmd?: ParsedCommand): void {
    this.ensureSnapshot()
    const from = this.mode
    this.mode = kind === 'R' ? 'replace' : 'insert'
    this.insert = {
      kind,
      count: kind === 'c' ? 1 : (cmd?.count ?? 1),
      keys: [],
      enteredWith: cmd?.keys ?? [],
      countless: cmd?.countless ?? [],
      enterCount: cmd?.count,
      startPos: clonePos(this.cursor),
      origLine: this.lines[this.cursor.line],
      origLineCount: this.lines.length,
      typed: '',
      simple: true,
      ctrlO: false,
      ctrlOAtEnd: false,
      ctrlOPos: null,
      pendingCtrlR: false,
      changedBefore: false,
      autoIndented: null,
      block: null,
    }
    this.events.push({ type: 'mode', from, to: this.mode })
  }

  /** Called by executeCommand paths that enter insert: remember the keys for dot-repeat. */
  private handleInsertKey(key: string): void {
    const s = this.insert!
    if (s.pendingCtrlR) {
      s.pendingCtrlR = false
      s.keys.push(key)
      const reg = this.getRegister(key === '<C-w>' ? undefined : key)
      if (reg) {
        const text = reg.type === 'line' ? reg.lines.join('\n') + '\n' : reg.lines.join('\n')
        this.insertString(text)
        s.simple = false
      }
      return
    }
    s.keys.push(key)
    const { cursor, lines } = this
    const line = lines[cursor.line]
    switch (key) {
      case '<Esc>':
      case '<C-c>':
        this.finishInsert()
        return
      case '<CR>': {
        s.simple = false
        this.changeTick++
        let head = line.slice(0, cursor.col)
        let tail = line.slice(cursor.col)
        let indent = this.options.autoindent ? indentOf(line) : ''
        if (s.autoIndented && s.autoIndented.line === cursor.line && line === s.autoIndented.indent) {
          head = ''
        }
        if (this.options.autoindent) tail = tail.replace(/^[ \t]+/, '')
        if (indent.length > head.length && head.trim() === '') indent = head
        lines.splice(cursor.line, 1, head, indent + tail)
        this.cursor = { line: cursor.line + 1, col: indent.length }
        s.autoIndented = indent ? { line: cursor.line + 1, indent } : null
        return
      }
      case '<BS>':
      case '<C-h>':
        s.simple = false
        this.insertBackspace()
        return
      case '<Del>':
        s.simple = false
        this.changeTick++
        if (cursor.col < line.length) lines[cursor.line] = line.slice(0, cursor.col) + line.slice(cursor.col + 1)
        else if (cursor.line + 1 < lines.length) lines.splice(cursor.line, 2, line + lines[cursor.line + 1])
        return
      case '<Tab>': {
        const { expandtab, tabstop, shiftwidth } = this.options
        const text = expandtab ? ' '.repeat(shiftwidth - (cursor.col % shiftwidth) || shiftwidth) : '\t'
        void tabstop
        this.insertString(text)
        s.typed += text
        return
      }
      case '<C-w>': {
        s.simple = false
        if (cursor.col === 0) {
          this.insertBackspace()
          return
        }
        let c = cursor.col
        while (c > 0 && isBlank(line[c - 1])) c--
        if (c > 0) {
          const cls = charClass(line[c - 1])
          while (c > 0 && charClass(line[c - 1]) === cls) c--
        }
        this.changeTick++
        lines[cursor.line] = line.slice(0, c) + line.slice(cursor.col)
        this.cursor.col = c
        return
      }
      case '<C-u>': {
        s.simple = false
        let c: number
        if (cursor.line === s.startPos.line && cursor.col > s.startPos.col) c = s.startPos.col
        else {
          const ind = indentOf(line).length
          c = cursor.col > ind ? ind : 0
        }
        this.changeTick++
        lines[cursor.line] = line.slice(0, c) + line.slice(cursor.col)
        this.cursor.col = c
        return
      }
      case '<C-t>':
      case '<C-d>': {
        s.simple = false
        this.changeTick++
        const before = line.length
        this.shiftLines(cursor.line, cursor.line, key === '<C-t>' ? 1 : -1, 1)
        if (line.length === 0 && key === '<C-t>') {
          lines[cursor.line] = makeIndent(this.options.shiftwidth, this.options.expandtab, this.options.tabstop)
        }
        this.cursor.col = Math.max(0, cursor.col + (lines[cursor.line].length - before))
        return
      }
      case '<C-r>':
        s.pendingCtrlR = true
        return
      case '<C-o>':
        s.ctrlO = true
        s.ctrlOAtEnd = cursor.col >= line.length && line.length > 0
        this.mode = 'normal'
        this.clampCursor()
        s.ctrlOPos = clonePos(this.cursor)
        return
      case '<Left>':
        s.simple = false
        if (cursor.col > 0) this.cursor.col--
        return
      case '<Right>':
        s.simple = false
        if (cursor.col < line.length) this.cursor.col++
        return
      case '<Up>':
        s.simple = false
        if (cursor.line > 0) {
          this.cursor.line--
          this.cursor.col = Math.min(cursor.col, lines[this.cursor.line].length)
        }
        return
      case '<Down>':
        s.simple = false
        if (cursor.line < lines.length - 1) {
          this.cursor.line++
          this.cursor.col = Math.min(cursor.col, lines[this.cursor.line].length)
        }
        return
      case '<Home>':
        s.simple = false
        this.cursor.col = 0
        return
      case '<End>':
        s.simple = false
        this.cursor.col = line.length
        return
      case '<C-e>':
      case '<C-y>': {
        const src = lines[cursor.line + (key === '<C-e>' ? 1 : -1)]
        const ch = src?.[cursor.col]
        if (ch !== undefined) {
          this.insertString(ch)
          s.typed += ch
        }
        return
      }
      case '<Space>':
        this.insertString(' ')
        s.typed += ' '
        return
      default:
        if (key.length === 1) {
          this.insertString(key)
          s.typed += key
        }
    }
  }

  private insertString(text: string): void {
    this.changeTick++
    const s = this.insert!
    const { cursor, lines } = this
    if (this.mode === 'replace' && !text.includes('\n')) {
      const line = lines[cursor.line]
      lines[cursor.line] = line.slice(0, cursor.col) + text + line.slice(cursor.col + text.length)
      this.cursor.col += text.length
      return
    }
    if (s.autoIndented && s.autoIndented.line === cursor.line) s.autoIndented = null
    this.cursor = insertText(lines, cursor, text)
  }

  private insertBackspace(): void {
    const s = this.insert!
    const { cursor, lines } = this
    const line = lines[cursor.line]
    this.changeTick++
    if (this.mode === 'replace') {
      if (cursor.col === 0) return
      this.cursor.col--
      const c = this.cursor.col
      if (cursor.line === s.startPos.line && c >= s.startPos.col && c < s.origLine.length) {
        lines[cursor.line] = line.slice(0, c) + s.origLine[c] + line.slice(c + 1)
      } else if (cursor.line === s.startPos.line && c >= s.origLine.length) {
        lines[cursor.line] = line.slice(0, c) + line.slice(c + 1)
      }
      return
    }
    if (cursor.col > 0) {
      lines[cursor.line] = line.slice(0, cursor.col - 1) + line.slice(cursor.col)
      this.cursor.col--
    } else if (cursor.line > 0) {
      const prev = lines[cursor.line - 1]
      lines.splice(cursor.line - 1, 2, prev + line)
      this.cursor = { line: cursor.line - 1, col: prev.length }
    }
  }

  private finishInsert(): void {
    const s = this.insert!
    const from = this.mode
    const { lines } = this
    // remove unused auto-indent
    if (s.autoIndented && lines[s.autoIndented.line] === s.autoIndented.indent) {
      lines[s.autoIndented.line] = ''
      this.cursor.col = 0
      this.changeTick++
    }
    // count: repeat the typed text
    if (s.count > 1 && s.simple && s.typed.length > 0 && !s.block) {
      this.changeTick++
      if (s.kind === 'o' || s.kind === 'O') {
        const l = lines[this.cursor.line]
        insertLines(lines, this.cursor.line + 1, Array(s.count - 1).fill(l))
        this.cursor = { line: this.cursor.line + s.count - 1, col: this.cursor.col }
      } else {
        this.cursor = insertText(lines, this.cursor, s.typed.repeat(s.count - 1))
      }
    }
    // visual-block insert: replicate the inserted text on every line of the block
    if (s.block && lines.length === s.origLineCount) {
      const b = s.block
      const newLine = lines[b.startLine]
      const orig = s.origLine
      const insertedLen = newLine.length - orig.length
      const inserted = insertedLen > 0 ? newLine.slice(s.startPos.col, s.startPos.col + insertedLen) : ''
      if (inserted) {
        this.changeTick++
        for (let l = b.startLine + 1; l <= b.endLine; l++) {
          let line = lines[l]
          if (b.append) {
            const col = b.toEol ? line.length : b.col + 1
            if (line.length < col) line = line.padEnd(col)
            line = line.slice(0, col) + inserted + line.slice(col)
          } else {
            if (line.length < b.col) continue
            line = line.slice(0, b.col) + inserted + line.slice(b.col)
          }
          lines[l] = line
        }
      }
      this.cursor = { line: b.startLine, col: s.startPos.col }
    }
    this.marks.set('^', clonePos(this.cursor))
    this.marks.set('.', clonePos(this.cursor))
    if (s.typed) this.registers.set('.', { type: 'char', lines: s.typed.split('\n') })
    this.mode = 'normal'
    if (this.cursor.col > 0 && !s.block) this.cursor.col--
    this.clampCursor()
    this.desiredCol = this.cursor.col
    this.insert = null
    this.events.push({ type: 'mode', from, to: 'normal' })
    const changed = s.keys.length > 1 || s.changedBefore || s.kind === 'o' || s.kind === 'O' || s.kind === 'c' || s.kind === 's'
    if (this.depth === 0) {
      this.events.push({ type: 'insert-session', keys: s.keys, enteredWith: s.enteredWith, changed })
    }
    if (!this.dotReplaying && (changed || s.typed.length > 0)) {
      this.lastChange = { keys: [...s.countless, ...s.keys], count: s.enterCount, visual: s.visualRepeat }
    }
  }

  // ------------------------------------------------------------------ cmdline

  private enterCmdline(kind: ':' | '/' | '?', cmd: ParsedCommand | null, initialText = ''): void {
    const fromMode = this.mode
    this.cmdlinePending = cmd ? { cmd, fromMode } : null
    if (this.visual && kind === ':') this.exitVisual()
    this.mode = 'cmdline'
    this.cmdline = { kind, text: initialText }
    this.events.push({ type: 'mode', from: fromMode, to: 'cmdline' })
  }

  private leaveCmdline(): void {
    const pending = this.cmdlinePending
    this.cmdline = null
    const back = pending?.fromMode && pending.fromMode.startsWith('visual') && this.visual ? pending.fromMode : 'normal'
    this.mode = back
    this.events.push({ type: 'mode', from: 'cmdline', to: back })
  }

  private handleCmdlineKey(key: string): void {
    const cl = this.cmdline!
    if (cl.text.startsWith('\u0000')) {
      // pending <C-r>
      cl.text = cl.text.slice(1)
      const reg = key === '<C-w>' ? null : this.getRegister(key)
      if (key === '<C-w>') {
        const w = wordUnderCursor(this.lines[this.cursor.line], this.cursor.col)
        if (w) cl.text += w.word
      } else if (reg) cl.text += reg.lines.join('\n')
      return
    }
    switch (key) {
      case '<Esc>':
      case '<C-c>':
        this.cmdlinePending = null
        this.leaveCmdline()
        return
      case '<CR>': {
        const text = cl.text
        const pending = this.cmdlinePending
        this.cmdlinePending = null
        if (cl.kind === ':') {
          this.cmdline = null
          this.mode = 'normal'
          this.events.push({ type: 'mode', from: 'cmdline', to: 'normal' })
          this.executeExCommand(text)
        } else {
          this.leaveCmdline()
          this.executeSearch(text, cl.kind === '/', pending)
        }
        return
      }
      case '<BS>':
      case '<C-h>':
        if (cl.text.length === 0) {
          this.cmdlinePending = null
          this.leaveCmdline()
        } else cl.text = cl.text.slice(0, -1)
        return
      case '<C-u>':
        cl.text = ''
        return
      case '<C-w>':
        cl.text = cl.text.replace(/\s*\S+\s*$/, '')
        return
      case '<C-r>':
        cl.text = '\u0000' + cl.text
        return
      case '<Space>':
        cl.text += ' '
        return
      case '<Tab>':
        cl.text += '\t'
        return
      default:
        if (key.length === 1) cl.text += key
    }
  }

  private executeExCommand(text: string): void {
    const tick = this.changeTick
    const trimmed = text.replace(/^:+/, '')
    if (trimmed.trim() === '') return
    this.lastEx = trimmed
    this.runNested(() => executeEx(this, trimmed), true)
    this.clampCursor()
    this.desiredCol = this.cursor.col
    if (this.depth === 0) this.events.push({ type: 'ex', command: trimmed, changed: this.changeTick !== tick })
  }

  private executeSearch(text: string, forward: boolean, pending: CmdlinePending | null): void {
    const tick = this.changeTick
    const pattern = text === '' ? this.search?.pattern : text
    const cmd = pending?.cmd
    const keys = [...(cmd?.keys ?? [forward ? '/' : '?']), ...text.split(''), '<CR>']
    if (!pattern) {
      this.setMessage('E35: No previous regular expression', true)
      return
    }
    this.search = { pattern, forward }
    this.hlsearch = true
    const count = cmd?.count ?? 1
    const r = this.searchMotion(pattern, forward, count)
    this.events.push({ type: 'search', pattern, found: !r.fail })
    if (r.fail) {
      this.failCommand()
      if (this.depth === 0) {
        this.events.push({ type: 'command', keys, name: cmd?.name ?? (forward ? '/' : '?'), kind: 'search', count, hasCount: cmd?.count !== undefined, mode: 'normal', changed: false })
      }
      return
    }
    this.marks.set("'", clonePos(this.cursor))
    this.beginCommand()
    let kind: CommandKind = 'search'
    if (cmd && cmd.type === 'operator-search') {
      kind = 'operator'
      const region = this.regionFromMotion(r)
      this.applyOperator(cmd.operator!, region, cmd.register, 1, false)
      const dotKeys = [...cmd.countless, ...text.split(''), '<CR>']
      if (this.insert) {
        this.insert.countless = dotKeys
        this.insert.enterCount = cmd.count
      } else if (!this.dotReplaying && this.changeTick !== tick) {
        this.lastChange = { keys: dotKeys, count: cmd.count }
      }
    } else {
      this.cursor = clonePos(r.pos)
      if (this.visual) this.visual.toEol = false
    }
    if (this.mode === 'normal' || this.mode.startsWith('visual')) this.clampCursor()
    this.desiredCol = this.cursor.col
    if (this.depth === 0) {
      this.events.push({
        type: 'command',
        keys,
        name: cmd?.name ?? (forward ? '/' : '?'),
        kind,
        count,
        hasCount: cmd?.count !== undefined,
        register: cmd?.register,
        mode: pending?.fromMode ?? 'normal',
        changed: this.changeTick !== tick,
      })
    }
  }

  // ------------------------------------------------------------------ repeat / macros

  /** Run keys as a nested command sequence (macros, :normal). */
  runKeys(keys: string[]): void {
    this.runNested(() => {
      for (const k of keys) {
        this.handleKey(k)
        if (this.abortMacro) break
      }
    }, false)
  }

  private runNested(fn: () => void, groupUndo: boolean): void {
    const prevGrouping = this.undoGrouping
    if (groupUndo) this.undoGrouping = true
    this.depth++
    try {
      fn()
    } finally {
      this.depth--
      this.undoGrouping = prevGrouping
      if (this.depth === 0) this.abortMacro = false
    }
  }

  private runMacro(text: string, count: number): void {
    const keys = parseKeys(text)
    this.abortMacro = false
    this.runNested(() => {
      for (let i = 0; i < count && !this.abortMacro; i++) {
        for (const k of keys) {
          this.handleKey(k)
          if (this.abortMacro) break
        }
      }
    }, false)
  }

  private dotRepeat(count: number, hasCount: boolean): void {
    const lc = this.lastChange
    if (!lc) return
    const saved = lc
    this.dotReplaying = true
    this.runNested(() => {
      if (lc.visual) this.recreateVisual(lc.visual)
      const countKeys = hasCount ? String(count).split('') : lc.count !== undefined ? String(lc.count).split('') : []
      let keys: string[]
      if (lc.keys[0] === '"' && lc.keys.length > 2) keys = [...lc.keys.slice(0, 2), ...countKeys, ...lc.keys.slice(2)]
      else keys = [...countKeys, ...lc.keys]
      if (lc.visual) keys = lc.keys // counts don't apply to repeated visual operations
      for (const k of keys) this.handleKey(k)
      if (this.mode === 'insert' || this.mode === 'replace') this.handleKey('<Esc>')
      if (this.mode === 'cmdline') this.handleKey('<Esc>')
    }, true)
    this.dotReplaying = false
    this.lastChange = { ...saved, count: hasCount ? count : saved.count }
  }

  private recreateVisual(v: VisualRepeat): void {
    this.mode = v.mode
    const anchor = clonePos(this.cursor)
    const last = this.lines.length - 1
    const endLine = Math.min(last, anchor.line + v.lines)
    let endCol: number
    if (v.mode === 'visual-block') endCol = anchor.col + v.cols
    else if (v.lines === 0) endCol = anchor.col + v.cols
    else endCol = v.endCol
    this.visual = { anchor, toEol: v.toEol }
    this.cursor = { line: endLine, col: Math.max(0, Math.min(endCol, Math.max(0, this.lines[endLine].length - 1))) }
    if (v.mode === 'visual-block') this.cursor.col = anchor.col + v.cols
  }
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}
