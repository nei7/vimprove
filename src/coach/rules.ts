import { NON_VIM_KEYS, type CommandEvent, type InsertSessionEvent, type Pos } from '../engine'
import { wordUnderCursor } from '../engine/motions'

/** A unit the coach reasons about: a completed command or an insert session. */
export type CoachItem =
  | { kind: 'command'; ev: CommandEvent; before: Snapshot }
  | { kind: 'insert'; ev: InsertSessionEvent; before: Snapshot }

export interface Snapshot {
  lines: string[]
  cursor: Pos
}

export interface Hint {
  ruleId: string
  title: string
  message: string
  /** Better alternatives in Vim notation. */
  better: string[]
  /** Cheat-sheet ids related to the better alternatives (used to pick weak-spot drills). */
  teaches: string[]
  /** How wasteful the pattern is: 1 = minor, 3 = significant. */
  severity: 1 | 2 | 3
}

export interface CoachRule {
  id: string
  title: string
  /** `history` includes the newest item last. Return a hint when the pattern is detected. */
  check(history: CoachItem[]): Hint | null
}

function last<T>(arr: T[], n = 1): T | undefined {
  return arr[arr.length - n]
}

function cmd(item: CoachItem | undefined): CommandEvent | null {
  return item && item.kind === 'command' ? item.ev : null
}

function isPlainMotion(ev: CommandEvent | null, names: string[]): boolean {
  return !!ev && ev.kind === 'motion' && names.includes(ev.name) && !ev.hasCount
}

function countTrailing(history: CoachItem[], pred: (ev: CommandEvent) => boolean): number {
  let n = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const c = cmd(history[i])
    if (c && pred(c)) n++
    else break
  }
  return n
}

const SIMPLE_VISUAL_MOTIONS = new Set(['w', 'W', 'e', 'E', 'b', 'B', '$', '0', '^', 'iw', 'aw', 'iW', 'aW', 'i"', 'a"', "i'", "a'", 'i(', 'a(', 'i)', 'a)', 'ib', 'ab', 'i{', 'a{', 'i}', 'a}', 'iB', 'aB', 'i[', 'a[', 'it', 'at', 'ip', 'ap', 'j', 'k', 'f', 't', 'F', 'T', 'G', 'gg', '}', '{'])

export const RULES: CoachRule[] = [
  {
    id: 'repeated-hl',
    title: 'Repeated h / l',
    check(h) {
      const n = countTrailing(h, (c) => isPlainMotion(c, ['h', 'l', '<Left>', '<Right>']))
      if (n < 3) return null
      const dir = cmd(last(h))!.name
      return {
        ruleId: 'repeated-hl',
        title: 'Repeated h / l',
        message: `You pressed ${dir} ${n} times. Jump with a word motion or a find.`,
        better: dir === 'h' || dir === '<Left>' ? ['b', 'F{char}', 'T{char}', '0', '^'] : ['w', 'e', 'f{char}', 't{char}', '$'],
        teaches: ['w', 'f', '$'],
        severity: 2,
      }
    },
  },
  {
    id: 'repeated-jk',
    title: 'Repeated j / k',
    check(h) {
      const n = countTrailing(h, (c) => isPlainMotion(c, ['j', 'k', '<Up>', '<Down>']))
      if (n < 3) return null
      const dir = cmd(last(h))!.name
      return {
        ruleId: 'repeated-jk',
        title: 'Repeated j / k',
        message: `You pressed ${dir} ${n} times. Use a count, a paragraph jump or search.`,
        better: [`${n}${dir === 'j' || dir === '<Down>' ? 'j' : 'k'}`, '}', '{', '/pattern', ':N', 'G', 'gg'],
        teaches: ['count', '}', '/', 'G'],
        severity: 2,
      }
    },
  },
  {
    id: 'arrow-keys',
    title: 'Arrow / Home / End / Delete keys',
    check(h) {
      const c = cmd(last(h))
      if (!c) return null
      const bad = c.keys.find((k) => NON_VIM_KEYS.has(k))
      if (!bad) return null
      const alt: Record<string, string> = {
        '<Left>': 'h',
        '<Right>': 'l',
        '<Up>': 'k',
        '<Down>': 'j',
        '<Home>': '0',
        '<End>': '$',
        '<Del>': 'x',
        '<PageUp>': '<C-b>',
        '<PageDown>': '<C-f>',
      }
      return {
        ruleId: 'arrow-keys',
        title: 'Non-Vim key',
        message: `${bad} works, but keeps your hand off the home row. Use ${alt[bad] ?? 'a Vim motion'} instead.`,
        better: [alt[bad] ?? 'hjkl'],
        teaches: ['hjkl'],
        severity: 1,
      }
    },
  },
  {
    id: 'repeated-x',
    title: 'Repeated x',
    check(h) {
      const n = countTrailing(h, (c) => (c.name === 'x' || c.name === '<Del>') && !c.hasCount)
      if (n < 2) return null
      return {
        ruleId: 'repeated-x',
        title: 'Repeated x',
        message: `x ${n} times deletes one character at a time. Delete the whole thing with a motion or text object.`,
        better: ['dw', 'de', 'diw', 'dt{char}', 'D', `${n}x`],
        teaches: ['dw', 'diw', 'dt', 'D'],
        severity: 2,
      }
    },
  },
  {
    id: 'd-dollar',
    title: 'd$ / c$ / y$',
    check(h) {
      const c = cmd(last(h))
      if (!c) return null
      if (c.name === 'd$') return hint('d-dollar', 'd$ → D', 'D deletes to the end of the line in one key.', ['D'], ['D'], 1)
      if (c.name === 'c$') return hint('d-dollar', 'c$ → C', 'C changes to the end of the line in one key.', ['C'], ['C'], 1)
      return null
    },
  },
  {
    id: 'zero-i',
    title: '0i / ^i / $a',
    check(h) {
      const a = cmd(last(h, 2))
      const b = cmd(last(h))
      if (!a || !b || b.kind !== 'insert-enter') return null
      if ((a.name === '0' || a.name === '^') && b.name === 'i') {
        return hint('zero-i', `${a.name}i → I`, 'I inserts at the first non-blank of the line directly.', ['I'], ['I'], 1)
      }
      if (a.name === '$' && b.name === 'a') {
        return hint('zero-i', '$a → A', 'A appends at the end of the line directly.', ['A'], ['A'], 1)
      }
      if (a.name === '$' && b.name === 'i') {
        return hint('zero-i', '$i → A', 'To type after the last character use A.', ['A'], ['A'], 1)
      }
      return null
    },
  },
  {
    id: 'delete-then-insert',
    title: 'Delete, then insert',
    check(h) {
      const a = cmd(last(h, 2))
      const b = cmd(last(h))
      if (!a || !b || b.kind !== 'insert-enter' || !['i', 'a', 'o', 'O', 'I', 'A'].includes(b.name)) return null
      if (a.name === 'x' && b.name === 'i') return hint('delete-then-insert', 'xi → s', 's replaces one character and enters insert mode.', ['s'], ['s'], 1)
      if (a.name === 'dd' && (b.name === 'O' || b.name === 'o' || b.name === 'i')) {
        return hint('delete-then-insert', 'dd + o → cc', 'cc (or S) clears the line, keeps indentation and enters insert mode.', ['cc', 'S'], ['cc'], 2)
      }
      if (a.name === 'D' && (b.name === 'a' || b.name === 'A' || b.name === 'i')) {
        return hint('delete-then-insert', 'D + a → C', 'C deletes to the end of the line and enters insert mode.', ['C'], ['C'], 1)
      }
      if (a.kind === 'operator' && a.name.startsWith('d') && (b.name === 'i' || b.name === 'a')) {
        const motion = a.name.slice(1)
        return hint('delete-then-insert', `d${motion} + i → c${motion}`, 'The change operator deletes and enters insert mode in one go.', [`c${motion}`], ['c'], 2)
      }
      return null
    },
  },
  {
    id: 'insert-backspace',
    title: 'Backspacing in insert mode',
    check(h) {
      const it = last(h)
      if (!it || it.kind !== 'insert') return null
      const bs = it.ev.keys.filter((k) => k === '<BS>' || k === '<C-h>').length
      if (bs < 3) return null
      return {
        ruleId: 'insert-backspace',
        title: 'Backspacing in insert mode',
        message: `You backspaced ${bs} times. Leave insert mode and delete with a text object or motion instead.`,
        better: ['ciw', 'ci"', 'ct{char}', '<C-w>'],
        teaches: ['ciw', 'ci"', '<C-w>'],
        severity: 2,
      }
    },
  },
  {
    id: 'empty-insert',
    title: 'Insert mode without typing',
    check(h) {
      const it = last(h)
      if (!it || it.kind !== 'insert') return null
      if (it.ev.keys.length === 1 && it.ev.keys[0] === '<Esc>' && !it.ev.changed) {
        return hint('empty-insert', 'Insert with nothing typed', 'Entering and leaving insert mode cost two keystrokes and changed nothing.', [], [], 1)
      }
      return null
    },
  },
  {
    id: 'visual-simple',
    title: 'Visual mode for a simple operation',
    check(h) {
      const op = cmd(last(h))
      if (!op || !op.mode.startsWith('visual') || !['d', 'c', 'y', 'x', 's'].includes(op.name)) return null
      // find the command that entered visual mode
      let i = h.length - 2
      const motions: CommandEvent[] = []
      while (i >= 0) {
        const c = cmd(h[i])
        if (!c) return null
        if (c.name === 'v' || c.name === 'V') break
        if (!c.mode.startsWith('visual')) return null
        motions.push(c)
        i--
      }
      if (i < 0) return null
      const enter = cmd(h[i])!
      if (motions.length !== 1) return null
      const m = motions[0]
      if (!SIMPLE_VISUAL_MOTIONS.has(m.name)) return null
      const opKey = op.name === 'x' ? 'd' : op.name === 's' ? 'c' : op.name
      const motionText = m.hasCount ? `${m.count}${m.name}` : m.name
      const better = enter.name === 'V' && (m.name === 'j' || m.name === 'k')
        ? [`${opKey}${motionText}`, `${m.count + 1}${opKey}${opKey}`]
        : [`${opKey}${motionText}`]
      return {
        ruleId: 'visual-simple',
        title: 'Visual mode for a simple edit',
        message: `${enter.name}${motionText}${op.name} can be ${better[0]}: operators take motions directly.`,
        better,
        teaches: ['operator-motion'],
        severity: 1,
      }
    },
  },
  {
    id: 'repeat-manually',
    title: 'Same change typed twice',
    check(h) {
      // pattern: change X, (optional motion), change X again — where X is identical keys
      const a = last(h)
      if (!a) return null
      const aKeys = itemKeys(a)
      if (!aKeys || !itemChanged(a) || a.kind === 'command' && a.ev.name === '.') return null
      for (const gap of [1, 2]) {
        const b = last(h, gap + 1)
        if (!b) continue
        const between = h.slice(h.length - gap, h.length - 1)
        if (!between.every((it) => it.kind === 'command' && it.ev.kind === 'motion')) continue
        const bKeys = itemKeys(b)
        if (!bKeys || !itemChanged(b)) continue
        if (bKeys.join('\u0001') !== aKeys.join('\u0001')) continue
        if (aKeys.length < 2) continue
        return {
          ruleId: 'repeat-manually',
          title: 'Same change typed twice',
          message: `You typed ${aKeys.join('')} again. Use . to repeat the last change.`,
          better: ['.'],
          teaches: ['dot'],
          severity: 2,
        }
      }
      return null
    },
  },
  {
    id: 'search-word-under-cursor',
    title: 'Searching for the word under the cursor',
    check(h) {
      const it = last(h)
      const c = cmd(it)
      if (!it || !c || c.kind !== 'search' || (c.name !== '/' && c.name !== '?')) return null
      const typed = c.keys.slice(1, -1).join('')
      const line = it.before.lines[it.before.cursor.line]
      const w = wordUnderCursor(line, it.before.cursor.col)
      if (!w || !w.keyword) return null
      const stripped = typed.replace(/^\\</, '').replace(/\\>$/, '')
      if (stripped !== w.word) return null
      return {
        ruleId: 'search-word-under-cursor',
        title: 'Searching the word under the cursor',
        message: `${c.name}${typed}⏎ searches the word you were on. * and # do that in one key.`,
        better: [c.name === '/' ? '*' : '#'],
        teaches: ['*'],
        severity: 2,
      }
    },
  },
  {
    id: 'b-then-cw',
    title: 'Back to word start, then change/delete',
    check(h) {
      const a = cmd(last(h, 2))
      const b = cmd(last(h))
      if (!a || !b || a.name !== 'b' || a.hasCount) return null
      if (b.name === 'cw' || b.name === 'ce') return hint('b-then-cw', 'bcw → ciw', 'Text objects work from anywhere inside the word.', ['ciw'], ['ciw'], 2)
      if (b.name === 'dw') return hint('b-then-cw', 'bdw → daw', 'daw deletes the word and its surrounding space from anywhere inside it.', ['daw', 'diw'], ['diw'], 2)
      if (b.name === 'yw' || b.name === 'ye') return hint('b-then-cw', 'byw → yiw', 'yiw yanks the word from anywhere inside it.', ['yiw'], ['yiw'], 1)
      return null
    },
  },
  {
    id: 'repeated-shift',
    title: 'Indenting line by line',
    check(h) {
      const a = cmd(last(h, 3))
      const m = cmd(last(h, 2))
      const b = cmd(last(h))
      if (!a || !m || !b) return null
      if ((a.name === '>>' || a.name === '<<') && a.name === b.name && (m.name === 'j' || m.name === 'k')) {
        return hint('repeated-shift', `${b.name} line by line`, 'Shift several lines at once with a count or a motion.', [`2${b.name}`, `${b.name[0]}j`, `${b.name[0]}}`, `Vj${b.name[0]}`], ['>>'], 2)
      }
      return null
    },
  },
  {
    id: 'esc-spam',
    title: 'Extra Esc presses',
    check(h) {
      const n = countTrailing(h, (c) => c.name === '<Esc>' && c.mode === 'normal')
      if (n < 2) return null
      return hint('esc-spam', 'Extra Esc', 'You were already in normal mode; each extra Esc is a wasted keystroke.', [], [], 1)
    },
  },
  {
    id: 'j-then-0',
    title: 'j then 0 / ^',
    check(h) {
      const a = cmd(last(h, 2))
      const b = cmd(last(h))
      if (!a || !b || a.hasCount) return null
      if (a.name === 'j' && b.name === '^') return hint('j-then-0', 'j^ → +', '+ (or Enter) moves to the first non-blank of the next line.', ['+', '<CR>'], ['+'], 1)
      if (a.name === 'k' && b.name === '^') return hint('j-then-0', 'k^ → -', '- moves to the first non-blank of the previous line.', ['-'], ['-'], 1)
      return null
    },
  },
]

function hint(ruleId: string, title: string, message: string, better: string[], teaches: string[], severity: 1 | 2 | 3): Hint {
  return { ruleId, title, message, better, teaches, severity }
}

function itemKeys(it: CoachItem): string[] | null {
  if (it.kind === 'command') return it.ev.keys
  return [...it.ev.enteredWith, ...it.ev.keys]
}

function itemChanged(it: CoachItem): boolean {
  return it.ev.changed
}

export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))
