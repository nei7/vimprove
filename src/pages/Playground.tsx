import { useCallback, useRef, useState } from 'react'
import { Editor } from '../components/Editor/Editor'
import { KeyStream, type KeyGroup } from '../components/KeyStream'
import { HintCard, HintToast } from '../components/HintToast'
import { useVim } from '../hooks/useVim'
import { Coach } from '../coach/analyzer'
import type { Hint } from '../coach/rules'
import { useProgress } from '../progress/store'

const SAMPLE = `import { readFile } from 'fs/promises';

export async function loadConfig(path: string) {
  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw);
  if (!config.name) {
    throw new Error("config is missing a name");
  }
  console.log('loaded', config.name);
  return config;
}
`

export function PlaygroundPage() {
  const settings = useProgress((s) => s.settings)
  const coach = useRef(new Coach())
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [hints, setHints] = useState<Hint[]>([])
  const [toast, setToast] = useState<Hint | null>(null)
  const [count, setCount] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(SAMPLE)
  const pending = useRef<string[]>([])

  const { vim, feed, reset, tick } = useVim(SAMPLE, { line: 0, col: 0 }, { relativenumber: settings.relativeNumber })

  const handleKey = useCallback(
    (key: string) => {
      const before = { lines: [...vim.lines], cursor: { ...vim.cursor } }
      const events = feed(key)
      setCount((c) => c + 1)
      pending.current.push(key)
      const completed = events.some((e) => e.type === 'command' || e.type === 'insert-session' || e.type === 'invalid' || e.type === 'ex')
      const invalid = events.some((e) => e.type === 'invalid')
      if (completed && (vim.mode === 'normal' || vim.mode.startsWith('visual'))) {
        const g: KeyGroup = { keys: pending.current, tone: invalid ? 'bad' : 'default' }
        pending.current = []
        setGroups((gs) => [...gs.slice(-40), g])
      }
      const raised = coach.current.process(events, before)
      if (raised.length > 0) {
        setHints((h) => [...raised, ...h].slice(0, 20))
        if (settings.liveHints) setToast(raised[0])
      }
    },
    [feed, settings.liveHints, vim],
  )

  const load = (text: string) => {
    reset(text, { line: 0, col: 0 })
    coach.current.reset()
    pending.current = []
    setGroups([])
    setHints([])
    setCount(0)
    setEditing(false)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Playground</h1>
            <p className="text-sm text-subtext">Free practice with the coach watching. Load your own text to rehearse a real edit.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Cancel' : 'Load text…'}
            </button>
            <button className="btn" onClick={() => load(SAMPLE)}>
              ↺ Reset sample
            </button>
          </div>
        </div>
        {editing && (
          <div className="card p-3">
            <textarea
              className="h-48 w-full resize-y rounded-lg bg-mantle p-3 font-mono text-sm text-text outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex justify-end">
              <button className="btn btn-primary" onClick={() => load(draft)}>
                Load into editor
              </button>
            </div>
          </div>
        )}
        <Editor vim={vim} tick={tick} onKey={handleKey} autoFocus={!editing} minLines={12} />
        <div className="card p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-overlay">
            <span>Keystrokes</span>
            <span>{count}</span>
          </div>
          <KeyStream groups={groups} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Coach notes</h2>
          {hints.length === 0 ? (
            <p className="text-sm text-subtext">Nothing to report yet. Inefficient patterns show up here as you type.</p>
          ) : (
            <div className="space-y-2">
              {hints.map((h, i) => (
                <div key={i} className="rounded-lg bg-mantle p-3">
                  <HintCard hint={h} compact />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4 text-sm text-subtext">
          <h2 className="mb-2 font-semibold text-text">Supported</h2>
          <p>
            Normal, insert, replace, visual (v / V / Ctrl-V) and command-line modes; operators d c y &gt; &lt; gu gU g~; text
            objects; counts; registers ("a–z, "0, "_); undo/redo; dot repeat; macros (q, @); marks; search with Vim regex;
            :s :g :m :t :d :j :norm :sort :set.
          </p>
        </div>
      </div>
      <HintToast hint={toast} onClose={() => setToast(null)} />
    </div>
  )
}
