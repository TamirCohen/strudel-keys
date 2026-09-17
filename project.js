import {newTrack as legacyTrack,exportTrack,validateProject,COLORS,SOUNDS,isDrum} from './core.js';
import {scopeCode} from './code-scope.js';
import {simpleExpression} from './clean-code.js';
export const tempoBpm=p=>Number(/^setcpm\(([\d.]+)\)$/.exec(p.tempo)?.[1])*4;
export const tempoCode=bpm=>'setcpm('+Number((bpm/4).toFixed(8))+')';
export function createTrack(instrument='909',index=0){
 const t=legacyTrack(instrument,index);
 return {id:t.id,name:t.name,instrument,color:t.color,mute:false,solo:false,code:'$: '+exportTrack(t,2)};
}
export const createProject=()=>({version:2,tempo:tempoCode(120),bars:2,tracks:[createTrack()]});
export function restoreProject(input){
 if(input?.version===1){
  validateProject(input);
  input={version:2,tempo:tempoCode(input.bpm),bars:input.bars,tracks:input.tracks?.map(t=>({
   id:t.id,name:SOUNDS[t.sound],instrument:t.sound,color:t.color,mute:t.mute,solo:t.solo,
   code:t.strudel||('$: '+exportTrack(t,input.bars))
  }))};
 }
 if(input?.version!==2||![1,2,4,8].includes(input.bars)||!Number.isFinite(tempoBpm(input))||tempoBpm(input)<40||tempoBpm(input)>240||!Array.isArray(input.tracks)||input.tracks.length>32)throw Error('Invalid Keylab project.');
 const ids=new Set();
 return {version:2,tempo:input.tempo,bars:input.bars,tracks:input.tracks.map((t,i)=>{
  if(!t||typeof t.id!=='string'||!/^[\w-]{1,100}$/.test(t.id)||ids.has(t.id)||typeof t.code!=='string'||t.code.length>500000||!Object.hasOwn(SOUNDS,t.instrument)||typeof t.mute!=='boolean'||typeof t.solo!=='boolean')throw Error('Invalid track.');
  ids.add(t.id);
  return {id:t.id,name:SOUNDS[t.instrument],instrument:t.instrument,color:COLORS[i%COLORS.length],mute:t.mute,solo:t.solo,code:t.code};
 })};
}
export function inputValue(instrument,pitch,volume=.8){
 return isDrum(instrument)?{s:pitch,bank:instrument==='909'?'RolandTR909':'BossDR660',gain:volume}:
 {note:pitch,s:instrument==='supersaw'?'sawtooth':instrument,gain:volume};
}
export function projectCode(project){
 const solo=project.tracks.some(t=>t.solo);
 // Each track has its own REPL scope for all()/each(), so preserve that in a
 // portable expression with the same Strudel transforms.
 return project.tempo+'\n\n'+project.tracks.filter(t=>!t.mute&&(!solo||t.solo)).map(t=>'$: '+(simpleExpression(t.code)||scopeCode(t.code))).join('\n\n');
}
