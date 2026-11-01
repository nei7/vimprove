import { describe, expect, test } from 'vitest'
import { edit } from './helpers'

describe('word objects', () => {
  test('iw aw', () => {
    expect(edit('foo b|ar baz', 'diw')).toBe('foo | baz')
    expect(edit('foo b|ar baz', 'daw')).toBe('foo |baz')
    expect(edit('foo b|ar', 'daw')).toBe('fo|o')
    expect(edit('foo b|ar baz', 'ciwX<Esc>')).toBe('foo |X baz')
    expect(edit('foo| bar', 'diw')).toBe('foo|bar')
    expect(edit('foo| bar', 'daw')).toBe('fo|o')
    expect(edit('foo.b|ar baz', 'daw')).toBe('foo.|baz')
    expect(edit('foo.b|ar baz', 'daW')).toBe('|baz')
    expect(edit('|foo', 'yiwP')).toBe('fo|ofoo')
  })
})

describe('quote objects', () => {
  test('i" a"', () => {
    expect(edit('x = "hel|lo" + y', 'di"')).toBe('x = "|" + y')
    expect(edit('x = "hel|lo" + y', 'da"')).toBe('x = |+ y')
    expect(edit('x = "hel|lo"', 'da"')).toBe('x |=')
    expect(edit('x = "hel|lo" + y', 'ci"bye<Esc>')).toBe('x = "by|e" + y')
    expect(edit('|x = "hello" + y', 'ci"bye<Esc>')).toBe('x = "by|e" + y')
    expect(edit("f('a|b', 'cd')", "ci'X<Esc>")).toBe("f('|X', 'cd')")
    expect(edit('|a "b" c "d"', 'ci"X<Esc>')).toBe('a "|X" c "d"')
    expect(edit('a "b" |c "d"', 'ci"X<Esc>')).toBe('a "b" c "|X"')
    expect(edit('a "b" "|c" "d"', 'ci"X<Esc>')).toBe('a "b" "|X" "d"')
    expect(edit('x = "|"', 'ci"y<Esc>')).toBe('x = "|y"')
    expect(edit('x = `a ${|b} c`', 'ci`y<Esc>')).toBe('x = `|y`')
    expect(edit('x = "a\\"b|c"', 'di"')).toBe('x = "|"')
  })
})

describe('bracket objects', () => {
  test('single line', () => {
    expect(edit('f(a, |b)', 'di(')).toBe('f(|)')
    expect(edit('f(a, |b)', 'dib')).toBe('f(|)')
    expect(edit('f(a, |b)', 'da(')).toBe('|f')
    expect(edit('f(a, |b)', 'ci(x<Esc>')).toBe('f(|x)')
    expect(edit('f(a, (b, |c), d)', 'di(')).toBe('f(a, (|), d)')
    expect(edit('f(a, (b, |c), d)', '2di(')).toBe('f(a, (|), d)')
    expect(edit('f(|a, (b, c), d)', 'di(')).toBe('f(|)')
    expect(edit('f|(a)', 'di(')).toBe('f(|)')
    expect(edit('f(a|)', 'di(')).toBe('f(|)')
    expect(edit('x[|1, 2]', 'di[')).toBe('x[|]')
    expect(edit('<a|b>', 'di<')).toBe('<|>')
    expect(edit('f(|)', 'ci(x<Esc>')).toBe('f(|x)')
    expect(edit('{ a: |1 }', 'diB')).toBe('{|}')
  })

  test('multi-line blocks become linewise', () => {
    expect(edit('f() {\n  a|;\n  b;\n}', 'di{')).toBe('f() {\n|}')
    expect(edit('f() {\n  a|;\n  b;\n}', 'ci{x<Esc>')).toBe('f() {\n  |x\n}')
    expect(edit('f() {\n  a|;\n  b;\n}', 'da{')).toBe('f()| ')
    expect(edit('f() {\n  a|;\n  b;\n}', 'yi{Gp')).toBe('f() {\n  a;\n  b;\n}\n  |a;\n  b;')
    expect(edit('foo(\n  a|,\n  b\n)', 'di(')).toBe('foo(\n|)')
    expect(edit('x = {\n  a: 1, b|: 2 }', 'di{')).toBe('x = {\n|}')
  })
})

describe('paragraph & tag objects', () => {
  test('ip ap', () => {
    expect(edit('a\nb|\n\nc\nd', 'dip')).toBe('|\nc\nd')
    expect(edit('a\nb|\n\nc\nd', 'dap')).toBe('|c\nd')
    expect(edit('a\nb\n\nc\nd|', 'dap')).toBe('a\n|b')
    expect(edit('a\n|\n\nb', 'dip')).toBe('a\n|b')
  })
  test('it at', () => {
    expect(edit('<div><p>he|llo</p></div>', 'dit')).toBe('<div><p>|</p></div>')
    expect(edit('<div><p>he|llo</p></div>', 'dat')).toBe('<div>|</div>')
    expect(edit('<div><p>he|llo</p></div>', 'cit bye <Esc>')).toBe('<div><p> bye| </p></div>')
    expect(edit('<ul>\n  <li>a|</li>\n</ul>', 'dat')).toBe('<ul>\n | \n</ul>')
    expect(edit('<a href="x">li|nk</a>', 'cityes<Esc>')).toBe('<a href="x">ye|s</a>')
    expect(edit('<br/><b>x|</b>', 'dit')).toBe('<br/><b>|</b>')
  })
})
