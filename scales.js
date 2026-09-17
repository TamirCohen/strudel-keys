export const ROOTS=['C','C♯ / D♭','D','D♯ / E♭','E','F','F♯ / G♭','G','G♯ / A♭','A','A♯ / B♭','B'];
export const SCALES={off:{label:'Off',steps:[]},major:{label:'Major',steps:[0,2,4,5,7,9,11]},minor:{label:'Natural minor',steps:[0,2,3,5,7,8,10]},majorPentatonic:{label:'Major pentatonic',steps:[0,2,4,7,9]},minorPentatonic:{label:'Minor pentatonic',steps:[0,3,5,7,10]},dorian:{label:'Dorian',steps:[0,2,3,5,7,9,10]},mixolydian:{label:'Mixolydian',steps:[0,2,4,5,7,9,10]},blues:{label:'Blues',steps:[0,3,5,6,7,10]}};
export function inScale(pitch,root,scale){return scale==='off'||!SCALES[scale]||SCALES[scale].steps.includes(((pitch-root)%12+12)%12);}
export const STRUDEL_ROOTS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const types={majorPentatonic:'major:pentatonic',minorPentatonic:'minor:pentatonic',blues:'minor:blues'};
export const scaleName=(root,scale)=>scale==='off'?'off':STRUDEL_ROOTS[root]+':'+(types[scale]||scale);
export function parseScaleName(name){
 if(name==='off')return {root:0,scale:'off'};
 for(let root=0;root<12;root++)for(const scale of Object.keys(SCALES))if(scale!=='off'&&scaleName(root,scale)===name)return {root,scale};
 throw Error('Unknown scale.');
}
