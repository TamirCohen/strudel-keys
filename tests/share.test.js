import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createTrack} from '../project.js';
import {shareURL,projectFromHash} from '../share.js';
test('share URL round-trips tracks, Unicode code, tempo, loop, mute and solo',async()=>{
 const p=createProject();p.bars=4;p.tempo='setcpm(35)';p.tracks.push(createTrack('sine',1));
 p.tracks[0].code='$: s("bd*4").bank("RolandTR909") // שלום 🎵';p.tracks[1].code='$: note("c3@2 e3 g3").s("sine").postgain(.3)';p.tracks[0].mute=true;p.tracks[1].solo=true;
 const url=new URL(await shareURL(p,'https://tamircohen.github.io/strudel-keys/?old=1#old'));
 assert.equal(url.pathname,'/strudel-keys/');assert.equal(url.search,'');assert.ok(url.hash.startsWith('#project=v1.'));
 assert.deepEqual(await projectFromHash(url.hash),p);
});
test('malformed, unsupported and oversized share links fail safely',async()=>{
 assert.equal(await projectFromHash(''),null);
 for(const hash of ['#project=v2.test','#project=v1.??','#project=v1.eA','#project=v1.'+'a'.repeat(65000)])await assert.rejects(projectFromHash(hash));
 const p=createProject();p.tracks[0].code='x'.repeat(500001);await assert.rejects(shareURL(p,'https://example.com/'));
});
