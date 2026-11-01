import type { Lesson } from '../lessons/types'
import { CATEGORY_LABELS } from '../lessons/types'
import { TextDiff } from './TextDiff'
import { formatMs } from './ResultModal'

export interface TaskPanelProps {
  lesson: Lesson
  keyCount: number
  par: number
  elapsedMs: number
  hintsRevealed: number
  onRevealHint: () => void
  onRestart: () => void
  onShowSolution: () => void
  solutionShown: boolean
  showDiff: boolean
  best: number | null
}

export function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex gap-0.5" title={`Difficulty ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-peach' : 'bg-surface-2'}`} />
      ))}
    </span>
  )
}

export function TaskPanel(p: TaskPanelProps) {
  const over = p.keyCount - p.par
  const keysTone = p.keyCount === 0 ? 'text-text' : over <= 0 ? 'text-green' : over <= 2 ? 'text-blue' : 'text-peach'
  const lessonHints = p.lesson.hints ?? []
  return (
    <div className="card flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2 text-xs text-overlay">
          <span className="rounded bg-surface-1 px-1.5 py-0.5">{CATEGORY_LABELS[p.lesson.category]}</span>
          <DifficultyDots level={p.lesson.difficulty} />
          <span className="rounded bg-surface-1 px-1.5 py-0.5 font-mono">{p.lesson.language}</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold">{p.lesson.title}</h1>
        <p className="mt-1 text-sm text-subtext">{p.lesson.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-mantle p-2">
          <div className={`font-mono text-xl font-bold ${keysTone}`}>{p.keyCount}</div>
          <div className="text-[11px] text-overlay">keys</div>
        </div>
        <div className="rounded-lg bg-mantle p-2">
          <div className="font-mono text-xl font-bold text-text">{p.par}</div>
          <div className="text-[11px] text-overlay">par{p.best !== null ? ` · best ${p.best}` : ''}</div>
        </div>
        <div className="rounded-lg bg-mantle p-2">
          <div className="font-mono text-xl font-bold text-text">{formatMs(p.elapsedMs)}</div>
          <div className="text-[11px] text-overlay">time</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-overlay">
          {p.lesson.goal.type === 'text' ? 'Target' : 'Target cursor'}
        </div>
        {p.lesson.goal.type === 'text' ? (
          <TextDiff from={p.lesson.start.text} to={p.lesson.goal.text} showDiff={p.showDiff} />
        ) : (
          <div className="rounded-lg bg-mantle p-3 text-sm text-subtext">
            Move the cursor to line {p.lesson.goal.cursor[0] + 1}, column {p.lesson.goal.cursor[1] + 1}. The target cell is
            outlined in green. The text must stay unchanged.
          </div>
        )}
      </div>

      {p.lesson.start.registers && (
        <div className="rounded-lg bg-mantle p-3 text-xs text-subtext">
          <span className="font-semibold text-text">Registers pre-filled: </span>
          {Object.entries(p.lesson.start.registers).map(([k, r]) => (
            <span key={k} className="mr-2 font-mono">
              "{k} = {JSON.stringify(r.text)}
              {r.type === 'line' ? ' (line)' : ''}
            </span>
          ))}
        </div>
      )}

      {p.hintsRevealed > 0 && lessonHints.length > 0 && (
        <div className="space-y-1 rounded-lg border border-yellow/20 bg-mantle p-3 text-sm text-subtext">
          {lessonHints.slice(0, p.hintsRevealed).map((h, i) => (
            <div key={i}>💡 {h}</div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {lessonHints.length > p.hintsRevealed && (
          <button className="btn" onClick={p.onRevealHint}>
            💡 Hint ({p.hintsRevealed}/{lessonHints.length})
          </button>
        )}
        <button className="btn" onClick={p.onRestart} title="Reset the task (progress on this attempt is lost)">
          ↺ Restart
        </button>
        {!p.solutionShown && (
          <button className="btn btn-ghost" onClick={p.onShowSolution} title="Shows the optimal keys; this attempt will not count towards mastery">
            Show solution
          </button>
        )}
      </div>
    </div>
  )
}
