// Isolated visual/interaction acceptance: real Coach shell + ClientsPanel, synthetic data.
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const coachHtml = await readFile('dist-coach/coach.html', 'utf8');
const stylesheets = [...coachHtml.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
assert.ok(stylesheets.length, 'Build Coach before running browser acceptance');
const builtCss = (await Promise.all(stylesheets.map(name => readFile(join('dist-coach', name), 'utf8')))).join('\n');
const artifacts = await mkdtemp(join(tmpdir(), 'coach-dashboard-'));
const profiles = { alice: { displayName: 'Anna Beispiel', clientStatus: 'client' }, bob: { displayName: 'Ben Muster', clientStatus: 'client' }, clara: { displayName: 'Clara Test', clientStatus: 'friend' } };
const workspaces = [{ id: 'anna', name: 'Anna Beispiel', uids: ['alice'], plans: [{ id: 'p', name: 'Ganzkörper · Aufbau', status: 'ready', version: 2, deliveredVersion: 1 }], taskwarriorConfigured: true }];
const mocks = {
  '@db': `export const getGlobalInbox = async () => []; export const watchCoachInbox = () => () => {}; export const getAllUserProfiles = async () => (${JSON.stringify(profiles)}); export const updateUserProfile = async () => true;`,
  '../contexts/UserContext.jsx': `export const useUser = () => ({user:{uid:'coach',email:'coach@example.test'},authLoading:false});`,
  '../store/index.js': `export const useSettingsStore = () => ({sidebarPinned:true,setSidebarPinned:()=>{}});`,
  '../hooks/useCoachAccess.js': `export const useCoachAccess = () => true;`,
  '../lib/kb/muscles.js': `export const getStaticMuscleTaxonomy = () => [];`,
  '../views/Coach/useCoachUnreadCounts.js': `export const useCoachUnreadCounts = () => ({byClient:{alice:3},total:3,unreadClients:[],error:false});`,
  '../Inbox/useInbox': `export const useInbox = () => ({exercises:[],mergeCandidates:{},loading:false});`,
  './useClientActivity.js': `export const useClientActivity = () => ({alice:{status:'active',label:'Aktiv · zuletzt heute'},bob:{status:'inactive',label:'Inaktiv · zuletzt vor 18 Tagen'},clara:{status:'unknown',label:'Aktivität unbekannt'}});`,
  './useWorkspaceSummary.js': `import {useState} from 'react'; export function useWorkspaceSummary(){const [offline,setOffline]=useState(false);return {status:offline?'offline':'ready',workspaces:offline?[]:${JSON.stringify(workspaces)},checkedAt:'2026-11-24T12:00:00Z',error:offline?'Lokaler Workspace nicht erreichbar. Laptop und Tailscale müssen verbunden sein.':'',retry:()=>setOffline(v=>!v)}}`,
};
const nullViews = new Set(['../components/ExerciseInsightModal.jsx','../components/AuthGateModal.jsx','./ThemeSheet.jsx','./WorkerChip.jsx','./CatalogBrowser','./TractionPanel.jsx']);
const subviews = new Set(['./ClientMessages','./ClientWorkoutsFeed','./ClientConsole','./AssignPlan','./ClientTrainingPlans','./ClientHabitCycle','./ClientInsights','./ClientSixPack']);
let browser, socket, server;
const errors=[];
try {
  server = await createServer({configFile:false,root:process.cwd(),css:{postcss:{plugins:[]}},server:{host:'127.0.0.1',port:15916,strictPort:true,watch:{ignored:['**/vitalos/**','**/dist*/**','**/klienten-python/**','**/workspaces/**']}},optimizeDeps:{noDiscovery:true,entries:[],include:['react','react-dom/client','lucide-react']},plugins:[{
    name:'dashboard-fixture',enforce:'pre',
    configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url==='/__styles.css'){res.setHeader('content-type','text/css');res.end(builtCss);return;}if(req.url!=='/__dashboard.html')return next();res.setHeader('content-type','text/html');res.end('<html data-theme="vital"><head><link rel="stylesheet" href="/__styles.css" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/__dashboard.jsx"></script></body></html>');});},
    resolveId(source){if(source==='/__dashboard.jsx')return '\0dashboard-entry';if(source in mocks||nullViews.has(source)||subviews.has(source))return `\0dashboard-mock:${source}`;},
    load(id){if(id==='\0dashboard-entry')return `import React from 'react';import{createRoot}from'react-dom/client';import Shell from '/src/shell/CoachShell.jsx';createRoot(document.getElementById('root')).render(React.createElement(Shell));`;
      if(!id.startsWith('\0dashboard-mock:'))return;const source=id.slice('\0dashboard-mock:'.length);if(source in mocks)return mocks[source];
      if(subviews.has(source))return `import React from 'react';export default function View({clientUid}){return React.createElement('section',{style:{padding:'24px 0',minHeight:180}},React.createElement('h2',null,${JSON.stringify(source.slice(2))}),React.createElement('p',null,clientUid||'Letzte Trainings deiner Klienten'));}`;
      return 'export default function View(){return null;}';}
  }]});
  await server.listen(); console.log('Fixture listening');
  browser=spawn('chromium',['--headless','--no-sandbox','--disable-gpu','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${artifacts}/profile`,'about:blank'],{stdio:'ignore'});
  let pages;
  let debugPort;
  for(let n=0;n<60;n++){try{debugPort=(await readFile(`${artifacts}/profile/DevToolsActivePort`,'utf8')).split('\n')[0];pages=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();if(pages.some(p=>p.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,200));}
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));console.log('Browser connected');
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const item=pending.get(msg.id);if(item){pending.delete(msg.id);clearTimeout(item.timer);msg.error?item.reject(new Error(JSON.stringify(msg.error))):item.resolve(msg.result);}}if(msg.method==='Runtime.exceptionThrown'){const error=msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text;errors.push(error);console.error(error);}});
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>reject(new Error(method+' timed out')),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result.value;}
  async function waitFor(expression){for(let n=0;n<100;n++){if(errors.length)throw new Error(errors.join('\n'));if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Not rendered: '+expression+'\n'+await evaluate('document.body.innerText'));}
  async function screenshot(name){const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,name+'.png'),Buffer.from(data,'base64'));}
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:15916/__dashboard.html'});console.log('Navigated');
  await waitFor(`document.body.innerText.includes('Anna Beispiel') && Boolean(document.querySelector('.coach-client-grid'))`);
  assert.equal(await evaluate('document.querySelectorAll(".coach-client-item").length'),3);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('desktop-overview');
  await evaluate(`document.querySelector('.coach-client-item .vos-btn.primary').click()`);
  await waitFor(`document.body.innerText.includes('Ganzkörper · Aufbau')`);
  assert.equal(await evaluate(`document.querySelectorAll('.coach-client-nav button').length`),7);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('desktop-client');
  await evaluate(`document.querySelectorAll('.coach-client-nav button')[2].click()`);
  await waitFor(`document.body.innerText.includes('ClientMessages')`);
  await evaluate(`document.querySelector('[aria-label="Klient wechseln"]').value='bob';document.querySelector('[aria-label="Klient wechseln"]').dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFor(`document.body.innerText.includes('Diesem Konto ist noch kein lokaler Workspace zugeordnet.')`);
  await evaluate(`document.querySelector('.coach-workspace button').click()`);
  await waitFor(`document.body.innerText.includes('Lokaler Workspace nicht erreichbar.')`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('window.scrollTo(0,0)');
  await screenshot('mobile-client-offline');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await evaluate(`window.location.hash='#/clients'`);
  await waitFor(`Boolean(document.querySelector('.coach-client-grid'))`);
  await screenshot('mobile-overview');
  await evaluate(`document.getElementById('activity-filter').value='inactive';document.getElementById('activity-filter').dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFor(`document.querySelectorAll('.coach-client-item').length===1`);
  assert.equal(await evaluate(`document.querySelector('.coach-client-item').innerText.includes('Ben Muster')`),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  assert.deepEqual(errors,[]);
  console.log(`Dashboard browser checks passed. Screenshots: ${artifacts}`);
} catch(error) {console.error('Browser acceptance failed:',error,errors);throw error;} finally {socket?.close();browser?.kill();server?.httpServer?.closeAllConnections();await server?.close();}
