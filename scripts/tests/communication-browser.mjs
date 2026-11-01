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
 await send('Page.navigate', { url:'http://127.0.0.1:15905/scripts/tests/communication-browser.html' });
 await wait(has('3er-Split Frühjahr'));
 await fill('select:not([aria-label])','plan-a:2');
 await fill('textarea','Bitte prüfe die Pausen im neuen Plan.');
 await click('Nachricht senden');
 await wait(has('Gespeichert'));
 await wait(has('Klient ungelesen: 1'));
 await click('Klienten-Seite');
 await wait(has('Bitte prüfe die Pausen im neuen Plan.'));
 await wait(has('Klient ungelesen: 0'));
 await click('Plan öffnen:',false);
 await wait(has('Persönlicher Trainingsplan'));
 await wait(has('Training A'));
 await click('← Zurück zu den Nachrichten');
 await click('Zu diesem Plan antworten');
 await fill('textarea','Entwurf nach Reload mit Planbezug');
 await send('Page.reload');
 await wait(has('3er-Split Frühjahr'));
 await click('Klienten-Seite');
 await wait(`document.querySelector('textarea')?.value === 'Entwurf nach Reload mit Planbezug'`);
 await wait(has('Bezug: 3er-Split Frühjahr · v2'));
 await fill('textarea','Passt, ich starte morgen mit Training A.');
 await click('Nachricht senden');
 await wait(has('Gespeichert'));
 await wait(has('Coach ungelesen: 1'));
 await click('Coach-Seite');
 await wait(has('Passt, ich starte morgen mit Training A.'));
 await wait(has('Vom Klienten gesehen'));
 await wait(has('Coach ungelesen: 0'));
 await fill('textarea','Entwurf nur für A');
 await fill('[aria-label="Klient wechseln"]','client-b');
 await wait(has('Noch keine Nachrichten'));
 assert.equal(await evaluate("document.body.innerText.includes('Passt, ich starte morgen')"),false);
 assert.equal(await evaluate("document.querySelector('textarea').value"),'');
 await fill('[aria-label="Klient wechseln"]','client-a');
 await wait(`document.querySelector('textarea')?.value === 'Entwurf nur für A'`);
 await fill('textarea','');
 await evaluate('window.seedCommunicationHistory()');
 await wait(has('Historie 204'));
 await wait(has('Klient ungelesen: 99+'));
 await click('Ältere Nachrichten laden');
 await wait(has('Historie 005'));
 await click('Ältere Nachrichten laden');
 await wait(has('Historie 000'));
 assert.equal(await evaluate("document.querySelectorAll('ol > li').length"),207);
 await evaluate('window.sendCommunicationLive()');
 await wait(has('Nach der Historie live'));
 assert.equal(await evaluate("document.querySelectorAll('ol > li').length"),208);
 await wait(has('Historie 000'));
 await click('Klienten-Seite');
 await wait(has('Nach der Historie live'));
 await wait(has('Klient ungelesen: 0'));
 assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
 assert.deepEqual(errors,[]);
 const shot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile('/tmp/coach-client-communication-mobile.png',Buffer.from(shot.data,'base64'));
 console.log('PASS: two-way conversation, pinned plan opens, drafts survive reload/client switch, unread counts clear, 205 history records paginated without loss on live updates.');
} catch(e){console.error(e);console.error('Browser errors:',errors);process.exitCode=1;}finally{ws.close();}
