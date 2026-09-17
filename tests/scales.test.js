import test from 'node:test';
import assert from 'node:assert/strict';
import {inScale,SCALES,scaleName,parseScaleName} from '../scales.js';
import {noteMidi} from '../core.js';
test('scale guide defaults off and supports roots across octaves',()=>{
 for(let pitch=12;pitch<120;pitch++)assert.equal(inScale(pitch,0,'off'),true);
 assert.equal(inScale(60,0,'major'),true);assert.equal(inScale(61,0,'major'),false);
 assert.equal(inScale(72,0,'major'),true);assert.equal(inScale(73,0,'major'),false);
 assert.equal(inScale(66,7,'major'),true);assert.equal(inScale(65,7,'major'),false);
 assert.equal(inScale(60,9,'minor'),true);assert.equal(inScale(61,9,'minor'),false);
 for(const [scale,{steps}]of Object.entries(SCALES))if(scale!=='off')assert.equal(Array.from({length:12},(_,n)=>inScale(n,2,scale)).filter(Boolean).length,steps.length);
});
test('Strudel-style scale names round-trip every root and supported type',()=>{
 assert.equal(scaleName(0,'major'),'C:major');assert.equal(scaleName(0,'minor'),'C:minor');
 assert.equal(scaleName(9,'minorPentatonic'),'A:minor:pentatonic');
 for(let root=0;root<12;root++)for(const scale of Object.keys(SCALES))if(scale!=='off')assert.deepEqual(parseScaleName(scaleName(root,scale)),{root,scale});
 assert.throws(()=>parseScaleName('unknown'));
});
test('Strudel scale notes with double accidentals keep their correct pitch',()=>{
 assert.equal(noteMidi('F##3'),55);assert.equal(noteMidi('Bbb3'),57);assert.equal(noteMidi('Fx3'),55);
 assert.equal(noteMidi('C#4'),61);assert.equal(noteMidi('Cb4'),59);
});
