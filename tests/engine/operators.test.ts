import { describe, expect, test } from 'vitest'
import { edit, run } from './helpers'

describe('delete', () => {
  test('x X dd D', () => {
    expect(edit('a|bc', 'x')).toBe('a|c')
    expect(edit('ab|c', 'x')).toBe('a|b')
    expect(edit('a|bc', '2x')).toBe('|a')
    expect(edit('ab|c', 'X')).toBe('a|c')
    expect(edit('a\n|b\nc', 'dd')).toBe('a\n|c')
    expect(edit('a\n|b\nc', '2dd')).toBe('|a')
    expect(edit('a\nb\n|c', 'dd')).toBe('a\n|b')
    expect(edit('|a', 'dd')).toBe('|')
    expect(edit('foo |bar baz', 'D')).toBe('foo| ')
    expect(edit('foo b|ar baz', 'D')).toBe('foo |b')
    expect(edit('  a\n|  b\n  c', 'dd')).toBe('  a\n  |c')
  })

  test('dw de db and the end-of-line special case', () => {
    expect(edit('|foo bar baz', 'dw')).toBe('|bar baz')
    expect(edit('foo |bar baz', 'dw')).toBe('foo |baz')
    expect(edit('foo bar |baz\nqux', 'dw')).toBe('foo bar| \nqux')
    expect(edit('foo bar |baz\n  qux', 'dw')).toBe('foo bar| \n  qux')
    expect(edit('|foo bar', 'de')).toBe('| bar')
    expect(edit('foo b|ar', 'db')).toBe('foo |ar')
    expect(edit('foo |bar baz', 'd2w')).toBe('foo| ')
    expect(edit('foo |bar baz', '2dw')).toBe('foo| ')
    expect(edit('|foo.bar baz', 'dW')).toBe('|baz')
    expect(edit('|foo.bar baz', 'dw')).toBe('|.bar baz')
  })

  test('d with f t $ 0 ^ j k G', () => {
    expect(edit('|foo(bar)', 'df(')).toBe('|bar)')
    expect(edit('|foo(bar)', 'dt(')).toBe('|(bar)')
    expect(edit('foo(|bar)', 'dt)')).toBe('foo(|)')
    expect(edit('foo b|ar', 'd$')).toBe('foo |b')
    expect(edit('foo b|ar', 'd0')).toBe('|ar')
    expect(edit('  foo b|ar', 'd^')).toBe('  |ar')
    expect(edit('a\n|b\nc\nd', 'dj')).toBe('a\n|d')
    expect(edit('a\nb\n|c\nd', 'dk')).toBe('a\n|d')
    expect(edit('a\n|b\nc\nd', 'dG')).toBe('|a')
    expect(edit('a\nb\n|c\nd', 'dgg')).toBe('|d')
  })

  test('exclusive-linewise rule: d} on a paragraph', () => {
    expect(edit('|a\nb\n\nc', 'd}')).toBe('|\nc')
    expect(edit('x |a\nb\n\nc', 'd}')).toBe('x| \n\nc')
  })

  test('registers after delete', () => {
    const r = run('foo bar', [0, 0], 'dwdw')
    expect(r.vim.getRegister('"')!.lines).toEqual(['bar'])
    expect(r.vim.getRegister('-')!.lines).toEqual(['bar'])
    const r2 = run('a\nb\nc', [0, 0], 'dddd')
    expect(r2.vim.getRegister('1')!.lines).toEqual(['b'])
    expect(r2.vim.getRegister('2')!.lines).toEqual(['a'])
    const r3 = run('foo bar', [0, 0], '"adw"Adw"ap')
    expect(r3.text).toBe('foo bar')
  })
})

describe('change', () => {
  test('cw acts like ce', () => {
    expect(edit('|foo bar', 'cwxyz<Esc>')).toBe('xy|z bar')
    expect(edit('f|oo bar', 'cwxyz<Esc>')).toBe('fxy|z bar')
    expect(edit('foo|  bar', 'cw-<Esc>')).toBe('foo|-bar')
    expect(edit('|foo.bar baz', 'cWx<Esc>')).toBe('|x baz')
  })

  test('cc S C s', () => {
    expect(edit('  foo\n  b|ar', 'ccx<Esc>')).toBe('  foo\n  |x')
    expect(edit('  foo\n  b|ar', 'Sx<Esc>')).toBe('  foo\n  |x')
    expect(edit('  foo\n  b|ar', 'cc<Esc>')).toBe('  foo\n|')
    expect(edit('foo b|ar baz', 'Cx<Esc>')).toBe('foo b|x')
    expect(edit('foo b|ar', 'sX<Esc>')).toBe('foo b|Xr')
    expect(edit('foo b|ar', '2sX<Esc>')).toBe('foo b|X')
    expect(edit('|', 'sX<Esc>')).toBe('|X')
  })

  test('ct cf c$', () => {
    expect(edit('f(|a, b)', 'ct,x<Esc>')).toBe('f(|x, b)')
    expect(edit('f(|a, b)', 'cf,x<Esc>')).toBe('f(|x b)')
    expect(edit('foo |bar', 'c$X<Esc>')).toBe('foo |X')
  })
})

describe('yank & put', () => {
  test('yy p P', () => {
    expect(edit('|a\nb', 'yyp')).toBe('a\n|a\nb')
    expect(edit('a\n|  b', 'yyP')).toBe('a\n  |b\n  b')
    expect(edit('|a\nb', 'yy3p')).toBe('a\n|a\na\na\nb')
    expect(edit('|a\nb\nc', '2yyGp')).toBe('a\nb\nc\n|a\nb')
  })
  test('yw p charwise', () => {
    expect(edit('|foo bar', 'ywP')).toBe('foo| foo bar')
    expect(edit('|foo bar', 'yw$p')).toBe('foo barfoo| ')
    expect(edit('|foo bar', 'yiwep')).toBe('foofo|o bar')
    expect(edit('|ab', 'ylp')).toBe('a|ab')
    expect(edit('|ab', 'yl2p')).toBe('aa|ab')
    expect(edit('|ab', 'ylgp')).toBe('aa|b')
  })
  test('yank register 0 survives deletes', () => {
    expect(edit('|foo bar', 'yiwwdiw"0P')).toBe('foofo|o ')
  })
  test('xp swaps characters, ddp swaps lines', () => {
    expect(edit('a|bc', 'xp')).toBe('ac|b')
    expect(edit('|a\nb\nc', 'ddp')).toBe('b\n|a\nc')
  })
  test('yank cursor placement', () => {
    expect(edit('foo b|ar', 'yiw')).toBe('foo |bar')
    expect(edit('a\n|b\nc', 'yj')).toBe('a\n|b\nc')
    expect(edit('a\n|b\nc', 'yk')).toBe('|a\nb\nc')
  })
})

describe('other operators', () => {
  test('J gJ', () => {
    expect(edit('|foo\n  bar', 'J')).toBe('foo| bar')
    expect(edit('|foo\n  bar', 'gJ')).toBe('foo|  bar')
    expect(edit('|a\nb\nc\nd', '3J')).toBe('a b| c\nd')
    expect(edit('|foo(\n  )', 'J')).toBe('foo(|)')
    expect(edit('|foo \nbar', 'J')).toBe('foo| bar')
  })
  test('>> << with counts', () => {
    expect(edit('|a\nb', '>>')).toBe('  |a\nb')
    expect(edit('|a\nb', '2>>')).toBe('  |a\n  b')
    expect(edit('    |a', '<<')).toBe('  |a')
    expect(edit('|a\nb\nc', '>j')).toBe('  |a\n  b\nc')
    expect(edit('|a\nb', '>>', { shiftwidth: 4 })).toBe('    |a\nb')
    expect(edit('|a\n\nb', '>}')).toBe('  |a\n\nb')
  })
  test('case operators', () => {
    expect(edit('foo |bar baz', 'gUiw')).toBe('foo |BAR baz')
    expect(edit('foo |BAR baz', 'guiw')).toBe('foo |bar baz')
    expect(edit('foo |bAr baz', 'g~iw')).toBe('foo |BaR baz')
    expect(edit('f|oo bar', 'gUU')).toBe('|FOO BAR')
    expect(edit('f|oo bar', '~')).toBe('fO|o bar')
    expect(edit('|foo bar', '3~')).toBe('FOO| bar')
    expect(edit('|foo', 'g??')).toBe('|sbb')
  })
  test('r and R', () => {
    expect(edit('f|oo', 'rx')).toBe('f|xo')
    expect(edit('f|oo', '2rx')).toBe('fx|x')
    expect(edit('f|oo', '3rx')).toBe('f|oo')
    expect(edit('foo|,bar', 'r<CR>')).toBe('foo\n|bar')
    expect(edit('|foo', 'Rab<Esc>')).toBe('a|bo')
    expect(edit('|foo', 'Rabcd<Esc>')).toBe('abc|d')
    expect(edit('|foo', 'Rab<BS><BS>x<Esc>')).toBe('|xoo')
  })
  test('<C-a> <C-x>', () => {
    expect(edit('|x = 1', '<C-a>')).toBe('x = |2')
    expect(edit('|x = 1', '5<C-a>')).toBe('x = |6')
    expect(edit('|x = 10', '<C-x>')).toBe('x = |9')
    expect(edit('|x = 0', '<C-x>')).toBe('x = -|1')
    expect(edit('|x = -1', '<C-a>')).toBe('x = |0')
    expect(edit('v|1.0.9', '<C-a>')).toBe('v|2.0.9')
    expect(edit('v1.|0.9', '<C-a>')).toBe('v1.|1.9')
    expect(edit('|007', '<C-a>')).toBe('00|8')
  })
})
