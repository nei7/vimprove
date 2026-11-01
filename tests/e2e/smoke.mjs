// End-to-end smoke test against a running preview server.
// Usage: node tests/e2e/smoke.mjs [baseUrl]
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

// playwright may be installed globally (as in CI containers); resolve it via require.
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const base = process.argv[2] ?? 'http://localhost:4173'
mkdirSync('tests/e2e/out', { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const step = (name) => console.log(`\n== ${name}`)

step('open today page')
await page.goto(`${base}/#/`)
await page.waitForSelector('text=Today\'s plan')
await page.screenshot({ path: 'tests/e2e/out/01-today.png' })

step('start the first task of the plan and solve it with the optimal keys')
await page.click('a:has-text("▶ Start")')
await page.waitForSelector('[role="textbox"]')
const url = page.url()
console.log('lesson url:', url)
// motions/find-paren is the first lesson in learning order: optimal "f("
await page.click('[role="textbox"]')
await page.keyboard.type('f(')
await page.waitForSelector('[role="dialog"]')
const rating = await page.textContent('[role="dialog"] .text-2xl')
console.log('rating:', rating?.trim())
if (!rating?.includes('Perfect')) throw new Error(`expected Perfect, got ${rating}`)
await page.screenshot({ path: 'tests/e2e/out/02-result.png' })

step('go to next task via Enter and check the coach flags repeated l presses')
await page.keyboard.press('Enter')
await page.waitForSelector('[role="textbox"]')
console.log('next lesson url:', page.url())
await page.click('[role="textbox"]')
await page.keyboard.type('lllll')
await page.waitForSelector('text=Repeated h / l', { timeout: 5000 })
await page.screenshot({ path: 'tests/e2e/out/03-hint.png' })

step('reload and verify progress persisted')
await page.goto(`${base}/#/`)
await page.waitForSelector('text=Today\'s plan')
const done = await page.textContent('svg text')
console.log('progress ring:', done)
if (!done?.startsWith('1/')) throw new Error(`expected 1 completed task, ring shows ${done}`)

step('playground: visual block + ex command')
await page.goto(`${base}/#/playground`)
await page.waitForSelector('[role="textbox"]')
await page.click('[role="textbox"]')
await page.keyboard.type('jjj')
await page.keyboard.down('Control')
await page.keyboard.press('v')
await page.keyboard.up('Control')
await page.keyboard.type('jjI// ')
await page.keyboard.press('Escape')
await page.keyboard.type(':%s/config/cfg/g')
await page.keyboard.press('Enter')
const text = await page.evaluate(() => document.querySelector('[role="textbox"]')?.textContent ?? '')
if (!text.includes('// ') || !text.includes('cfg')) throw new Error('playground edit did not apply')
await page.screenshot({ path: 'tests/e2e/out/04-playground.png' })

step('library, stats, cheatsheet, settings render')
for (const route of ['library', 'stats', 'cheatsheet', 'settings']) {
  await page.goto(`${base}/#/${route}`)
  await page.waitForSelector('h1')
  console.log(route, '→', (await page.textContent('h1'))?.trim())
}

await browser.close()
if (errors.length) {
  console.error('\nBrowser errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nSMOKE OK')
