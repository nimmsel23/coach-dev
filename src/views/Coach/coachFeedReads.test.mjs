import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import process from 'node:process';
import { Buffer } from 'node:buffer';

async function adapter(kind) {
  const file = resolve(`src/lib/db/${kind}/coach.js`);
  const source = await readFile(file, 'utf8');
  const names = [...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from/g)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim()).filter(Boolean)))];
  const values = {
    api: 'globalThis.coachFeedFixture.api',
    getDocs: '(ref) => globalThis.coachFeedFixture.read(ref)',
    collection: '(_db, ...path) => path.at(-1)',
    collectionGroup: '(_db, name) => name',
    cachedQuery: '(_key, loader) => loader()',
    CACHE_KEYS: '{feedClient:(uid,n)=>`feed:client:${uid}:${n}`,feedGlobal:(n)=>`feed:global:${n}`,routinesProgress:(uid)=>`routines:${uid}`} ',
  };
  const stub = names.map((name) => `export const ${name} = ${values[name] || 'null'};`).join('\n');
  const result = await build({
    stdin: {contents:`export {getClientJournalFeed,getGlobalJournalFeed,getClientRoutinesProgress} from ${JSON.stringify(file)}`,resolveDir:process.cwd()},
    bundle:true,write:false,format:'esm',platform:'node',
    plugins:[{name:'profile-fixture',setup(builder) {
      builder.onResolve({filter:/.*/},(args)=>args.importer===file ? {path:args.path,namespace:'stub'} : undefined);
      builder.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${kind}`);
}

const snapshot = (source) => ({docs:[{id:'same-id',ref:{path:`fitness/client-a/${source}/same-id`,parent:{parent:{id:'client-a'}}},data:()=>({date:'2026-11-14',notes:'saved notes',text:'journal text',exercises:[{id:'bench'}],coachFeedback:'saved feedback'})}]});

test('Coach feed/progress adapters reject failed reads instead of caching empty or partial history',async(t)=>{
  const fixture=globalThis.coachFeedFixture={};
  try {
    const cloud=await adapter('firestore');
    for(const method of ['getClientJournalFeed','getGlobalJournalFeed']) {
      await t.test(`${method} keeps all three entry types and their identities`,async()=>{
        fixture.read=async(source)=>snapshot(source);
        const feed=await cloud[method](...(method==='getClientJournalFeed'?['client-a']:[]));
        assert.equal(feed.length,3);
        assert.deepEqual(feed.map(x=>x.type),['workout','journal','habit_journal']);
        assert.equal(feed[0].coachFeedback,'saved feedback');
        assert.equal(feed[0].exercises[0].id,'bench');
        assert.equal(new Set(feed.map(x=>x.path)).size,3);
      });
      for(const failed of ['sessions','journal','habitJournals']) await t.test(`${method}: ${failed} failure remains an error`,async()=>{
        const cause=Object.assign(new Error('read denied'),{code:'permission-denied'});
        fixture.read=async(source)=>{if(source===failed)throw cause;return snapshot(source);};
        await assert.rejects(cloud[method](...(method==='getClientJournalFeed'?['client-a']:[])),error=>error===cause);
      });
    }
    for(const failed of ['routines','workouts']) await t.test(`progress: ${failed} failure remains an error`,async()=>{
      fixture.read=async(source)=>{if(source===failed)throw new Error('offline');return snapshot(source);};
      await assert.rejects(cloud.getClientRoutinesProgress('client-a'),/offline/);
    });
    await t.test('genuinely empty cloud collections are valid',async()=>{
      fixture.read=async()=>({docs:[]});
      assert.deepEqual(await cloud.getClientJournalFeed('a'),[]);
      assert.deepEqual(await cloud.getGlobalJournalFeed(),[]);
      assert.deepEqual(await cloud.getClientRoutinesProgress('a'),{routines:[],workouts:[]});
    });
    let response;
    fixture.api={get:async()=>response};
    const local=await adapter('local');
    await t.test('local feeds require arrays and propagate transport failures',async()=>{
      for(const method of ['getClientJournalFeed','getGlobalJournalFeed']) {
        for(response of [null,{}, {feed:{}},{ok:false,feed:[]}]) await assert.rejects(local[method](...(method==='getClientJournalFeed'?['a']:[])));
        response={feed:[]};assert.deepEqual(await local[method](...(method==='getClientJournalFeed'?['a']:[])),[]);
      }
      fixture.api.get=async()=>{throw new Error('offline');};
      await assert.rejects(local.getClientJournalFeed('a'),/offline/);
      await assert.rejects(local.getGlobalJournalFeed(),/offline/);
      await assert.rejects(local.getClientRoutinesProgress('a'),/offline/);
    });
    await t.test('local progress requires both arrays',async()=>{
      for(response of [null,{}, {routines:[],workouts:null},{routines:{},workouts:[]},{ok:false,routines:[],workouts:[]}]) {
        fixture.api.get=async()=>response;
        await assert.rejects(local.getClientRoutinesProgress('a'));
      }
      response={routines:[],workouts:[]};fixture.api.get=async()=>response;
      assert.deepEqual(await local.getClientRoutinesProgress('a'),response);
    });
  } finally {delete globalThis.coachFeedFixture;}
});
