export interface CheatEntry {
  /** Stable id referenced by lessons' `teaches` and coach rules. */
  id: string
  keys: string
  name: string
  description: string
  group: string
  /** Alternative ids that should also count as "learned" for this entry. */
  aliases?: string[]
}

export const CHEATSHEET: CheatEntry[] = [
  // --- motions
  { id: 'hjkl', keys: 'h j k l', name: 'Basic movement', description: 'Left, down, up, right. Prefer bigger motions whenever possible.', group: 'Motions' },
  { id: 'w', keys: 'w / b', name: 'Word forward / back', description: 'Move to the start of the next / previous word. Punctuation counts as a word.', group: 'Motions', aliases: ['b'] },
  { id: 'e', keys: 'e / ge', name: 'End of word', description: 'Move to the end of the next / previous word.', group: 'Motions', aliases: ['ea'] },
  { id: 'W', keys: 'W B E', name: 'WORD motions', description: 'Like w/b/e but only white space separates WORDs: foo.bar is one WORD.', group: 'Motions', aliases: ['E', 'B'] },
  { id: 'f', keys: 'f{c} F{c}', name: 'Find character', description: 'Jump to the next / previous occurrence of {c} on the line.', group: 'Motions' },
  { id: 't', keys: 't{c} T{c}', name: 'Till character', description: 'Jump to just before the next / after the previous {c}.', group: 'Motions' },
  { id: ';', keys: '; ,', name: 'Repeat find', description: 'Repeat the last f/t/F/T forward (;) or backward (,).', group: 'Motions' },
  { id: '0', keys: '0 ^ $', name: 'Line extremes', description: 'Column 0, first non-blank, end of line.', group: 'Motions', aliases: ['^'] },
  { id: '$', keys: '$', name: 'End of line', description: 'Move to the last character; with a count, to the end of a later line.', group: 'Motions' },
  { id: 'G', keys: 'gg / G / {n}G', name: 'Go to line', description: 'First line, last line, or line n.', group: 'Motions', aliases: [':N'] },
  { id: '}', keys: '} {', name: 'Paragraph', description: 'Next / previous blank line.', group: 'Motions' },
  { id: '%', keys: '%', name: 'Matching bracket', description: 'Jump between matching (), [] and {}.', group: 'Motions' },
  { id: '+', keys: '+ - ⏎', name: 'Next / previous line start', description: 'First non-blank of the next (+ or Enter) or previous (-) line.', group: 'Motions' },
  { id: 'count', keys: '{n}motion', name: 'Counts', description: 'Repeat a motion or command n times: 3w, 5j, 2dd, 4p.', group: 'Motions' },

  // --- search
  { id: '/', keys: '/pat ⏎  ?pat ⏎', name: 'Search', description: 'Search forward / backward for a pattern.', group: 'Search', aliases: ['n'] },
  { id: 'n', keys: 'n N', name: 'Next / previous match', description: 'Repeat the last search in the same / opposite direction.', group: 'Search' },
  { id: '*', keys: '* #', name: 'Search word under cursor', description: 'Search forward / backward for the whole word under the cursor.', group: 'Search' },

  // --- operators
  { id: 'operator-motion', keys: '{op}{motion}', name: 'Operator + motion', description: 'd, c, y, >, <, gu, gU work on the text covered by any motion or text object.', group: 'Operators' },
  { id: 'dw', keys: 'dw / de / db', name: 'Delete word', description: 'Delete to the next word start / word end / previous word start.', group: 'Operators', aliases: ['de', 'db'] },
  { id: 'dt', keys: 'dt{c} / df{c} / ct{c}', name: 'Delete / change till', description: 'Delete or change up to (t, excluding) or through (f, including) character {c}.', group: 'Operators', aliases: ['ct', 'cf', 'df'] },
  { id: 'D', keys: 'D', name: 'Delete to end of line', description: 'Same as d$.', group: 'Operators' },
  { id: 'dd', keys: 'dd / {n}dd', name: 'Delete lines', description: 'Delete the current line, or n lines.', group: 'Operators' },
  { id: 'dG', keys: 'dG / dgg', name: 'Delete to end / start of file', description: 'Delete from the current line to the last / first line.', group: 'Operators' },
  { id: 'cw', keys: 'cw / ce', name: 'Change word', description: 'Change to the end of the word (cw behaves like ce).', group: 'Operators' },
  { id: 'C', keys: 'C', name: 'Change to end of line', description: 'Same as c$.', group: 'Operators' },
  { id: 'cc', keys: 'cc / S', name: 'Change line', description: 'Replace the whole line, keeping indentation.', group: 'Operators', aliases: ['S'] },
  { id: 's', keys: 's', name: 'Substitute character', description: 'Delete the character and enter insert mode (same as cl).', group: 'Operators' },
  { id: 'x', keys: 'x X', name: 'Delete character', description: 'Delete under / before the cursor.', group: 'Operators' },
  { id: 'r', keys: 'r{c}', name: 'Replace character', description: 'Replace the character under the cursor; r⏎ splits the line.', group: 'Operators' },
  { id: 'J', keys: 'J / gJ', name: 'Join lines', description: 'Join with the next line (J normalises spaces, gJ does not).', group: 'Operators' },
  { id: '>>', keys: '>> << / >{motion}', name: 'Shift indentation', description: 'Indent / dedent lines by shiftwidth.', group: 'Operators', aliases: ['<<', '>j'] },
  { id: 'gU', keys: 'gU gu g~ ~', name: 'Change case', description: 'Uppercase / lowercase / toggle the covered text; ~ toggles one character.', group: 'Operators', aliases: ['gu', 'u'] },
  { id: '<C-a>', keys: 'Ctrl-A / Ctrl-X', name: 'Increment / decrement', description: 'Add / subtract from the number under or after the cursor.', group: 'Operators', aliases: ['g<C-a>'] },

  // --- text objects
  { id: 'iw', keys: 'iw / aw', name: 'Word object', description: 'Inner word / a word including surrounding white space.', group: 'Text objects', aliases: ['diw', 'daw', 'ciw', 'yiw'] },
  { id: 'ci"', keys: 'i" a"  i\' a\'  i` a`', name: 'Quote objects', description: 'Inside / around quotes on the line. Works from before the quotes too.', group: 'Text objects', aliases: ["ci'", 'ca"', 'di"'] },
  { id: 'ci(', keys: 'i( a(  i[ a[  i{ a{  i< a<', name: 'Bracket objects', description: 'Inside / around the enclosing brackets (b = (), B = {}).', group: 'Text objects', aliases: ['di(', 'da(', 'ci[', 'di{', 'yi{', 'ci<', 'ci{'] },
  { id: 'cit', keys: 'it / at', name: 'Tag objects', description: 'Inside / around an HTML/XML element.', group: 'Text objects', aliases: ['dit'] },
  { id: 'ip', keys: 'ip / ap', name: 'Paragraph object', description: 'A paragraph (ap includes the following blank line).', group: 'Text objects', aliases: ['dap', 'vip'] },

  // --- insert
  { id: 'i', keys: 'i a', name: 'Insert / append', description: 'Insert before / after the cursor.', group: 'Insert' },
  { id: 'I', keys: 'I', name: 'Insert at line start', description: 'Insert before the first non-blank character.', group: 'Insert' },
  { id: 'A', keys: 'A', name: 'Append at line end', description: 'Append after the last character.', group: 'Insert' },
  { id: 'o', keys: 'o O', name: 'Open line', description: 'Open a new line below / above and insert (keeps indentation).', group: 'Insert', aliases: ['O'] },
  { id: '<C-w>', keys: 'Ctrl-W / Ctrl-U', name: 'Delete while inserting', description: 'Delete the word / everything before the cursor on the line.', group: 'Insert' },
  { id: '<C-r>', keys: 'Ctrl-R {reg}', name: 'Insert register', description: 'Paste a register while in insert mode; Ctrl-R 0 is the last yank.', group: 'Insert' },

  // --- repeat
  { id: 'dot', keys: '.', name: 'Repeat change', description: 'Repeat the last change, including the text typed in insert mode. A count replaces the original count.', group: 'Repeat' },

  // --- registers
  { id: 'yy', keys: 'yy / y{motion}', name: 'Yank', description: 'Copy a line / the covered text.', group: 'Registers', aliases: ['y'] },
  { id: 'p', keys: 'p P', name: 'Put', description: 'Paste after / before the cursor (lines go below / above).', group: 'Registers', aliases: ['P', 'yyp', 'ddp'] },
  { id: '"0', keys: '"0p', name: 'Yank register', description: 'Register 0 keeps the last yank even after deletes.', group: 'Registers' },
  { id: '"_', keys: '"_d', name: 'Black-hole register', description: 'Delete without touching any register.', group: 'Registers' },
  { id: '"a', keys: '"ay / "Ay / "ap', name: 'Named registers', description: 'Yank or delete into a–z; uppercase appends.', group: 'Registers', aliases: ['numbered-registers'] },
  { id: 'viwp', keys: 'viwp', name: 'Replace selection with register', description: 'In visual mode p replaces the selection; the replaced text goes to the unnamed register.', group: 'Registers' },

  // --- visual
  { id: 'v', keys: 'v V Ctrl-V', name: 'Visual modes', description: 'Character-wise, line-wise and block-wise selection.', group: 'Visual', aliases: ['V', '<C-v>'] },
  { id: 'block-I', keys: 'Ctrl-V … I / A', name: 'Block insert / append', description: 'Insert on every line of the block; $A appends at each line end.', group: 'Visual', aliases: ['block-A'] },
  { id: 'block-d', keys: 'Ctrl-V … d / c / r', name: 'Block delete / change / replace', description: 'Operate on a rectangle of text.', group: 'Visual', aliases: ['block-c'] },
  { id: 'gv', keys: 'gv', name: 'Reselect', description: 'Reselect the previous visual area.', group: 'Visual' },

  // --- ex
  { id: ':s', keys: ':s/pat/rep/g', name: 'Substitute on line', description: 'Replace on the current line (g = all occurrences).', group: 'Ex commands', aliases: ['regex', 'regex-groups', 'regex-case', 'regex-word'] },
  { id: ':%s', keys: ':%s/pat/rep/g', name: 'Substitute in file', description: '% is the whole file; a visual selection gives \'<,\'>.', group: 'Ex commands' },
  { id: ':g', keys: ':g/pat/cmd  :v/pat/cmd', name: 'Global command', description: 'Run an ex command on every (non-)matching line, e.g. :g/debug/d.', group: 'Ex commands' },
  { id: ':m', keys: ':m {addr}', name: 'Move lines', description: 'Move lines below an address: :m0 top, :m$ bottom, :m+1 down.', group: 'Ex commands' },
  { id: ':t', keys: ':t {addr}', name: 'Copy lines', description: 'Copy lines below an address (:t. duplicates).', group: 'Ex commands' },
  { id: ':sort', keys: ':sort / :sort u / :sort n', name: 'Sort lines', description: 'Sort the range (default: whole file).', group: 'Ex commands' },
  { id: ':norm', keys: ':norm {keys}', name: 'Normal on range', description: 'Run normal-mode keys on each line of the range.', group: 'Ex commands' },

  // --- macros
  { id: 'q', keys: 'q{a-z} … q', name: 'Record macro', description: 'Record keystrokes into a register.', group: 'Macros' },
  { id: '@', keys: '@{a-z} / @@ / {n}@a', name: 'Replay macro', description: 'Run a macro, repeat the last one, or run it n times.', group: 'Macros', aliases: ['@@'] },
]

export const CHEAT_GROUPS = [...new Set(CHEATSHEET.map((c) => c.group))]

/** Map from any id/alias to its cheat entry. */
export const CHEAT_BY_ID = new Map<string, CheatEntry>()
for (const c of CHEATSHEET) {
  CHEAT_BY_ID.set(c.id, c)
  for (const a of c.aliases ?? []) CHEAT_BY_ID.set(a, c)
}
