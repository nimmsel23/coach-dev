// Manual integration test: node src/views/Coach/clientConsole.browser-test.mjs
// Uses only virtual data, its own Vite server and its own temporary browser profile.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const profile = await mkdtemp(join(tmpdir(), 'coach-console-browser-'))
const db = `
export const state = {loads:[],saves:[]};
export function getClientJournalFeed(uid) {return new Promise((resolve,reject)=>state.loads.push({uid,resolve,reject}));}
export async function getClientNutritionDays() {return {access:'ok',days:[]};}
export function saveCoachFeedback(uid,id,type,text) {return new Promise((resolve,reject)=>state.saves.push({uid,id,type,text,resolve,reject}));}
`
const fixture = `
import {createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClientConsole from '/src/views/Coach/ClientConsole.jsx';
import {state} from '@db';
import '/src/styles.css';
window.consoleTest=state;
const listeners=new Set();
const add=window.addEventListener.bind(window), remove=window.removeEventListener.bind(window);
window.addEventListener=(type,listener,...rest)=>{if(type==='vos-coach-cache'||type==='vos-coach-cache-error')listeners.add(listener);return add(type,listener,...rest);};
window.removeEventListener=(type,listener,...rest)=>{if(type==='vos-coach-cache'||type==='vos-coach-cache-error')listeners.delete(listener);return remove(type,listener,...rest);};
state.listenerCount=()=>listeners.size;
function App(){const [uid,setUid]=useState('a');state.select=setUid;return createElement(ClientConsole,{clientUid:uid});}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(createElement(App));
`
let browser, ws, server
const errors = []
try {
  server = await createServer({
    configFile:false, cacheDir:join(profile,'vite-cache'), plugins:[react(), {
      name:'console-browser-fixture', enforce:'pre',
      resolveId(id) {if(id==='@db') return '\0console-db';if(id==='virtual:console-fixture')return '\0console-fixture.jsx';},
      load(id) {if(id==='\0console-db')return db;if(id==='\0console-fixture.jsx')return fixture;},
      configureServer(vite) {vite.middlewares.use(async(req,res,next)=>{
        if(req.url!=='/console-check')return next();
        res.setHeader('Content-Type','text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/virtual:console-fixture"></script></body></html>'));
      });},
    }],
    optimizeDeps:{entries:[],include:['react','react-dom/client','lucide-react']},
    server:{host:'127.0.0.1',port:15919,strictPort:true},
  })
  await server.listen()
  let debuggerInUse = false
  try {debuggerInUse = (await fetch('http://127.0.0.1:19240/json/version', {signal:AbortSignal.timeout(1000)})).ok} catch {}
  assert.equal(debuggerInUse,false,'CDP port19240 is already in use; refusing to attach to another browser')
  browser = spawn('thorium-browser-avx2', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-address=127.0.0.1','--remote-debugging-port=19240',`--user-data-dir=${profile}`,'about:blank'], {stdio:'ignore'})
  let browserError
  browser.on('error',(error)=>{browserError=error})
  let pages
  for(let i=0;i<100;i++) {
    if(browserError)throw browserError
    try {pages=await (await fetch('http://127.0.0.1:19240/json')).json();if(pages.some(p=>p.type==='page'))break;}catch{}
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
  const row=(uid,feedback,label='Push')=>({id:'same-session',userId:uid,type:'workout',date:'2026-11-14',block:label,coachFeedback:feedback,exercises:[]})
  const cache=async(key,data)=>evaluate(`window.dispatchEvent(new CustomEvent('vos-coach-cache',{detail:{key:${JSON.stringify(key)},data:${JSON.stringify(data)}}}))`)
  const cacheError=async(key,message)=>evaluate(`window.dispatchEvent(new CustomEvent('vos-coach-cache-error',{detail:{key:${JSON.stringify(key)},message:${JSON.stringify(message)}}}))`)
  await send('Runtime.enable');await send('Page.enable')
  await send('Page.navigate',{url:'http://127.0.0.1:15919/console-check'})
  await wait('window.consoleTest?.loads.length===1')
  await evaluate("window.consoleTest.loads[0].reject(new Error('Feed offline'))")
  await wait(has('Feed offline'))
  assert.equal(await evaluate(has('Keine Trainingslogs')),false)
  assert.equal(await evaluate(has('Trainingslogs')),false,'failed cold read must not display a zero total')
  await click('Erneut versuchen')
  await wait('window.consoleTest.loads.length===2')
  await cacheError('feed:client:a:100','Aktualisierung offline')
  await evaluate(`window.consoleTest.loads[1].resolve(${JSON.stringify([row('a','Saved A')])})`)
  await wait("document.querySelector('textarea')?.value==='Saved A'")
  assert.equal(await evaluate(has('Aktualisierung offline')),true)
  assert.equal(await evaluate('window.consoleTest.listenerCount()'),2)
  await type('Unsent A')
  await cache('feed:client:b:100',[row('b','Wrong client','Wrong client')])
  await cache('feed:client:a:500',[row('a','Wrong limit','Wrong limit')])
  await cacheError('feed:client:b:100','Wrong error')
  assert.equal(await value(),'Unsent A')
  assert.equal(await evaluate(has('Wrong client')),false)
  assert.equal(await evaluate(has('Wrong error')),false)
  await cache('feed:client:a:100',[row('a','Remote A','Pull'),row('b','Hidden B','Foreign')])
  await wait(has('Pull'))
  assert.equal(await evaluate(has('Foreign')),false)
  assert.equal(await evaluate(has('Aktualisierung offline')),false)
  assert.equal(await value(),'Unsent A')
  await type('')
  await cache('feed:client:a:100',[row('a','Remote A2','Pull')])
  assert.equal(await value(),'','an intentionally cleared draft must survive refresh')
  await type('First send')
  await cacheError('feed:client:a:100','Retry offline')
  await click('Erneut versuchen')
  await wait('window.consoleTest.loads.length===3')
  await evaluate(`window.consoleTest.loads[2].resolve(${JSON.stringify([row('a','Remote A3')])})`)
  await wait(`!(${has('Retry offline')})`)
  assert.equal(await value(),'First send')
  await click('Senden')
  await wait('window.consoleTest.saves.length===1')
  await type('Typed while saving')
  await evaluate('window.consoleTest.saves[0].resolve({ok:true})')
  await wait("[...document.querySelectorAll('button')].some(b=>!b.disabled&&b.textContent.includes('Senden'))")
  assert.equal(await value(),'Typed while saving')
  await click('Senden')
  await wait('window.consoleTest.saves.length===2')
  await evaluate('window.consoleTest.saves[1].resolve({ok:false})')
  await wait(has('Kommentar konnte nicht gespeichert werden.'))
  assert.equal(await value(),'Typed while saving')
  await cache('feed:client:a:100',[row('a','Remote A4'),{...row('a','Other saved','Other workout'),id:'other-session'}])
  await type('Concurrent first','#feedback-same-session')
  await click('Senden')
  await wait('window.consoleTest.saves.length===3')
  await type('Edited during overlap','#feedback-same-session')
  await type('Concurrent second','#feedback-other-session')
  await click('Senden')
  await wait('window.consoleTest.saves.length===4')
  assert.deepEqual(await evaluate('window.consoleTest.saves.slice(2).map(s=>s.id)'),['same-session','other-session'])
  assert.equal(await evaluate("document.querySelectorAll('form button:disabled').length"),2)
  await evaluate('window.consoleTest.saves[2].resolve({ok:true})')
  await wait("!document.querySelector('#feedback-same-session').closest('form').querySelector('button').disabled")
  assert.equal(await value(),'Edited during overlap')
  assert.equal(await evaluate("document.querySelector('#feedback-other-session').closest('form').querySelector('button').disabled"),true)
  await evaluate('window.consoleTest.saves[3].resolve({ok:false})')
  await wait("!document.querySelector('#feedback-other-session').closest('form').querySelector('button').disabled")
  assert.equal(await evaluate("document.querySelector('#feedback-other-session').value"),'Concurrent second')
  assert.equal(await evaluate(has('Kommentar konnte nicht gespeichert werden.')),true)
  await click('Senden')
  await wait('window.consoleTest.saves.length===5')
  await cacheError('feed:client:a:100','Another retry')
  await click('Erneut versuchen')
  await wait('window.consoleTest.loads.length===4')
  await evaluate("window.consoleTest.select('b')")
  await wait('window.consoleTest.loads.length===5')
  await cache('feed:client:a:100',[row('a','Late cache A','Late A')])
  await cacheError('feed:client:a:100','Late A error')
  await evaluate(`window.consoleTest.loads[4].resolve(${JSON.stringify([row('b','Saved B','Client B'),{...row('b','Hidden journal B','Journal B'),type:'journal'}])})`)
  await wait("document.querySelector('textarea')?.value==='Saved B'")
  await evaluate(`window.consoleTest.loads[3].resolve(${JSON.stringify([row('a','Late read A','Late A')])})`)
  await evaluate("window.consoleTest.saves[4].reject(new Error('Late A save error'))")
  await new Promise(resolve=>setTimeout(resolve,100))
  assert.equal(await value(),'Saved B')
  assert.equal(await evaluate(has('Late A')),false)
  assert.equal(await evaluate('window.consoleTest.listenerCount()'),2)
  for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true})
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`overflow at ${width}`)
  }
  await evaluate('window.consoleTest.unmount()')
  await wait('window.consoleTest.listenerCount()===0')
  await cache('feed:client:b:100',[row('b','After unmount')])
  await cacheError('feed:client:b:100','After unmount error')
  assert.deepEqual(errors,[])
  console.log('PASS Console: cold error/retry; exact client+limit cache updates; persistent refresh error with cached logs; nonempty and cleared drafts survive refresh/retry; pending-save edits; concurrent independent saves and failures; negative save; stale read/cache/save isolation on client switch; listener cleanup; four mobile viewports; no runtime exceptions.')
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
