import { useRef, useState } from 'react'
import { useProgress } from '../progress/store'
import type { ProgressData } from '../progress/types'

export function SettingsPage() {
  const settings = useProgress((s) => s.settings)
  const update = useProgress((s) => s.updateSettings)
  const exportData = useProgress((s) => s.exportData)
  const importData = useProgress((s) => s.importData)
  const resetAll = useProgress((s) => s.resetAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const doExport = () => {
    const data = exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vimprove-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Progress exported.')
  }

  const doImport = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ProgressData
      if (!parsed || typeof parsed !== 'object' || !('lessons' in parsed)) throw new Error('not a vimprove export')
      importData(parsed)
      setMessage(`Imported progress for ${Object.keys(parsed.lessons ?? {}).length} tasks.`)
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Daily practice</h2>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Daily goal</span>
            <span className="block text-xs text-subtext">Tasks per day. 5–8 keeps sessions under ten minutes.</span>
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={settings.dailyGoal}
            onChange={(e) => update({ dailyGoal: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
            className="w-20 rounded-lg border border-surface-1 bg-mantle px-2 py-1 text-right font-mono outline-none focus:border-blue/50"
          />
        </label>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Editor & coaching</h2>
        <div className="space-y-3 text-sm">
          <Toggle
            label="Live hints"
            help="Show a hint toast as soon as an inefficient pattern is detected. Hints are always listed after a task."
            checked={settings.liveHints}
            onChange={(v) => update({ liveHints: v })}
          />
          <Toggle
            label="Relative line numbers"
            help="Show distances instead of absolute numbers, like :set relativenumber."
            checked={settings.relativeNumber}
            onChange={(v) => update({ relativeNumber: v })}
          />
          <Toggle
            label="Show diff in the target panel"
            help="Highlight removed and added lines between the start and the target text."
            checked={settings.showTargetDiff}
            onChange={(v) => update({ showTargetDiff: v })}
          />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-subtext">Progress lives in this browser's localStorage. Export it to move between machines.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={doExport}>
            ⬇ Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
          {!confirmReset ? (
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
              Reset all progress
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-red">Delete everything?</span>
              <button
                className="btn btn-danger"
                onClick={() => {
                  resetAll()
                  setConfirmReset(false)
                  setMessage('Progress reset.')
                }}
              >
                Yes, reset
              </button>
              <button className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
        {message && <div className="mt-3 rounded-lg bg-mantle p-2 text-sm text-subtext">{message}</div>}
      </section>

      <section className="card p-5 text-sm text-subtext">
        <h2 className="mb-2 font-semibold text-text">Engine notes</h2>
        <ul className="list-disc space-y-1 pl-4">
          <li>Behaves like Vim with autoindent on, expandtab, shiftwidth 2 (tasks may override, e.g. Python uses 4).</li>
          <li>Every key press counts, including Esc, Enter and Ctrl combos, like VimGolf. A task is complete when the text matches in normal mode.</li>
          <li>Ctrl-[ works as Esc. Arrow keys work but the coach will nag you.</li>
        </ul>
      </section>
    </div>
  )
}

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-subtext">{help}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-green' : 'bg-surface-2'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-base transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}
