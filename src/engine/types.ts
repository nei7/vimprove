export type Mode =
  | 'normal'
  | 'insert'
  | 'replace'
  | 'visual'
  | 'visual-line'
  | 'visual-block'
  | 'cmdline'

export interface Pos {
  line: number
  col: number
}

export type RegisterType = 'char' | 'line' | 'block'

export interface Register {
  type: RegisterType
  /** For char/line registers: lines of text. For block: one entry per row. */
  lines: string[]
}

export interface VimOptions {
  shiftwidth: number
  tabstop: number
  expandtab: boolean
  autoindent: boolean
  ignorecase: boolean
  smartcase: boolean
  wrapscan: boolean
  startofline: boolean
  hlsearch: boolean
  number: boolean
  relativenumber: boolean
}

export const DEFAULT_OPTIONS: VimOptions = {
  shiftwidth: 2,
  tabstop: 2,
  expandtab: true,
  autoindent: true,
  ignorecase: false,
  smartcase: false,
  wrapscan: true,
  startofline: true,
  hlsearch: true,
  number: true,
  relativenumber: false,
}

export interface CmdlineState {
  kind: ':' | '/' | '?'
  text: string
}

export interface VisualState {
  anchor: Pos
  /** `$` was used: selection extends to the end of every line. */
  toEol: boolean
}

export interface SearchState {
  pattern: string
  forward: boolean
}

export type CommandKind =
  | 'motion'
  | 'operator'
  | 'action'
  | 'insert-enter'
  | 'visual'
  | 'ex'
  | 'search'
  | 'undo'
  | 'macro'
  | 'other'

export interface CommandEvent {
  type: 'command'
  /** Raw keys that formed the command, e.g. ['3','d','w'] */
  keys: string[]
  /** Normalised name without counts/registers, e.g. 'dw', 'ci"', 'l' */
  name: string
  kind: CommandKind
  count: number
  hasCount: boolean
  register?: string
  /** Mode the command was issued in */
  mode: Mode
  /** Whether the buffer text changed */
  changed: boolean
}

export interface InsertSessionEvent {
  type: 'insert-session'
  /** Keys typed while in insert mode, including the final <Esc> */
  keys: string[]
  /** Command that entered insert mode, e.g. ['c','i','w'] */
  enteredWith: string[]
  changed: boolean
}

export type VimEvent =
  | CommandEvent
  | InsertSessionEvent
  | { type: 'invalid'; keys: string[]; mode: Mode }
  | { type: 'ex'; command: string; changed: boolean }
  | { type: 'search'; pattern: string; found: boolean }
  | { type: 'mode'; from: Mode; to: Mode }
  | { type: 'message'; text: string; error: boolean }
  | { type: 'write' }
  | { type: 'quit' }

export interface Snapshot {
  lines: string[]
  cursor: Pos
}

/** Read-only view of engine state for rendering. */
export interface VimView {
  lines: string[]
  cursor: Pos
  mode: Mode
  visual: VisualState | null
  cmdline: CmdlineState | null
  pendingKeys: string[]
  message: string | null
  messageIsError: boolean
  recording: string | null
  search: SearchState | null
  hlsearch: boolean
  options: VimOptions
}
