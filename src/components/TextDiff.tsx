import { useMemo } from 'react'

type Op = { kind: 'same' | 'del' | 'add'; text: string }

/** Minimal line-based diff (LCS) for small texts. */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', text: a[i] })
      i++
    } else {
      ops.push({ kind: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ kind: 'del', text: a[i++] })
  while (j < m) ops.push({ kind: 'add', text: b[j++] })
  return ops
}

function renderWs(s: string): string {
  return s.replace(/\t/g, '→   ').replace(/ +$/, (m) => '·'.repeat(m.length))
}

export function TextDiff({ from, to, showDiff }: { from: string; to: string; showDiff: boolean }) {
  const ops = useMemo(() => diffLines(from.split('\n'), to.split('\n')), [from, to])
  if (!showDiff) {
    return (
      <pre className="overflow-auto rounded-lg bg-mantle p-3 font-mono text-[13px] leading-6 text-text">
        {to.split('\n').map((l, i) => (
          <div key={i} className="whitespace-pre">
            {renderWs(l) || ' '}
          </div>
        ))}
      </pre>
    )
  }
  return (
    <pre className="overflow-auto rounded-lg bg-mantle p-3 font-mono text-[13px] leading-6">
      {ops.map((op, i) => (
        <div
          key={i}
          className={`whitespace-pre ${
            op.kind === 'del' ? 'bg-red/15 text-red line-through decoration-red/60' : op.kind === 'add' ? 'bg-green/15 text-green' : 'text-text'
          }`}
        >
          <span className="inline-block w-4 select-none text-overlay">{op.kind === 'del' ? '-' : op.kind === 'add' ? '+' : ' '}</span>
          {renderWs(op.text) || ' '}
        </div>
      ))}
    </pre>
  )
}
