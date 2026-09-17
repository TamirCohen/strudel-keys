import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createProject} from '../project.js';
import {shareURL} from '../share.js';
const browser=await chromium.launch({headless:true});
const base='http://127.0.0.1:5173/';
try{
 const sender=await browser.newPage();await sender.goto(base);
 await sender.waitForFunction(()=>document.body.dataset.busy==='false');
 assert.equal(await sender.locator('#save, #load, #file').count(),0);
 assert.equal(await sender.textContent('#play'),'▶ Play music');
 // No separate audio-enable step is needed to play.
 await sender.click('#play');await sender.waitForFunction(()=>document.querySelector('#status').textContent==='Playing Strudel.');
 assert.equal(await sender.textContent('#play'),'■ Stop music');await sender.click('#play');
 await sender.click('#share');await sender.waitForFunction(()=>document.querySelector('#share-dialog').open);
 const url=await sender.inputValue('#share-url');assert.ok(url.includes('#project=v1.'));
 const received=await browser.newPage();await received.goto(url);
 await received.waitForFunction(()=>document.body.dataset.busy==='false');
 assert.equal(await received.locator('.track').count(),1);assert.equal(await received.textContent('#play'),'▶ Play music');
 await received.close();
 const shared=createProject();shared.tempo='setcpm(36)';shared.bars=4;
 shared.tracks[0].code='globalThis.sharedTestRan=true;\n$: s("bd*4").bank("RolandTR909")';
 const previous=createProject();previous.tracks[0].code='globalThis.previousTestRan=true;\n$: silence';
 const recipient=await browser.newPage(),errors=[];recipient.on('pageerror',e=>errors.push(e.message));
 await recipient.addInitScript(saved=>localStorage.setItem('keylab-project',saved),JSON.stringify(previous));
 await recipient.goto(await shareURL(shared,base));await recipient.waitForFunction(()=>document.body.dataset.busy==='false');
 assert.equal(await recipient.inputValue('#track-code'),shared.tracks[0].code);
 assert.equal(await recipient.inputValue('#bpm'),'144');assert.equal(await recipient.inputValue('#bars'),'4');
 assert.equal(await recipient.evaluate(()=>window.sharedTestRan),undefined);
 assert.equal(await recipient.evaluate(()=>window.previousTestRan),undefined);
 assert.equal(await recipient.locator('#trust-dialog').count(),0);
 await recipient.click('#play');
 await recipient.waitForFunction(()=>document.querySelector('#status').textContent==='Playing Strudel.',null,{timeout:60000});
 assert.equal(await recipient.evaluate(()=>window.sharedTestRan),true);await recipient.click('#stop');
 assert.deepEqual(await recipient.evaluate(()=>JSON.parse(localStorage.getItem('keylab-project'))),previous);
 assert.equal(await recipient.evaluate(()=>JSON.parse(localStorage.getItem('keylab-shared-project')).tracks[0].code),shared.tracks[0].code);
 assert.deepEqual(errors,[]);
 console.log('PASS: share UI round-trip, direct one-click shared playback, no execution on opening, no trust popup, shared tempo/loop, saved project isolation.');
}finally{await browser.close();}
