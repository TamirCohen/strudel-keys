import {scopeCode} from './code-scope.js';
import {tempoBpm} from './project.js';
import {noteMidi} from './core.js';
let api,repl,initPromise,mix,countIn=0,playing=false;
const cache=new Map();
const triggers=[];
function cloneControls(value){
 if(Array.isArray(value))return value.map(cloneControls);
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cloneControls(v)]));
 return value;
}
export function normalizeControls(raw){
 const value=cloneControls(raw);
 if(typeof value.s!=='string')return value;
 if(!value.bank){
  const match=/^(RolandTR909|BossDR660)_/i.exec(value.s);
  if(match)value.bank=match[1];
 }
 if(typeof value.bank==='string'){
  const prefix=value.bank.toLowerCase()+'_';
  while(value.s.toLowerCase().startsWith(prefix))value.s=value.s.slice(prefix.length);
 }
 return value;
}
export async function initialize(){
 if(!initPromise)initPromise=(async()=>{
  api=await import('@strudel/web');
  repl=await api.initStrudel({
   beforeStart:async()=>{await api.initAudio();await api.getAudioContext().resume();},
   defaultOutput:(hap,deadline,duration,cps,time)=>{
    triggers.push({cycle:Number(hap.whole.begin),time,cps,metronome:!!hap.value.keylabMetronome});
    if(triggers.length>128)triggers.shift();
    // Superdough expands bank names and adds duration on its input object.
    // Never let these playback mutations touch the canonical pattern's values.
    return api.webaudioOutput(hap.withValue(normalizeControls),deadline,duration,cps,time);
   }
  });
  const r=await fetch(import.meta.env.BASE_URL+'samples.json');if(!r.ok)throw Error('Sound map unavailable.');
  const manifest=await r.json(),map={};
  for(const [kit,items]of Object.entries(manifest))for(const [pitch,url]of Object.entries(items)){
   const bank=kit==='909'?'RolandTR909':'BossDR660';
   map[bank+'_'+pitch]=[url];map[bank.toLowerCase()+'_'+pitch]=[url];
   if(kit==='909'){map[pitch]=[url];map['Roland_'+pitch]=[url];map['tr909_'+pitch]=[url];}
  }
  await api.samples(map);
  return {context:api.getAudioContext(),manifest};
 })().catch(e=>{initPromise=null;throw e;});
 return initPromise;
}
export async function compile(code){
 await initialize();
 const {output}=api.transpiler(scopeCode(code,true));
 const result=await Function('return (async()=>{'+output+'})()')();
 if(!result?.pattern?.queryArc)throw Error('Code did not produce a Strudel pattern.');
 // Reject an invalid tempo before committing any part of a track edit.
 if(result.tempo!==undefined&&(!Number.isFinite(result.tempo)||result.tempo<10||result.tempo>60))throw Error('Tempo must be 40–240 BPM.');
 result.pattern=result.pattern.withValue(normalizeControls);
 return result;
}
export function remember(id,code,pattern){cache.set(id,{code,pattern});}
export async function prepare(project){
 await initialize();
 for(const t of project.tracks)if(cache.get(t.id)?.code!==t.code){
  const code=t.code,{pattern}=await compile(code);
  if(t.code===code)remember(t.id,code,pattern);
  else {const latest=t.code,{pattern}=await compile(latest);remember(t.id,latest,pattern);}
 }
}
export function patternFor(id){return cache.get(id)?.pattern;}
function compose(project,{metronome=false,only=null}={}){
 const solo=project.tracks.some(t=>t.solo);
 const tracks=project.tracks.filter(t=>!t.mute&&(!solo||t.solo)&&(!only||t.id===only));
 let music=api.stack(...tracks.map(t=>cache.get(t.id).pattern));
 if(countIn)music=music.late(countIn).filterHaps(h=>Number(h.whole.begin)>=countIn);
 // Metronome is a Strudel pattern in the same scheduler, not a second timer.
 const click=api.note('84 72 72 72').s('sine').gain(.16).attack(0).decay(.025).sustain(0).release(.015).withValue(v=>({...v,keylabMetronome:true}))
  .filterHaps(h=>metronome||Number(h.whole.begin)<countIn);
 return api.stack(music,click);
}
export async function start(project,options={}){
 await prepare(project);countIn=options.countIn?1:0;triggers.length=0;
 repl.setCps(tempoBpm(project)/240);mix=compose(project,options);
 await repl.setPattern(mix,true);playing=true;
}
export async function update(project,options={}){
 await prepare(project);
 repl.setCps(tempoBpm(project)/240);mix=compose(project,options);
 await repl.setPattern(mix,false);
}
export function stop(){playing=false;repl?.stop();api?.resetGlobalEffects?.();}
// Inverse of Cyclist's actual targetTime formula, including audio latency.
// Input timestamps and the playhead therefore refer to the audible beat.
export function cycles(){
 if(!playing)return 0;
 const s=repl.scheduler;
 if(!Number.isFinite(s.seconds_at_cps_change))return -countIn;
 return s.num_cycles_at_cps_change+(api.getAudioContext().currentTime-s.seconds_at_cps_change-s.latency)*s.cps-countIn;
}
export function tempo(){return repl?repl.scheduler.cps*240:120;}
export function projectTrack(id,bars,begin=0){
 const pattern=patternFor(id);if(!pattern)return [];
 return eventsForPattern(pattern,bars,begin);
}
export function eventsForPattern(pattern,bars,begin=0){
 const events=pattern.queryArc(begin,begin+bars,{_cps:repl.scheduler.cps}).filter(h=>h.hasOnset());
 if(events.length>20000)throw Error('Loop exceeds 20,000 notes.');
 return events.map((h,index)=>{
  const raw=normalizeControls(h.value||{}),value=JSON.parse(JSON.stringify(raw));
  delete value.id;delete value.duration;
  const pitch=noteMidi(raw.note);
  const pitched=Number.isFinite(pitch);
  const start=(Number(h.whole.begin)-begin)*4;
  const duration=raw.note===undefined?.15:Number(h.whole.end.sub(h.whole.begin))*4*(Number(raw.clip)||1);
  return {id:'event-'+index,start,duration,pitch:pitched?pitch:String(raw.s||'sound'),pitched,value};
 });
}
export function diagnostics(){return {playing,cycles:cycles(),bpm:tempo(),countIn,schedulerCount:1,triggers:[...triggers]};}
