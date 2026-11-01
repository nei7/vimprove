import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { keyFromEvent, matchesOnLine, type Mode, type Pos, type Vim } from '../../engine'

export interface EditorProps {
  vim: Vim
  /** Bump to re-render after the engine changed. */
  tick: number
  onKey: (key: string) => void
  /** Optional target cursor to highlight (cursor-goal lessons). */
  targetCursor?: Pos | null
  autoFocus?: boolean
  readOnly?: boolean
  className?: string
  /** Called when focus changes so parents can show hints. */
  onFocusChange?: (focused: boolean) => void
  minLines?: number
}

interface CellSel {
  from: number
  to: number // exclusive; may be Infinity for "to end of line including newline"
}

function modeLabel(mode: Mode, recording: string | null): string {
  let label = ''
  switch (mode) {
    case 'insert':
      label = '-- INSERT --'
      break
    case 'replace':
      label = '-- REPLACE --'
      break
    case 'visual':
      label = '-- VISUAL --'
      break
    case 'visual-line':
      label = '-- VISUAL LINE --'
      break
    case 'visual-block':
      label = '-- VISUAL BLOCK --'
      break
    default:
      label = ''
  }
  if (recording) label = `${label ? label + '  ' : ''}recording @${recording}`
  return label
}

export function Editor({
  vim,
  tick,
  onKey,
  targetCursor,
  autoFocus,
  readOnly,
  className,
  onFocusChange,
  minLines = 6,
}: EditorProps) {
  void tick
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const view = vim.view()
  const { lines, cursor, mode, cmdline, options } = view

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return
      const key = keyFromEvent(e)
      if (!key) return
      e.preventDefault()
      e.stopPropagation()
      onKey(key)
    },
    [onKey, readOnly],
  )

  // selection per line (recomputed every render: the engine state is mutable and cheap to read)
  const selection = (() => {
    const out = new Map<number, CellSel>()
    if (!view.visual) return out
    const region = vim.visualRegion()
    if (region.linewise) {
      for (let l = region.start.line; l <= region.end.line; l++) out.set(l, { from: 0, to: Infinity })
    } else if (region.block) {
      for (let l = region.start.line; l <= region.end.line; l++) {
        out.set(l, { from: region.block.left, to: region.block.toEol ? Infinity : region.block.right + 1 })
      }
    } else {
      for (let l = region.start.line; l <= region.end.line; l++) {
        const from = l === region.start.line ? region.start.col : 0
        const to = l === region.end.line ? region.end.col : Infinity
        out.set(l, { from, to })
      }
    }
    return out
  })()

  const searchRe = view.hlsearch && view.search ? vim.compilePattern(view.search.pattern) : null
  const incRe = cmdline && cmdline.kind !== ':' && cmdline.text ? vim.compilePattern(cmdline.text) : null

  const lineNumberWidth = Math.max(2, String(lines.length).length)
  const showCursor = mode !== 'cmdline' || !!view.visual
  const cursorIsBar = mode === 'insert' || mode === 'replace'
  const padLines = Math.max(0, minLines - lines.length)

  return (
    <div className={`card flex flex-col overflow-hidden ${className ?? ''}`}>
      <div
        ref={ref}
        tabIndex={0}
        role="textbox"
        aria-label="Vim editor"
        aria-multiline="true"
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true)
          onFocusChange?.(true)
        }}
        onBlur={() => {
          setFocused(false)
          onFocusChange?.(false)
        }}
        className={`relative flex-1 overflow-auto bg-surface px-3 py-3 font-mono text-[14px] leading-6 outline-none ${
          focused ? 'ring-1 ring-blue/60' : ''
        }`}
      >
        {!focused && !readOnly && (
          <div className="pointer-events-none absolute right-3 top-2 rounded bg-surface-1 px-2 py-0.5 text-xs text-subtext">
            click to focus · keys go to Vim
          </div>
        )}
        {lines.map((line, l) => {
          const sel = selection.get(l)
          const matches = searchRe ? matchesOnLine(line, searchRe) : []
          const incMatches = incRe ? matchesOnLine(line, incRe) : []
          const isCursorLine = l === cursor.line
          const cells: string[] = Array.from(line)
          // one extra cell for the end-of-line position (cursor in insert mode, newline selection)
          cells.push('')
          const rel = Math.abs(l - cursor.line)
          const num = options.relativenumber
            ? isCursorLine
              ? options.number
                ? String(l + 1)
                : '0'
              : String(rel)
            : String(l + 1)
          return (
            <div key={l} className={`flex whitespace-pre ${isCursorLine ? 'bg-surface-1/40' : ''}`}>
              <span
                className={`select-none pr-3 text-right ${isCursorLine ? 'text-subtext' : 'text-overlay'}`}
                style={{ minWidth: `${lineNumberWidth + 1}ch` }}
              >
                {num}
              </span>
              <span>
                {cells.map((ch, c) => {
                  const isEol = c === line.length
                  const isCursor = showCursor && isCursorLine && c === cursor.col
                  const inSel = !!sel && c >= sel.from && c < sel.to && (!isEol || sel.to === Infinity)
                  const inMatch = matches.some((m) => c >= m.start && c < m.end)
                  const inInc = incMatches.some((m) => c >= m.start && c < m.end)
                  const isTarget = targetCursor && targetCursor.line === l && targetCursor.col === c
                  let cls = ''
                  if (isCursor) cls = cursorIsBar ? 'editor-cursor-bar' : view.visual ? 'editor-cursor-visual' : 'editor-cursor-block'
                  else if (inSel) cls = 'bg-surface-2 text-text'
                  else if (inInc) cls = 'bg-peach/60 text-base'
                  else if (inMatch) cls = 'bg-yellow/30'
                  if (isTarget && !isCursor) cls += ' outline outline-1 outline-green rounded-[2px]'
                  if (isEol && !isCursor && !inSel && !isTarget) return null
                  const display = ch === '\t' ? ' '.repeat(options.tabstop) : ch === '' ? ' ' : ch
                  return (
                    <span key={c} className={cls}>
                      {display}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
        {Array.from({ length: padLines }).map((_, i) => (
          <div key={`pad-${i}`} className="flex whitespace-pre text-overlay/60">
            <span className="select-none pr-3 text-right" style={{ minWidth: `${lineNumberWidth + 1}ch` }}>
              ~
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-surface-1 bg-mantle px-3 py-1 font-mono text-xs">
        {cmdline ? (
          <div className="flex-1 truncate text-text">
            {cmdline.kind}
            {cmdline.text}
            <span className="editor-cursor-block"> </span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="shrink-0 font-semibold text-yellow">{modeLabel(mode, view.recording)}</span>
            {view.message && (
              <span className={`truncate ${view.messageIsError ? 'text-red' : 'text-subtext'}`}>{view.message}</span>
            )}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3 text-subtext">
          {view.pendingKeys.length > 0 && <span className="text-peach">{view.pendingKeys.join('')}</span>}
          <span>
            {cursor.line + 1},{cursor.col + 1}
          </span>
        </div>
      </div>
    </div>
  )
}
