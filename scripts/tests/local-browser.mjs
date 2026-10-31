// Chrome DevTools Protocol smoke test, against browser-server + temporary Python backend.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:19222/json')).json();
const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let seq = 0;
const pending = new Map();
const errors = [];
const prompts = [];
const send = (method, params = {}) => new Promise((resolve,reject) => { const id = ++seq; const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10000); pending.set(id,{resolve:(r)=>{ clearTimeout(timer); resolve(r); },reject:(e)=>{ clearTimeout(timer); reject(e); }}); ws.send(JSON.stringify({id,method,params})); });
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || ''));
  if (msg.method === 'Page.javascriptDialogOpening') { console.log('Dialog:', msg.params.message); send('Page.handleJavaScriptDialog', { accept: true, promptText: prompts.shift() || '' }).catch(console.error); }
});
await send('Runtime.enable'); await send('Page.enable');
await send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: 'http://127.0.0.1:15904' });
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression, label = expression) {
  for (let i = 0; i < 450; i++) { if (await evaluate(expression)) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`Timed out: ${label}\n${await evaluate('document.body?.innerText')}`);
}
const has = (text) => `document.body?.innerText?.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`;
async function click(text, exact = true) {
  console.log('Click:',text);
  const expr = `[...document.querySelectorAll('button')].find((b) => !b.disabled && b.textContent.trim()${exact ? '===' : '.includes('}${JSON.stringify(text)}${exact ? '' : ')'})`;
  await wait(`!!(${expr})`, `button ${text}`);
  await evaluate(`(${expr}).click()`);
}
async function fill(selector, value) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true})); })()`);
}
async function labelFill(label, value) {
  const selector = await evaluate(`(() => { const l = [...document.querySelectorAll('label')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!l) throw new Error('missing label'); const e=l.querySelector('input'); e.id='smoke-field'; return '#smoke-field'; })()`);
  await fill(selector,value);
  await evaluate(`document.querySelector('#smoke-field').removeAttribute('id')`);
}
const cloudRequests = [];
await send('Network.enable');
ws.addEventListener('message', (event) => { const m = JSON.parse(event.data); if (m.method === 'Network.requestWillBeSent' && /firestore.googleapis.com|identitytoolkit.googleapis.com|securetoken.googleapis.com/.test(m.params.request.url)) cloudRequests.push(m.params.request.url); });
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:15904/coach/local.html' });
  await wait(has('Ein gemeinsamer Arbeitsplatz'));
  await click('Fixture Client', false);
  await click('Neuer Trainingsplan', false);
  await fill('[aria-label="Neuer Planname"]','Laptop Plan');
  await click('Plan gestalten');
  await click('+ Trainingstag');
  await labelFill('Name des Trainingstags','Ganzkörper A');
  await fill('[aria-label="Übung suchen und hinzufügen"]','Barbell Bench Press');
  await click('Barbell Bench Press',false);
  await wait(`!!document.querySelector('[aria-label$="Satzvorgaben bearbeiten"]')`);
  await evaluate(`document.querySelector('[aria-label$="Satzvorgaben bearbeiten"]').click()`);
  await labelFill('Ziel-Sätze','2');
  await labelFill('Ziel-Wdh','10');
  await labelFill('Notiz','Lokal ohne Cloud');
  await click('Klientenvorschau');
  await wait(has('Lokal ohne Cloud'));
  await click('Entwurf sichern');
  await wait(has('Entwurf lokal gesichert'));
  await evaluate('location.reload()');
  await click('Fixture Client',false);
  await wait(has('Laptop Plan'));
  await click('Version freigeben');
  await fill('[aria-label="Versionshinweis"]','Erste lokale Version');
  await click('Lokale Version freigeben');
  await wait(has('Version 1 bereit zur Übergabe'));
  await click('Plan ansehen');
  await wait(`document.querySelectorAll('.plan-document .plan-sheet').length === 1`);
  assert.equal(await evaluate(`document.querySelectorAll('.plan-document .plan-training-table tbody').length`),1);
  await wait(`document.documentElement.scrollWidth <= 390`);
  const print = await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
  const bytes = Buffer.from(print.data,'base64');
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  await writeFile('/tmp/coach-local-plan.pdf',bytes);
  await click('Alle Pläne');
  assert.equal(await evaluate(`document.querySelectorAll('.plan-print-root').length`),0);

  await click('Versionen');
  await wait(has('Erste lokale Version'));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
  const shot = await send('Page.captureScreenshot',{format:'png'});
  await writeFile('/tmp/coach-local-mobile.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(cloudRequests,[], 'Editing and local release must not access Firebase');
  await click('An Klienten senden');
  await wait(has('Plan an die Klienten-App übergeben'));
  assert.deepEqual(cloudRequests,[], 'Only the test server handles fake delivery');
  assert.deepEqual(errors,[]);
  console.log('PASS: Local client → plan → exercise prescriptions → disk save → reload → local version → history → explicit fake delivery, without Firebase browser calls.');
} catch (err) { console.error(err); console.error('Browser errors:',errors); process.exitCode=1; }
finally { ws.close(); }
