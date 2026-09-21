import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,editLiteral,editLength,setVolume,mutePattern,setTempo,removePatterns,addPattern,renamePattern,nextPatternName} from '../document.js';
import {createProject,restoreProject} from '../project.js';
import {shareURL,projectFromHash} from '../share.js';

test('one document, source-backed parallel patterns and nested stack expressions',()=>{
 const code='const f=1200;\n// keep this\n$: stack(note("c3*4").s("sawtooth"), s("bd ~ cp ~").bank("RolandTR808")).lpf(f)\n$: note("g3").s("sine")';
 const {patterns}=analyze(code);assert.equal(patterns.length,2);assert.equal(patterns[0].targets.length,2);
 const t=patterns[0].targets[1];assert.equal(t.bank,'RolandTR808');
 const edited=editLiteral(code,t,'bd*4');
 assert.equal(edited,code.replace('bd ~ cp ~','bd*4'));
 assert.ok(edited.includes('// keep this'));assert.ok(edited.includes('.lpf(f)'));
});
test('dynamic mini notation stays code-only; shared variables are not flattened',()=>{
 const {patterns}=analyze('const melody=note("c3 e3");\n$: melody.s("sine")\n$: note("<c3 d3>").s("sine")');
 assert.equal(patterns[0].targets.length,0);assert.equal(patterns[1].targets[0].editable,false);
 assert.throws(()=>editLiteral('x',patterns[1].targets[0],'c3'));
});
test('volume updates one literal, preserves comments and does not accumulate wrappers',()=>{
 let source='// music\n$: note("c3").s("sine").postgain(0.7).lpf(400)\n$: s("hh*4")';
 source=setVolume(source,analyze(source).patterns[0],.2);
 assert.equal(source,'// music\n$: note("c3").s("sine").postgain(0.2).lpf(400)\n$: s("hh*4")');
 assert.throws(()=>setVolume('$: s("hh").postgain("0.2 0.5")',analyze('$: s("hh").postgain("0.2 0.5")').patterns[0],.8));
});
test('native muted labels and source deletion',()=>{
 const code='$: note("c3")\n_$: note("d3")\n$: note("e3")';
 const p=analyze(code).patterns;assert.deepEqual(p.map(x=>x.runtimeId),['$0','_$','$1']);
 const muted=mutePattern(code,p[0]);assert.ok(muted.startsWith('_$:'));
 assert.equal(removePatterns(code,p).trim(),'');
});
test('tempo updates the document and refuses ambiguous dynamic overrides',()=>{
 assert.equal(setTempo('setcpm(30)\n$: note("c3")',40),'setcpm(40)\n$: note("c3")');
 assert.equal(setTempo('setcps(0.5)',40),'setcpm(40)');
 assert.throws(()=>setTempo('setcpm(120/4)',40));
 assert.throws(()=>setTempo('setcpm(30);setcpm(40)',40));
});
test('new patterns are ordinary native Strudel, not stored tracks',()=>{
 assert.equal(addPattern('',{kind:'note',sound:'sawtooth'}),'\n\npattern1: note("~").s("sawtooth")\n');
 assert.deepEqual(Object.keys(createProject()),['version','document']);
 assert.throws(()=>restoreProject({version:2,tracks:[]}));
 assert.ok(addPattern('note("c3").s("sine")',{kind:'note',sound:'sawtooth'}).startsWith('$: note("c3")'));
});
test('bare expressions follow native last-expression semantics',()=>{
 assert.equal(analyze('note("c3"); note("d3")').patterns.length,1);
 assert.equal(analyze('note("c3"); $: note("d3")').patterns.length,1);
 assert.equal(analyze('note("c3"); const x=1').patterns.length,0);
 assert.equal(analyze('const note=x=>s(x); $: note("bd")').patterns[0].targets.length,0);
 assert.equal(analyze('$: note("c4*9999999")').patterns[0].targets[0].editable,false);
});
test('cycle length is a native slow literal, never separate project state',()=>{
 let code='// keep\nmelody: note("c3").s("sine").lpf(500)';
 let t=analyze(code).patterns[0].targets[0];
 assert.equal(t.length,1);
 code=editLength(code,t,4,'c3 ~@3');
 assert.equal(code,'// keep\nmelody: note("c3 ~@3").slow(4).s("sine").lpf(500)');
 t=analyze(code).patterns[0].targets[0];assert.equal(t.length,4);
 assert.equal(editLength(code,t,2,'c3 ~'),code.replace('c3 ~@3','c3 ~').replace('slow(4)','slow(2)'));
 for(const suffix of ['.slow(tempo)','.slow(2).slow(2)','.slow(3)']){
  assert.equal(analyze('note("c3")'+suffix).patterns[0].targets[0].lengthEditable,false);
 }
 const nested=analyze('$: stack(note("c3").slow(2), s("bd")).slow(4)').patterns[0].targets;
 assert.deepEqual(nested.map(t=>t.length),[2,1]);
});
test('names are native unique labels, preserving mute, comments and expressions',()=>{
 const source='// keep\n_$: s("bd*4").bank("RolandTR909")\nbass: note("c3")';
 const renamed=renamePattern(source,analyze(source).patterns[0],'drums');
 assert.equal(renamed,source.replace('_$:', '_drums:'));
 assert.equal(analyze(renamed).patterns[0].runtimeId,'_drums');
 for(const label of ['bass','Solo','_muted','muted_','$foo','two words','for']){
  assert.throws(()=>renamePattern(source,analyze(source).patterns[0],label));
 }
 assert.equal(renamePattern('note("c3")',analyze('note("c3")').patterns[0],'melody'),'melody: note("c3")');
 assert.equal(nextPatternName('pattern1: s("bd")\n_pattern2: s("hh")'),'pattern3');
});
test('share links preserve the entire document without executing or transforming it',async()=>{
 const project={version:3,document:'// שלום\nconst x = 12;\n$: note("c3").add(x)'};
 const url=await shareURL(project,'https://example.org/app/?old=1');
 assert.deepEqual(await projectFromHash(new URL(url).hash),project);
 await assert.rejects(projectFromHash('#project=v1.old'));
 await assert.rejects(projectFromHash('#document=v1.broken'));
});
