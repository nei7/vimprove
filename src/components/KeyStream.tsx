import { keyLabel, NON_VIM_KEYS } from '../engine'

export interface KeyGroup {
  keys: string[]
  /** Highlight style */
  tone?: 'default' | 'good' | 'bad' | 'muted'
  title?: string
}

export function KeyBadge({ k, tone = 'default' }: { k: string; tone?: 'default' | 'good' | 'bad' | 'muted' }) {
  const toneCls =
    tone === 'good'
      ? 'border-green/50 bg-green/15 text-green'
      : tone === 'bad'
        ? 'border-red/50 bg-red/15 text-red'
        : tone === 'muted'
          ? 'border-surface-1 bg-surface text-overlay'
          : NON_VIM_KEYS.has(k)
            ? 'border-peach/50 bg-peach/15 text-peach'
            : ''
  return <kbd className={`key ${toneCls}`}>{keyLabel(k)}</kbd>
}

export function KeySequence({ keys, tone }: { keys: string[]; tone?: KeyGroup['tone'] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {keys.map((k, i) => (
        <KeyBadge key={i} k={k} tone={tone} />
      ))}
    </span>
  )
}

/** A horizontal stream of typed keys grouped per command. */
export function KeyStream({ groups, emptyText = 'Your keystrokes will appear here' }: { groups: KeyGroup[]; emptyText?: string }) {
  if (groups.length === 0) return <div className="text-xs text-overlay">{emptyText}</div>
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {groups.map((g, i) => (
        <span key={i} title={g.title} className="inline-flex items-center gap-0.5 rounded-md bg-surface px-1 py-0.5">
          <KeySequence keys={g.keys} tone={g.tone} />
        </span>
      ))}
    </div>
  )
}
