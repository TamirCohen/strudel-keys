import test from 'node:test';
import assert from 'node:assert/strict';
import {inScale,SCALES} from '../scales.js';
test('scale guide defaults off and supports roots across octaves',()=>{
 for(let pitch=12;pitch<120;pitch++)assert.equal(inScale(pitch,0,'off'),true);
 assert.equal(inScale(60,0,'major'),true);assert.equal(inScale(61,0,'major'),false);
 assert.equal(inScale(72,0,'major'),true);assert.equal(inScale(73,0,'major'),false);
 assert.equal(inScale(66,7,'major'),true);assert.equal(inScale(65,7,'major'),false);
 assert.equal(inScale(60,9,'minor'),true);assert.equal(inScale(61,9,'minor'),false);
 for(const [scale,{steps}]of Object.entries(SCALES))if(scale!=='off')assert.equal(Array.from({length:12},(_,n)=>inScale(n,2,scale)).filter(Boolean).length,steps.length);
});
