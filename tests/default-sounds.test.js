import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSoundLoader} from '../default-sounds.js';
test('default sample maps register once, aliases load after banks, and failed maps retry',async()=>{
 const original=globalThis.fetch,requests=[],samples=[],aliases=[];let failPiano=true;
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url.endsWith('/piano.json')&&failPiano)return {ok:false,status:503};
  return {ok:true,json:async()=>url.includes('alias')?{RolandTR909:'TR909'}:url.includes('Dirt-Samples')?{casio:['casio.wav'],bd:['not-the-default.wav']}:{sound:['sound.wav']}};
 };
 try{
  const load=defaultSoundLoader({samples:async(...args)=>samples.push(args),aliasBank:async map=>aliases.push(map)});
  assert.equal((await load()).length,1);
  assert.equal(aliases.length,1);
  assert.ok(samples.some(([map])=>map.casio&&!map.bd));
  const successful=samples.length,first=requests.length;failPiano=false;
  assert.deepEqual(await load(),[]);assert.equal(samples.length,successful+1);assert.equal(requests.length,first+1);
  assert.deepEqual(await load(),[]);assert.equal(requests.length,first+1);
 }finally{globalThis.fetch=original;}
});
