import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const pages = await (await fetch('http://127.0.0.1:19238/json')).json()
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:15918/src/views/Coach/insights.browser.html' });
  await wait(has('Entwurfsdienst nicht erreichbar'));
  assert.equal(await evaluate(has('Keine offenen Drafts')), false);
  await click('Erneut versuchen');
  await wait(has('Entwurf für Klient A'));
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].every((b) => b.getBoundingClientRect().height >= 44)`), true, 'touch targets are at least 44px');
  await click('Freigeben');
  await wait(has('Fehler beim Speichern'));
  assert.equal(await evaluate(has('Bereits entschieden')), false);
  assert.equal(await evaluate(has('Offene Drafts (1)')), true);
  await click('Freigeben');
  await wait(has('Draft freigegeben ✓'));
  await wait(has('Bereits entschieden (1)'));
  await click('Check starten');
  await wait(has('Prüfdienst nicht erreichbar'));
  assert.equal(await evaluate(has('Keine ungeklärte Trainingslücke gefunden')), false);
  await click('Klient B wählen');
  await wait(has('Entwurf für Klient B'));
  assert.equal(await evaluate(has('Entwurf für Klient A')), false);
  assert.equal(await evaluate(has('Bereits entschieden')), false);
  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1024, 768]]) {
    await checkViewport(width, height, true);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/coach-insights-browser.png', Buffer.from(shot.data, 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS: retry, failed and successful review, failed gap check, client switch; no overflow at 390/844/768/1024px; no runtime exceptions.');
} finally { ws.close(); }
