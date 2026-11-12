import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const pages = await (await fetch('http://127.0.0.1:19225/json')).json()
const ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let seq = 0
const pending = new Map()
const errors = []
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10000)
    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (!msg.id) {
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || ''))
    }
    return
  }
  const waiter = pending.get(msg.id)
  if (!waiter) return
  pending.delete(msg.id)
  msg.error ? waiter.reject(new Error(JSON.stringify(msg.error))) : waiter.resolve(msg.result)
})
await send('Runtime.enable')
await send('Page.enable')

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result.value
}
async function wait(expression, label = expression) {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${label}\n${await evaluate('document.body?.innerText')}`)
}
const has = (text) => `document.body?.innerText?.includes(${JSON.stringify(text)})`
async function click(text) {
  const expr = `[...document.querySelectorAll('button')].find((button) => !button.disabled && button.textContent.trim() === ${JSON.stringify(text)})`
  await wait(`!!(${expr})`, `button ${text}`)
  await evaluate(`(${expr}).click()`)
}
async function checkViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
    true,
    `overflow at ${width}px`,
  )
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:15906/scripts/tests/feed-highlight-browser.html' })
  await wait(has('Anna Beispiel'))
  await wait(has('3 Einträge vom 10. November 2026.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=feed-highlight-card]').length"), 3)
  assert.equal(
    await evaluate("document.querySelector('[data-testid=feed-highlight-card]')?.getAttribute('aria-current')"),
    'date',
  )
  assert.equal(await evaluate('document.activeElement?.dataset?.testid'), 'feed-highlight-card')
  await click('Habits')
  await wait(has('Ein Eintrag vom 10. November 2026 sichtbar. 2 Einträge sind durch den Filter verdeckt.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=feed-highlight-card]').length"), 1)
  assert.equal(await evaluate("document.body.innerText.includes('Bankdrücken')"), false)
  await click('Filter zurücksetzen')
  await wait(has('3 Einträge vom 10. November 2026.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=feed-highlight-card]').length"), 3)
  await click('Tag ohne Eintrag')
  await wait(has('In den geladenen Einträgen ist nichts vom 1. Jänner 2026.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=feed-highlight-card]').length"), 0)
  await click('Markierung schließen')
  await wait("!document.querySelector('[data-testid=feed-highlight-banner]')")
  assert.equal(await evaluate("document.body.innerText.includes('Dieser Tag')"), false)
  await click('Tag mit Eintrag')
  await wait(has('3 Einträge vom 10. November 2026.'))
  await click('Konsole')
  await wait(has('Ein Eintrag vom 10. November 2026.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=console-highlight-card]').length"), 1)
  assert.equal(await evaluate("document.body.innerText.includes('Bankdrücken')"), true)
  assert.equal(await evaluate('document.activeElement?.dataset?.testid'), 'console-highlight-card')
  await click('Tag ohne Eintrag')
  await wait(has('In den geladenen Einträgen ist nichts vom 1. Jänner 2026.'))
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=console-highlight-card]').length"), 0)
  await checkViewport(390, 844, true)
  await click('Tag mit Eintrag')
  await wait(has('Ein Eintrag vom 10. November 2026.'))
  await click('Feed')
  await wait(has('3 Einträge vom 10. November 2026.'))
  await checkViewport(1280, 800, false)
  assert.deepEqual(errors, [])
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('/tmp/coach-feed-highlight.png', Buffer.from(shot.data, 'base64'))
  console.log('PASS: push date highlights the feed and the client console, including a missing day.')
} catch (error) {
  console.error(error)
  console.error('Browser errors:', errors)
  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile('/tmp/coach-feed-highlight-failed.png', Buffer.from(shot.data, 'base64'))
  } catch {
    // The browser may already be gone.
  }
  process.exitCode = 1
} finally {
  ws.close()
}
