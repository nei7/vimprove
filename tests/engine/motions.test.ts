import { describe, expect, test } from 'vitest'
import { edit } from './helpers'

describe('basic motions', () => {
  test('hjkl', () => {
    expect(edit('ab|cd', 'h')).toBe('a|bcd')
    expect(edit('ab|cd', 'l')).toBe('abc|d')
    expect(edit('abc|d', 'l')).toBe('abc|d')
    expect(edit('a|bc\nxyz', 'j')).toBe('abc\nx|yz')
    expect(edit('abc\nx|yz', 'k')).toBe('a|bc\nxyz')
    expect(edit('|abcdef\nab\nabcdef', '$jj')).toBe('abcdef\nab\nabcde|f')
    expect(edit('|abcdef\nab\nabcdef', '4ljj')).toBe('abcdef\nab\nabcd|ef')
    expect(edit('|abcdef', '3l')).toBe('abc|def')
    expect(edit('|a\nb\nc\nd', '10j')).toBe('a\nb\nc\n|d')
  })

  test('0 ^ $ g_ |', () => {
    expect(edit('  foo b|ar', '0')).toBe('|  foo bar')
    expect(edit('  foo b|ar', '^')).toBe('  |foo bar')
    expect(edit('  f|oo bar', '$')).toBe('  foo ba|r')
    expect(edit('  f|oo bar   ', 'g_')).toBe('  foo ba|r   ')
    expect(edit('|abcdef', '4|')).toBe('abc|def')
    expect(edit('|abc\nabcdef', '2$')).toBe('abc\nabcde|f')
  })

  test('word motions', () => {
    expect(edit('|foo bar baz', 'w')).toBe('foo |bar baz')
    expect(edit('|foo bar baz', '2w')).toBe('foo bar |baz')
    expect(edit('|foo.bar baz', 'w')).toBe('foo|.bar baz')
    expect(edit('|foo.bar baz', 'W')).toBe('foo.bar |baz')
    expect(edit('|foo bar', 'e')).toBe('fo|o bar')
    expect(edit('fo|o bar', 'e')).toBe('foo ba|r')
    expect(edit('foo ba|r', 'b')).toBe('foo |bar')
    expect(edit('foo |bar', 'b')).toBe('|foo bar')
    expect(edit('foo.bar |baz', 'B')).toBe('|foo.bar baz')
    expect(edit('foo |bar', 'ge')).toBe('fo|o bar')
    expect(edit('foo bar\n|baz', 'b')).toBe('foo |bar\nbaz')
    expect(edit('foo b|ar\nbaz', 'w')).toBe('foo bar\n|baz')
    expect(edit('foo|\n\nbar', 'w')).toBe('foo\n|\nbar')
    expect(edit('|foo\n  bar', 'w')).toBe('foo\n  |bar')
    expect(edit('foo b|ar', 'w')).toBe('foo ba|r')
    expect(edit('foo b|ar', 'e')).toBe('foo ba|r')
  })

  test('f F t T ; ,', () => {
    expect(edit('|foo(bar, baz)', 'f(')).toBe('foo|(bar, baz)')
    expect(edit('|foo(bar, baz)', 't,')).toBe('foo(ba|r, baz)')
    expect(edit('foo(bar, ba|z)', 'F(')).toBe('foo|(bar, baz)')
    expect(edit('foo(bar, ba|z)', 'T(')).toBe('foo(|bar, baz)')
    expect(edit('|a,b,c,d', 'f,;')).toBe('a,b|,c,d')
    expect(edit('|a,b,c,d', 'f,;,')).toBe('a|,b,c,d')
    expect(edit('|a,b,c,d', '2f,')).toBe('a,b|,c,d')
    expect(edit('|a,b,c,d', 't,;')).toBe('a,|b,c,d')
    expect(edit('|a,b,c,d', 'fx')).toBe('|a,b,c,d')
  })

  test('gg G and counts', () => {
    expect(edit('a\nb\n|c', 'gg')).toBe('|a\nb\nc')
    expect(edit('|a\nb\nc', 'G')).toBe('a\nb\n|c')
    expect(edit('|a\n  b\nc', '2G')).toBe('a\n  |b\nc')
    expect(edit('|a\nb\nc\nd', '3gg')).toBe('a\nb\n|c\nd')
  })

  test('paragraphs', () => {
    expect(edit('|a\nb\n\nc\nd', '}')).toBe('a\nb\n|\nc\nd')
    expect(edit('|a\nb\n\nc\nd', '}}')).toBe('a\nb\n\nc\n|d')
    expect(edit('a\nb\n\nc\n|d', '{')).toBe('a\nb\n|\nc\nd')
  })

  test('%', () => {
    expect(edit('|foo(a, (b), c)', '%')).toBe('foo(a, (b), c|)')
    expect(edit('foo(a, (b), c|)', '%')).toBe('foo|(a, (b), c)')
    expect(edit('if (x) |{\n  y\n}', '%')).toBe('if (x) {\n  y\n|}')
  })

  test('search / ? n N * #', () => {
    expect(edit('|foo bar foo baz', '/foo<CR>')).toBe('foo bar |foo baz')
    expect(edit('|foo bar foo baz', '/foo<CR>n')).toBe('|foo bar foo baz')
    expect(edit('|foo bar foo baz', '*')).toBe('foo bar |foo baz')
    expect(edit('foo bar |foo baz', '#')).toBe('|foo bar foo baz')
    expect(edit('|foo foobar', '*')).toBe('|foo foobar')
    expect(edit('|foo foobar', 'g*')).toBe('foo |foobar')
    expect(edit('a\nb\n|c', '?a<CR>')).toBe('|a\nb\nc')
    expect(edit('|ab\nab', '/b<CR>N')).toBe('ab\na|b')
    expect(edit('|x1 x2 x3', '/x\\d<CR>n')).toBe('x1 x2 |x3')
    expect(edit('|foo Foo', '/\\cFOO<CR>')).toBe('foo |Foo')
  })

  test('marks', () => {
    expect(edit('|a\n  b\nc', 'jlmaggk`a')).toBe('a\n | b\nc')
    expect(edit('|a\n  b\nc', "jlmagg'a")).toBe('a\n  |b\nc')
  })

  test('H M L + - _ <CR>', () => {
    expect(edit('|a\nb\nc\nd\ne', 'L')).toBe('a\nb\nc\nd\n|e')
    expect(edit('|a\nb\nc\nd\ne', 'M')).toBe('a\nb\n|c\nd\ne')
    expect(edit('a\n  b|\nc', '-')).toBe('|a\n  b\nc')
    expect(edit('|a\n  b\nc', '+')).toBe('a\n  |b\nc')
    expect(edit('|a\n  b\nc', '<CR>')).toBe('a\n  |b\nc')
    expect(edit('a|bc\n  b\nc', '2_')).toBe('abc\n  |b\nc')
  })
})
