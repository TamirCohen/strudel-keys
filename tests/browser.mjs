import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {shareURL} from '../share.js';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL||'http://127.0.0.1:5173/';
const settle=()=>page.waitForFunction(()=>document.body.dataset.busy==='false');
const code=async()=> (await page.frameLocator('iframe').locator('.cm-line').allTextContents()).join('\n');
async function document(code,play=false){
 await page.frameLocator('iframe').locator('.cm-content').fill(code);await page.waitForTimeout(450);await settle();
 await page.locator(play?'#play':'#apply').click();await settle();
 assert.equal(await page.locator('#document-state').evaluate(e=>e.classList.contains('error')),false,await page.locator('#document-state').textContent());
}
const frame=()=>page.frames().find(f=>f.url().includes('player.html'));
try{
 await page.goto(base);await page.waitForSelector('.note');
 assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
 assert.equal(await frame().evaluate(()=>{try{return parent.localStorage.length}catch(e){return e.name}}),'SecurityError');
 assert.equal(await page.locator('#document-state').textContent(),'Unapplied · Press Play music to hear this document.');
 assert.equal(await frame().evaluate(()=>!!getIsStarted()),false);
 await page.locator('#play').click();await settle();
 assert.equal(await page.locator('.arr-note').count(),4);
 assert.equal(await frame().evaluate(()=>getAudioContext().state),'running');
 assert.ok((await frame().evaluate(()=>getCps()))>0);
 console.log('PASS isolated native playback and initial no-execution');

 await page.locator('#stop').click();await page.waitForFunction(()=>document.body.dataset.running==='false');
 await document('$: note("~").s("sine")\nbass: note("c2").s("sine")');
 await page.locator('[data-rename="0"]').click();
 await page.locator('#pattern-name').fill('bass');await page.locator('#rename-form button[value="rename"]').click();await settle();
 assert.match(await page.locator('#rename-error').textContent(),/already/);
 await page.locator('#pattern-name').fill('melody');await page.locator('#rename-form button[value="rename"]').click();await settle();
 assert.ok((await code()).startsWith('melody:'));
 assert.match(await page.locator('.pattern-title').first().textContent(),/^melody/);
 await frame().evaluate(()=>{
  globalThis.previewTriggers=0;
  const sound=getSound('sine'),original=sound.onTrigger;
  sound.onTrigger=(...args)=>{globalThis.previewTriggers++;return original(...args);};
 });
 const previewLane=page.locator('.lane[data-pitch="60"] .lane-body');
 await previewLane.click({position:{x:20,y:12}});await settle();
 await page.waitForFunction(()=>document.querySelectorAll('.note').length===1);
 assert.equal(await frame().evaluate(()=>globalThis.previewTriggers),1);
 assert.equal(await frame().evaluate(()=>!!getIsStarted()),false);
 await page.locator('.note').first().click();await settle();
 await frame().waitForFunction(()=>globalThis.previewTriggers===2,undefined,{polling:50});
 assert.equal(await frame().evaluate(()=>globalThis.previewTriggers),2);
 await page.locator('.note').first().click({modifiers:['Shift']});await settle();
 assert.equal(await frame().evaluate(()=>globalThis.previewTriggers),2);
 await page.locator('#play').click();await settle();
 assert.equal(await page.locator('.arr-row').count(),2);
 assert.match(await page.locator('.arr-row').first().textContent(),/melody/);
 await page.locator('#add').click();await settle();
 await page.locator('#new-name').fill('lead');await page.locator('#create').click();await settle();
 assert.match(await code(),/lead: note\("~"\)/);
 assert.match(await page.locator('.pattern-title').last().textContent(),/^lead/);
 await page.locator('[data-select="0"]').first().click();await settle();
 console.log('PASS native pattern names, duplicate validation, and click previews without starting playback');

 const drumResponse=page.waitForResponse(r=>/RolandTR909\/.*\.wav/i.test(r.url()),{timeout:15000}).catch(error=>error);
 await document('$: s("bd*4").bank("RolandTR909")\n$: s("cp*2").bank("TR808")',true);
 assert.ok((await drumResponse).ok());
 assert.equal(await frame().evaluate(()=>!!getSound('bd')&&!!getSound('piano')&&!!getSound('tr909_bd')&&!!getSound('rolandtr808_cp')),true);
 assert.ok(!(await code()).includes('samples('));
 console.log('PASS default samples, drum-bank aliases and actual TR-909 audio download without setup code');

 const shared='// preserved\nconst cutoff = 900;\nsetcpm(45)\n$: note("c3 e3").s("sawtooth").lpf(cutoff)\n$: note("g3").s("sine")\nall(p=>p.gain(0.4))';
 await document(shared,true);
 assert.equal(await page.locator('.pattern').count(),2);
 assert.equal(await frame().evaluate(()=>getCps()),.75);
 const values=await frame().evaluate(()=>getPattern().queryArc(0,1).map(h=>h.value));
 assert.equal(values.length,3);assert.ok(values.every(v=>v.gain===.4));assert.equal(values[0].cutoff,900);
 assert.equal(await page.locator('#record').isDisabled(),true);
 await page.locator('#volume').fill('0.3');await page.locator('#volume').dispatchEvent('change');await settle();
 assert.ok((await code()).includes('.lpf(cutoff).postgain(0.3)'));
 assert.ok((await code()).includes('all(p=>p.gain(0.4))'));
 console.log('PASS whole-document shared variables, all(), tempo and source volume');

 await page.locator('#metro').check();await settle();
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),7);
 await page.locator('#metro').uncheck();await settle();
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),3);
 assert.ok((await code()).includes('setcpm(45)'));

 await page.frameLocator('iframe').locator('.cm-content').fill('setcpm(20)\n$: missingFunction()');await page.waitForTimeout(450);await settle();
 await page.locator('#apply').click();await settle();
 assert.ok((await page.locator('#document-state').textContent()).includes('Last applied document is still playing'));
 assert.equal(await frame().evaluate(()=>getCps()),.75);
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),3);
 console.log('PASS failed evaluation leaves playing document and tempo untouched');

 await document('setcpm(60)\n$: note("c4").s("sine").cpm(30)');
 assert.equal(await frame().evaluate(()=>Number(getPattern().queryArc(0,1)[0].whole.end)),2);
 await document("registerSound('testtone', getSound('sine').onTrigger)\n$: note(\"c4\").s(\"testtone\")");
 assert.equal(await frame().evaluate(()=>!!getSound('testtone')),true);
 await page.frameLocator('iframe').locator('.cm-content').fill('$: note("c4").s("testtone")');await page.waitForTimeout(450);await settle();
 await page.locator('#apply').click();await settle();
 assert.ok((await page.locator('#document-state').textContent()).includes('Unknown sound'));
 await document('$: note("c4").s("sine")');
 assert.equal(await frame().evaluate(()=>!!getSound('testtone')),false);
 console.log('PASS native cpm transform, metronome and document-owned sound dependencies');

 await document("registerSound('testbank_cp', getSound('sine').onTrigger)\n$: s(\"cp ~\").bank(\"testbank\")",true);
 await page.waitForTimeout(300);
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1)[0].value.s),'cp');
 const clap=page.locator('.lane[data-pitch="cp"] .lane-body');const clapRect=await clap.boundingBox();
 await clap.click({position:{x:clapRect.width*.75,y:12}});await settle();
 assert.equal(await page.locator('.lane[data-pitch="cp"]').count(),1);
 assert.ok(!(await code()).includes('testbank_testbank'));assert.ok((await code()).includes('.bank("testbank")'));
 console.log('PASS banked sound edits never duplicate the bank or move sound rows');

 await document('// keep me\nsetcpm(30)\n$: note("c4 ~ e4 ~").s("sawtooth").lpf(700).slow(2)',true);
 assert.equal(await page.locator('#record').isDisabled(),false);
 assert.equal(await page.locator('#length').inputValue(),'2');
 await page.locator('#stop').click();await page.waitForFunction(()=>document.body.dataset.running==='false');
 const before=await code();
 let note=page.locator('.note').first();await note.scrollIntoViewIfNeeded();let rect=await note.boundingBox();
 const lane=await note.locator('..').boundingBox();
 await page.mouse.move(rect.x+rect.width/2,rect.y+8);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+lane.width/8,rect.y+8,{steps:8});await page.mouse.up();await settle();
 const moved=await code();assert.notEqual(moved,before);assert.ok(moved.includes('// keep me'));assert.ok(moved.endsWith('.lpf(700).slow(2)'));
 note=page.locator('.note').first();await note.scrollIntoViewIfNeeded();rect=await note.boundingBox();
 await page.mouse.move(rect.x+rect.width-2,rect.y+8);await page.mouse.down();await page.mouse.move(rect.x+rect.width-2+lane.width/16,rect.y+8,{steps:5});await page.mouse.up();await settle();
 assert.notEqual(await code(),moved);
 await page.keyboard.press('Control+z');await settle();assert.equal(await code(),moved);
 await page.keyboard.press('Control+z');await settle();assert.equal(await code(),before);
 await page.locator('.note').nth(0).click({modifiers:['Shift']});await page.locator('.note').nth(1).click({modifiers:['Shift']});
 await page.locator('#delete-notes').click();await settle();assert.ok((await code()).includes('note("~")'));
 await page.keyboard.press('Control+z');await settle();assert.equal(await code(),before);
 console.log('PASS source-only move, resize, batch delete and unified undo');

 await document('drums: s("bd*4").bank("RolandTR909")');
 const repeatedDrums=await code();
 await page.locator('#length').selectOption('4');await settle();
 assert.equal(await code(),repeatedDrums);
 assert.equal(await page.locator('.note').count(),16);
 await page.locator('.note').nth(9).click({modifiers:['Shift']});
 await page.locator('#delete-notes').click();await settle();
 assert.equal(await page.locator('.note').count(),15);
 assert.match(await code(),/\.slow\(4\)/);
 await page.locator('#length').selectOption('1');await settle();
 const fourCycleCode=await code();
 assert.equal(await page.locator('.note').count(),4);
 await page.locator('.note').first().click({modifiers:['Shift']});
 await page.locator('#delete-notes').click();await settle();
 await page.locator('#length').selectOption('4');await settle();
 assert.equal(await page.locator('.note').count(),14);
 await page.keyboard.press('Control+z');await settle();assert.equal(await code(),fourCycleCode);
 await page.keyboard.press('Control+z');await settle();assert.equal(await code(),repeatedDrums);
 assert.equal(await page.locator('.note').count(),16);

 await document('melody: note("c4 ~@3").s("sine").lpf(700)');
 const oneCycleCode=await code();
 await page.locator('#length').selectOption('2');await settle();
 assert.equal(await code(),oneCycleCode);
 assert.equal(await page.locator('.note').count(),2);
 assert.equal(await page.locator('.note').first().getAttribute('title'),'c4 · 0.000 → 0.250');
 const laterLane=page.locator('.lane[data-pitch="64"] .lane-body'),laterBox=await laterLane.boundingBox();
 await laterLane.click({position:{x:laterBox.width*.76,y:12}});await settle();
 assert.match(await page.locator('.lane[data-pitch="64"] .note').getAttribute('title'),/1.500/);
 const phrase=await code();
 for(const length of ['1','4','8','2']){
  await page.locator('#length').selectOption(length);await settle();
  assert.equal(await page.locator('#length').inputValue(),length);
  assert.equal(await code(),phrase);
 }
 await page.locator('#play').click();await settle();
 assert.deepEqual(await frame().evaluate(()=>getPattern().queryArc(0,2).filter(h=>h.hasOnset()).map(h=>Number(h.whole.begin)).sort((a,b)=>a-b)),[0,1,1.5]);
 await page.evaluate(()=>{globalThis.auditions=0;const send=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(data,...rest){if(data?.method==='audition')globalThis.auditions++;return send.call(this,data,...rest);};});
 await laterLane.click({position:{x:laterBox.width*.9,y:12}});await settle();
 assert.equal(await page.evaluate(()=>globalThis.auditions),0);
 await page.locator('#stop').click();await page.waitForFunction(()=>document.body.dataset.running==='false');
 console.log('PASS repeat-aware views, independent edits, hidden-note preservation, source undo and no previews during playback');

 await document('$: note("<c3 e3>").s("sine")');
 assert.equal(await page.locator('#clear-notes').isDisabled(),true);
 assert.ok((await page.locator('#edit-hint').textContent()).includes('Dynamic'));
 await document('$: stack(note("c4").s("sine"), note("e4").s("triangle"))');
 await page.locator('#expression').selectOption('1');await settle();
 await page.locator('#clear-notes').click();await settle();
 assert.equal(await code(),'$: stack(note("c4").s("sine"), note("~").s("triangle"))');
 await page.locator('#scale').fill('C:major');await page.locator('#scale').dispatchEvent('change');await settle();
 assert.equal(await page.locator('#keys .out-of-scale').count(),5);
 await page.locator('#keys .out-of-scale').first().click();
 assert.equal(await page.locator('#keys button:disabled').count(),0);
 console.log('PASS nested source selection, dynamic read-only and native scale guide');

 await document('setcpm(120)\n$: note("~").s("sine")');
 await page.locator('#countin').uncheck();await page.locator('#record').click();await settle();
 await page.waitForFunction(()=>document.querySelector('#position').textContent!=='Count-in…');
 await page.locator('#keys button').first().focus();await page.keyboard.down('a');await page.waitForTimeout(130);await page.keyboard.up('a');
 await page.waitForFunction(()=>document.querySelector('#record').textContent==='● Record',{},{timeout:6000});await settle();
 assert.ok(!(await code()).includes('note("~")'),await code());assert.ok((await code()).includes('c4'));
 await page.locator('#stop').click();await page.waitForFunction(()=>document.body.dataset.running==='false');
 console.log('PASS keyboard recording writes native named notes');

 await document('setcpm(120)\nmelody: note("~").slow(2).s("sine")');
 await page.locator('#record').click();await settle();
 await page.waitForTimeout(650);
 assert.equal(await page.locator('#record').textContent(),'■ Finish recording');
 await page.locator('#keys button').first().focus();await page.keyboard.down('a');await page.waitForTimeout(100);await page.keyboard.up('a');
 await page.waitForFunction(()=>document.querySelector('#record').textContent==='● Record',undefined,{timeout:6000});await settle();
 assert.ok(await frame().evaluate(()=>getPattern().queryArc(0,2).some(h=>h.hasOnset()&&Number(h.whole.begin)>=1)));
 await page.locator('#stop').click();await page.waitForFunction(()=>document.body.dataset.running==='false');
 console.log('PASS recording captures notes in the second cycle');

 await document('$: note("c4").s("sine")\n$: note("e4").s("sawtooth")',true);
 const original=await code();await page.locator('[data-solo="0"]').click();await settle();assert.equal(await code(),original);
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),1);
 await page.locator('[data-solo="0"]').click();await settle();assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),2);
 await page.locator('[data-mute="0"]').click();await settle();assert.ok((await code()).startsWith('_$:'));
 assert.equal(await frame().evaluate(()=>getPattern().queryArc(0,1).length),1);
 await page.locator('#remove-all').click();await settle();assert.equal(await page.locator('.pattern').count(),0);
 await page.keyboard.press('Control+z');await settle();assert.equal(await page.locator('.pattern').count(),2);
 console.log('PASS native mute, transient solo, remove all and undo');

 const sharedCode='globalThis.shareExecuted = true;\n$: note("c4").s("sine")';
 const url=await shareURL({version:3,document:sharedCode},base);
 const recipient=await browser.newPage();await recipient.goto(url);await recipient.waitForSelector('.note');
 const receiver=recipient.frames().find(f=>f.url().includes('player.html'));
 assert.equal(await receiver.evaluate(()=>globalThis.shareExecuted),undefined);
 assert.equal((await recipient.frameLocator('iframe').locator('.cm-line').allTextContents()).join('\n'),sharedCode);
 await recipient.locator('#play').click();await recipient.waitForFunction(()=>document.body.dataset.busy==='false');
 assert.equal(await receiver.evaluate(()=>globalThis.shareExecuted),true);
 assert.equal(await recipient.evaluate(()=>globalThis.shareExecuted),undefined);
 await recipient.close();
 console.log('PASS share round trip, no autoexecution, sandbox containment');

 await page.screenshot({path:'/tmp/live-strudel-rebuild-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/live-strudel-rebuild-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS responsive layout and no uncaught exceptions');
}finally{await browser.close();}
