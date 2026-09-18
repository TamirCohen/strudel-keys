import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as patterns from '@strudel/core/pattern.mjs';
import * as controls from '@strudel/core/controls.mjs';
registerHooks({resolve(s,c,next){return next(s==='@strudel/core'?new URL('./strudel-core.mjs',import.meta.url).href:s,c);}});
const {mini}=await import('@strudel/mini');patterns.setStringParser(mini);
import {readableExpression} from '../export-code.js';
import {scopeCode} from '../code-scope.js';
import {withVolume,withControl} from '../clean-code.js';
const scope={...patterns,...controls};
const evaluate=code=>Function(...Object.keys(scope),'return (async()=>('+code+'))()')(...Object.values(scope));
const signature=p=>p.queryArc(0,4).filter(h=>h.hasOnset()).map(h=>JSON.stringify([Number(h.whole.begin),Number(h.whole.end),Object.entries(h.value).sort()])).sort();
test('multiple track patterns export as a native stack with identical music',async()=>{
 const code='$: s("bd*4, [~ cp]*2").bank("RolandTR909")\n$: s("hh*16").bank("RolandTR909").gain("0.1, 0.2, 0.1, 0.3")\n$: s("[~ oh]*4").bank("RolandTR909").gain("0.7")';
 const out=readableExpression(code);assert.ok(out.startsWith('stack('));assert.ok(!/await|_kl|const |=>/.test(out));
 assert.deepEqual(signature(await evaluate(out)),signature(await evaluate(scopeCode(code))));
});
test('all and each remain local musical transforms without REPL machinery',async()=>{
 for(const code of [
  '$: s("bd*4")\n$: s("hh*8")\neach(p=>p.gain(.4))\nall(p=>p.postgain(.2))',
  '$: s("bd*4")\nall(p=>stack(p,p.late(.5)))',
  '$: note("c3 e3").s("sine")\nall(p=>p.room(.2).gain(.4))'
 ]){
  const out=readableExpression(code);assert.ok(!out.includes('_kl'));
  assert.deepEqual(signature(await evaluate(out)),signature(await evaluate(scopeCode(code))));
 }
});
test('multiline volume stays compact across repeated edits',()=>{
 let code='$: s("bd*4")\n$: s("hh*16")';
 for(const value of [.2,.3,.4])code=withVolume(code,value);
 assert.equal(code,'$: stack(\n  s("bd*4"),\n  s("hh*16")\n).postgain(0.4)');
});
test('custom declarations do not leak implementation code into exports',()=>{
 assert.throws(()=>readableExpression('const motif=note("c3");\n$: motif'),/Share the project/);
});
test('changing sounds replaces controls rather than accumulating wrappers',()=>{
 let code='$: note("c3 e3").s("sine").room(.2)';
 for(const sound of ['square','triangle','sawtooth'])code=withControl(code,'s',sound);
 assert.equal(code,'$: note("c3 e3").room(.2).s("sawtooth")');
});
