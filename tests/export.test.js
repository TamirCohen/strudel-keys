import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import * as patterns from '@strudel/core/pattern.mjs';
import * as controls from '@strudel/core/controls.mjs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 return next(specifier==='@strudel/core'?new URL('./strudel-core.mjs',import.meta.url).href:specifier,context);
}});
const {mini}=await import('@strudel/mini');
patterns.setStringParser(mini);
import {newTrack,exportStrudel,strudelNote} from '../core.js';
globalThis.crypto??=webcrypto;
function evaluate(p){const scope={...patterns,...controls,samples:()=>{},setcpm:()=>{}};const code=exportStrudel(p,{'909':{bd:'https://example.com/kick.wav'}});return Function(...Object.keys(scope),'code','return eval(code)')(...Object.values(scope),code);}
test('repeated drum bars become native mini patterns with identical onsets',()=>{
 const t=newTrack();t.notes=Array.from({length:8},(_,i)=>({id:String(i),pitch:'bd',start:i,duration:.15}));
 const p={bpm:120,bars:2,tracks:[t]},code=exportStrudel(p);
 assert.ok(code.includes('s("bd*4")'));assert.ok(code.includes('.bank("RolandTR909")'));assert.ok(!code.includes('samples('));
 const h=evaluate(p).queryArc(0,2).filter(h=>h.hasOnset());
 assert.deepEqual(h.map(h=>Number(h.whole.begin)*4),t.notes.map(n=>n.start));
});
test('compact melody preserves chords, held lengths and repeated phrases',()=>{
 const t=newTrack('sawtooth');t.notes=[];
 for(const offset of [0,4])for(const [start,pitch] of [[0,60],[0,64],[1,67],[2,62],[3,65]])t.notes.push({id:crypto.randomUUID(),start:start+offset,pitch,duration:1.5});
 const p={bpm:120,bars:2,tracks:[t]},code=exportStrudel(p);
 assert.ok(code.includes('c4'));assert.ok(!/legato|attack|sustain|release/.test(code));
 const h=evaluate(p).queryArc(0,2).filter(h=>h.hasOnset()).sort((a,b)=>Number(a.whole.begin)-Number(b.whole.begin)||a.value.note-b.value.note);
 assert.equal(h.length,10);
 h.forEach((h,i)=>{assert.equal(Number(h.whole.begin)*4,t.notes[i].start);assert.equal(h.value.note,strudelNote(t.notes[i].pitch));assert.equal(Number(h.whole.end.sub(h.whole.begin))*4*(h.value.clip??1),1.5);});
});
test('triplets and non-repeated final bars keep their timing',()=>{
 const t=newTrack('acoustic');t.notes=[0,1/3,2/3,4].map((start,i)=>({id:String(i),start,pitch:'hh',duration:.15}));
 const p={bpm:120,bars:2,tracks:[t]};
 const h=evaluate(p).queryArc(0,2).filter(h=>h.hasOnset());
 assert.equal(h.length,4);h.forEach((h,i)=>assert.ok(Math.abs(Number(h.whole.begin)*4-t.notes[i].start)<1e-7));
 assert.ok(exportStrudel(p).includes('BossDR660'));
});
test('Strudel engine reproduces off-grid onsets, held lengths, overlaps, and loop period',()=>{
 const t=newTrack('sawtooth');t.notes=[{id:'a',pitch:60,start:.13,duration:1.2},{id:'b',pitch:64,start:.13,duration:.5},{id:'c',pitch:67,start:7.8,duration:1}];const p={bpm:120,bars:2,tracks:[t]};const pattern=evaluate(p);const haps=pattern.queryArc(0,4).filter(h=>h.hasOnset()).sort((a,b)=>Number(a.whole.begin)-Number(b.whole.begin)||a.value.note-b.value.note);assert.equal(haps.length,6);
 for(let i=0;i<haps.length;i++){const n=t.notes[i%3],cycle=Math.floor(i/3)*2;assert.ok(Math.abs(Number(haps[i].whole.begin)-(n.start/4+cycle))<1e-7);assert.ok(Math.abs(Number(haps[i].whole.end)-Number(haps[i].whole.begin)-n.duration/4)<1e-7);}
});
test('supersaw export produces three voices per note and drum export retains natural tails',()=>{const t=newTrack('supersaw');t.notes=[{id:'a',pitch:60,start:0,duration:1}];const p={bpm:120,bars:1,tracks:[t]};const h=evaluate(p).queryArc(0,1);assert.equal(h.length,3);assert.deepEqual(h.map(x=>x.value.detune).sort(),[-12,12,undefined].sort());t.sound='909';t.notes[0].pitch='bd';const drum=evaluate(p).queryArc(0,1);assert.equal(drum.length,1);assert.equal(drum[0].value.clip,undefined);});
