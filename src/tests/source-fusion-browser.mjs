// Start scripts/tests/source-fusion-browser-backend.py, insights.browser-server.mjs,
// and a disposable Chromium with --remote-debugging-port=19238 first.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
const pages=await(await fetch('http://127.0.0.1:19238/json')).json();
const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let seq=0;const pending=new Map();
socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(!msg.id)return;const request=pending.get(msg.id);if(!request)return;pending.delete(msg.id);clearTimeout(request.timer);msg.error?request.reject(new Error(JSON.stringify(msg.error))):request.resolve(msg.result)});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(new Error(`${method} timed out`)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function wait(expression){for(let n=0;n<900;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error(`Not rendered: ${expression}\n${await evaluate('document.body.innerText')}`)}
async function click(text){const selector=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;await wait(`!!(${selector})`);await evaluate(`(${selector}).click()`)}
async function api(payload){const response=await fetch('http://127.0.0.1:15930/fitness/inbox/inbox_test/link-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return response.json()}
async function reload(){await send('Page.navigate',{url:'http://127.0.0.1:15918/src/views/Inbox/source-fusion.browser.html'});await new Promise(r=>setTimeout(r,500));await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Kandidaten suchen'&&!b.disabled)&&!document.body.innerText.includes('Gespeicherte Zuordnung wird geladen')`)}
async function screenshot(name){const{data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(`/tmp/source-fusion-${name}.png`,Buffer.from(data,'base64'))}
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await reload();
 await click('Ablehnen');
 assert.equal((await api({operation:'inspect'})).exercise.wger_id,1,'Reject is still staged');
 await click('Entscheidungen speichern');await wait(`document.body.innerText.includes('Entscheidungen gespeichert')`);
 let saved=await api({operation:'inspect'});
 assert.equal(saved.exercise.wger_id,1,'Rejecting candidate 999 must preserve linked source 1');
 assert.deepEqual(saved.exercise.source_rejections.wger,['999']);
 await reload();
 assert.equal(await evaluate('document.body.innerText.includes("Falscher Vorschlag")'),false,'Rejected candidate stays hidden after reload');
 await evaluate(`document.querySelector('.source-merge-rejected input').click()`);
 await wait(`document.body.innerText.includes('Wieder vorschlagen')`);
 await screenshot('desktop-rejected');
 await click('Kandidaten suchen');await wait(`!![...document.querySelectorAll('li')].find(el=>el.textContent.includes('Chin-ups'))`);
 await evaluate(`[...document.querySelectorAll('li')].find(el=>el.textContent.includes('Chin-ups')).querySelector('input').click()`);
 await click('Änderungen verwerfen');
 assert.equal(await evaluate(`document.querySelector('.source-merge-selection').textContent.includes('Chin-ups')`),false,'Discard restores the original name as well as its ID');
 await screenshot('desktop-discard');
 await evaluate(`[...document.querySelectorAll('li')].find(el=>el.textContent.includes('Chin-ups')).querySelector('input').click()`);
 await evaluate(`const s=document.querySelector('.source-merge-search select');s.value='yuhonas';s.dispatchEvent(new Event('change',{bubbles:true}))`);
 await click('Kandidaten suchen');await wait(`!![...document.querySelectorAll('li')].find(el=>el.textContent.includes('Chin-Up'))`);
 await evaluate(`[...document.querySelectorAll('li')].find(el=>el.textContent.includes('Chin-Up')).querySelector('input').click()`);
 assert.equal((await api({operation:'inspect'})).exercise.wger_id,1,'Choosing candidates does not save prematurely');
 await screenshot('desktop-preview');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await screenshot('mobile-preview');
 await click('Zusammenführen');await wait(`document.body.innerText.includes('Quellen und Entscheidungen gespeichert')`);
 saved=await api({operation:'inspect'});
 assert.deepEqual(saved.exercise.external_ids,{wger:[152],yuhonas:['Chin-Up']});
 assert.equal(saved.exercise.coaching_notes[0],'Coach-Hinweis behalten.');
 assert.equal(saved.exercise.source_snapshot.wger.wger_id,152);
 assert.equal(saved.exercise.source_snapshot.yuhonas.yuhonas_id,'Chin-Up');
 assert.equal(saved.exercise.source,'inbox','Merging is not expert approval');
 assert.deepEqual(saved.exercise.source_rejections.wger,['999']);
 await reload();
 // Simulate another coach changing the authoritative record after this screen loaded.
 const concurrent=await api({operation:'merge',revision:saved.revision,selection:{wger:1,yuhonas:'Chin-Up'},rejections:saved.exercise.source_rejections});
 assert.equal(concurrent.ok,true);
 await evaluate(`document.querySelector('.source-merge-selection button').click()`);
 await click('Zusammenführen');await wait(`document.body.innerText.includes('inzwischen geändert')`);
 assert.equal((await api({operation:'inspect'})).exercise.wger_id,1,'Conflict does not overwrite another edit');
 await screenshot('mobile-conflict');
 console.log('PASS: durable candidate rejection, selection preview, atomic two-source merge, original snapshots, unchanged draft state, reload, mobile overflow, conflict protection');
}finally{socket.close()}
