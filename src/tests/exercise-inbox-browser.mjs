// Run insights.browser-server.mjs and a disposable Chromium on CDP :19238; build Coach first.
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
const pages=await(await fetch('http://127.0.0.1:19238/json')).json();
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:15918/src/views/Coach/exercise-inspector.browser.html'});
await new Promise(r=>setTimeout(r,1000));
for(let i=0;i<300;i++){if(await ev('!!window.selectInspectorExercise'))break;await new Promise(r=>setTimeout(r,100));}
const ex={id:'bench-review',file_id:'bench-review',name:'Dumbbell Bench Press',display_name:'Kurzhantel-Bankdrücken',status:'ai_enriched',description:'Drücke die Kurzhanteln aus der Rückenlage kontrolliert nach oben. Halte die Schulterblätter stabil und senke die Gewichte langsam neben die Brust.',primary_muscles:['pectoralis_major'],secondary_muscles:['triceps_brachii'],coaching_notes:['Füße fest am Boden aufstellen.','Schulterblätter nach hinten und unten führen.','Gewichte kontrolliert senken und gleichmäßig hochdrücken.'],source_selection:{wger:null,yuhonas:null},mergeCandidate:{wger:{id:42,display_name:'Dumbbell Bench Press'},yuhonas:{id:'Dumbbell_Bench_Press',display_name:'Dumbbell Bench Press'}},lesson:{learning_goal:{short:'Brustmuskulatur kontrolliert belasten'},coaching_cues:['Schulterblätter stabil halten']}};
await ev(`window.selectInspectorExercise(${JSON.stringify(ex)})`);await new Promise(r=>setTimeout(r,500));
assert.equal(await ev('!!document.querySelector("[role=dialog]")'),true);
assert.equal(await ev('document.querySelector(".ei-dialog").scrollWidth <= document.querySelector(".ei-dialog").clientWidth'),true);
for(const [width,height,name] of [[1440,1000,'desktop'],[390,844,'mobile']]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
 await ev(`document.querySelector('.ei-scroll').scrollTop=0`);
 const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(`/tmp/coach-inbox-${name}.png`,Buffer.from(data,'base64'));
 assert.equal(await ev('document.querySelector(".ei-dialog").scrollWidth <= innerWidth'),true);
}
await ev(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Quellen zusammenführen')).click()`);await new Promise(r=>setTimeout(r,400));
assert.equal(await ev('document.body.innerText.includes("Bewusst getrennt")'),false);
assert.equal(await ev('document.body.innerText.includes("Mit dieser Übung zusammenführen")'),true);
assert.equal(await ev('document.querySelectorAll(".ei-dialog select").length'),1);
await ev(`document.querySelector('.ei-scroll').scrollTop=0`);
const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/coach-inbox-sources.png',Buffer.from(data,'base64'));
await ev(`document.querySelector('.ei-dialog form').requestSubmit()`);
await new Promise(r=>setTimeout(r,100));
await ev(`window.insightsFixture.inspectorWrites.approve.resolve({ok:true,results:Array.from({length:12},(_,i)=>({id:String(i),display_name:'Bankdrücken Variante '+i}))})`);
await new Promise(r=>setTimeout(r,100));
assert.equal(await ev(`document.querySelectorAll('.ei-dialog form + ul li').length`),12);
assert.equal(await ev(`getComputedStyle(document.querySelector('.ei-dialog form + ul')).overflowY`),'visible');
await ev(`document.querySelector('.ei-dialog form + ul').scrollIntoView({block:'start'})`);
const resultsShot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/coach-inbox-results.png',Buffer.from(resultsShot.data,'base64'));
await ev(`[...document.querySelectorAll('.ei-dialog button')].find(b=>b.textContent==='Mit dieser Übung zusammenführen').click()`);
await new Promise(r=>setTimeout(r,100));
await ev(`window.insightsFixture.inspectorWrites.approve.resolve({ok:true,exercise:${JSON.stringify({...ex,source_selection:{wger:'42',yuhonas:null}})}})`);
await new Promise(r=>setTimeout(r,100));
assert.equal(await ev(`document.querySelector('.ei-dialog').innerText.includes('wger: 42')`),true);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
assert.equal(await ev('!!document.querySelector("[role=dialog]")'),false);
console.log('PASS: desktop/mobile overflow, source candidates after null selection, source editor open, Escape');ws.close();
