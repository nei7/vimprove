import type { Lesson } from '../types'
import { lines } from './util'

export const registerLessons: Lesson[] = [
  {
    id: 'registers/register-zero',
    title: 'Paste what you yanked, not what you deleted',
    category: 'registers',
    difficulty: 2,
    language: 'ts',
    description:
      'You already yanked `userId`. Delete the debug comment line, then paste `userId` into the `log()` call. Deleting overwrites the unnamed register, so use "0.',
    start: {
      text: lines('const id = userId;', '// temporary debug line', 'log();'),
      cursor: [0, 0],
      registers: { '"': { type: 'char', text: 'userId' }, '0': { type: 'char', text: 'userId' } },
    },
    goal: { type: 'text', text: lines('const id = userId;', 'log(userId);') },
    optimal: ['jddf("0p', 'jddjf("0p'],
    teaches: ['"0', 'p'],
    hints: ['Register 0 always holds the last yank; deletes never touch it.'],
  },
  {
    id: 'registers/blackhole',
    title: 'Delete without clobbering the register',
    category: 'registers',
    difficulty: 2,
    language: 'ts',
    description:
      'You yanked the line `  return cache;`. Delete the two log lines and paste the yanked line in their place. Either keep the yank safe with "_ or paste from "0.',
    start: {
      text: lines('function get() {', "  log('a');", "  log('b');", '}'),
      cursor: [0, 0],
      registers: { '"': { type: 'line', text: '  return cache;' }, '0': { type: 'line', text: '  return cache;' } },
    },
    goal: { type: 'text', text: lines('function get() {', '  return cache;', '}') },
    optimal: ['j"_2ddP', 'j2dd"0P', 'j"_dd"_ddP'],
    teaches: ['"_', '"0'],
    hints: ['"_ is the black-hole register: text deleted into it is gone and nothing else changes.'],
  },
  {
    id: 'registers/ctrl-r-insert',
    title: 'Insert a register while typing',
    category: 'registers',
    difficulty: 2,
    language: 'ts',
    description:
      'You yanked `x`. Replace both `foo` and `bar` with it. Use Ctrl-R 0 in insert mode so the change is repeatable with .',
    start: {
      text: lines('a = foo;', 'b = bar;'),
      cursor: [0, 0],
      registers: { '"': { type: 'char', text: 'x' }, '0': { type: 'char', text: 'x' } },
    },
    goal: { type: 'text', text: lines('a = x;', 'b = x;') },
    optimal: ['wwciw<C-r>0<Esc>j.', '$bciw<C-r>0<Esc>j.'],
    teaches: ['<C-r>', '"0', 'dot'],
    hints: ['Ctrl-R {register} inserts the register contents while in insert mode.'],
  },
  {
    id: 'registers/named-register',
    title: 'Collect lines in a named register',
    category: 'registers',
    difficulty: 3,
    language: 'ts',
    description: 'Move both import lines to the bottom, keeping their order. Append the second one to the same register with an uppercase name.',
    start: { text: lines("import a from 'a';", 'const x = 1;', "import b from 'b';", 'const y = 2;'), cursor: [0, 0] },
    goal: { type: 'text', text: lines('const x = 1;', 'const y = 2;', "import a from 'a';", "import b from 'b';") },
    optimal: ['"addj"Add"ap', 'ddjdd"2pp', ':g/import/m$<CR>'],
    teaches: ['"a', 'numbered-registers'],
    hints: ['"add deletes into register a; "Add appends to it. "ap puts the collected lines.'],
  },
  {
    id: 'registers/paste-above',
    title: 'Paste above the current line',
    category: 'registers',
    difficulty: 1,
    language: 'ts',
    description: 'Copy the `use(...)` line and paste it above the `listen` line.',
    start: { text: lines('app.use(json());', 'app.listen(3000);'), cursor: [0, 0] },
    goal: { type: 'text', text: lines('app.use(json());', 'app.use(json());', 'app.listen(3000);') },
    optimal: ['yyp', 'yyjP'],
    teaches: ['P', 'yy'],
  },
]
