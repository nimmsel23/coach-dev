// Chrome DevTools Protocol smoke test, against browser-server + temporary Python backend.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:19224/json')).json();
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
await send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: 'http://127.0.0.1:15905' });
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
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true})); })()`);
}
try {
 await send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
 await send('Page.navigate', { url:'http://127.0.0.1:15905/scripts/tests/plan-feedback-browser.html' });
 await wait(has('Empfang noch nicht bestätigt'));
 await click('Plan gelesen – Empfang bestätigen');
 await wait(has('Empfang dieser Planversion bestätigt.'));
 await fill('textarea','Welche Alternative gibt es für Klimmzüge?');
 await click('Rückmeldung senden');
 await wait(has('Rückmeldung zum Plan gespeichert.'));
 await click('Coach-Seite');
 await wait(has('Vom Klienten bestätigt'));
 await wait(has('Welche Alternative gibt es für Klimmzüge?'));
 assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Empfang bestätigen'))"), false);
 await fill('textarea','Bitte verwende den Latzug mit denselben Vorgaben.');
 await click('Antwort speichern');
 await wait(has('Rückmeldung zum Plan gespeichert.'));
 await click('Klienten-Seite');
 await wait(has('Bitte verwende den Latzug'));
 await click('Version wechseln');
 await wait(has('Version 3'));
 await wait(has('Empfang noch nicht bestätigt'));
 assert.equal(await evaluate("document.body.innerText.includes('Welche Alternative')"), false);
 await click('Version wechseln');
 await wait(has('Version 2'));
 await wait(has('Empfang bestätigt'));
 await wait(has('Welche Alternative gibt es für Klimmzüge?'));
 assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
 assert.deepEqual(errors, []);
 const screenshot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
 await writeFile('/tmp/coach-plan-feedback-mobile.png', Buffer.from(screenshot.data,'base64'));
 console.log('PASS: mobile client confirms v2, sends plan question, coach replies; v3 is isolated and v2 remains intact.');
} finally { ws.close(); }
