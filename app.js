import {DRUMS,SYNTH_KEYS,SOUNDS,isDrum,noteName,newTrack,quantizeNotes,audibleTracks,exportStrudel,validateProject,mod} from './core.js';
import {AudioEngine} from './audio.js';
const $=id=>document.getElementById(id), engine=new AudioEngine();
let manifest={}, project={version:1,bpm:120,bars:2,tracks:[newTrack()]}, selected=project.tracks[0].id, octave=4, grid=.25;
let running=false, recording=false, epoch=0, cursor=0, timer=null, ready=false, pending=false, history=[], held=new Map(), gesture=null, selection=null;
const beats=()=>project.bars*4, track=()=>project.tracks.find(t=>t.id===selected), beatNow=()=> (engine.now-epoch)*project.bpm/60;
const status=message=>$('status').textContent=message;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{const saved=localStorage.getItem('keylab-project');if(saved){project=validateProject(JSON.parse(saved));selected=project.tracks[0].id;}}catch{status('Saved project could not be restored. You can open a project file.');}
function persist(){try{localStorage.setItem('keylab-project',JSON.stringify(project));}catch{status('Browser storage is full. Use Save project to keep your work.');}}
function snapshot(){history.push(JSON.stringify(project));if(history.length>40)history.shift();$('undo').disabled=false;}
function changed(){persist();render();}
function mapping(){return isDrum(track().sound)?DRUMS.map(([key,pitch,label])=>({key,pitch,label})):SYNTH_KEYS.map((key,i)=>({key,pitch:(octave+1)*12+i,label:noteName((octave+1)*12+i)}));}
function render(){
 const t=track();$('bpm').value=project.bpm;$('bars').value=project.bars;$('sound').value=t.sound;$('volume').value=t.volume;$('octave').textContent=octave;
 $('octave-control').style.display=isDrum(t.sound)?'none':'flex';$('track-count').textContent=String(project.tracks.length).padStart(2,'0');
 $('tracks').innerHTML=project.tracks.map((t,i)=>`<div class="track ${t.id===selected?'selected':''}" style="--track-color:${t.color}" data-track="${t.id}" tabindex="0" role="button" aria-label="Select ${escape(t.name)} track ${i+1}" aria-pressed="${t.id===selected}"><div class="track-top"><span class="small">${String(i+1).padStart(2,'0')}</span><span class="track-name">${escape(t.name)}</span></div><small>${t.notes.length} notes · ${isDrum(t.sound)?'DRUMS':'SYNTH'}</small><div class="track-controls"><button data-action="mute" class="${t.mute?'on':''}" aria-pressed="${t.mute}" aria-label="Mute track ${i+1}">M</button><button data-action="solo" class="${t.solo?'on':''}" aria-pressed="${t.solo}" aria-label="Solo track ${i+1}">S</button><button data-action="delete" aria-label="Delete track ${i+1}" ${project.tracks.length===1?'disabled':''}>×</button></div></div>`).join('');
 $('editor-title').textContent=t.name;$('editor-type').textContent=isDrum(t.sound)?'DRUM MACHINE':'POLYPHONIC SYNTH';
 renderRoll();renderKeys();renderExport();
}
function renderKeys(){
 const drum=isDrum(track().sound);$('keys').className='keys'+(drum?'':' synth');
 $('keys').innerHTML=mapping().map(({key,pitch,label},i)=>`<button class="pad ${!drum&&[1,3,6,8,10].includes(pitch%12)?'black':''}" data-key="${key}" aria-label="${label}, key ${key.toUpperCase()}"><b>${key.toUpperCase()}</b><small>${String(i+1).padStart(2,'0')}</small><span>${label}</span></button>`).join('');
 $('keyboard-help').textContent=drum?'Tap the keys below. Each key is a different drum.':'Hold keys for longer notes. Z / X shift the octave. Play chords with multiple keys.';
}
function renderRoll(){
 const t=track(),drum=isDrum(t.sound);let rows;
 if(drum)rows=DRUMS.map(([key,pitch,label])=>({key,pitch,label}));else{const visible=mapping().map(m=>m.pitch), pitches=t.notes.map(n=>n.pitch);const low=Math.min(...visible,...pitches),high=Math.max(...visible,...pitches);rows=Array.from({length:high-low+1},(_,i)=>({pitch:high-i,label:noteName(high-i),key:mapping().find(m=>m.pitch===high-i)?.key||''}));}
 $('roll').style.setProperty('--steps',beats()/grid);$('roll').style.setProperty('--beats',beats());$('roll').style.setProperty('--track-color',t.color);
 $('ruler').innerHTML=Array.from({length:beats()},(_,i)=>`<span>${Math.floor(i/4)+1}.${i%4+1}</span>`).join('');
 $('lanes').innerHTML=rows.map(row=>`<div class="lane"><div class="lane-label"><kbd>${row.key.toUpperCase()}</kbd>${row.label}</div><div class="lane-grid" data-pitch="${row.pitch}" aria-label="${row.label} note lane">${t.notes.filter(n=>n.pitch===row.pitch).map(n=>`<button class="note ${selection===n.id?'selected-note':''}" data-note="${n.id}" style="left:${n.start/beats()*100}%;width:${Math.max(.5,Math.min(drum?.16:n.duration,beats()-n.start)/beats()*100)}%" title="${row.label} · beat ${(n.start+1).toFixed(3)} · ${n.duration.toFixed(3)} beats" aria-label="${row.label} at beat ${(n.start+1).toFixed(3)}"></button>`).join('')}</div></div>`).join('');
 $('note-count').textContent=`${t.notes.length} note${t.notes.length===1?'':'s'}`;
}
function renderExport(){$('code').value=Object.keys(manifest).length?exportStrudel(project,manifest):'// Loading sound map…';$('export-meta').textContent=`${project.bars} BARS · ${project.bpm} BPM`;}
async function enable(){
 if(pending)return false;pending=true;$('audio').textContent='Loading sounds…';
 try{if(!Object.keys(manifest).length){const r=await fetch(`${import.meta.env.BASE_URL}samples.json`);if(!r.ok)throw Error('Sound map unavailable.');manifest=await r.json();}await engine.init(manifest);ready=true;$('audio').textContent='Audio enabled ✓';status('Ready. Play your keyboard or press Record.');renderExport();return true;}catch(e){status(e.message);$('audio').textContent='Retry audio ↗';return false;}finally{pending=false;}
}
function lockTransport(){for(const id of ['bpm','bars','sound','quantize','clear','undo','add-track','demo','load'])$(id).disabled=running; if(!running)$('undo').disabled=!history.length;}
async function start(rec=false){
 if(running){stop();return;}if(!ready||engine.context.state!=='running'){if(!await enable())return;}
 releaseAll();recording=rec;running=true;if(rec)snapshot();const count=rec&&$('countin').checked?4:0;epoch=engine.now+.08+count*60/project.bpm;cursor=-count;
 $('play').textContent='Ⅱ';$('record').classList.toggle('active',rec);$('record').innerHTML=rec?'<span class="record-dot"></span> Stop recording':'<span class="record-dot"></span> Record';$('playhead').style.display='block';lockTransport();status(rec?'Recording selected track. Each loop adds a layer.':'Playing your loop.');schedule();timer=setInterval(schedule,25);
}
function schedule(){
 if(!running)return;const now=beatNow(),end=now+.1*project.bpm/60;
 if(end<cursor)return;
 // If the browser suspends timers, resume near the current beat instead of replaying missed audio.
 cursor=Math.max(cursor,now-.04*project.bpm/60);
 for(let b=Math.ceil(cursor);b<end;b++)if((b<0||$('metro').checked)&&epoch+b*60/project.bpm>=engine.now)engine.click(epoch+b*60/project.bpm,mod(b,4)===0);
 for(const t of audibleTracks(project.tracks))for(const n of t.notes){
  let cycle=Math.max(0,Math.ceil((cursor-n.start)/beats()));let position=cycle*beats()+n.start;
  while(position<end){if(position>=cursor&&position>=0)engine.play(t,n.pitch,epoch+position*60/project.bpm,n.duration*60/project.bpm);cycle++;position=cycle*beats()+n.start;}
 }
 cursor=end;
}
function stop(){if(running)releaseAll();running=false;recording=false;clearInterval(timer);engine.stopAll();$('play').textContent='▶';$('record').classList.remove('active');$('record').innerHTML='<span class="record-dot"></span> Record';$('playhead').style.display='none';$('position').textContent='1.1.1';document.querySelectorAll('#beats i').forEach(i=>i.classList.remove('lit'));lockTransport();persist();render();status('Stopped. Your recording is saved in this browser.');}
function animate(){if(running){const b=beatNow();if(b<0){$('position').textContent=`IN ${Math.ceil(-b)}`;}else{const p=mod(b,beats());$('position').textContent=`${Math.floor(p/4)+1}.${Math.floor(p%4)+1}.${Math.floor(mod(p,1)*4)+1}`;const w=$('roll').clientWidth-112;$('playhead').style.left=`${112+p/beats()*w}px`;}
 document.querySelectorAll('#beats i').forEach((el,i)=>el.classList.toggle('lit',i===mod(Math.floor(b),4)));}requestAnimationFrame(animate);}
function press(key){
 if(held.has(key))return;if(!ready||engine.context.state!=='running'){status('Click Enable audio before playing.');return;}
 const m=mapping().find(m=>m.key===key);if(!m)return;const t=track(), voice=engine.play(t,m.pitch), absolute=running?beatNow():0;let n=null;
 if(recording&&absolute>=0){if(t.notes.length>=20000){status('Track is full. Add another track.');}else{n={id:crypto.randomUUID(),pitch:m.pitch,start:mod(absolute,beats()),duration:isDrum(t.sound)?.15:.1};t.notes.push(n);renderRoll();renderExport();}}
 held.set(key,{voice,n,absolute,trackId:t.id});document.querySelector(`[data-key="${key}"]`)?.classList.add('active');
}
function release(key){const h=held.get(key);if(!h)return;const t=project.tracks.find(t=>t.id===h.trackId);if(t&&!isDrum(t.sound))h.voice();if(h.n&&t&&!isDrum(t.sound))h.n.duration=Math.min(beats(),Math.max(.04,beatNow()-h.absolute));held.delete(key);document.querySelector(`[data-key="${key}"]`)?.classList.remove('active');if(h.n){persist();renderRoll();renderExport();}}
function releaseAll(){for(const key of [...held.keys()])release(key);}
function setOctave(n){releaseAll();octave=Math.max(1,Math.min(7,n));$('octave').textContent=octave;renderKeys();renderRoll();}
$('audio').onclick=enable;$('play').onclick=()=>start();$('record').onclick=()=>start(true);$('stop').onclick=stop;
$('bpm').onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<40||v>240){e.target.value=project.bpm;return;}snapshot();project.bpm=v;changed();};
$('bars').onchange=e=>{const value=Number(e.target.value);if(value<project.bars&&project.tracks.some(t=>t.notes.some(n=>n.start>=value*4))&&!confirm('Shortening the loop removes notes beyond its end. Continue?')){e.target.value=project.bars;return;}snapshot();project.bars=value;for(const t of project.tracks)t.notes=t.notes.filter(n=>n.start<beats()).map(n=>({...n,duration:Math.min(n.duration,beats())}));changed();};
$('grid').onchange=e=>{grid=Number(e.target.value);renderRoll();};
$('quantize').onclick=()=>{if(running)return;snapshot();track().notes=quantizeNotes(track().notes,grid,beats());changed();status(`Selected track aligned to ${$('grid').selectedOptions[0].text}. Undo restores the original timing.`);};
$('undo').onclick=()=>{if(running||!history.length)return;project=JSON.parse(history.pop());if(!project.tracks.some(t=>t.id===selected))selected=project.tracks[0].id;changed();$('undo').disabled=!history.length;};
$('add-track').onclick=()=>{if(project.tracks.length>=32){status('Maximum of 32 tracks reached.');return;}releaseAll();snapshot();const t=newTrack('sawtooth',project.tracks.length);project.tracks.push(t);selected=t.id;changed();status('New track ready. Choose its sound, then record over your other tracks.');};
$('tracks').onclick=e=>{const el=e.target.closest('[data-track]');if(!el)return;const t=project.tracks.find(t=>t.id===el.dataset.track),action=e.target.dataset.action;if(running){status('Stop playback before changing tracks.');return;}releaseAll();if(action){snapshot();if(action==='delete'){if(project.tracks.length===1)return;project.tracks=project.tracks.filter(x=>x.id!==t.id);if(selected===t.id)selected=project.tracks[0].id;}else t[action]=!t[action];}else selected=t.id;changed();};
$('tracks').onkeydown=e=>{if(e.target.matches('.track')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}};
$('sound').onchange=e=>{releaseAll();const sound=e.target.value;if(isDrum(sound)!==isDrum(track().sound)&&track().notes.length){snapshot();const t=newTrack(sound,project.tracks.length);project.tracks.push(t);selected=t.id;status('Created a new track to keep your existing notes.');}else{snapshot();track().sound=sound;track().name=SOUNDS[sound];}changed();};
$('volume').oninput=e=>{track().volume=Number(e.target.value);persist();renderExport();};
$('oct-down').onclick=()=>setOctave(octave-1);$('oct-up').onclick=()=>setOctave(octave+1);
$('clear').onclick=()=>{if(!track().notes.length||running)return;snapshot();track().notes=[];changed();status('Track cleared. Undo is available.');};
$('keys').onpointerdown=e=>{const pad=e.target.closest('[data-key]');if(!pad)return;e.preventDefault();pad.setPointerCapture(e.pointerId);press(pad.dataset.key);};
$('keys').onpointerup=e=>{const pad=e.target.closest('[data-key]');if(pad)release(pad.dataset.key);};$('keys').onpointercancel=$('keys').onpointerup;
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,[contenteditable="true"]')||e.metaKey||e.ctrlKey||e.altKey)return;const key=e.key.toLowerCase();if(e.code==='Space'){if(e.target.closest('button,a'))return;e.preventDefault();if(!e.repeat)start();return;}if(e.shiftKey&&key==='r'){e.preventDefault();if(!e.repeat)start(true);return;}if(e.repeat)return;if(!isDrum(track().sound)&&['z','x'].includes(key)){setOctave(octave+(key==='z'?-1:1));return;}if(mapping().some(m=>m.key===key)){e.preventDefault();press(key);}});
window.addEventListener('keyup',e=>release(e.key.toLowerCase()));window.addEventListener('blur',()=>{releaseAll();if(recording)stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
$('lanes').onpointerdown=e=>{if(running||e.button!==0)return;const lane=e.target.closest('.lane-grid');if(!lane)return;const rect=lane.getBoundingClientRect(),note=e.target.closest('[data-note]');const pitch=isDrum(track().sound)?lane.dataset.pitch:Number(lane.dataset.pitch);
 if(note){const n=track().notes.find(n=>n.id===note.dataset.note);selection=n.id;gesture={id:n.id,x:e.clientX,original:n.start,rect,moved:false};$('note-detail').textContent=`${isDrum(track().sound)?DRUMS.find(d=>d[1]===n.pitch)[2]:noteName(n.pitch)} · bar ${Math.floor(n.start/4)+1}, beat ${(n.start%4+1).toFixed(3)} · length ${n.duration.toFixed(3)} beats. Alt + drag adjusts length.`;gesture.resize=e.altKey;gesture.duration=n.duration;note.setPointerCapture(e.pointerId);
 }else{snapshot();const start=Math.min(beats()-grid,Math.max(0,Math.round((e.clientX-rect.left)/rect.width*beats()/grid)*grid));track().notes.push({id:crypto.randomUUID(),pitch,start,duration:grid});if(ready)engine.play(track(),pitch,engine.now,grid*60/project.bpm);changed();}};
$('lanes').onpointermove=e=>{if(!gesture)return;const delta=(e.clientX-gesture.x)/gesture.rect.width*beats();if(Math.abs(e.clientX-gesture.x)<3&&!gesture.moved)return;if(!gesture.moved){snapshot();gesture.moved=true;}const n=track().notes.find(n=>n.id===gesture.id);if(gesture.resize&&!isDrum(track().sound))n.duration=Math.max(grid,Math.min(beats(),Math.round((gesture.duration+delta)/grid)*grid));else n.start=Math.max(0,Math.min(beats()-grid,Math.round((gesture.original+delta)/grid)*grid));const el=document.querySelector(`[data-note="${n.id}"]`);if(el){el.style.left=n.start/beats()*100+'%';if(!isDrum(track().sound))el.style.width=Math.min(n.duration,beats()-n.start)/beats()*100+'%';}};
$('lanes').onpointerup=()=>{if(gesture){gesture=null;changed();}};$('lanes').onpointercancel=$('lanes').onpointerup;
$('lanes').oncontextmenu=e=>{const n=e.target.closest('[data-note]');if(!n)return;e.preventDefault();if(running)return;snapshot();track().notes=track().notes.filter(x=>x.id!==n.dataset.note);changed();};
$('lanes').onkeydown=e=>{if(running)return;const n=e.target.closest('[data-note]');if(n&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();snapshot();track().notes=track().notes.filter(x=>x.id!==n.dataset.note);changed();}};
$('demo').onclick=()=>{if(running)return;snapshot();const t=newTrack('909',project.tracks.length);for(let b=0;b<beats();b++){for(const [pitch,start]of [['bd',b],['hh',b+.5],...(b%2===1?[['sd',b]]:[])])t.notes.push({id:crypto.randomUUID(),pitch,start,duration:.15});}project.tracks.push(t);selected=t.id;changed();status('Demo added as a new track. Press Play to hear it.');};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);status('Copied. Paste into Strudel and press Ctrl + Enter to play.');$('copy').textContent='Copied ✓';setTimeout(()=>$('copy').textContent='Copy Strudel code ↗',1800);}catch{$('code').focus();$('code').select();status('Select and copy the code using Ctrl/Cmd + C.');}};
$('save').onclick=()=>{releaseAll();const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='keylab-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Project downloaded. Open it here to continue later.');};
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Project file is too large (maximum 10 MB).');const p=validateProject(JSON.parse(await file.text()));stop();snapshot();project=p;selected=p.tracks[0].id;changed();status('Project opened.');}catch(err){status(err.message);}e.target.value='';};
render();animate();fetch(`${import.meta.env.BASE_URL}samples.json`).then(r=>{if(!r.ok)throw Error();return r.json();}).then(m=>{manifest=m;renderExport();}).catch(()=>status('Could not load the sound map. Enable audio to retry.'));
const context=document.modelContext;
if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'read_keylab_project',description:'Read recorded tracks, timing in beats, and generated Strudel code.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object.');return {project:JSON.parse(JSON.stringify(project)),strudel:$('code').value};}})).catch(()=>{});}catch{}}
