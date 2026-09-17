import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool:t=>{window.registeredTools[t.name]=t;}}});});
const state=()=>page.evaluate(()=>window.registeredTools.read_keylab_project.execute({}));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('keylab-project')));
const settle=()=>page.waitForFunction(()=>document.body.dataset.busy==='false');
async function apply(code){
 await page.fill('#track-code',code);await page.click('#run-code');
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Playing Strudel.'||document.querySelector('#status').textContent==='Track code applied.');
 await settle();
}
try{
 await page.goto('http://127.0.0.1:5173');
 await page.click('#audio');await page.waitForFunction(()=>document.querySelector('#audio').textContent.includes('enabled'),null,{timeout:60000});
 await apply('$: s("bd*4").bank("RolandTR909")');
 await page.waitForTimeout(650);
 let s=await state();
 assert.equal(s.project.version,2);assert.ok(s.project.tracks.every(t=>typeof t.code==='string'&&!('notes' in t)));
 assert.equal(s.views[s.project.tracks[0].id].length,8);
 assert.equal(s.transport.schedulerCount,1);
 const clicks=s.transport.triggers.filter(t=>t.metronome),music=s.transport.triggers.filter(t=>!t.metronome);
 assert.ok(clicks.length>=2&&music.length>=2);
 for(const hit of music){const click=clicks.find(c=>Math.abs(c.cycle-hit.cycle)<1e-8);assert.ok(click);assert.ok(Math.abs(click.time-hit.time)<1e-8);}
 assert.ok(Math.abs(clicks[1].time-clicks[0].time-.5)<1e-7);
 await page.click('#stop');
 // Change tempo through code. It becomes the one global tempo source.
 await apply('setcpm(45)\n$: s("bd*4").bank("RolandTR909")');
 await page.waitForTimeout(600);s=await state();
 assert.equal(s.project.tempo,'setcpm(45)');assert.equal(s.transport.bpm,180);
 assert.ok(!s.project.tracks[0].code.includes('setcpm'));
 const faster=s.transport.triggers.filter(t=>t.metronome);assert.ok(Math.abs(faster[1].time-faster[0].time-1/3)<1e-7);
 await page.click('#stop');
 // Edit existing source notes directly; no bake mode, no effect loss.
 await apply('$: note("c3 e3 g3 b3").s("sawtooth").lpf(1200).room(.2)');
 await page.click('#stop');await page.locator('.note').first().click();await page.click('#delete-note');await settle();
 s=await state();assert.equal(s.views[s.project.tracks[0].id].length,7);
 assert.ok(s.project.tracks[0].code.includes('.lpf(1200)'));assert.ok(s.project.tracks[0].code.includes('.room(0.2)'));assert.ok(!s.project.tracks[0].code.includes('filterHaps'));
 await page.keyboard.press('Meta+z');await settle();assert.equal(await page.locator('.note').count(),8);
 // Volume is a code control, not an independent mixer state.
 await page.locator('[data-volume]').first().fill('0.35');await page.locator('[data-volume]').first().dispatchEvent('change');await settle();
 s=await state();assert.ok(s.project.tracks[0].code.includes('postgain(0.35)'));assert.ok(s.views[s.project.tracks[0].id].every(n=>n.value.postgain===.35));
 await page.locator('.lane-grid[data-pitch="72"]').click({position:{x:120,y:10}});await settle();
 s=await state();assert.equal(s.views[s.project.tracks[0].id].length,9);assert.ok(s.views[s.project.tracks[0].id].every(n=>n.value.postgain===.35));
 await page.click('#undo');await settle();
 // Sound picker and all-track view.
 await page.click('#add-track');await page.selectOption('#new-sound','909');await page.click('#create-track');await settle();
 assert.equal(await page.locator('.track').count(),2);assert.equal(await page.locator('.arrangement-row').count(),2);
 await page.locator('[data-volume]').last().fill('0.4');await page.locator('[data-volume]').last().dispatchEvent('change');await settle();
 // Recorded take is translated into canonical code.
 await page.uncheck('#countin');await page.click('#record');await page.waitForTimeout(200);
 await page.dispatchEvent('body','keydown',{key:'ש',code:'KeyA',bubbles:true});await page.dispatchEvent('body','keyup',{key:'ש',code:'KeyA',bubbles:true});
 await page.click('#stop');await settle();s=await state();
 const recorded=s.project.tracks[1];assert.ok(!/Recorded take|JSON|keylabId/.test(recorded.code));assert.equal(s.views[recorded.id].length,1);assert.ok(!('notes' in recorded));
 assert.equal(s.views[recorded.id][0].value.postgain,.4);
 await page.keyboard.press('Meta+z');await settle();s=await state();assert.equal(s.views[s.project.tracks[1].id].length,0);
 // Clear/remove and undo preserve code.
 await page.locator('.track-select').first().click();await settle();
 await page.click('#clear');await settle();assert.equal(await page.locator('.note').count(),0);
 await page.keyboard.press('Meta+z');await settle();assert.equal(await page.locator('.note').count(),8);
 await page.click('#remove-all');await settle();assert.equal(await page.locator('.track').count(),0);
 await page.keyboard.press('Meta+z');await settle();assert.equal(await page.locator('.track').count(),2);
 // Bank expansion during audio playback must never create duplicate clap lanes.
 await page.locator('.track-select').last().click();
 await apply('$: s("cp").bank("RolandTR909")');
 for(const x of [130,250]){
  await page.waitForTimeout(700);
  await page.locator('.lane-grid[data-pitch="cp"]').click({position:{x,y:10}});await settle();
  s=await state();
  assert.ok(s.views[s.project.tracks[1].id].every(n=>n.pitch==='cp'&&n.value.s==='cp'));
  assert.equal(await page.locator('.lane-grid[data-pitch*="Roland"]').count(),0);
 }
 await page.click('#stop');
 const clapCount=await page.locator('.note').count();assert.equal(clapCount,4);
 await page.locator('.note').last().click();await page.click('#delete-note');await settle();
 assert.equal(await page.locator('.note').count(),clapCount-1);
 // Old generated edit history cleans up to the original musical pattern.
 const legacy='$: s("bd*4, - cp - cp, hh*16").bank("RolandTR909")\n\n// Piano-roll edit\nall(p => stack(p, timecat([0.25, pure(JSON.parse(\'{"s":"cp","bank":"RolandTR909","keylabId":"old-edit"}\'))], [7.75, silence]).slow(2).late(1.625)))\n\n// Piano-roll edit\nall(p => p.filterHaps(h => !(h.value.keylabId===\'old-edit\')))\n\n// Track volume\nall(p => p.postgain(0.3))';
 await apply(legacy);await page.click('#stop');s=await state();const oldCount=s.views[s.project.tracks[1].id].length;
 await page.click('#simplify-code');await settle();s=await state();
 assert.equal(s.project.tracks[1].code,'$: s("bd*4, [~ cp]*2, hh*16").bank("RolandTR909").postgain(0.3)');
 assert.equal(s.views[s.project.tracks[1].id].length,oldCount);assert.ok(!s.strudel.includes('_klParts'));
 await page.click('#undo');await settle();assert.equal((await state()).project.tracks[1].code,legacy);
 await page.click('#simplify-code');await settle();
 // Evolving code still plays, but a destructive fixed-window rewrite is rejected.
 await apply('$: s("<bd cp>").bank("RolandTR909")');await page.click('#stop');
 const evolving=(await state()).project.tracks[1].code;
 await page.locator('.lane-grid[data-pitch="cp"]').click({position:{x:130,y:10}});await settle();
 assert.equal((await state()).project.tracks[1].code,evolving);
 assert.ok((await page.textContent('#status')).includes('cannot be safely rewritten'));
 await apply('$: s("bd*4, - cp - cp, hh*16").bank("RolandTR909").postgain(0.3)');await page.click('#stop');
 // Resize a real recorded synth note using its visible edge, without modifiers.
 await page.click('#add-track');await page.selectOption('#new-sound','sawtooth');await page.click('#create-track');await settle();
 await page.uncheck('#countin');await page.click('#record');await page.waitForTimeout(300);
 await page.dispatchEvent('body','keydown',{key:'a',code:'KeyA',bubbles:true});await page.waitForTimeout(250);
 await page.dispatchEvent('body','keyup',{key:'a',code:'KeyA',bubbles:true});await page.click('#stop');await settle();
 s=await state();const resizedId=s.project.tracks.at(-1).id,original=s.views[resizedId][0],originalCode=s.project.tracks.at(-1).code;
 assert.equal(s.views[resizedId].length,1);
 async function resizeBy(beats){
  const handle=page.locator('.note-resize').first();await handle.scrollIntoViewIfNeeded();
  const box=await handle.boundingBox(),lane=await page.locator('.lane-grid').first().boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+lane.width*beats/8,box.y+box.height/2,{steps:8});await page.mouse.up();await settle();
 }
 await resizeBy(1);s=await state();const longer=s.views[resizedId][0];
 assert.ok(longer.duration>original.duration);assert.equal(longer.start,original.start);assert.equal(longer.pitch,original.pitch);
 assert.equal(s.views[resizedId].length,1);assert.notEqual(s.project.tracks.at(-1).code,originalCode);
 await resizeBy(-.5);s=await state();assert.ok(s.views[resizedId][0].duration<longer.duration);
 await page.click('#undo');await settle();s=await state();assert.equal(s.views[resizedId][0].duration,longer.duration);
 await page.click('#undo');await settle();s=await state();assert.equal(s.project.tracks.at(-1).code,originalCode);
 const before=(await saved()).tracks.map(t=>t.code);
 await page.reload();await page.click('#audio');await page.waitForFunction(()=>document.querySelector('#audio').textContent.includes('enabled'));
 assert.deepEqual((await state()).project.tracks.map(t=>t.code),before);
 // Failed compilation must not change the canonical source.
 await page.fill('#track-code','$: broken(');await page.click('#run-code');await settle();
 assert.deepEqual((await state()).project.tracks.map(t=>t.code),before);
 await page.reload();await page.click('#audio');await page.waitForFunction(()=>document.querySelector('#audio').textContent.includes('enabled'));
 await page.screenshot({path:'/tmp/live-strudel-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/live-strudel-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS: one-clock metronome/audio timing at 120 and 180 BPM, canonical code, direct note edits preserving effects, volume round-trip, recording, Hebrew keyboard, undo, track overview, persistence and mobile layout.');
}finally{await browser.close();}
