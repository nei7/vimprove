import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Editor } from '../components/Editor/Editor'
import { KeyStream, type KeyGroup } from '../components/KeyStream'
import { TaskPanel } from '../components/TaskPanel'
import { HintToast } from '../components/HintToast'
import { ResultModal } from '../components/ResultModal'
import { useVim } from '../hooks/useVim'
import { ALL_LESSONS, applyLessonRegisters, goalReached, LESSON_BY_ID, parFor } from '../lessons'
import { Coach } from '../coach/analyzer'
import type { Hint } from '../coach/rules'
import { rate } from '../coach/rating'
import { useProgress } from '../progress/store'
import { useShallow } from 'zustand/react/shallow'
import { buildDailyPlan, learningOrder, todayStr } from '../progress/scheduler'
import { parseKeys, type VimEvent, type Vim } from '../engine'
import type { Rating } from '../lessons/types'

interface Finished {
  keys: string[]
  timeMs: number
  rating: Rating
  hints: Hint[]
  usedSolution: boolean
}

export function PracticePage() {
  // lesson ids contain a slash (category/name), so the route is a splat
  const params = useParams()
  const lessonId = params['*']
  const lesson = lessonId ? LESSON_BY_ID.get(lessonId) : undefined
  if (!lesson) {
    return (
      <div className="card p-6">
        <div className="text-lg font-semibold">Lesson not found</div>
        <div className="text-sm text-subtext">The link may be outdated.</div>
      </div>
    )
  }
  return <Practice key={lesson.id} lessonId={lesson.id} />
}

function Practice({ lessonId }: { lessonId: string }) {
  const lesson = LESSON_BY_ID.get(lessonId)!
  const navigate = useNavigate()
  const par = useMemo(() => parFor(lesson), [lesson])
  const settings = useProgress((s) => s.settings)
  const recordAttempt = useProgress((s) => s.recordAttempt)
  const markSolutionShown = useProgress((s) => s.markSolutionShown)
  const lessonProgress = useProgress((s) => s.lessons[lesson.id])
  const progressData = useProgress(
    useShallow((s) => ({ lessons: s.lessons, days: s.days, habits: s.habits, settings: s.settings, schemaVersion: s.schemaVersion, createdAt: s.createdAt })),
  )

  const coach = useRef(new Coach())
  const [keys, setKeys] = useState<string[]>([])
  const [groups, setGroups] = useState<KeyGroup[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [toast, setToast] = useState<Hint | null>(null)
  const [hintsRevealed, setHintsRevealed] = useState(0)
  const [solutionShown, setSolutionShown] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const replayTimer = useRef<number | null>(null)
  const pendingGroup = useRef<string[]>([])

  const onEvents = useCallback((events: VimEvent[], vim: Vim) => {
    void vim
    void events
  }, [])

  const { vim, feed, reset, tick } = useVim(
    lesson.start.text,
    { line: lesson.start.cursor[0], col: lesson.start.cursor[1] },
    { ...lesson.options, relativenumber: settings.relativeNumber },
    onEvents,
  )

  useEffect(() => {
    applyLessonRegisters(vim, lesson)
  }, [vim, lesson])

  // timer
  useEffect(() => {
    if (startedAt === null || finished) return
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 500)
    return () => window.clearInterval(id)
  }, [startedAt, finished])

  const nextLessonId = useMemo(() => {
    const today = todayStr()
    const plan = buildDailyPlan(ALL_LESSONS, progressData, today)
    const done = new Set(progressData.days[today]?.completed ?? [])
    const idx = plan.findIndex((p) => p.lessonId === lesson.id)
    const after = idx >= 0 ? [...plan.slice(idx + 1), ...plan.slice(0, idx)] : plan
    const next = after.find((p) => !done.has(p.lessonId) && p.lessonId !== lesson.id)
    if (next) return next.lessonId
    const order = learningOrder(ALL_LESSONS)
    const i = order.findIndex((l) => l.id === lesson.id)
    return order[(i + 1) % order.length]?.id ?? null
  }, [lesson.id, progressData])

  const restart = useCallback(() => {
    if (replayTimer.current) {
      window.clearInterval(replayTimer.current)
      replayTimer.current = null
    }
    reset(lesson.start.text, { line: lesson.start.cursor[0], col: lesson.start.cursor[1] }, lesson.options)
    applyLessonRegisters(vim, lesson)
    coach.current.reset()
    pendingGroup.current = []
    setKeys([])
    setGroups([])
    setStartedAt(null)
    setElapsed(0)
    setFinished(null)
    setToast(null)
    setReplaying(false)
    setStatus(null)
  }, [lesson, reset, vim])

  const finish = useCallback(
    (allKeys: string[]) => {
      const timeMs = startedAt ? Date.now() - startedAt : 0
      const rating = rate(allKeys.length, par)
      const result: Finished = { keys: allKeys, timeMs, rating, hints: [...coach.current.hints], usedSolution: solutionShown }
      setFinished(result)
      setToast(null)
      recordAttempt({
        lessonId: lesson.id,
        keys: allKeys.length,
        par,
        timeMs,
        rating,
        usedSolution: solutionShown,
        habits: { ...coach.current.habits },
        date: todayStr(),
      })
    },
    [lesson.id, par, recordAttempt, solutionShown, startedAt],
  )

  const handleKey = useCallback(
    (key: string) => {
      if (finished || replaying) return
      if (startedAt === null) setStartedAt(Date.now())
      const before = { lines: [...vim.lines], cursor: { ...vim.cursor } }
      const events = feed(key)
      const nextKeys = [...keys, key]
      setKeys(nextKeys)
      // group keys per completed command for the key stream
      pendingGroup.current.push(key)
      const completed = events.some((e) => e.type === 'command' || e.type === 'insert-session' || e.type === 'invalid' || e.type === 'ex')
      const invalid = events.some((e) => e.type === 'invalid')
      if (completed && (vim.mode === 'normal' || vim.mode.startsWith('visual'))) {
        const g: KeyGroup = { keys: pendingGroup.current, tone: invalid ? 'bad' : 'default' }
        pendingGroup.current = []
        setGroups((gs) => [...gs, g])
      }
      const raised = coach.current.process(events, before)
      if (raised.length > 0 && settings.liveHints) setToast(raised[0])
      if (goalReached(vim, lesson)) finish(nextKeys)
    },
    [feed, finish, finished, keys, lesson, replaying, settings.liveHints, startedAt, vim],
  )

  const showSolution = useCallback(() => {
    setSolutionShown(true)
    markSolutionShown(lesson.id)
    setStatus('Solution revealed below. Replay it, then restart and try it yourself.')
  }, [lesson.id, markSolutionShown])

  const replay = useCallback(
    (notation: string) => {
      if (replayTimer.current) window.clearInterval(replayTimer.current)
      setFinished(null)
      setSolutionShown(true)
      markSolutionShown(lesson.id)
      reset(lesson.start.text, { line: lesson.start.cursor[0], col: lesson.start.cursor[1] }, lesson.options)
      applyLessonRegisters(vim, lesson)
      coach.current.reset()
      pendingGroup.current = []
      setKeys([])
      setGroups([])
      setStartedAt(null)
      setElapsed(0)
      setReplaying(true)
      setStatus('Replaying the optimal solution…')
      const ks = parseKeys(notation)
      let i = 0
      replayTimer.current = window.setInterval(() => {
        if (i >= ks.length) {
          if (replayTimer.current) window.clearInterval(replayTimer.current)
          replayTimer.current = null
          setReplaying(false)
          setStatus('That was the optimal solution. Press Restart to try it yourself.')
          return
        }
        const k = ks[i++]
        feed(k)
        setGroups((gs) => [...gs, { keys: [k], tone: 'good' }])
      }, 450)
    },
    [feed, lesson, markSolutionShown, reset, vim],
  )

  useEffect(() => () => {
    if (replayTimer.current) window.clearInterval(replayTimer.current)
  }, [])

  // keyboard shortcuts while the result modal is open
  useEffect(() => {
    if (!finished) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && nextLessonId) {
        e.preventDefault()
        navigate(`/practice/${nextLessonId}`)
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        restart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finished, navigate, nextLessonId, restart])

  const targetCursor = lesson.goal.type === 'cursor' ? { line: lesson.goal.cursor[0], col: lesson.goal.cursor[1] } : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-3">
        <Editor vim={vim} tick={tick} onKey={handleKey} targetCursor={targetCursor} autoFocus readOnly={replaying} minLines={8} />
        <div className="card p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-overlay">
            <span>Keystrokes</span>
            <span>
              {keys.length} / par {par}
            </span>
          </div>
          <KeyStream groups={groups} />
        </div>
        {status && <div className="rounded-lg border border-blue/30 bg-blue/10 p-3 text-sm text-text">{status}</div>}
        {solutionShown && !finished && (
          <div className="card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-overlay">Optimal solution</div>
            <div className="space-y-1.5">
              {lesson.optimal.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-mantle p-2">
                  <KeyStream groups={[{ keys: parseKeys(o), tone: 'good' }]} />
                  <button className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => replay(o)} disabled={replaying}>
                    ▶ Replay
                  </button>
                </div>
              ))}
            </div>
            {lesson.hints && <div className="mt-2 text-sm text-subtext">{lesson.hints.join(' ')}</div>}
          </div>
        )}
      </div>
      <TaskPanel
        lesson={lesson}
        keyCount={keys.length}
        par={par}
        elapsedMs={finished ? finished.timeMs : elapsed}
        hintsRevealed={hintsRevealed}
        onRevealHint={() => setHintsRevealed((h) => h + 1)}
        onRestart={restart}
        onShowSolution={showSolution}
        solutionShown={solutionShown}
        showDiff={settings.showTargetDiff}
        best={lessonProgress?.bestKeys ?? null}
      />
      <HintToast hint={toast} onClose={() => setToast(null)} />
      {finished && (
        <ResultModal
          lesson={lesson}
          keys={finished.keys}
          par={par}
          timeMs={finished.timeMs}
          rating={finished.rating}
          hints={finished.hints}
          usedSolution={finished.usedSolution}
          nextLessonId={nextLessonId}
          isNew={!lessonProgress || lessonProgress.completions <= 1}
          onRetry={restart}
          onNext={() => nextLessonId && navigate(`/practice/${nextLessonId}`)}
          onReplay={replay}
          onClose={() => setFinished(null)}
        />
      )}
    </div>
  )
}
