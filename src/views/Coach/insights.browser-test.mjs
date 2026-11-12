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
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
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
  await send('Page.navigate', { url: 'http://127.0.0.1:15918/src/views/Coach/insights.browser.html?habits' });
  await wait(has('Zyklus konnte nicht geladen werden.'));
  assert.equal(await evaluate(has('Zyklus-Tags')), false);
  await click('Erneut versuchen');
  await wait(has('Zyklus-Tags'));
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Neuer Zyklus-Tag"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Pull');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`document.querySelector('button[aria-label="Tag hinzufügen"]').click()`);
  await wait(has('Ungespeicherte Änderungen'));
  assert.equal(await evaluate(`window.insightsFixture.calls.filter((c) => c[0] === 'habit-save').length`), 0);
  await click('Änderungen speichern');
  await wait(has('Änderungen konnten nicht gespeichert werden.'));
  assert.equal(await evaluate(has('Ungespeicherte Änderungen')), true);
  await click('Änderungen speichern');
  await wait(has('Keine offenen Änderungen'));
  assert.equal(await evaluate(`window.insightsFixture.calls.filter((c) => c[0] === 'habit-save').length`), 2);
  await evaluate(`document.querySelector('button[aria-label="Pull entfernen"]').click()`);
  await wait(has('Ungespeicherte Änderungen'));
  await click('Verwerfen');
  await wait(has('Keine offenen Änderungen'));
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Pull entfernen"]')`), true);
  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1024, 768]]) await checkViewport(width, height, true);
  assert.deepEqual(await evaluate(`(async () => {
    const { snapSet, snapGet, snapDelete, cachedQuery } = await import('/src/lib/db/firestore/clientDataIdb.js');
    const key = 'browser:test:invalidate';
    await snapSet(key, { value: 'cached' });
    let release, started;
    const oldRead = new Promise((resolve) => { release = resolve; });
    const readStarted = new Promise((resolve) => { started = resolve; });
    const published = [];
    let fresh;
    const refreshed = new Promise((resolve) => { fresh = resolve; });
    const listener = (event) => {
      if (event.detail.key !== key) return;
      published.push(event.detail.data.value);
      if (event.detail.data.value === 'fresh') fresh();
    };
    window.addEventListener('vos-coach-cache', listener);
    let reads = 0;
    try {
      const hit = await cachedQuery(key, () => {
        if (++reads === 1) { started(); return oldRead; }
        return { value: 'fresh' };
      });
      await readStarted;
      await snapDelete(key);
      release({ value: 'stale-network' });
      await refreshed;
      return { hit: hit.value, stored: (await snapGet(key)).value, published, reads };
    } finally {
      window.removeEventListener('vos-coach-cache', listener);
      await snapDelete(key);
    }
  })()`), { hit: 'cached', stored: 'fresh', published: ['fresh'], reads: 2 });
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Neuer Zyklus-Tag"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Legs');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(has('Ungespeicherte Änderungen'));
  await send('Page.reload');
  await wait(has('Zyklus konnte nicht geladen werden.'));
  await click('Erneut versuchen');
  await wait(has('Entwurf wiederhergestellt. Die gespeicherte Konfiguration hat sich inzwischen geändert.'));
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Neuer Zyklus-Tag"]').value`), 'Legs');
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Pull entfernen"]')`), true);
  await send('Page.reload');
  await wait(has('Zyklus konnte nicht geladen werden.'));
  await click('Erneut versuchen');
  await wait(has('Entwurf wiederhergestellt. Die gespeicherte Konfiguration hat sich inzwischen geändert.'));
  await click('Verwerfen');
  await wait(has('Keine offenen Änderungen'));
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Neuer Zyklus-Tag"]').value`), '');
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Pull entfernen"]')`), false);
  assert.equal(await evaluate(`Object.keys(sessionStorage).some((k) => k.startsWith('coach:habit-draft:'))`), false);
  await send('Page.navigate', { url: 'http://127.0.0.1:15918/src/views/Coach/insights.browser.html?feed' });
  await wait("document.querySelectorAll('textarea').length === 3");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('textarea')].map((n) => n.value)"), ['Feedback A', 'Feedback B', 'Journal A']);
  await evaluate(`(() => {
    const input = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Neuer Text A');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait("document.querySelector('textarea').value === 'Neuer Text A'");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('textarea')].map((n) => n.value)"), ['Neuer Text A', 'Feedback B', 'Journal A']);
  await evaluate(`document.querySelectorAll('[data-entry-key]')[0].querySelector('button:last-child').click()`);
  await evaluate(`document.querySelectorAll('[data-entry-key]')[1].querySelector('button:last-child').click()`);
  await wait("document.querySelectorAll('[data-entry-key] button:disabled').length === 2");
  assert.deepEqual(await evaluate("window.insightsFixture.calls.filter((c) => c[0] === 'feedback')"), [
    ['feedback', 'a', 'same-day', 'workout', 'Neuer Text A'],
    ['feedback', 'b', 'same-day', 'workout', 'Feedback B'],
  ]);
  await evaluate("window.insightsFixture.feedbackPending.a({ok:true})");
  await wait("document.querySelectorAll('[data-entry-key] button:disabled').length === 1");
  assert.equal(await evaluate("document.querySelectorAll('[data-entry-key]')[1].querySelector('button:last-child').disabled"), true);
  await evaluate("window.insightsFixture.feedbackPending.b({ok:false})");
  await wait(has('Fehler beim Speichern des Kommentars'));
  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1024, 768]]) await checkViewport(width, height, true);
  const deepLink = '#/clients/client-a/trainingplan?plan=plan-a&date=2026-11-12';
  await send('Page.navigate', { url: `http://coach.localhost:15918/coach-shell.html${deepLink}` });
  await wait("!!document.querySelector('iframe')?.contentDocument?.querySelector('h1')");
  assert.equal(await evaluate("document.querySelector('iframe').contentWindow.location.hash"), deepLink);
  assert.equal(await evaluate("document.querySelector('a[target=\"_blank\"]').hash"), deepLink);
  await evaluate("document.querySelector('iframe').contentDocument.querySelector('a').click()");
  await wait("location.hash === '#/clients/client-b/messages'");
  assert.equal(await evaluate("document.querySelector('a[target=\"_blank\"]').hash"), '#/clients/client-b/messages');
  await evaluate("location.hash = '#/catalog'");
  await wait("document.querySelector('iframe').contentWindow.location.hash === '#/catalog'");
  await evaluate('history.back()');
  await wait("location.hash === '#/clients/client-b/messages' && document.querySelector('iframe').contentWindow.location.hash === '#/clients/client-b/messages'");
  await evaluate('history.forward()');
  await wait("location.hash === '#/catalog' && document.querySelector('iframe').contentWindow.location.hash === '#/catalog'");
  await send('Page.reload');
  await wait("document.querySelector('iframe')?.contentWindow.location.hash === '#/catalog'");
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/coach-insights-browser.png', Buffer.from(shot.data, 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS: habit draft reload, conflict notice and discard; real Vue shell deep links, iframe navigation, direct-open URL and reload; duplicate feed IDs isolated across clients and collections; concurrent feedback saves and failures; habit load retry, explicit save, failed save, successful save and discard;  retry, failed and successful review, failed gap check, client switch; no overflow at 390/844/768/1024px; no runtime exceptions.');
} finally { ws.close(); }
