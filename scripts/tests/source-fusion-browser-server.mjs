// Lightweight isolated React fixture; avoids loading the full Coach/KB tree.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'source-fusion-ui-'));
await build({entryPoints:['src/views/Inbox/source-fusion.browser.jsx'],outfile:join(dir,'fixture.js'),bundle:true,format:'esm',jsx:'automatic',loader:{'.css':'empty'},alias:{'@db':resolve('src/views/Coach/insights.browser-db.js')},define:{'process.env.NODE_ENV':'"production"'}});
const html=await readFile('dist-coach/coach.html','utf8');let css='';
for(const match of html.matchAll(/href="([^"]+\.css)"/g))css+=await readFile(join('dist-coach',match[1]),'utf8');
css+=await readFile('src/components/exercise-inspector.css','utf8');
const js=await readFile(join(dir,'fixture.js'));
createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-theme="vital"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
}).listen(15918,'127.0.0.1',()=>console.log('Source merge fixture on :15918'));
