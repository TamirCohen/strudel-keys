import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import * as patterns from '../node_modules/@strudel/core/pattern.mjs';
import * as controls from '../node_modules/@strudel/core/controls.mjs';
import {newTrack,exportStrudel} from '../core.js';
globalThis.crypto??=webcrypto;
function evaluate(p){const scope={...patterns,...controls,samples:()=>{},setcpm:()=>{}};const code=exportStrudel(p,{'909':{bd:'https://example.com/kick.wav'}});return Function(...Object.keys(scope),'code','return eval(code)')(...Object.values(scope),code);}
test('Strudel engine reproduces off-grid onsets, held lengths, overlaps, and loop period',()=>{
 const t=newTrack('sawtooth');t.notes=[{id:'a',pitch:60,start:.13,duration:1.2},{id:'b',pitch:64,start:.13,duration:.5},{id:'c',pitch:67,start:7.8,duration:1}];const p={bpm:120,bars:2,tracks:[t]};const pattern=evaluate(p);const haps=pattern.queryArc(0,4).filter(h=>h.hasOnset()).sort((a,b)=>Number(a.whole.begin)-Number(b.whole.begin)||a.value.note-b.value.note);assert.equal(haps.length,6);
 for(let i=0;i<haps.length;i++){const n=t.notes[i%3],cycle=Math.floor(i/3)*2;assert.ok(Math.abs(Number(haps[i].whole.begin)-(n.start/4+cycle))<1e-7);assert.ok(Math.abs(Number(haps[i].whole.end)-Number(haps[i].whole.begin)-n.duration/4)<1e-7);}
});
test('supersaw export produces three voices per note and drum export retains natural tails',()=>{const t=newTrack('supersaw');t.notes=[{id:'a',pitch:60,start:0,duration:1}];const p={bpm:120,bars:1,tracks:[t]};const h=evaluate(p).queryArc(0,1);assert.equal(h.length,3);assert.deepEqual(h.map(x=>x.value.detune).sort(),[-12,12,undefined].sort());t.sound='909';t.notes[0].pitch='bd';const drum=evaluate(p).queryArc(0,1);assert.equal(drum.length,1);assert.equal(drum[0].value.clip,undefined);});
