import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as patterns from '@strudel/core/pattern.mjs';
import * as controls from '@strudel/core/controls.mjs';
registerHooks({resolve(specifier,context,next){return next(specifier==='@strudel/core'?new URL('./strudel-core.mjs',import.meta.url).href:specifier,context);}});
const {mini}=await import('@strudel/mini');patterns.setStringParser(mini);
import {cleanCode,rewriteNotes,assertEditable,eventSignature,withVolume} from '../clean-code.js';
const scope={...patterns,...controls};
function events(code,bars=2){
 const pattern=Function(...Object.keys(scope),'return '+code.replace(/^\$:\s*/,''))(...Object.values(scope));
 return pattern.queryArc(0,bars).filter(h=>h.hasOnset()).map((h,i)=>({id:String(i),start:Number(h.whole.begin)*4,
  duration:h.value.note===undefined?.15:Number(h.whole.end.sub(h.whole.begin))*4*(h.value.clip??1),
  pitch:h.value.note??h.value.s,value:h.value}));
}
test('a common drum groove simplifies to one native sound pattern',()=>{
 const original='$: s("bd*4, ~ cp ~ cp, hh*16").bank("RolandTR909").postgain(0.3)';
 const notes=events(original),code=cleanCode(notes,2);
 assert.equal(code,'$: s("bd*4, [~ cp]*2, hh*16").bank("RolandTR909").postgain(0.3)');
 assert.equal(eventSignature(events(code)),eventSignature(notes));assertEditable(code,2);
});
test('fifty add/delete pairs return identical source, not an edit log',()=>{
 let code='$: s("bd*4, [~ cp]*2, hh*16").bank("RolandTR909").postgain(0.3)';
 const original=code;
 for(let i=0;i<50;i++){
  code=rewriteNotes(code,events(code),{add:[{start:6.5,duration:.15,pitch:'cp',value:{s:'cp',bank:'RolandTR909',postgain:.3}}]},2);
  const current=events(code),added=current.find(n=>n.start===6.5&&n.pitch==='cp');
  code=rewriteNotes(code,current,{remove:[added]},2);
 }
 assert.equal(code,original);assert.ok(!/keylabId|filterHaps|JSON|Piano-roll/.test(code));
});
test('held chords, overlaps, effects, off-grid notes, and duplicate hits round-trip',()=>{
 const notes=[{start:.13,duration:1.2,pitch:60},{start:.13,duration:.5,pitch:64},{start:7.8,duration:1,pitch:67}]
  .map(n=>({...n,value:{note:n.pitch,s:'sawtooth',cutoff:1200,room:.2,postgain:.4}}));
 const code=cleanCode(notes,2);assert.equal(eventSignature(events(code)),eventSignature(notes));
 assert.ok(code.includes('.lpf(1200)'));assert.ok(!code.includes('JSON'));
 const drums=[0,0,1/3,2/3].map(start=>({start,duration:.15,value:{s:'hh',bank:'RolandTR909'}}));
 assert.equal(eventSignature(events(cleanCode(drums,2))),eventSignature(drums));
});
test('unsupported, evolving, or longer-period source is never silently flattened',()=>{
 for(const code of ['$: s("<bd cp>")','$: s("bd?")','$: s("bd").sometimes(x=>x.fast(2))','$: s("bd").gain(sine)','$: s("bd").slow(3)','const x=s("bd"); $: x'])assert.throws(()=>assertEditable(code,2));
 assertEditable('$: s("bd").slow(4)',4);
 assertEditable('$: s("bd*4").gain(".2 .4")',2);
 assert.throws(()=>cleanCode([{start:0,duration:.15,value:{s:'bd',unknownEffect:42}}],2));
});
test('legacy generated edits are eligible for cleanup, custom callbacks are not',()=>{
 const base='$: s("bd*4").bank("RolandTR909")';
 assertEditable(base+'\n// Piano-roll edit\nall(p => stack(p, timecat([0.25, pure(JSON.parse(\'{"s":"cp","bank":"RolandTR909"}\'))], [7.75, silence]).slow(2).late(1.5)))\n// Track volume\nall(p => p.postgain(0.3))',2);
 assert.throws(()=>assertEditable(base+'\n// Piano-roll edit\nall(p => p.sometimes(x=>x.fast(2)))',2));
 assert.throws(()=>assertEditable(base+'\n// Piano-roll edit\nall(p => stack(p, timecat([0.25, pure(JSON.parse(\'{"s":"cp"}\'))], [7.75, silence]).slow(2).late(1.5)))',1));
});
test('volume replaces its control and does not accumulate transforms',()=>{
 let code='$: s("bd*4").bank("RolandTR909")';
 for(const v of [.2,.3,.4])code=withVolume(code,v);
 assert.equal(code,'$: s("bd*4").bank("RolandTR909").postgain(0.4)');
 assert.equal(withVolume('$: note("60").postgain(.2).s("sine")',.3),'$: note("60").s("sine").postgain(0.3)');
});
