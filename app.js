import {DRUMS,SYNTH_KEYS,SOUNDS,isDrum,noteName,mod} from './core.js';
import {createProject,createTrack,restoreProject,tempoBpm,tempoCode,inputValue,projectCode} from './project.js';
import {assertEditable,cleanCode,withVolume,eventSignature} from './clean-code.js';
import {stripTempo} from './code-scope.js';
import * as live from './live-strudel.js';
import {AudioEngine} from './audio.js';

const $=id=>document.getElementById(id),monitor=new AudioEngine();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=text=>$('status').textContent=text;
let project=createProject(),selected=project.tracks[0].id,ready=false,running=false,recording=false,busy=false;
let octave=4,grid=.25,selection=null,gesture=null,only=null,lastLoop=-1,recorded=[],takeBefore=null;
const views=new Map(),drafts=new Map(),history=[],held=new Map();
let rollFocus='';
const track=()=>project.tracks.find(t=>t.id===selected);
const beats=()=>project.bars*4;
const currentNotes=()=>views.get(selected)||[];
const options=()=>({metronome:$('metro').checked,only});
try{const saved=localStorage.getItem('keylab-project');if(saved)project=restoreProject(JSON.parse(saved));selected=project.tracks[0]?.id;}catch{status('Could not restore the saved project. Open a saved file to recover it.');}
function persist(){localStorage.setItem('keylab-project',JSON.stringify(project));}
function saveUndo(value=JSON.stringify(project)){history.push(value);if(history.length>80)history.shift();$('undo').disabled=false;}
function mapping(){
 const t=track();if(!t)return [];
 return isDrum(t.instrument)?DRUMS.map(([key,pitch,label])=>({key,pitch,label})):SYNTH_KEYS.map((key,i)=>({key,pitch:(octave+1)*12+i,label:noteName((octave+1)*12+i)}));
}
function refreshViews(begin=0){
 for(const t of project.tracks){try{
  const notes=live.projectTrack(t.id,project.bars,begin);views.set(t.id,notes);
  const first=notes[0];
  if(first){
   const bank=String(first.value.bank||'').toLowerCase(),sound=first.value.s;
   if(first.pitched&&Object.hasOwn(SOUNDS,sound)&&!isDrum(sound))t.instrument=sound;
   else if(!first.pitched&&['roland','rolandtr909','tr909'].includes(bank))t.instrument='909';
   else if(!first.pitched&&['bossdr660','dr660'].includes(bank))t.instrument='acoustic';
   t.name=first.pitched?(SOUNDS[sound]||String(sound||'Notes')):(bank?String(first.value.bank):SOUNDS[t.instrument]);
  }
 }catch(e){status(e.message);}}
}
function trackVolume(t){
 const values=(views.get(t.id)||[]).map(n=>Number(n.value.postgain??1));
 if(values.length)return values[0];
 return Number([...t.code.matchAll(/\.postgain\(([\d.]+)\)/g)].at(-1)?.[1]??1);
}
function render(){
 document.body.dataset.busy=String(busy);
 const t=track();
 $('bpm').value=Math.round(tempoBpm(project)*100)/100;$('bars').value=project.bars;
 $('undo').disabled=!history.length||busy;
 $('editor-content').hidden=!t;$('empty-state').hidden=!!t;$('instrument').hidden=!t;
 $('track-count').textContent=project.tracks.length;$('remove-all').disabled=!project.tracks.length||busy;
 $('tracks').innerHTML=project.tracks.map((t,i)=>`<div class="track ${t.id===selected?'selected':''}" style="--track-color:${t.color}" data-track="${t.id}">
 <button class="track-select" aria-label="Select ${escape(t.name)} track ${i+1}" aria-pressed="${t.id===selected}"><span class="track-name">${escape(t.name)}</span><small>${(views.get(t.id)||[]).length} notes</small></button>
 <div class="track-controls"><button data-action="mute" class="${t.mute?'on':''}" aria-label="Mute track ${i+1}" aria-pressed="${t.mute}" title="Silence this track">Mute</button><button data-action="solo" class="${t.solo?'on':''}" aria-label="Solo track ${i+1}" aria-pressed="${t.solo}" title="Play only soloed tracks">Solo</button><button data-action="delete" class="danger" aria-label="Delete track ${i+1}">Delete</button></div>
 <label class="track-volume">Volume <input data-volume="${t.id}" aria-label="Track ${i+1} volume" type="range" min="0" max="1" step=".01" value="${trackVolume(t)}"><output>${Math.round(trackVolume(t)*100)}%</output></label></div>`).join('');
 $('record').disabled=!t||busy;$('play').disabled=!t||busy;
 for(const id of ['bpm','bars','add-track','load'])$(id).disabled=busy||recording;
 if(t){
  $('editor-title').textContent=t.name;$('sound').value=t.instrument;$('volume').value=trackVolume(t);
  $('octave').textContent=octave;$('octave-control').style.display=isDrum(t.instrument)?'none':'flex';
  $('delete-note').disabled=!selection||busy||recording;$('clear').disabled=!currentNotes().length||busy||recording;
  $('quantize').disabled=busy||recording;$('run-code').disabled=busy||recording;$('simplify-code').disabled=busy||recording;
  const code=drafts.get(t.id)??t.code;if($('track-code').value!==code)$('track-code').value=code;
  $('code-state').textContent=drafts.has(t.id)?'Unapplied changes':'Strudel → note view';
  renderRoll();renderKeys();
 }
 $('code').value=projectCode(project);$('export-meta').textContent=tempoBpm(project)+' BPM';
 renderOverview();
}
function renderKeys(){
 $('keys').className='keys'+(isDrum(track().instrument)?'':' synth');
 $('keys').innerHTML=mapping().map(({key,pitch,label})=>`<button class="pad ${typeof pitch==='number'&&[1,3,6,8,10].includes(pitch%12)?'black':''}" data-key="${key}" aria-label="${label}, key ${key.toUpperCase()}"><b>${key.toUpperCase()}</b><span>${label}</span></button>`).join('');
 $('keyboard-help').textContent=isDrum(track().instrument)?'Use the labeled keys or click a pad.':'Hold notes · Z / X: octave';
 for(const key of held.keys())document.querySelector(`[data-key="${key}"]`)?.classList.add('active');
}
function rowsForTrack(){
 const notes=currentNotes(),rows=new Map();
 for(const m of mapping())rows.set(String(m.pitch),m);
 for(const n of notes)if(!rows.has(String(n.pitch)))rows.set(String(n.pitch),{key:'',pitch:n.pitch,label:n.pitched?noteName(n.pitch):String(n.pitch)});
 const list=[...rows.values()];
 if(!isDrum(track().instrument))list.sort((a,b)=>Number(b.pitch)-Number(a.pitch));
 return list;
}
function renderRoll(){
 if(!track())return;
 const notes=currentNotes();
 $('roll').style.setProperty('--steps',beats()/grid);$('roll').style.setProperty('--beats',beats());$('roll').style.setProperty('--track-color',track().color);
 $('ruler').innerHTML=Array.from({length:beats()},(_,i)=>`<span>${Math.floor(i/4)+1}.${i%4+1}</span>`).join('');
 $('lanes').innerHTML=rowsForTrack().map(row=>`<div class="lane"><div class="lane-label"><kbd>${escape(row.key.toUpperCase())}</kbd>${escape(row.label)}</div><div class="lane-grid" data-pitch="${escape(row.pitch)}" aria-label="${escape(row.label)} note lane">${notes.filter(n=>String(n.pitch)===String(row.pitch)).map(n=>`<button class="note ${selection===n.id?'selected-note':''}" data-note="${n.id}" style="left:${n.start/beats()*100}%;width:${Math.max(.6,Math.min(n.pitched?n.duration:.16,beats()-n.start)/beats()*100)}%" aria-label="${escape(row.label)} at beat ${(n.start+1).toFixed(3)}" title="${n.pitched?'Drag to move · Drag right edge to resize':'Drag to move'}">${n.pitched?'<span class="note-resize" title="Drag to change note length" aria-hidden="true"></span>':''}</button>`).join('')}</div></div>`).join('');
 $('note-count').textContent=notes.length+' notes';
 $('note-detail').textContent='Drag note to move · Drag right edge to resize · Delete to remove';
 const focus=selected+':'+[...new Set(notes.map(n=>n.pitch))].sort().join(',');
 if(focus!==rollFocus){
  rollFocus=focus;
  const first=$('lanes').querySelector('.note'),scroller=document.querySelector('.roll-scroll');
  scroller.scrollTop=first?Math.max(0,first.closest('.lane').offsetTop-scroller.clientHeight/3):0;
 }
}
function renderOverview(){
 const container=$('arrangement');container.innerHTML=project.tracks.map(t=>{
  const notes=views.get(t.id)||[],pitches=[...new Set(notes.map(n=>String(n.pitch)))];
  return `<button class="arrangement-row ${t.id===selected?'selected':''}" data-arrange="${t.id}" style="--track-color:${t.color}" aria-label="Open ${escape(t.name)} timeline"><span class="arrangement-name">${escape(t.name)}</span><span class="arrangement-grid" style="--beats:${beats()}">${notes.map(n=>`<i style="left:${n.start/beats()*100}%;width:${Math.max(.5,Math.min(n.pitched?n.duration:.15,beats()-n.start)/beats()*100)}%;top:${6+(pitches.indexOf(String(n.pitch))/Math.max(1,pitches.length))*34}px"></i>`).join('')}<span class="arrangement-playhead"></span></span></button>`;
 }).join('')||'<p class="small">Add a track to see its timeline.</p>';
}
async function enable(){
 if(ready)return true;
 $('audio').disabled=true;$('audio').textContent='Loading…';
 try{const {context,manifest}=await live.initialize();await monitor.init(manifest,context);await live.prepare(project);refreshViews();ready=true;$('audio').textContent='Audio enabled ✓';render();return true;}
 catch(e){status(e.message);$('audio').textContent='Retry audio';return false;}
 finally{$('audio').disabled=false;}
}
async function commitCode(t,code,{before=JSON.stringify(project),undo=true}={}){
 // Keep the UI's track-level volume after appended recordings and note edits.
 const volumes=[...code.matchAll(/\/\/ Track volume\s+all\(p => p\.postgain\(([\d.]+)\)\);?/g)];
 if(volumes.length)code=code.replace(/\/\/ Track volume\s+all\(p => p\.postgain\(([\d.]+)\)\);?/g,'').trim()+'\n\n// Track volume\nall(p => p.postgain('+volumes.at(-1)[1]+'))';
 if(code.length>500000)throw Error('Track code is too long.');
 const result=await live.compile(code);
 // Global tempo commands become the project's single tempo source.
 const normalized=stripTempo(code);
 if(undo)saveUndo(before);
 t.code=normalized||'$: silence';
 if(result.tempo!==undefined)project.tempo=tempoCode(result.tempo*4);
 live.remember(t.id,t.code,result.pattern);drafts.delete(t.id);selection=null;
 if(running)await live.update(project,options());
 refreshViews();persist();render();
}
async function transaction(action){
 if(busy)return;busy=true;document.body.dataset.busy='true';
 try{await action();}catch(e){status(e.message);$('code-state').textContent=e.message;}
 finally{busy=false;render();}
}
async function editNotes(remove,add){
 const t=track();if(!t||recording)return;
 await transaction(async()=>{
  assertEditable(t.code,project.bars);
  const ids=new Set(remove.map(n=>n.id)),events=[...currentNotes().filter(n=>!ids.has(n.id)),...add];
  await commitCode(t,await verifiedCode(events));
 });
}
async function verifiedCode(events){
 const code=cleanCode(events,project.bars),{pattern}=await live.compile(code);
 const projected=live.eventsForPattern(pattern,project.bars);
 // Compare normalized pitch identities as well as every supported effect.
 if(eventSignature(events)!==eventSignature(projected))throw Error('This edit cannot be represented accurately yet. Your Strudel is unchanged.');
 return code;
}
$('simplify-code').onclick=()=>transaction(async()=>{
 const t=track();if(!t||recording)return;
 if(drafts.has(t.id))throw Error('Run or undo your code changes before simplifying.');
 assertEditable(t.code,project.bars);
 const code=await verifiedCode(live.projectTrack(t.id,project.bars));
 if(code!==t.code)await commitCode(t,code);
 status('Simplified Strudel. Notes and effects preserved.');
});
async function start(rec=false,target=null){
 if(running){await stop();return;}if(busy||!track())return;
 await transaction(async()=>{
  if(!await enable())return;
  if(rec){assertEditable(track().code,project.bars);await verifiedCode(live.projectTrack(track().id,project.bars));}
  releaseAll();only=target;recorded=[];takeBefore=rec?JSON.stringify(project):null;
  await live.start(project,{...options(),countIn:rec&&$('countin').checked});
  running=true;recording=rec;lastLoop=-1;
  $('play').textContent='Ⅱ';$('record').classList.toggle('active',rec);$('record').textContent=rec?'Stop recording':'● Record';
  $('playhead').style.display='block';status(rec?'Recording…':'Playing Strudel.');
 });
}
async function stop(){
 releaseAll();const wasRecording=recording;running=false;recording=false;only=null;live.stop();monitor.stopAll();
 $('play').textContent='▶';$('record').classList.remove('active');$('record').textContent='● Record';$('playhead').style.display='none';$('position').textContent='1.1.1';
 document.querySelectorAll('#beats i').forEach(el=>el.classList.remove('lit'));
 document.querySelectorAll('.arrangement-playhead').forEach(el=>el.style.display='none');
 if(wasRecording&&recorded.length){
  const t=track(),take=[...recorded];recorded=[];
  const existing=live.projectTrack(t.id,project.bars),volume=trackVolume(t);
  const additions=take.map(n=>({...n,value:{...inputValue(t.instrument,n.pitch),postgain:volume}}));
  await commitCode(t,await verifiedCode([...existing,...additions]),{before:takeBefore});
 }
 refreshViews();persist();render();status('Stopped.');
}
function press(key){
 const t=track(),m=mapping().find(m=>m.key===key);if(!t||!m||held.has(key))return;
 if(!ready){status('Enable audio first.');return;}
 const absolute=live.cycles()*4;
 const voice=monitor.play({sound:t.instrument,volume:.8*trackVolume(t)},m.pitch);
 held.set(key,{voice,pitch:m.pitch,start:absolute,instrument:t.instrument,record:recording&&absolute>=0});
 document.querySelector(`[data-key="${key}"]`)?.classList.add('active');
}
function release(key){
 const h=held.get(key);if(!h)return;
 if(!isDrum(h.instrument))h.voice();
 if(h.record){recorded.push({id:crypto.randomUUID(),pitch:h.pitch,start:mod(h.start,beats()),duration:isDrum(h.instrument)?.15:Math.min(beats(),Math.max(.04,live.cycles()*4-h.start))});$('note-count').textContent=recorded.length+' new notes';}
 held.delete(key);document.querySelector(`[data-key="${key}"]`)?.classList.remove('active');
}
function releaseAll(){for(const key of [...held.keys()])release(key);}
async function undo(){
 if(busy||(!history.length&&!recording))return;
 await transaction(async()=>{
  await stop();if(!history.length)return;const saved=history.pop();project=restoreProject(JSON.parse(saved));drafts.clear();
  if(!project.tracks.some(t=>t.id===selected))selected=project.tracks[0]?.id;
  await live.prepare(project);refreshViews();persist();status('Undone.');
 });
}
function animate(){
 if(running){
  const beat=live.cycles()*4;
  $('position').textContent=beat<0?'IN '+Math.ceil(-beat):`${Math.floor(mod(beat,beats())/4)+1}.${Math.floor(mod(beat,4))+1}.${Math.floor(mod(beat,1)*4)+1}`;
  const phase=mod(Math.max(0,beat),beats())/beats();
  $('playhead').style.left=112+phase*($('roll').clientWidth-112)+'px';
  document.querySelectorAll('.arrangement-playhead').forEach(el=>{el.style.left=phase*100+'%';el.style.display='block';});
  document.querySelectorAll('#beats i').forEach((el,i)=>el.classList.toggle('lit',i===mod(Math.floor(beat),4)));
  const loop=Math.floor(Math.max(0,beat)/beats())*project.bars;
  if(loop!==lastLoop&&!gesture){lastLoop=loop;refreshViews(loop);renderRoll();renderOverview();}
  $('bpm').value=Math.round(live.tempo()*100)/100;
 }
 requestAnimationFrame(animate);
}
const soundOptions=Object.entries(SOUNDS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
$('sound').innerHTML=soundOptions;$('new-sound').innerHTML=soundOptions;
$('audio').onclick=enable;$('play').onclick=()=>start();$('record').onclick=()=>start(true);$('stop').onclick=()=>stop();$('stop-code').onclick=()=>stop();$('undo').onclick=undo;
$('add-track').onclick=()=>{if(project.tracks.length>=32){status('Maximum 32 tracks.');return;}$('track-dialog').showModal();};
$('empty-add').onclick=()=>$('add-track').click();
$('create-track').onclick=()=>transaction(async()=>{
 saveUndo();const t=createTrack($('new-sound').value,project.tracks.length);project.tracks.push(t);selected=t.id;
 await live.prepare(project);refreshViews();persist();
});
$('remove-all').onclick=()=>transaction(async()=>{await stop();saveUndo();project.tracks=[];selected=null;views.clear();persist();});
$('tracks').onclick=e=>{
 if(e.target.closest('input'))return;
 const el=e.target.closest('[data-track]');if(!el)return;
 const t=project.tracks.find(t=>t.id===el.dataset.track),action=e.target.dataset.action;
 if(recording){status('Stop recording before changing tracks.');return;}
 if(!action){releaseAll();selected=t.id;selection=null;render();return;}
 transaction(async()=>{
  saveUndo();
  if(action==='delete'){if(running)await stop();project.tracks=project.tracks.filter(x=>x.id!==t.id);if(selected===t.id)selected=project.tracks[0]?.id;}
  else t[action]=!t[action];
  if(running)await live.update(project,options());persist();
 });
};
function volumeCode(code,value){
 return withVolume(code,value);
}
$('tracks').oninput=e=>{if(e.target.dataset.volume)e.target.nextElementSibling.textContent=Math.round(Number(e.target.value)*100)+'%';};
$('tracks').onchange=e=>{const t=project.tracks.find(t=>t.id===e.target.dataset.volume);if(t)transaction(()=>commitCode(t,volumeCode(t.code,Number(e.target.value))));};
$('volume').onchange=e=>{if(track())transaction(()=>commitCode(track(),volumeCode(track().code,Number(e.target.value))));};
$('track-code').oninput=()=>{if(track()){drafts.set(selected,$('track-code').value);$('code-state').textContent='Unapplied changes';}};
async function runCode(){
 if(!track()||recording||busy)return;
 const t=track(),code=$('track-code').value;
 const wasRunning=running;
 let applied=false;
 await transaction(async()=>{if(!await enable())return;await commitCode(t,code);applied=true;status('Track code applied.');});
 if(applied&&!wasRunning)await start(false,t.id);
}
$('run-code').onclick=runCode;
$('track-code').onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();runCode();}};
$('sound').onchange=e=>transaction(async()=>{
 const t=track(),instrument=e.target.value,before=JSON.stringify(project);
 const transform=isDrum(instrument)?'p.bank("'+(instrument==='909'?'RolandTR909':'BossDR660')+'")':'p.s("'+(instrument==='supersaw'?'sawtooth':instrument)+'")';
 if(currentNotes().length&&isDrum(instrument)!==isDrum(t.instrument)){status('Add a new track to switch between drums and pitched notes.');return;}
 await commitCode(t,t.code+'\nall(p => '+transform+')',{before});t.instrument=instrument;t.name=SOUNDS[instrument];persist();
});
$('bpm').onchange=e=>transaction(async()=>{const bpm=Number(e.target.value);if(bpm<40||bpm>240||!Number.isFinite(bpm))return;saveUndo();project.tempo=tempoCode(bpm);if(running)await live.update(project,options());persist();});
$('bars').onchange=e=>{saveUndo();project.bars=Number(e.target.value);selection=null;refreshViews();persist();render();};
$('grid').onchange=e=>{grid=Number(e.target.value);renderRoll();e.target.blur();};
$('metro').onchange=()=>{if(running)live.update(project,options()).catch(e=>status(e.message));};
$('clear').onclick=()=>transaction(()=>commitCode(track(),'$: silence'));
$('delete-note').onclick=()=>{const n=currentNotes().find(n=>n.id===selection);if(n)editNotes([n],[]);};
$('quantize').onclick=()=>{
 const notes=currentNotes();
 editNotes(notes,notes.map(n=>({...n,start:mod(Math.round(n.start/grid)*grid,beats()),duration:Math.min(beats(),Math.max(grid,Math.round(n.duration/grid)*grid))})));
};
function changeOctave(delta){releaseAll();octave=Math.max(1,Math.min(7,octave+delta));render();}
$('oct-down').onclick=()=>changeOctave(-1);$('oct-up').onclick=()=>changeOctave(1);
$('keys').onpointerdown=e=>{const pad=e.target.closest('[data-key]');if(!pad)return;e.preventDefault();pad.setPointerCapture(e.pointerId);press(pad.dataset.key);};
$('keys').onpointerup=e=>{const pad=e.target.closest('[data-key]');if(pad)release(pad.dataset.key);};$('keys').onpointercancel=$('keys').onpointerup;
const physicalKey=e=>/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():e.key.toLowerCase();
window.addEventListener('keydown',e=>{
 if(e.target.closest('input,select,textarea,[contenteditable="true"]')||$('track-dialog').open)return;
 const key=physicalKey(e);
 if((e.metaKey||e.ctrlKey)&&key==='z'&&!e.shiftKey){e.preventDefault();if(!e.repeat)undo();return;}
 if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
 if(['Delete','Backspace'].includes(e.key)&&selection){e.preventDefault();$('delete-note').click();return;}
 if(e.code==='Space'){e.preventDefault();start();return;}
 if(e.shiftKey&&key==='r'){e.preventDefault();start(true);return;}
 if(!track())return;
 if(!isDrum(track().instrument)&&['z','x'].includes(key)){e.preventDefault();changeOctave(key==='z'?-1:1);return;}
 if(mapping().some(m=>m.key===key)){e.preventDefault();press(key);}
});
window.addEventListener('keyup',e=>{release(physicalKey(e));if(e.code==='Space'&&!e.target.closest('input,select,textarea'))e.preventDefault();});
window.addEventListener('blur',()=>{releaseAll();if(recording)stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
for(const id of ['sound','bpm','volume'])$(id).addEventListener('change',()=>$(id).blur());
$('lanes').onpointerdown=e=>{
 if(busy||recording||e.button!==0)return;
 const lane=e.target.closest('.lane-grid');if(!lane)return;
 const rect=lane.getBoundingClientRect(),button=e.target.closest('[data-note]');
 if(button){
  const n=currentNotes().find(n=>n.id===button.dataset.note);selection=n.id;gesture={note:n,x:e.clientX,rect,resize:n.pitched&&(e.altKey||!!e.target.closest('.note-resize')),moved:false};
  e.preventDefault();button.setPointerCapture(e.pointerId);$('delete-note').disabled=false;button.classList.add('selected-note');
 }else{
  const pitch=lane.dataset.pitch,n=currentNotes().find(n=>String(n.pitch)===pitch)||currentNotes()[0];
  const value=n?{...n.value,...(isDrum(track().instrument)?{s:pitch}:{note:Number(pitch)})}:inputValue(track().instrument,isDrum(track().instrument)?pitch:Number(pitch));
  const start=Math.max(0,Math.min(beats()-grid,Math.round((e.clientX-rect.left)/rect.width*beats()/grid)*grid));
  editNotes([],[{start,duration:grid,value}]);
 }
};
$('lanes').onpointermove=e=>{
 if(!gesture||Math.abs(e.clientX-gesture.x)<3&&!gesture.moved)return;
 gesture.moved=true;const delta=(e.clientX-gesture.x)/gesture.rect.width*beats(),n={...gesture.note};
 if(gesture.resize)n.duration=Math.min(beats()-n.start,Math.max(grid,Math.round((n.duration+delta)/grid)*grid));
 else n.start=Math.max(0,Math.min(beats()-grid,Math.round((n.start+delta)/grid)*grid));
 $('note-detail').textContent=gesture.resize?'Length: '+Number(n.duration.toFixed(3))+' beats · release to apply':'Drag to move · release to apply';
 gesture.updated=n;const el=document.querySelector(`[data-note="${n.id}"]`);
 if(el){el.style.left=n.start/beats()*100+'%';if(n.pitched)el.style.width=Math.min(n.duration,beats()-n.start)/beats()*100+'%';}
};
$('lanes').onpointerup=()=>{if(!gesture)return;const g=gesture;gesture=null;if(g.moved)editNotes([g.note],[g.updated]);else renderRoll();};
$('lanes').onpointercancel=()=>{gesture=null;renderRoll();};
$('lanes').oncontextmenu=e=>{const el=e.target.closest('[data-note]');if(!el)return;e.preventDefault();const n=currentNotes().find(n=>n.id===el.dataset.note);if(n)editNotes([n],[]);};
$('view-all').onclick=()=>{const open=$('overview').hidden;$('overview').hidden=!open;$('view-all').setAttribute('aria-pressed',String(open));renderOverview();};
$('arrangement').onclick=e=>{const el=e.target.closest('[data-arrange]');if(el&&!recording){selected=el.dataset.arrange;selection=null;render();}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(projectCode(project));status('Project code copied.');}catch{$('code').focus();$('code').select();}};
$('save').onclick=()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='live-strudel.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('load').onclick=()=>$('file').click();
$('file').onchange=e=>transaction(async()=>{
 const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('Project file exceeds 10 MB.');
 const next=restoreProject(JSON.parse(await file.text()));await stop();await live.prepare(next);saveUndo();project=next;selected=project.tracks[0]?.id;drafts.clear();refreshViews();persist();e.target.value='';
});
document.addEventListener('strudel.log',e=>{if(e.detail?.message?.includes('error:'))status(e.detail.message);});
render();animate();
live.prepare(project).then(()=>{refreshViews();render();}).catch(e=>status('Pattern: '+e.message));
// Compile saved code only when the user enables audio or runs a track.
const context=document.modelContext;
if(context?.registerTool)context.registerTool({name:'read_keylab_project',description:'Read canonical Strudel tracks and their derived note view.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){
 if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('Expected an empty object.');
 return {project:JSON.parse(JSON.stringify(project)),views:Object.fromEntries(views),transport:live.diagnostics(),strudel:projectCode(project)};
}});
