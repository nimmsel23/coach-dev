// Manual integration test: node src/views/Coach/clientMessages.browser-test.mjs
// Uses only virtual data, its own Vite server and its own temporary browser profile.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const profile = await mkdtemp(join(tmpdir(), 'coach-messages-browser-'))
const db = `
export const state={watches:[],sends:[],plansFail:true};
export const getUid=()=> 'coach-fixture';
export function watchClientMessages(uid,change,error) {const item={uid,change,error,stopped:false};state.watches.push(item);return {unsubscribe(){item.stopped=true;},async loadOlder(){}};}
export async function markClientConversationRead() {}
export async function listClientTrainingPlans() {if(state.plansFail)throw new Error('plans offline');return [];}
export async function getMacrocycle() {return {macrocycle:{headVersion:1,published:{name:'Plan'}}};}
export async function loadClientMessagePlan() {return {name:'Plan'};}
export function sendClientMessage(uid,text,plan) {return new Promise((resolve,reject)=>state.sends.push({uid,text,plan,resolve,reject}));}
`
const fixture = `
import {createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClientMessages from '/src/views/Coach/ClientMessages.jsx';
import {state} from '@db';
import '/src/styles.css';
window.messagesTest=state;
function App(){const [uid,setUid]=useState('a');state.select=setUid;return createElement(ClientMessages,{clientUid:uid});}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(createElement(App));
`
let browser, ws, server
const errors = []
try {
  server = await createServer({
    configFile:false, cacheDir:join(profile,'vite-cache'), plugins:[react(), {
      name:'messages-browser-fixture', enforce:'pre',
      resolveId(id,importer='') {
        if(id==='@db')return '\0messages-db';
        if(id==='virtual:messages-fixture')return '\0messages-fixture.jsx';
        if(importer.endsWith('/ClientMessages.jsx')&&id==='./trainingProgramStore.js')return '\0messages-plans';
        if(importer.endsWith('/ClientMessages.jsx')&&id.endsWith('/views/Plan/PlanDocument.jsx'))return '\0messages-plan-document';
      },
      load(id) {
        if(id==='\0messages-db')return db;
        if(id==='\0messages-fixture.jsx')return fixture;
        if(id==='\0messages-plans')return "export {listClientTrainingPlans} from '@db';";
        if(id==='\0messages-plan-document')return 'export default function Plan(){return null;}';
      },
      configureServer(vite) {vite.middlewares.use(async(req,res,next)=>{
        if(req.url!=='/messages-check')return next();
        res.setHeader('Content-Type','text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/virtual:messages-fixture"></script></body></html>'));
      });},
    }],
    optimizeDeps:{entries:[],include:['react','react-dom/client','lucide-react']},
    server:{host:'127.0.0.1',port:15920,strictPort:true},
  })
  await server.listen()
  let debuggerInUse = false
  try {debuggerInUse = (await fetch('http://127.0.0.1:19241/json/version', {signal:AbortSignal.timeout(1000)})).ok} catch {}
  assert.equal(debuggerInUse,false,'CDP port19241 is already in use; refusing to attach to another browser')
  browser = spawn('thorium-browser-avx2', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-address=127.0.0.1','--remote-debugging-port=19241',`--user-data-dir=${profile}`,'about:blank'], {stdio:'ignore'})
  let browserError
  browser.on('error',(error)=>{browserError=error})
  let pages
  for(let i=0;i<100;i++) {
    if(browserError)throw browserError
    try {pages=await (await fetch('http://127.0.0.1:19241/json')).json();if(pages.some(p=>p.type==='page'))break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.ok(pages?.some(p=>p.type==='page'),'Owned browser did not start')
  ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}))
  let sequence=0
  const pending=new Map()
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`))},10000)
    pending.set(id,{resolve:(result)=>{clearTimeout(timer);resolve(result)},reject:(error)=>{clearTimeout(timer);reject(error)}})
    ws.send(JSON.stringify({id,method,params}))
  })
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data)
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
    const task=pending.get(message.id)
    if(!task)return
    pending.delete(message.id)
    message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result)
  })
  const evaluate=async(expression)=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text)
    return result.result.value
  }
  const wait=async(expression)=>{
    for(let i=0;i<150;i++) {if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50))}
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}\n${errors.join('\n')}`)
  }
  const has=(text)=>`document.body.innerText.includes(${JSON.stringify(text)})`
  const click=async(text)=>{
    const selector=`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.trim()===${JSON.stringify(text)})`
    await wait(`!!(${selector})`);await evaluate(`(${selector}).click()`)
  }
  const type=async(text,selector='textarea')=>evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(text)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  const value=()=>evaluate("document.querySelector('textarea')?.value")
  await send('Runtime.enable');await send('Page.enable')
  await send('Page.navigate',{url:'http://127.0.0.1:15920/messages-check'})
  await wait('window.messagesTest?.watches.length===1')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('textarea')).fontSize"),'16px')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('select')).fontSize"),'16px')
  await evaluate("window.messagesTest.watches[0].error(new Error('Listener offline'))")
  await wait(has('Listener offline'))
  assert.equal(await evaluate(has('Noch keine Nachrichten.')),false)
  await type('Draft A')
  await evaluate('window.messagesTest.plansFail=false')
  await click('Erneut versuchen')
  await wait('window.messagesTest.watches.length===2')
  assert.equal(await evaluate('window.messagesTest.watches[0].stopped'),true)
  await evaluate("window.messagesTest.watches[1].change({messages:[],readers:{},fromCache:false})")
  await wait(has('Noch keine Nachrichten.'))
  assert.equal(await value(),'Draft A')
  assert.equal(await evaluate(has('Planbezüge konnten nicht geladen werden.')),false)
  // Same-turn duplicate form events must dispatch only one write.
  await evaluate("document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
  await wait('window.messagesTest.sends.length===1')
  assert.equal(await evaluate('window.messagesTest.sends[0].text'),'Draft A')
  await evaluate("window.messagesTest.sends[0].reject(new Error('Send offline'))")
  await wait(has('Send offline'))
  assert.equal(await value(),'Draft A')
  await click('Nachricht senden')
  await wait('window.messagesTest.sends.length===2')
  await evaluate("window.messagesTest.sends[1].resolve('message-1')")
  await wait("document.querySelector('textarea').value===''")
  assert.equal(await evaluate("localStorage.getItem('coach-conversation-draft-v1:coach-fixture:a')"),null)
  await type('Old A send')
  await click('Nachricht senden')
  await wait('window.messagesTest.sends.length===3')
  await evaluate("window.messagesTest.select('b')")
  await wait("window.messagesTest.watches.at(-1).uid==='b'")
  await type('B draft')
  await evaluate("window.messagesTest.select('a')")
  await wait('window.messagesTest.watches.length===4')
  assert.equal(await value(),'Old A send')
  await type('New A draft')
  await evaluate("window.messagesTest.sends[2].resolve('message-2')")
  await new Promise(resolve=>setTimeout(resolve,100))
  assert.equal(await value(),'New A draft')
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('coach-conversation-draft-v1:coach-fixture:a')).text"),'New A draft')
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('coach-conversation-draft-v1:coach-fixture:b')).text"),'B draft')
  await evaluate("window.messagesTest.watches[0].error(new Error('Late A error'));window.messagesTest.watches[0].change({messages:[{id:'wrong',body:'Late wrong message'}],readers:{}})")
  assert.equal(await evaluate(has('Late A error')),false)
  assert.equal(await evaluate(has('Late wrong message')),false)
  for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true})
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`overflow at ${width}`)
  }
  await send('Page.reload')
  await wait('window.messagesTest?.watches.length===1')
  await wait("document.querySelector('textarea')?.value==='New A draft'")
  assert.deepEqual(errors,[])
  console.log('PASS Chat: listener/plan retry; draft retention; duplicate-send guard; failed/successful send; new drafts preserved after late old send; client/account storage separation; old listener isolation; reload and four mobile widths; no real messages.')
} finally {
  ws?.close()
  if(browser) {
    const exited=new Promise(resolve=>browser.once('exit',resolve))
    browser.kill('SIGTERM')
    await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,2000))])
  }
  await server?.close()
  await rm(profile,{recursive:true,force:true})
}
