import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeControls} from '../live-strudel.js';

test('playback receives detached controls and cannot contaminate note lanes',()=>{
 const raw={s:'cp',bank:'RolandTR909',nested:{values:[1,2]}};
 const output=normalizeControls(raw);
 output.s=output.bank+'_'+output.s;output.duration=1;output.nested.values.push(3);
 assert.deepEqual(raw,{s:'cp',bank:'RolandTR909',nested:{values:[1,2]}});
 assert.equal(normalizeControls(output).s,'cp');
});
test('repeated bank prefixes resolve to one native drum identity',()=>{
 assert.deepEqual(normalizeControls({s:'RolandTR909_RolandTR909_cp',bank:'RolandTR909'}),{s:'cp',bank:'RolandTR909'});
 assert.deepEqual(normalizeControls({s:'BossDR660_sd'}),{s:'sd',bank:'BossDR660'});
 assert.equal(normalizeControls({s:'sawtooth'}).s,'sawtooth');
});
