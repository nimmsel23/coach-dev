// Run scripts/tests/csuite-browser-backend.py first. Uses a disposable browser profile.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const folder = await mkdtemp(join(tmpdir(), 'csuite-browser-'))
const browser = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${folder}`, 'about:blank'], { stdio: 'ignore' })
let socket
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let port
  for (let n = 0; n < 100; n++) {
    try { port = Number((await readFile(join(folder, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await sleep(100) }
  }
  assert.ok(port, 'Chromium started')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let seq = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (!data.id) return
    const item = pending.get(data.id)
    pending.delete(data.id)
    if (data.error) item.reject(new Error(JSON.stringify(data.error)))
    else item.resolve(data.result)
  })
  function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
  async function evaluate(expression) {
    const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text)
    return data.result.value
  }
  async function wait(expression) {
    for (let n = 0; n < 180; n++) { if (await evaluate(`!!document.body && (${expression})`)) return; await sleep(100) }
    throw new Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}`)
  }
  async function click(label) {
    await wait(`!![...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)})`)
    await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  async function screenshot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(folder, `${name}.png`), Buffer.from(data, 'base64'))
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  for (const role of ['coo']) {
    await send('Page.navigate', { url: `http://127.0.0.1:15940/workspaces/${role}/dashboard.html` })
    await wait(`document.body.innerText.includes('Runtime verbunden') && !!document.querySelector('[data-launch]')`)
    assert.equal(await evaluate(`document.querySelectorAll('[data-id]').length`), 0)
    assert.equal(await evaluate(`document.body.innerText.includes('Matthias')`), false)
  }
  await send('Page.navigate', { url: 'http://127.0.0.1:15940/workspaces/coo/dashboard.html' })
  await wait(`!!document.querySelector('[data-launch]')`)
  await wait(`!!document.querySelector('#coo-client')`)
  await evaluate(`document.querySelector('#coo-client').value = 'alice'; document.querySelector('#coo-client').dispatchEvent(new Event('change'))`)
  await wait(`document.querySelector('#coo-context')?.textContent.includes('Ziel: konsistente Woche')`)
  await wait(`!!document.querySelector('#coo-event')`)
  await evaluate(`document.querySelector('#coo-event').value = 'meeting-1'; document.querySelector('#coo-event').dispatchEvent(new Event('change'))`)
  await click('Gespräch vorbereiten')
  await wait(`document.body.innerText.includes('Bitte prüfen')`)
  assert.equal(await evaluate(`document.querySelector('[data-preview] h1')?.textContent`), 'Agenda')
  assert.ok(await evaluate(`document.querySelector('[data-id] h3').textContent.includes('Gesprächsvorbereitung')`))
  await click('Bearbeiten')
  await evaluate(`document.querySelector('[data-edit]').value = ${JSON.stringify('# Geprüfte Agenda\n\nMeine Korrektur')}; document.querySelector('[data-edit]').focus()`)
  await sleep(3200)
  assert.equal(await evaluate(`document.querySelector('[data-edit]').value`), '# Geprüfte Agenda\n\nMeine Korrektur', 'Polling preserves edits')
  assert.ok(await evaluate(`import('/workspaces/_shared/markdown.js').then(m => { const html=m.renderMarkdown('<script>window.pwned=1</script><a href="javascript:alert(1)">x</a>'); return !html.includes('<script') && !html.includes('javascript:'); })`))
  await screenshot('desktop-review')
  await click('Vorschau')
  assert.equal(await evaluate(`document.querySelector('[data-preview] h1')?.textContent`), 'Geprüfte Agenda')
  await click('Freigeben & committen')
  await wait(`document.querySelector('[data-id]')?.textContent.includes('Committed')`)
  await send('Page.reload')
  await wait(`document.querySelector('[data-id]')?.textContent.includes('Committed')`)
  assert.equal(await evaluate(`document.querySelector('[data-edit]').value`), '# Geprüfte Agenda\n\nMeine Korrektur')
  await wait(`!!document.querySelector('a[href$="/document"]')`)
  const doc = await evaluate(`fetch(document.querySelector('a[href$="/document"]').href).then(r=>r.text())`)
  assert.equal(doc, '# Geprüfte Agenda\n\nMeine Korrektur')
  await wait(`!!document.querySelector('#coo-client')`)
  await evaluate(`document.querySelector('#coo-client').value = 'alice'; document.querySelector('#coo-client').dispatchEvent(new Event('change'))`)
  await wait(`document.querySelector('#coo-context')?.textContent.includes('Ziel: konsistente Woche')`)
  await evaluate(`document.querySelector('#prompt').value = 'Zweiter Auftrag'; document.querySelector('#composer').requestSubmit()`)
  await wait(`!!document.querySelector('[data-reject]')`)
  await click('Ablehnen')
  await wait(`document.body.innerText.includes('Abgelehnt')`)
  await evaluate(`document.querySelector('#prompt').value = 'Fehlerfall'; document.querySelector('#composer').requestSubmit()`)
  await wait(`document.body.innerText.includes('Fehlgeschlagen')`)
  assert.ok(await evaluate(`document.body.innerText.includes('Engine im Test nicht erreichbar')`))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No mobile overflow')
  await screenshot('mobile-history')
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['*/api/csuite/*'] })
  await wait(`document.body.innerText.includes('Runtime nicht verbunden')`)
  await send('Network.setBlockedURLs', { urls: [] })
  await wait(`document.body.innerText.includes('Runtime verbunden')`)
  await send('Network.setBlockedURLs', { urls: ['*/api/csuite/*'] })
  await send('Page.reload')
  await wait(`document.body.innerText.includes('Runtime nicht verbunden')`)
  await evaluate(`document.querySelector('#prompt').value = 'Auftrag bleibt erhalten'; document.querySelector('#composer').requestSubmit()`)
  await wait(`document.body.innerText.includes('Auftrag nicht gestartet')`)
  assert.equal(await evaluate(`document.querySelector('#prompt').value`), 'Auftrag bleibt erhalten')
  assert.equal(await evaluate(`document.querySelectorAll('[data-id]').length`), 0, 'No fake offline jobs')
  await screenshot('mobile-disconnected')
  console.log(`PASS: COO client frontdoor, real HTTP job pipeline, editing, durable approval, document, rejection, failure, mobile. Screenshots: ${folder}`)
} finally {
  socket?.close()
  browser.kill()
}
