import type { Rating } from '../lessons/types'

/** VimGolf-style rating: at or under par is perfect. */
export function rate(keys: number, par: number): Rating {
  if (keys <= par) return 'perfect'
  if (keys <= par + 2 || keys <= Math.ceil(par * 1.5)) return 'good'
  return 'ok'
}

export const RATING_LABEL: Record<Rating, string> = {
  perfect: 'Perfect',
  good: 'Good',
  ok: 'Completed',
}

export const RATING_EMOJI: Record<Rating, string> = {
  perfect: '🏆',
  good: '👍',
  ok: '✅',
}

/** 0..1 efficiency score for progress bars. */
export function efficiency(keys: number, par: number): number {
  if (keys <= 0) return 0
  return Math.min(1, par / keys)
}
