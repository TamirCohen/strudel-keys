import {api,prepareRuntime} from './strudel-runtime.js';
import {createNativeEditor} from './native-editor.js';
import {noteMidi} from './notation.js';
import {defaultSoundLoader} from './default-sounds.js';
let port,repl,music=api.silence,activeDocument='',started=false,metro=false,solo=null,countIn=0;
let stagedCps=.5,triggerCount=0,lastError='',sourceNames=[],evaluating=false,builtins={},pendingSounds=null;
const auditionVoices=new Map();let auditionId=0,nativeEditor;
const loadDefaults=defaultSoundLoader(api);let defaultWarnings=[];
const send=state=>port?.postMessage({type:'state',state});
function cloneControls(v){
 if(Array.isArray(v))return v.map(cloneControls);
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,cloneControls(value)]));
 return v;
}
function events(pattern,begin=0,span=1) {
 const haps=pattern.queryArc(begin,begin+span,{_cps:repl.scheduler.cps}).filter(h=>h.hasOnset());
 if(haps.length>10000)throw Error('More than 10,000 events in the visible range.');
 return haps.map((h,index)=>{
  const value=JSON.parse(JSON.stringify(h.value));
  const pitched=value.note!==undefined;
  return {id:String(index),start:Number(h.whole.begin)-begin,duration:Number(h.whole.end)-Number(h.whole.begin),
   pitch:pitched?noteMidi(value.note):String(value.s??''),pitched,value,patternId:h.context?.editorPattern};
 });
}
function output(hap,deadline,duration,cps,time) {
 triggerCount++;
 return api.webaudioOutput(hap.withValue(cloneControls),deadline,duration,cps,time).catch(e=>{lastError=e.message;send({error:lastError});});
}
function overlay(pattern) {
 let p=solo?pattern.filterHaps(h=>h.context?.editorPattern===solo):pattern;
 if(countIn)p=p.late(countIn).filterHaps(h=>Number(h.whole.begin)>=countIn);
 const click=api.note('84 72 72 72').s('sine').gain(.15).attack(0).decay(.025).sustain(0).release(.01)
  .filterHaps(h=>metro||Number(h.whole.begin)<countIn);
 return api.stack(p,click);
}
async function initialize() {
 if(repl)return;
 await prepareRuntime();
 nativeEditor=createNativeEditor({
  getTime:()=>api.getAudioContext().currentTime,
  transpiler:api.transpiler,
  onToggle:value=>{started=value;send({started:value});},
  defaultOutput:output,
  beforeStart:async()=>{await api.initAudio();await api.getAudioContext().resume();},
  beforeEval:()=>{
   sourceNames=[];stagedCps=.5;
   // Tempo is committed only after successful native Strudel evaluation.
   const cps=v=>{const n=Number(v?.__pure??v);if(!Number.isFinite(n)||n<=0||n>5)throw Error('Tempo must be 0–300 CPM.');stagedCps=n;return api.silence;};
   Object.assign(globalThis,{setcps:cps,setCps:cps,setcpm:v=>cps(Number(v?.__pure??v)/60),setCpm:v=>cps(Number(v?.__pure??v)/60)});
   globalThis.cpm=api.register('cpm',(value,pattern)=>pattern._fast(value/60/stagedCps));
   const p=api.Pattern.prototype.p;let anonymous=0;
   api.Pattern.prototype.p=function(id){
    sourceNames.push(id);
    const muted=String(id).startsWith('_')||String(id).endsWith('_');
    const key=String(id).includes('$')&&!muted?id+(anonymous++):id;
    return p.call(this.withContext(context=>({...context,editorPattern:key})),id);
   };
  },
  editPattern:pattern=>{
   if(!evaluating)return pattern;
   for(const e of events(pattern,0,1)){
    const sound=e.value.s,bank=e.value.bank;
    if(sound&&!pendingSounds?.[String(bank?bank+'_'+sound:sound).toLowerCase()])throw Error('Unknown sound: '+(bank?bank+'_':'')+sound+'. '+(defaultWarnings.length?defaultWarnings.join(' '):'Check its name, or use samples() for a custom library.'));
   }
   music=pattern;return overlay(pattern);
  },
 },send,registry);
 repl=nativeEditor.mirror.repl;
 defaultWarnings=await loadDefaults();builtins={...api.soundMap.get()};
}
function registry() {return Object.keys(api.soundMap.get()).sort();}
function clock() {
 const s=repl?.scheduler;
 if(!started||!Number.isFinite(s?.seconds_at_cps_change))return 0;
 return s.num_cycles_at_cps_change+(api.getAudioContext().currentTime-s.seconds_at_cps_change-s.latency)*s.cps-countIn;
}
const methods={
 async editorText({text}){await initialize();nativeEditor.setText(text);return {};},
 async editorReadOnly({value}){await initialize();nativeEditor.setReadOnly(value);return {};},
 async editorBlur(){nativeEditor?.mirror.editor.contentDOM.blur();return {};},
 async initialize(){await initialize();return {sounds:registry(),warnings:defaultWarnings};},
 async apply({document,play=false,metronome=false,only=null,count=false}) {
  await initialize();
  if(defaultWarnings.length){
   const previous={...api.soundMap.get()};
   defaultWarnings=await loadDefaults();
   for(const [name,sound]of Object.entries(api.soundMap.get()))if(sound!==previous[name])builtins[name]=sound;
  }
  const previous={music,metro,solo,countIn},previousSounds={...api.soundMap.get()};
  pendingSounds={...builtins};
  // Journal native sound registrations. Do not remove the playing document's
  // sounds while an asynchronous samples() call is still being evaluated.
  const setKey=api.soundMap.setKey,set=api.soundMap.set;
  api.soundMap.setKey=(key,value)=>{pendingSounds[key]=value;return setKey(key,value);};
  api.soundMap.set=value=>{
   const current=api.soundMap.get();
   for(const key of Object.keys(current))if(!(key in value))delete pendingSounds[key];
   for(const [key,sound]of Object.entries(value))if(sound!==current[key])pendingSounds[key]=sound;
   return set(value);
  };
  metro=metronome;solo=only;if(!started)countIn=count?1:0;
  try {
   nativeEditor.setText(document);
   nativeEditor.mirror.flash();
   evaluating=true;await repl.evaluate(document.trim()||'silence',play||started);evaluating=false;
   if(repl.state.evalError)throw repl.state.evalError;
   api.soundMap.setKey=setKey;api.soundMap.set=set;set(pendingSounds);
   repl.setCps(stagedCps);activeDocument=document;started=play||started;
   lastError='';return {events:events(music),sounds:registry(),warnings:defaultWarnings,cpm:stagedCps*60,cycles:clock(),started};
  } catch(e){evaluating=false;api.soundMap.setKey=setKey;api.soundMap.set=set;set(previousSounds);({music,metro,solo,countIn}=previous);throw e;}
 },
 async stop(){repl?.stop();for(const voice of auditionVoices.values())voice.handle?.stop?.(api.getAudioContext().currentTime+.02);auditionVoices.clear();api.resetGlobalEffects();started=false;countIn=0;return {};},
 async options({metronome,only}){metro=metronome;solo=only;await repl.setPattern(overlay(music),false);return {};},
 async query({begin=0,span=1}) {return {events:events(music,begin,Math.min(8,span))};},
 async literal({kind,value}) {
  await initialize();const list=events((kind==='note'?api.note:api.s)(value));
  for(const e of list){
   if(Object.keys(e.value).some(k=>!['s','n','note'].includes(k)))throw Error('This literal contains controls that require code editing.');
   if(kind==='s'&&e.value.n!==undefined)e.pitch+=':'+e.value.n;
  }
  return {events:list};
 },
 async audition({pitch,sound,key,oneShot=false,duration}) {
  await initialize();await api.initAudio();await api.getAudioContext().resume();
  if(!registry().includes(sound.toLowerCase()))throw Error('Sound is not registered: '+sound);
  const original=api.getSound(sound),alias='__audition_'+(++auditionId),voice={oneShot};
  auditionVoices.set(key,voice);
  // Use the registered Strudel sound and its native stop handle. This temporary
  // output alias is never stored in the document or exposed in the sound browser.
  api.registerSound(alias,async(...args)=>{voice.handle=await original.onTrigger(...args);return voice.handle;},original.data);
  try{
   const hap=(oneShot?api.s(alias):api.note(pitch).s(alias)).queryArc(0,1)[0];
   await output(hap,0,duration===undefined?(oneShot ? .25 : 30):Math.max(.08,Math.min(.5,Number(duration)||.25)),repl.scheduler.cps,api.getAudioContext().currentTime+.03);
  }finally{if(duration!==undefined)auditionVoices.delete(key);const map={...api.soundMap.get()};delete map[alias];api.soundMap.set(map);}
  return {};
 },
 async release({key}){const voice=auditionVoices.get(key);if(!voice?.oneShot)voice?.handle?.stop?.(api.getAudioContext().currentTime+.02);auditionVoices.delete(key);return {};},
 async scale({name}) {await initialize();return api.n('0 1 2 3 4 5 6').scale(name).queryArc(0,1).map(h=>noteMidi(h.value.note)%12);},
 async diagnostics(){return {activeDocument,started,cycles:clock(),cpm:repl?.scheduler.cps*60,triggerCount,schedulerCount:1,sourceNames,error:lastError};},
};
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.type!=='connect'||port||!event.ports[0])return;
 port=event.ports[0];let queue=Promise.resolve();
 port.onmessage=({data})=>{
  const run=async()=>{
   try {if(!Object.hasOwn(methods,data.method))throw Error('Unknown player operation.');const result=await methods[data.method](data.args||{});port.postMessage({id:data.id,result});}
   catch(e){port.postMessage({id:data.id,error:String(e.message||e)});}
  };queue=queue.then(run,run);
 };
});
setInterval(()=>{if(started)send({cycles:clock(),cpm:repl.scheduler.cps*60,started});},40);
parent.postMessage('strudel-player-ready','*');
