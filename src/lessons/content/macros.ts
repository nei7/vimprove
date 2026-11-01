import type { Lesson } from '../types'
import { lines } from './util'

export const macroLessons: Lesson[] = [
  {
    id: 'macros/quote-and-comma',
    title: 'Record a macro for a multi-step edit',
    category: 'macros',
    difficulty: 2,
    language: 'txt',
    description:
      'Turn each word into a quoted, comma-terminated string, keeping the indentation. Two edits per line and uneven indentation make this a job for a macro.',
    start: { text: lines('  alpha', '    beta', '  gamma', '      delta'), cursor: [0, 0] },
    goal: { type: 'text', text: lines('  "alpha",', '    "beta",', '  "gamma",', '      "delta",') },
    optimal: ['qaI"<Esc>A",<Esc>jq3@a', 'qqI"<Esc>A",<Esc>jq3@q', ':%norm I"<CR>:%norm A",<CR>'],
    teaches: ['q', '@'],
    hints: ['qa starts recording into register a; q stops. 3@a replays it three times.', 'End the macro with j so each replay works on the next line.'],
  },
  {
    id: 'macros/async-signatures',
    title: 'Macro over unaligned lines',
    category: 'macros',
    difficulty: 3,
    language: 'ts',
    description: 'Make every function async and type its parameter as `x: number`. The closing parens are in different columns.',
    start: { text: lines('function a(x) {', 'function bb(x) {', 'function ccc(x) {'), cursor: [0, 0] },
    goal: {
      type: 'text',
      text: lines('async function a(x: number) {', 'async function bb(x: number) {', 'async function ccc(x: number) {'),
    },
    optimal: ['qaIasync <Esc>f)i: number<Esc>jq2@a', 'qaIasync <Esc>f)i: number<Esc>jq@a@@'],
    teaches: ['q', '@', '@@'],
    hints: ['Inside the macro, use f) to find the paren so the position does not matter.'],
  },
  {
    id: 'macros/replay-with-count',
    title: 'Replay a macro many times',
    category: 'macros',
    difficulty: 2,
    language: 'md',
    description: 'Turn the five plain lines into a numbered-looking list by prefixing `* ` and appending ` ✓`.',
    start: { text: lines('fix bug', 'write tests', 'review', 'deploy', 'celebrate'), cursor: [0, 0] },
    goal: { type: 'text', text: lines('* fix bug ✓', '* write tests ✓', '* review ✓', '* deploy ✓', '* celebrate ✓') },
    optimal: ['qaI* <Esc>A ✓<Esc>jq4@a', '<C-v>GI* <Esc>gv$A ✓<Esc>'],
    teaches: ['q', '@', 'count'],
  },
]
