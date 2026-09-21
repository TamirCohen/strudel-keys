import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.editorAudioContexts=0;
 const Original=window.AudioContext;
 window.AudioContext=class extends Original {constructor(...args){super(...args);window.editorAudioContexts++;}};
});
const settle=()=>page.waitForFunction(()=>document.body.dataset.busy==='false');
const content=page.frameLocator('iframe').locator('.cm-content');
const read=async()=>(await page.frameLocator('iframe').locator('.cm-line').allTextContents()).join('\n');
const selected=page.frameLocator('iframe').locator('.cm-tooltip-autocomplete [aria-selected="true"]');
try{
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');await page.waitForSelector('.note');
 await content.fill('$: note("c4").l');await page.keyboard.type('pf',{delay:80});
 await selected.filter({hasText:/^lpf$/}).waitFor();
 await page.frameLocator('iframe').locator('.cm-completionInfo').filter({hasText:'cutoff frequency'}).waitFor();
 await page.waitForTimeout(150);
 await page.keyboard.press('Enter');
 assert.equal(await read(),'$: note("c4").lpf');
 assert.equal(await page.evaluate(()=>localStorage.getItem('live-strudel-document-v3')),'$: note("c4").lpf');
 assert.equal(await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete').count(),0);
 console.log('PASS upstream automatic completions, documentation and Enter acceptance');

 await content.fill('$: note("c4").slo');await page.waitForTimeout(400);
 await page.keyboard.press('Control+Space');await selected.filter({hasText:/^slow$/}).waitFor();
 await page.waitForTimeout(150);
 await page.keyboard.press('Tab');assert.equal(await read(),'$: note("c4").slow');
 await page.keyboard.press('Control+z');await expect.poll(read).toBe('$: note("c4").slo');
 await page.keyboard.press('Control+Shift+z');await expect.poll(read).toBe('$: note("c4").slow');
 console.log('PASS explicit completion, Tab and shared undo/redo');

 await content.fill('$: s("bd h');await page.keyboard.press('Control+Space');
 await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^hh$/}).waitFor();
 await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^hh$/}).click();
 assert.equal(await read(),'$: s("bd hh');
 await content.fill('$: s("bd").bank("RolandTR9');await page.keyboard.press('Control+Space');
 await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^rolandtr909$/}).waitFor();
 await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^rolandtr909$/}).click();
 assert.equal(await read(),'$: s("bd").bank("rolandtr909');
 console.log('PASS live registry sound/bank completion without a maintained name list');

 const valid='setcpm(30)\n$: note("c4 e4 g4").s("sine")\n$: note("c3").s("triangle")';
 await content.fill(valid);await page.waitForTimeout(450);await settle();
 const count=await page.locator('.note').count(),rows=await page.locator('.pattern').count();
 const top=await page.locator('.workspace').evaluate(e=>e.getBoundingClientRect().top+scrollY);
 const keyboard=await page.locator('.instrument').evaluate(e=>e.getBoundingClientRect().top+scrollY);
 await content.fill(valid+'(');await page.waitForTimeout(450);await settle();
 assert.ok((await page.locator('#document-state').textContent()).includes('Invalid document'));
 assert.equal(await page.locator('.note').count(),count);assert.equal(await page.locator('.pattern').count(),rows);
 assert.equal(await page.locator('#clear-notes').isDisabled(),true);
 assert.equal(await page.locator('.workspace').evaluate(e=>e.getBoundingClientRect().top+scrollY),top);
 assert.equal(await page.locator('.instrument').evaluate(e=>e.getBoundingClientRect().top+scrollY),keyboard);
 await content.fill(valid);await page.waitForTimeout(450);await settle();
 assert.equal(await page.locator('#clear-notes').isDisabled(),false);
 console.log('PASS syntax errors preserve rows, notes and layout without enabling stale edits');

 await content.fill('globalThis.editorExecuted = true;\n$: note("c4").s("sine")');await page.waitForTimeout(400);await settle();
 const frame=page.frames().find(f=>f.url().includes('player.html'));
 assert.equal(await frame.evaluate(()=>globalThis.editorExecuted),undefined);
 assert.equal(await page.evaluate(()=>window.editorAudioContexts),0);
 await page.keyboard.press('End');await page.keyboard.type(' // asdf g');
 assert.equal(await page.locator('#keys .held').count(),0);
 assert.equal(await page.locator('body').getAttribute('data-running'),'false');
 await page.keyboard.press('Control+Enter');await settle();
 await frame.waitForFunction(()=>globalThis.editorExecuted===true,undefined,{polling:50});
 assert.equal(await frame.evaluate(()=>globalThis.editorExecuted),true);
 assert.equal(await page.evaluate(()=>globalThis.editorExecuted),undefined);
 assert.equal(await page.evaluate(()=>window.editorAudioContexts),0);
 console.log('PASS editor shortcuts do not trigger notes or create a second audio engine');

 await content.fill('$: note("c4").l');await page.keyboard.type('pf');
 await selected.filter({hasText:/^lpf$/}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete').count(),0);
 await page.keyboard.press('Control+Space');await selected.waitFor();
 await page.screenshot({path:'/tmp/live-strudel-autocomplete.png'});
 await page.locator('#copy').focus();await page.waitForTimeout(100);
 assert.equal(await page.frameLocator('iframe').locator('.cm-tooltip-autocomplete').count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS completion dismissal, responsive editor and no uncaught errors');
}finally{await browser.close();}
