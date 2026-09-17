import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createTrack,restoreProject,tempoBpm,tempoCode,projectCode} from '../project.js';
import {rewriteNotes,cleanCode} from '../clean-code.js';
import {newTrack} from '../core.js';
import {scopeCode,stripTempo} from '../code-scope.js';
test('canonical projects contain code and no persisted note arrays',()=>{
 const p=createProject();assert.equal(p.version,2);assert.equal(tempoBpm(p),120);
 assert.ok(!('notes' in p.tracks[0]));assert.ok(p.tracks[0].code.startsWith('$:'));
 assert.deepEqual(restoreProject(p),p);
});
test('migrate recordings and live-code legacy tracks without losing source',()=>{
 const a=newTrack(),b=newTrack('sawtooth');a.notes=[{id:'a',pitch:'bd',start:0,duration:.15}];b.strudel='$: note("c3").s("sawtooth").room(.3)';
 const p=restoreProject({version:1,bpm:100,bars:2,tracks:[a,b]});
 assert.equal(tempoBpm(p),100);assert.ok(p.tracks[0].code.includes('RolandTR909'));assert.equal(p.tracks[1].code,b.strudel);
 assert.ok(p.tracks.every(t=>!('notes' in t)&&!('strudel' in t)));
});
test('MIDI edits rewrite compact code and retain effects without edit history',()=>{
 const code='$: note("c3").s("sawtooth").room(.2)';
 const event={id:'a',start:0,duration:1,pitch:48,value:{note:'c3',s:'sawtooth',room:.2,gain:.5}};
 const result=rewriteNotes(code,[event],{remove:[event],add:[{...event,start:1}]},2);
 assert.ok(result.includes('.room(0.2)'));assert.ok(result.includes('.gain(0.5)'));
 assert.ok(!/JSON|filterHaps|keylabId|Piano-roll/.test(result));
});
test('track scopes isolate all transforms and tempo comes from project source',()=>{
 const a=createTrack(),b=createTrack('sawtooth'),p={...createProject(),tracks:[a,b]};
 a.code+='\nall(p=>p.postgain(.2))';
 const out=projectCode(p);assert.equal(out.split('const _klParts=').length,2);
 assert.equal(stripTempo('setcpm(120/4)\n$: s("bd")'),'$: s("bd")');
 assert.ok(scopeCode('const x=note("c3");\n$: x\nall(p=>p.room(.2))').includes('_klParts.push(x)'));
 assert.equal(tempoCode(90),'setcpm(22.5)');
});
test('empty projects are valid and recording produces native Strudel',()=>{
 const p=createProject();p.tracks=[];assert.equal(restoreProject(p).tracks.length,0);
 const code=cleanCode([{start:0,duration:.15,pitch:'bd',value:{s:'bd',bank:'RolandTR909'}}],2);
 assert.ok(code.startsWith('$: s('));assert.ok(code.includes('RolandTR909'));
 assert.throws(()=>restoreProject({...p,tempo:'setcpm(NaN)'}));
});
