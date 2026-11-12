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
    api: 'globalThis.profileDiscoveryFixture.api',
    getDocs: '(ref) => globalThis.profileDiscoveryFixture.read(ref)',
    collectionGroup: '(_db, name) => name',
    cachedQuery: '(_key, loader) => loader()',
    CACHE_KEYS: '{profiles:"profiles:all"}',
  };
  const stub = names.map((name) => `export const ${name} = ${values[name] || 'null'};`).join('\n');
  const result = await build({
    stdin: {contents:`export {getAllUserProfiles} from ${JSON.stringify(file)}`,resolveDir:process.cwd()},
    bundle:true,write:false,format:'esm',platform:'node',
    plugins:[{name:'profile-fixture',setup(builder) {
      builder.onResolve({filter:/.*/},(args)=>args.importer===file ? {path:args.path,namespace:'stub'} : undefined);
      builder.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${kind}`);
}
const snapshot = (uid, data) => ({docs:[{ref:{parent:{parent:{id:uid}}},data:()=>data}]});

test('profile discovery never turns failed or malformed reads into a valid empty list',async (t)=>{
  const fixture = globalThis.profileDiscoveryFixture = {};
  try {
    const firestore = await adapter('firestore');
    await t.test('merges profile and settings records and accepts genuine emptiness',async()=>{
      fixture.read=async (name)=>name==='profile' ? snapshot('a',{email:'a@example.invalid'}) : snapshot('a',{name:'Anna'});
      assert.equal((await firestore.getAllUserProfiles()).a.displayName,'Anna');
      fixture.read=async()=>({docs:[]});
      assert.deepEqual(await firestore.getAllUserProfiles(),{});
    });
    for(const source of ['profile','settings']) await t.test(`${source} failure rejects instead of publishing partial data`,async()=>{
      const error=Object.assign(new Error('permission denied'),{code:'permission-denied'});
      fixture.read=async(name)=>{if(name===source)throw error;return snapshot('a',{displayName:'Anna'});};
      await assert.rejects(firestore.getAllUserProfiles(),(cause)=>cause===error);
    });
    let response;
    fixture.api={get:async()=>response};
    const local=await adapter('local');
    await t.test('local malformed results reject; a real empty profiles map succeeds',async()=>{
      for(response of [null,{}, {profiles:null},{profiles:[]},{ok:false,profiles:{}}]) await assert.rejects(local.getAllUserProfiles());
      response={profiles:{}};
      assert.deepEqual(await local.getAllUserProfiles(),{});
    });
    await t.test('local transport errors propagate',async()=>{
      fixture.api.get=async()=>{throw new Error('offline');};
      await assert.rejects(local.getAllUserProfiles(),/offline/);
    });
  } finally {delete globalThis.profileDiscoveryFixture;}
});
