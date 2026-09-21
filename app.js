import {analyze,DEFAULT_DOCUMENT,editLiteral,editLength,setVolume,volumeOf,mutePattern,setTempo,removePatterns,addPattern,renamePattern,nextPatternName,patternName} from './document.js';
import {KEYS,COLORS,noteName,noteMidi,mod,literalFromEvents,normalizeEvents,expandEvents,repeatEvents} from './notation.js';
import {Player} from './player-client.js';
import {shareURL,projectFromHash} from './share.js';
import {createDocumentEditor} from './document-editor.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey=location.hash?'live-strudel-shared-document-v3':'live-strudel-document-v3';
let source=DEFAULT_DOCUMENT,active=null,model={patterns:[]},parseError='',index=0,targetIndex=0,notes=[],sounds=[],rendered=[];
let running=false,busy=false,solo=null,cycles=0,cpm=30,span=1,windowStart=0,selected=new Set(),revision=0,clockAt=performance.now(),runtimeError='';
let history=[],redo=[],lastTyping=0,scalePitches=null,gesture=null,recording=null,finishing=false,querying=false,notesRevision=-1;
const held=new Map();
const editorActions=[];
let renameTarget=null,previewId=0,viewCycles=null,allSourceNotes=[];
const documentEditor=createDocumentEditor({getPlayer:()=>player});
const player=new Player(state=>{
 if(typeof state.editorText==='string'){
  setSource(state.editorText,{typing:state.typing,fromEditor:true});
  clearTimeout(window.documentRefresh);window.documentRefresh=setTimeout(()=>{if(!parseError)void task(refreshLiteral);},350);
 }
 if(state.editorAction){editorActions.push(state.editorAction);drainEditorActions();}
 if(state.error)status(state.error);
 if(Number.isFinite(state.cycles)){
  cycles=state.cycles;clockAt=performance.now();cpm=state.cpm;$('position').textContent=cycles<0?'Count-in…':cycles.toFixed(2)+' cycles';
  const head=$('playhead');head.style.display=running?'block':'none';head.style.left='calc(80px + (100% - 80px) * '+mod(cycles,editSpan())/editSpan()+')';
  const next=Math.max(0,Math.floor(cycles/span)*span);
  if(next!==windowStart&&!querying){windowStart=next;refreshOverview();}
  if(recording&&cycles>=recording.begin+recording.length&&!finishing)void finishRecording();
 }
});
function status(message){$('status').textContent=message;}
function pattern(){return model.patterns[index];}
function target(){return pattern()?.targets[targetIndex];}
function canEditSource(){return !parseError&&!!target()?.editable&&notesRevision===revision;}
function editSpan(){return viewCycles??target()?.length??1;}
function dirty(){return source!==active;}
function nowCycles(){return running?cycles+(performance.now()-clockAt)*cpm/60000:0;}
function project(){return {version:3,document:source};}
function persist(){try{localStorage.setItem(storageKey,source);}catch{status('Browser storage unavailable. Copy your document or share it before closing.');}}
function rebuild(){
 try{model=analyze(source);parseError='';}catch(e){parseError=e.message;}
 index=Math.min(index,Math.max(0,model.patterns.length-1));
 targetIndex=Math.min(targetIndex,Math.max(0,(pattern()?.targets.length||1)-1));
}
function recordHistory(typing=false){
 if(!typing||Date.now()-lastTyping>600){history.push(source);if(history.length>150)history.shift();}
 lastTyping=typing?Date.now():0;redo=[];
}
function setSource(next,{typing=false,remember=true,fromEditor=false}={}){
 if(next===source)return;
 if(remember)recordHistory(typing);
 source=next;revision++;selected.clear();if(!fromEditor)notes=[];runtimeError='';
 if(fromEditor)viewCycles=null;
 if(fromEditor)documentEditor.acceptValue(source);else documentEditor.setValue(source);
 persist();rebuild();render();
}
async function change(next){setSource(next);if(running)await apply();else await refreshLiteral();}
async function task(fn){
 if(busy)return;
 busy=true;renderState();
 try{await fn();}catch(e){runtimeError=e.message;status(e.message);}
 finally{busy=false;renderState();drainEditorActions();}
}
function drainEditorActions(){
 if(busy||!editorActions.length)return;
 const action=editorActions.shift();
 void task(()=>action==='undo'?undo(false):action==='redo'?undo(true):action==='stop'?stop():apply());
}
function renderState(){
 document.body.dataset.busy=String(busy);document.body.dataset.running=String(running);
 const state=$('document-state');
 state.classList.toggle('error',!!parseError||!!runtimeError);
 state.textContent=runtimeError?runtimeError+(running?' · Last applied document is still playing.':''):parseError?'Invalid document: '+parseError+(running?' · Last applied document is still playing.':''):dirty()?(running?'Unapplied edits · Last applied document is playing.':'Unapplied · Press Play music to hear this document.'):(running?'Playing applied document.':'Applied · Press Play music to hear it.');
 $('play').textContent=running?'↻ Apply & play':'▶ Play music';
 $('apply').disabled=busy||!!recording;$('play').disabled=busy||!!recording;
 $('record').classList.toggle('active',!!recording);
 $('record').textContent=recording?'■ Finish recording':'● Record';
 $('record').disabled=busy||(!recording&&!canRecord());
 documentEditor.setReadOnly(!!recording);
 for(const id of ['add','remove-all','tempo','expression'])$(id).disabled=!!recording||busy||!!parseError;
 for(const button of $('patterns').querySelectorAll('button'))button.disabled=!!parseError||!!recording||busy||((button.dataset.mute!==undefined||button.dataset.solo!==undefined)&&!model.patterns[+(button.dataset.mute??button.dataset.solo)]?.label);
 $('delete-notes').disabled=!selected.size||busy||!canEditSource();
 $('length').value=String(editSpan());$('length').disabled=busy||!!recording||!canEditSource()||!target()?.lengthEditable;
 $('clear-notes').disabled=!canEditSource()||busy||!!recording;
 const p=pattern();$('volume').disabled=!p||volumeOf(p)===null||!!recording||busy||!!parseError;
 if(p){const volume=volumeOf(p);$('volume').value=volume??1;$('volume').title=volume===null?'Dynamic postgain: edit in code':'Edits .postgain() in the document';}
}
function render(){
 $('patterns').innerHTML=model.patterns.map((p,i)=>'<div class="pattern '+(i===index?'selected':'')+'" style="--color:'+COLORS[i%COLORS.length]+'"><button class="pattern-title" data-select="'+i+'" title="'+esc(p.source)+'">'+esc(patternName(p,i))+' · '+esc(p.source.slice(0,45))+'</button><div class="pattern-actions"><button data-mute="'+i+'" '+(!p.label?'disabled':'')+'>'+(p.muted?'Unmute':'Mute')+'</button><button data-solo="'+i+'" class="'+(solo===p.runtimeId&&solo?'active':'')+'" '+(!p.runtimeId?'disabled':'')+'>Solo</button><button data-rename="'+i+'">Rename</button><button data-remove="'+i+'" class="danger">Delete</button></div></div>').join('');
 const p=pattern(),t=target();
 $('pattern-title').textContent=p?patternName(p,index)+' · source notes':'No pattern selected';
 $('expression').innerHTML=(p?.targets||[]).map((t,i)=>'<option value="'+i+'">'+esc(t.kind+'('+JSON.stringify(t.value)+')')+'</option>').join('');
 $('expression').value=String(targetIndex);
 $('edit-hint').textContent=parseError?'Last valid source view · Fix the syntax to edit notes.':!t?'This expression is code-only. Its evaluated output appears above.':!t.editable?'Dynamic mini notation: edit its code directly.':`Viewing ${editSpan()} source cycle${editSpan()===1?'':'s'}. Repetitions become independent only when edited. Other transforms remain unchanged.`;
 $('sample-label').hidden=t?.kind!=='s';
 renderSounds();renderRoll();renderKeys();renderOverview();renderState();
}
function renderSounds(){
 const previous=$('audition-sound').value;
 $('audition-sound').innerHTML=sounds.map(s=>'<option>'+esc(s)+'</option>').join('');
 const t=target(),preferred=t?.sound?(t.bank?t.bank+'_':'')+t.sound:previous;
 $('audition-sound').value=sounds.includes(preferred?.toLowerCase())?preferred.toLowerCase():sounds.includes(previous)?previous:sounds.includes('sawtooth')?'sawtooth':sounds[0]||'';
 const insert=$('insert-sound').value;
 const available=t?.bank?sounds.filter(s=>s.toLowerCase().startsWith(t.bank.toLowerCase()+'_')).map(s=>s.slice(t.bank.length+1)):sounds;
 $('insert-sound').innerHTML=available.map(s=>'<option>'+esc(s)+'</option>').join('');
 if(available.includes(insert))$('insert-sound').value=insert;
}
function pitches(){
 const t=target();
 if(t?.kind==='s'){
  const existing=[...new Set(notes.map(n=>String(n.pitch)))];
  const chosen=$('insert-sound').value;if(chosen&&!existing.includes(chosen))existing.push(chosen);
  if(t.bank)for(const s of sounds.filter(s=>s.startsWith(t.bank.toLowerCase()+'_')).slice(0,12)){const token=s.slice(t.bank.length+1);if(!existing.includes(token))existing.push(token);}
  return existing.length?existing:['sound'];
 }
 const base=(Number($('octave').value)+1)*12;
 const nums=notes.map(n=>noteMidi(n.pitch)).filter(Number.isFinite);
 const low=Math.max(0,Math.min(base,...nums)),high=Math.min(127,Math.max(base+12,...nums));
 return Array.from({length:Math.min(128,high-low+1)},(_,i)=>high-i);
}
function renderRoll(){
 const rows=pitches(),steps=Number($('grid').value)*editSpan();
 $('roll').style.minWidth=Math.max(660,editSpan()*320)+'px';
 $('roll').style.setProperty('--steps',steps);
 $('ruler').innerHTML=Array.from({length:4*editSpan()},(_,i)=>'<span>'+i/4+'</span>').join('');
 $('lanes').innerHTML=rows.map(pitch=>{
  const pitched=target()?.kind!=='s',dim=pitched&&scalePitches&&!scalePitches.includes(mod(pitch,12));
  return '<div class="lane '+(dim?'out-of-scale':'')+'" data-pitch="'+esc(pitch)+'"><span class="lane-label">'+esc(pitched?noteName(pitch):pitch)+'</span><div class="lane-body">'+notes.filter(n=>String(n.pitch)===String(pitch)).map(n=>'<button class="note '+(selected.has(n.id)?'selected':'')+'" data-id="'+esc(n.id)+'" style="left:'+n.start/editSpan()*100+'%;width:'+Math.min(n.duration,editSpan()-n.start)/editSpan()*100+'%" title="'+esc((pitched?noteName(pitch):pitch)+' · '+n.start.toFixed(3)+' → '+(n.start+n.duration).toFixed(3))+'" aria-label="'+esc(pitched?noteName(pitch):pitch)+'"></button>').join('')+'</div></div>';
 }).join('');
}
function renderKeys(){
 const t=target(),base=(Number($('octave').value)+1)*12;
 const values=t?.kind==='s'?pitches().slice(0,KEYS.length):KEYS.map((_,i)=>base+i);
 $('keys').innerHTML=values.map((p,i)=>{
  const pitched=t?.kind!=='s',dim=pitched&&scalePitches&&!scalePitches.includes(mod(p,12));
  return '<button data-key="'+KEYS[i]+'" data-pitch="'+esc(p)+'" class="'+(dim?'out-of-scale ':'')+(pitched&&[1,3,6,8,10].includes(p%12)?'sharp':'')+'"><span>'+esc(pitched?noteName(p):p)+'</span><small>'+KEYS[i].toUpperCase()+'</small></button>';
 }).join('');
}
function renderOverview(){
 const playingPatterns=active===null?[]:analyze(active).patterns;
 $('arrangement').innerHTML=playingPatterns.map((p,i)=>{
  const replaced=p.runtimeId&&playingPatterns.slice(i+1).some(later=>later.runtimeId===p.runtimeId);
  const events=replaced?[]:rendered.filter(e=>p.runtimeId?e.patternId===p.runtimeId:!e.patternId);
  return '<div class="arr-row" style="--color:'+COLORS[i%COLORS.length]+'"><button data-select="'+i+'" '+(dirty()?'disabled title="Apply document edits to select this playing pattern"':'')+'>'+esc(patternName(p,i))+'</button><div class="arr-notes" '+(replaced?'title="Replaced by a later pattern with the same Strudel label"':'')+'>'+events.map((e,j)=>'<i class="arr-note" style="left:'+e.start/span*100+'%;width:'+Math.max(.3,e.duration/span*100)+'%;top:'+(4+(j%5)*7)+'px"></i>').join('')+'</div></div>';
 }).join('')||'<p class="small">Apply or play a document to see its output.</p>';
}
async function refreshLiteral(){
 if(parseError)return;
 notesRevision=-1;
 const t=target(),r=revision,key=t?.key;
 let nextNotes=[];
 if(t?.editable){
  const result=await player.call('literal',{kind:t.kind,value:t.value});
  if(r!==revision||key!==target()?.key)return;
  nextNotes=repeatEvents(expandEvents(result.events,t.length),t.length,Math.max(t.length,editSpan())).map(e=>({...e,pitch:t.kind==='note'?noteMidi(e.pitch):e.pitch}));
 }
 if(r!==revision||key!==target()?.key)return;
 allSourceNotes=nextNotes;notes=nextNotes.filter(n=>n.start<editSpan());notesRevision=r;selected.clear();
 render();
}
async function refreshOverview(){
 if(active===null)return;
 querying=true;
 try{const result=await player.call('query',{begin:windowStart,span});rendered=result.events;renderOverview();}
 catch(e){status(e.message);}finally{querying=false;}
}
async function apply(play=false,count=false){
 if(parseError)throw Error(parseError);
 const document=source;
 if(active!==null&&JSON.stringify(analyze(active).patterns.map(p=>p.label))!==JSON.stringify(model.patterns.map(p=>p.label)))solo=null;
 const result=await player.call('apply',{document,play,metronome:$('metro').checked,only:solo,count});
 active=document;running=result.started;sounds=result.sounds;cpm=result.cpm;cycles=result.cycles;clockAt=performance.now();runtimeError='';$('tempo').value=String(cpm);
 await refreshLiteral();await refreshOverview();renderState();
 status(result.warnings?.length?result.warnings.join(' '):running?'Playing Strudel.':'Document applied.');
}
async function selectPattern(i){index=i;targetIndex=0;viewCycles=null;await refreshLiteral();}
async function editEvents(next){
 if(!canEditSource())throw Error('Wait for a valid source view before editing notes.');
 const t=target();if(!t)throw Error('Select a source expression.');
 const length=Math.max(t.length,editSpan());
 const merged=[...next,...allSourceNotes.filter(n=>n.start>=editSpan())];
 const normalized=normalizeEvents(merged,length);
 const literal=literalFromEvents(normalized,t.kind);
 // Verify the mini notation in Strudel before changing any source.
 const expected=await player.call('literal',{kind:t.kind,value:literal});
 const signature=ns=>ns.map(n=>[String(n.pitch),n.start.toFixed(7),n.duration.toFixed(7)].join(':')).sort().join('|');
 if(signature(normalized)!==signature(expected.events))throw Error('Cannot preserve these notes exactly. Edit the Strudel directly.');
 await change(length===t.length?editLiteral(source,t,literal):editLength(source,t,length,literal));
}
function canRecord(){
 const p=pattern(),t=target();if(!canEditSource()||p.targets.length!==1)return false;
 // Do not guess the inverse of arbitrary transforms or shared all()/each().
 if(/\b(all|each)\s*\(/.test(source))return false;
 const allowed=new Set(['slow','s','sound','bank','gain','postgain','lpf','hpf','lpq','lpenv','lpdecay','attack','decay','sustain','release','pan','room','delay','distort']);
 const methods=[...p.source.matchAll(/\.([A-Za-z_]\w*)\s*\(/g)].map(m=>m[1]);
 return methods.every(m=>allowed.has(m))&&t.lengthEditable&&methods.filter(m=>m==='slow').length===(t.lengthStart!==null?1:0);
}
async function beginRecording(){
 if(!canRecord())throw Error('Record into a direct note() or s() literal without timing transforms.');
 const wasRunning=running;
 if(dirty()||!running)await apply(true,!running&&$('countin').checked);
 recording={before:source,target:target(),notes:[...notes],captured:[],length:editSpan(),begin:wasRunning?Math.max(0,Math.ceil((nowCycles()-.01)/Math.max(editSpan(),target().length))*Math.max(editSpan(),target().length)):0};
 $('record').classList.add('active');renderState();status('Recording '+recording.length+' source cycles. Play the keyboard.');
}
async function finishRecording(){
 if(!recording||finishing)return;finishing=true;
 try{
  for(const key of [...held.keys()])release(key);
  const take=recording;recording=null;renderState();
  if(source!==take.before)throw Error('Source changed during recording; take was not applied.');
  if(take.captured.length)await task(()=>editEvents([...take.notes,...take.captured]));
  status(take.captured.length?'Recording written to the source literal.':'No notes recorded.');
 }catch(e){status(e.message);}finally{finishing=false;renderState();}
}
async function previewNote(pitch,duration){
 if(running)return;
 const t=target();if(!t)return;
 let sound=t.kind==='s'?((t.bank?t.bank+'_':'')+pitch).toLowerCase():$('audition-sound').value;
 if(!sound)return;
 try{await player.call('audition',{pitch:t.kind==='s'?60:pitch,sound,key:'preview-'+(++previewId),oneShot:t.kind==='s',duration:Math.max(.08,Math.min(.5,duration*60/cpm))});}catch(e){status(e.message);}
}
async function press(key){
 if(held.has(key))return;
 const button=$('keys').querySelector('[data-key="'+key+'"]');if(!button)return;
 const t=target(),pitch=t?.kind==='s'?button.dataset.pitch:Number(button.dataset.pitch);
 const entry={pitch,start:nowCycles(),record:!!recording};held.set(key,entry);button.classList.add('held');
 let sound=$('audition-sound').value;
 if(t?.kind==='s')sound=((t.bank?t.bank+'_':'')+String(pitch)).toLowerCase();
 if(!sound){held.delete(key);throw Error('Choose an audition sound.');}
 try{await player.call('audition',{pitch:t?.kind==='s'?60:pitch,sound,key,oneShot:t?.kind==='s'});}catch(e){status(e.message);}
}
function release(key){
 const entry=held.get(key);if(!entry)return;held.delete(key);
 void player.call('release',{key}).catch(e=>status(e.message));
 $('keys').querySelector('[data-key="'+key+'"]')?.classList.remove('held');
 if(!entry.record||!recording)return;
 const grid=1/Number($('grid').value),end=nowCycles(),at=Math.max(0,entry.start-recording.begin);
 if(end<=recording.begin||at>=recording.length)return;
 const start=Math.min(recording.length-grid,Math.max(0,Math.round(at/grid)*grid));
 const duration=Math.min(recording.length-start,Math.max(grid,Math.round((end-Math.max(entry.start,recording.begin))/grid)*grid));
 recording.captured.push({pitch:entry.pitch,start,duration});
}
async function stop(){
 if(recording)await finishRecording();
 for(const key of [...held.keys()])release(key);
 await player.call('stop');running=false;cycles=0;$('playhead').style.display='none';renderState();status('Stopped.');
}
$('play').onclick=()=>task(()=>apply(true));
$('apply').onclick=()=>task(()=>apply());
$('stop').onclick=()=>void stop().catch(e=>status(e.message));
$('record').onclick=()=>recording?void finishRecording():task(beginRecording);
$('reset').onclick=()=>{recording=null;held.clear();player.reset();running=false;active=null;busy=false;void player.call('editorText',{text:source});renderState();status('Player reset. Press Play to reload the document.');};
$('patterns').onclick=e=>{
 const b=e.target.closest('button');if(!b||recording)return;
 if(b.dataset.select!==undefined)return void task(()=>selectPattern(+b.dataset.select));
 if(b.dataset.rename!==undefined){renameTarget=model.patterns[+b.dataset.rename];$('pattern-name').value=renameTarget.label?.includes('$')||!renameTarget.label?nextPatternName(source):patternName(renameTarget);$('rename-error').textContent='';$('rename-dialog').showModal();$('pattern-name').select();return;}
 if(b.dataset.mute!==undefined)return void task(()=>change(mutePattern(source,model.patterns[+b.dataset.mute])));
 if(b.dataset.remove!==undefined)return void task(()=>change(removePatterns(source,[model.patterns[+b.dataset.remove]])));
 if(b.dataset.solo!==undefined)return void task(async()=>{const id=model.patterns[+b.dataset.solo].runtimeId;solo=solo===id?null:id;if(active!==null)await player.call('options',{metronome:$('metro').checked,only:solo});render();});
};
$('arrangement').onclick=e=>{const b=e.target.closest('[data-select]');if(b&&!recording)void task(()=>selectPattern(+b.dataset.select));};
$('expression').onchange=()=>task(async()=>{targetIndex=+$('expression').value;viewCycles=null;await refreshLiteral();});
$('volume').onchange=()=>{const value=+$('volume').value;void task(()=>change(setVolume(source,pattern(),value)));};
$('tempo').onchange=()=>task(()=>change(setTempo(source,+$('tempo').value)));
$('remove-all').onclick=()=>task(()=>change(removePatterns(source,model.patterns)));
$('metro').onchange=()=>task(async()=>{if(active!==null)await player.call('options',{metronome:$('metro').checked,only:solo});});
$('span').onchange=()=>{span=+$('span').value;windowStart=0;void refreshOverview();};
$('grid').onchange=renderRoll;
$('length').onchange=()=>{
 const length=+$('length').value;
 void task(async()=>{viewCycles=length;await refreshLiteral();});
};
$('octave').onchange=()=>{for(const k of [...held.keys()])release(k);renderRoll();renderKeys();};
$('insert-sound').onchange=()=>{renderRoll();renderKeys();};
$('scale').onchange=()=>task(async()=>{
 const name=$('scale').value.trim();scalePitches=name?await player.call('scale',{name}):null;renderRoll();renderKeys();
});
$('clear-notes').onclick=()=>task(()=>editEvents([]));
async function deleteNotes(){if(selected.size)await editEvents(notes.filter(n=>!selected.has(n.id)));}
$('delete-notes').onclick=()=>task(deleteNotes);
$('keys').onpointerdown=e=>{const b=e.target.closest('[data-key]');if(!b)return;e.preventDefault();b.focus();b.setPointerCapture(e.pointerId);void press(b.dataset.key);};
$('keys').onpointerup=$('keys').onpointercancel=e=>{const b=e.target.closest('[data-key]');if(b)release(b.dataset.key);};
$('lanes').onpointerdown=e=>{
 if(e.button!==0||busy||recording||!canEditSource())return;
 const lane=e.target.closest('.lane-body');if(!lane)return;
 e.preventDefault();documentEditor.blur();
 const pitch=target().kind==='note'?Number(lane.parentElement.dataset.pitch):lane.parentElement.dataset.pitch;
 const button=e.target.closest('.note'),bounds=lane.getBoundingClientRect(),grid=1/Number($('grid').value);
 if(!button){const start=Math.min(editSpan()-grid,Math.max(0,Math.floor((e.clientX-bounds.left)/bounds.width*editSpan()/grid)*grid));void previewNote(pitch,grid);void task(()=>editEvents([...notes,{pitch,start,duration:grid}]));return;}
 const n=notes.find(n=>n.id===button.dataset.id);
 if(e.shiftKey){selected.has(n.id)?selected.delete(n.id):selected.add(n.id);renderRoll();renderState();return;}
 void previewNote(n.pitch,n.duration);
 selected=new Set([n.id]);button.classList.add('selected');renderState();
 const rect=button.getBoundingClientRect();
 gesture={id:n.id,n:{...n},x:e.clientX,y:e.clientY,width:bounds.width/editSpan(),resize:e.clientX>=rect.right-8,button};
 button.setPointerCapture(e.pointerId);
};
$('lanes').onpointermove=e=>{
 if(!gesture)return;
 const {n,x,width,resize,button}=gesture,grid=1/Number($('grid').value),delta=Math.round((e.clientX-x)/width/grid)*grid;
 if(resize)button.style.width=Math.max(grid,Math.min(editSpan()-n.start,n.duration+delta))/editSpan()*100+'%';
 else button.style.left=Math.max(0,Math.min(editSpan()-n.duration,n.start+delta))/editSpan()*100+'%';
};
$('lanes').onpointerup=e=>{
 if(!gesture)return;const g=gesture;gesture=null;
 const grid=1/Number($('grid').value),delta=Math.round((e.clientX-g.x)/g.width/grid)*grid;
 const next={...g.n};
 if(g.resize)next.duration=Math.max(grid,Math.min(editSpan()-next.start,next.duration+delta));
 else{
  next.start=Math.max(0,Math.min(editSpan()-next.duration,next.start+delta));
  const rows=pitches(),original=rows.findIndex(p=>String(p)===String(next.pitch));
  const row=Math.max(0,Math.min(rows.length-1,original+Math.round((e.clientY-g.y)/26)));next.pitch=rows[row];
 }
 if(next.start===g.n.start&&next.duration===g.n.duration&&next.pitch===g.n.pitch){renderRoll();return;}
 void task(()=>editEvents(notes.map(n=>n.id===g.id?next:n)));
};
$('lanes').onpointercancel=()=>{gesture=null;renderRoll();};
async function undo(forward=false){
 if(recording)return;const from=forward?redo:history,to=forward?history:redo;if(!from.length)return;
 to.push(source);setSource(from.pop(),{remember:false});lastTyping=0;
 if(running&&!parseError)await apply();else if(!parseError)await refreshLiteral();
}
window.addEventListener('keydown',e=>{
 if(e.defaultPrevented)return;
 const input=e.target.closest('input,select,textarea,[contenteditable],.cm-editor');
 if((e.metaKey||e.ctrlKey)&&e.code==='KeyZ'){e.preventDefault();void task(()=>undo(e.shiftKey));return;}
 if((e.metaKey||e.ctrlKey)&&e.code==='Enter'){e.preventDefault();void task(()=>apply());return;}
 if(input||e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
 if(e.code==='Space'){e.preventDefault();running?void stop():void task(()=>apply(true));return;}
 if(e.code==='Delete'||e.code==='Backspace'){if(selected.size){e.preventDefault();void task(deleteNotes);}return;}
 if(e.code==='Escape'){selected.clear();renderRoll();renderState();return;}
 const key=e.code.startsWith('Key')?e.code.slice(3).toLowerCase():e.key.toLowerCase();
 if(KEYS.includes(key)){e.preventDefault();void press(key);}
});
window.addEventListener('keyup',e=>release(e.code.startsWith('Key')?e.code.slice(3).toLowerCase():e.key.toLowerCase()));
window.addEventListener('blur',()=>{for(const key of [...held.keys()])release(key);});
$('add').onclick=()=>task(async()=>{
 const result=await player.call('initialize');sounds=result.sounds;
 $('new-sound').innerHTML=sounds.map(s=>'<option>'+esc(s)+'</option>').join('');$('new-sound').value=sounds.includes('sawtooth')?'sawtooth':sounds[0];
 $('new-name').value=nextPatternName(source);$('add-error').textContent='';$('add-dialog').showModal();
});
$('cancel-add').onclick=()=>$('add-dialog').close();
$('cancel-rename').onclick=()=>$('rename-dialog').close();
$('add-dialog').querySelector('form').onsubmit=e=>{
 e.preventDefault();void task(async()=>{
  const sound=$('new-sound').value,kind=$('new-kind').value;let bank='',token=sound;
  if(kind==='s'&&sound.includes('_')){const last=sound.lastIndexOf('_');bank=sound.slice(0,last);token=sound.slice(last+1);}
  let next;try{next=addPattern(source,{kind,sound:token,bank,label:$('new-name').value});}catch(error){$('add-error').textContent=error.message;return;}
  $('add-dialog').close();await change(next);index=model.patterns.length-1;targetIndex=0;viewCycles=null;await refreshLiteral();
  if(kind==='s'){$('insert-sound').value=token;renderRoll();renderKeys();}
 });
};
$('rename-form').onsubmit=e=>{
 e.preventDefault();if(e.submitter?.value==='cancel'){$('rename-dialog').close();return;}
 void task(async()=>{let next;try{next=renamePattern(source,renameTarget,$('pattern-name').value);}catch(error){$('rename-error').textContent=error.message;return;}
 $('rename-dialog').close();await change(next);});
};
$('copy').onclick=()=>task(async()=>{await navigator.clipboard.writeText(source);status('Strudel document copied.');});
$('share').onclick=()=>task(async()=>{$('share-url').value=await shareURL(project(),location.href);$('share-dialog').showModal();$('share-url').select();});
$('copy-share').onclick=()=>task(async()=>{await navigator.clipboard.writeText($('share-url').value);status('Share link copied.');});
async function boot(){
 try{
  const shared=await projectFromHash(location.hash);
  source=shared?.document||localStorage.getItem(storageKey)||DEFAULT_DOCUMENT;
 }catch(e){status(e.message);}
 documentEditor.setValue(source);rebuild();render();
 // Initial rendering never evaluates the document, including local or shared code.
 status('Loading Strudel sounds…');
 const result=await player.call('initialize');sounds=result.sounds;await refreshLiteral();
 status(result.warnings?.length?result.warnings.join(' '):'Ready.');
}
void boot().catch(e=>status(e.message));
if(navigator.modelContext)navigator.modelContext.registerTool({name:'read_live_strudel_document',description:'Read the current Strudel document and derived playback state.',inputSchema:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:JSON.stringify({document:source,activeDocument:active,patterns:model.patterns,notes,running})}]})});
