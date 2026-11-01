import type { VimEvent } from '../engine'
import { RULES, type CoachItem, type Hint, type Snapshot } from './rules'

const REFIRE_GAP = 3
const MAX_HISTORY = 60

/**
 * Keeps a history of completed commands for one editing session (a task or a
 * playground run) and evaluates coaching rules after every command.
 */
export class Coach {
  history: CoachItem[] = []
  /** Every hint raised during the session, in order. */
  hints: Hint[] = []
  /** Count of hints per rule. */
  habits: Record<string, number> = {}
  private lastFired = new Map<string, number>()

  reset(): void {
    this.history = []
    this.hints = []
    this.habits = {}
    this.lastFired.clear()
  }

  /** Feed the events produced by one key press. Returns hints raised by this key. */
  process(events: VimEvent[], before: Snapshot): Hint[] {
    const raised: Hint[] = []
    for (const ev of events) {
      if (ev.type === 'command') {
        this.history.push({ kind: 'command', ev, before })
      } else if (ev.type === 'insert-session') {
        // merge with the command that entered insert mode
        const prev = this.history[this.history.length - 1]
        let snapshot = before
        if (prev && prev.kind === 'command' && prev.ev.kind === 'insert-enter') {
          snapshot = prev.before
          this.history.pop()
        }
        this.history.push({ kind: 'insert', ev, before: snapshot })
      } else continue
      if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY)
      for (const rule of RULES) {
        const hint = rule.check(this.history)
        if (!hint) continue
        const lastAt = this.lastFired.get(rule.id)
        if (lastAt !== undefined && this.history.length - lastAt < REFIRE_GAP) continue
        this.lastFired.set(rule.id, this.history.length)
        this.hints.push(hint)
        this.habits[hint.ruleId] = (this.habits[hint.ruleId] ?? 0) + 1
        raised.push(hint)
      }
    }
    return raised
  }
}
