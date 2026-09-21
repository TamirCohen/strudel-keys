import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='@strudel/core'?new URL('./strudel-core.mjs',import.meta.url).href:specifier,context);}});
const {note,s}=await import('./strudel-core.mjs');
const {miniAllStrings}=await import('@strudel/mini');miniAllStrings();
const {literalFromEvents,noteMidi,normalizeEvents,expandEvents,repeatEvents}=await import('../notation.js');
function events(value,kind){return (kind==='note'?note:s)(value).queryArc(0,1).filter(h=>h.hasOnset()).map(h=>({pitch:kind==='note'?noteMidi(h.value.note):String(h.value.s)+(h.value.n===undefined?'':':'+h.value.n),start:Number(h.whole.begin),duration:Number(h.whole.end)-Number(h.whole.begin)}));}
const signature=events=>events.map(e=>[e.pitch,e.start.toFixed(7),e.duration.toFixed(7)].join(':')).sort();
test('bd*4 repeats across four cycles and editing one repetition preserves the other kicks',()=>{
 const repeated=repeatEvents(events('bd*4','s'),1,4);
 assert.equal(repeated.length,16);
 assert.equal(new Set(repeated.map(e=>e.id)).size,16);
 const edited=repeated.filter((e,i)=>i!==9);
 const text=literalFromEvents(normalizeEvents(edited,4),'s');
 assert.deepEqual(signature(expandEvents(events(text,'s'),4)),signature(edited));
});
test('multi-cycle notes retain absolute timing and independent later cycles',()=>{
 const original=[{pitch:60,start:0,duration:.25},{pitch:64,start:1.5,duration:.5},{pitch:67,start:3.75,duration:.25}];
 for(const length of [4,8]){
  const text=literalFromEvents(normalizeEvents(original,length),'note');
  assert.deepEqual(signature(expandEvents(events(text,'note'),length)),signature(original));
  const native=note(text).slow(length).queryArc(0,length).filter(h=>h.hasOnset()).map(h=>({pitch:noteMidi(h.value.note),start:Number(h.whole.begin),duration:Number(h.whole.end)-Number(h.whole.begin)}));
  assert.deepEqual(signature(native),signature(original));
 }
});
for(const [kind,notation] of [['note','c3 e3 g3 e3'],['note','[c3,e3,g3]@2 ~ c4'],['note','c3*4'],['note','c3 ~@3 g3@2 ~@2'],['s','bd*4, [~ cp]*2, hh*16'],['s','bd:2 ~ cp:1 ~'],['note','[c3 e3 g3]*3']]){
 test('literal round trip: '+notation,()=>{
  const before=events(notation,kind),result=literalFromEvents(before,kind);
  assert.deepEqual(signature(events(result,kind)),signature(before));
  assert.ok(!result.includes('JSON'));assert.ok(!result.includes('filterHaps'));
 });
}
test('move, resize and batch delete change only requested source events',()=>{
 const original=events('c3 ~ e3 ~','note');
 const changed=[{...original[0],start:1/8,duration:3/8,pitch:50}];
 const result=literalFromEvents(changed,'note');assert.ok(result.includes('d3'));
 assert.deepEqual(signature(events(result,'note')),signature(changed));
 assert.equal(literalFromEvents([],'note'),'~');
});
test('serializer refuses lossy rounding and out-of-cycle notes',()=>{
 assert.throws(()=>literalFromEvents([{pitch:60,start:.123456,duration:.25}],'note'));
 assert.throws(()=>literalFromEvents([{pitch:60,start:.75,duration:.5}],'note'));
});
test('drum voices stay readable instead of interleaving unrelated sounds',()=>{
 const result=literalFromEvents(events('bd*4, [~ cp]*2, hh*16','s'),'s');
 assert.deepEqual(result.split(', ').sort(),['bd*4','[~ cp]*2','hh*16'].sort());
});
