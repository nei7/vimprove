# vimprove

Daily Vim practice in the browser. Short, realistic editing tasks (rename an argument, delete a block, swap quote style, comment a column…) with a known optimal keystroke sequence, a coach that points out inefficient habits as you type, and spaced-repetition scheduling so the patterns stick.

- **Real Vim semantics**: a from-scratch Vim emulator in TypeScript — normal / insert / replace / visual (char, line, block) / command-line modes, operators, motions, text objects, counts, registers, undo/redo, dot-repeat, macros, marks, Vim regex search and the common ex commands (`:s`, `:g`, `:m`, `:t`, `:d`, `:j`, `:norm`, `:sort`, `:set`).
- **Par per task**: every task ships with one or more optimal solutions; the test suite replays each of them through the engine, so the par is always achievable.
- **Coach**: rules detect `hhhh`, `xxxx`, `0i`, `$a`, `dw` followed by `i`, backspacing in insert mode, visual mode for simple edits, retyping a change instead of `.`, searching the word under the cursor instead of `*`, and more. Each hint names the better key.
- **Daily loop**: due reviews first (intervals 1 → 3 → 7 → 14 → 30 → 60 days, driven by Perfect runs), then new material in a sensible order, then a drill for your most frequent recent habit. Streaks, an activity heat-map, per-topic mastery and lifetime habit stats.
- **No backend**: progress lives in `localStorage`, with JSON export/import.

## Run it

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm test            # engine + lesson validation tests (vitest)
npm run typecheck   # tsc
npm run lint        # oxlint
npm run build       # production build in dist/
npm run preview     # serve dist/
```

## Project layout

```
src/engine/      Vim emulator (pure TS, no React): parser, motions, text objects, operators, ex commands, regex
src/lessons/     task catalogue (content/*.ts), cheat-sheet data, helpers (par, goal check)
src/coach/       efficiency rules, analyzer, rating
src/progress/    zustand store (localStorage), spaced repetition + daily plan scheduler
src/components/  Editor, key stream, task panel, result modal, hints, heat-map
src/pages/       Today, Practice, Playground, Library, Stats, Cheat sheet, Settings
tests/           vitest suites; tests/lessons replays every optimal solution
```

## Adding a task

Add an object to the matching file in `src/lessons/content/`:

```ts
{
  id: 'text-objects/change-inside-quotes',
  title: 'Change a string',
  category: 'text-objects',
  difficulty: 1,
  language: 'ts',
  description: 'Change the greeting text to `Hi`.',
  start: { text: 'const greeting = "Hello, world";', cursor: [0, 0] },
  goal: { type: 'text', text: 'const greeting = "Hi";' },
  optimal: ['ci"Hi<Esc>'],          // Vim notation; the shortest one is the par
  teaches: ['ci"'],                 // ids from src/lessons/cheatsheet.ts
  hints: ['ci" finds the next quoted string on the line.'],
}
```

`npm test` fails if a solution does not reach the goal, if the start state already satisfies it, or if a `teaches` id is unknown.

## Engine assumptions

Behaves like Vim with `autoindent`, `expandtab`, `shiftwidth=2`, `startofline` and `wrapscan` on (tasks can override options). Every key press counts, including `<Esc>`, `<CR>` and control keys, as in VimGolf; a task is complete when the buffer matches the target in normal mode. Not emulated: folds, windows/buffers, `=`/`gq` formatting, the system clipboard (`"+` is an alias of the unnamed register), plugins.

## Deploy

The app uses hash routing, so any static host works.

**Cloudflare Pages** (live at https://vimprove-b3a.pages.dev): `.github/workflows/cloudflare-pages.yml` deploys `dist/` on pushes to `main`; it needs the repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. To deploy by hand with the same variables in your environment:

```bash
npm run deploy:cf
```

**GitHub Pages**: `.github/workflows/deploy.yml` publishes `dist/` on pushes to `main` (enable Pages → "GitHub Actions" in the repository settings).
