import { useCallback, useRef, useState } from 'react'
import { Vim, type Pos, type VimEvent, type VimOptions } from '../engine'

export interface UseVimResult {
  vim: Vim
  /** Feed a single key in Vim notation; triggers a re-render. */
  feed: (key: string) => VimEvent[]
  /** Feed a key string in Vim notation, e.g. 'ciw<Esc>'. */
  feedKeys: (keys: string) => VimEvent[]
  /** Reset the buffer and all engine state. */
  reset: (text: string, cursor?: Pos, options?: Partial<VimOptions>) => void
  /** Monotonic counter bumped on every change, useful as an effect dependency. */
  tick: number
}

export function useVim(
  initialText: string,
  initialCursor: Pos = { line: 0, col: 0 },
  options: Partial<VimOptions> = {},
  onEvents?: (events: VimEvent[], vim: Vim) => void,
): UseVimResult {
  const [vim] = useState(() => new Vim(initialText, initialCursor, options))
  const [tick, setTick] = useState(0)
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents

  const feed = useCallback(
    (key: string) => {
      const events = vim.feedKey(key)
      setTick((t) => t + 1)
      onEventsRef.current?.(events, vim)
      return events
    },
    [vim],
  )

  const feedKeys = useCallback(
    (keys: string) => {
      const events = vim.feedKeys(keys)
      setTick((t) => t + 1)
      onEventsRef.current?.(events, vim)
      return events
    },
    [vim],
  )

  const reset = useCallback(
    (text: string, cursor: Pos = { line: 0, col: 0 }, opts?: Partial<VimOptions>) => {
      if (opts) vim.options = { ...vim.options, ...opts }
      vim.setText(text, cursor)
      vim.registers.clear()
      vim.lastChange = null
      vim.search = null
      vim.hlsearch = false
      vim.recording = null
      setTick((t) => t + 1)
    },
    [vim],
  )

  return { vim, feed, feedKeys, reset, tick }
}
