// Shared modules: native editor, audio and visuals use one pattern engine.
import * as core from '@strudel/core';
import * as audio from '@strudel/webaudio';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as draw from '@strudel/draw';
import * as transpiler from '@strudel/transpiler';
import {slider,sliderWithID} from '@strudel/codemirror';
export const api={...core,...audio,...mini,...tonal,...draw,...transpiler};
export async function prepareRuntime(){
 await core.evalScope(core,audio,mini,tonal,draw,{slider,sliderWithID});
 mini.miniAllStrings();
 audio.registerSynthSounds();
}
