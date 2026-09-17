export const DRUMS = [ ['a','bd','Kick'], ['s','sd','Snare'], ['d','hh','Closed hat'], ['f','oh','Open hat'], ['g','cp','Clap'], ['h','lt','Low tom'], ['j','ht','High tom'], ['k','cr','Crash'] ];
export const SYNTH_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];
export const SOUNDS = {'909':'Roland TR-909', acoustic:'Acoustic drums', sawtooth:'Sawtooth synth', supersaw:'Supersaw synth', triangle:'Triangle synth', sine:'Sine synth', square:'Square synth'};
export const COLORS = ['#8b9dff','#c4a2ed','#7fb8d4','#d6a3b6','#91b8ac','#b2b6ca'];
export const isDrum = sound => sound === '909' || sound === 'acoustic';
export const noteName = midi => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12) - 1);
export const mod = (n,m) => ((n%m)+m)%m;
export function newTrack(sound='909', index=0) { return {id:crypto.randomUUID(), sound, name:SOUNDS[sound], volume:.8, mute:false, solo:false, color:COLORS[index%COLORS.length], notes:[]}; }
export function quantizeNotes(notes, grid, beats) {
  return notes.map(n=>({...n, start:mod(Math.round(n.start/grid)*grid,beats), duration:Math.min(beats,Math.max(grid,Math.round(n.duration/grid)*grid))}));
}
export function audibleTracks(tracks) { const solo=tracks.some(t=>t.solo); return tracks.filter(t=>!t.mute && (!solo || t.solo)); }
const fmt=n=>String(Number(n.toFixed(8)));
// Compress equal subdivisions without changing their timing.
function compactSteps(tokens) {
 for(let size=1;size<=tokens.length/2;size++){
  if(tokens.length%size===0&&tokens.every((v,i)=>v===tokens[i%size])){
   const phrase=compactSteps(tokens.slice(0,size));
   return (size===1?phrase:'['+phrase+']')+'*'+tokens.length/size;
  }
 }
 return tokens.join(' ');
}
export function gridPattern(notes,beats,drum){
 const step=[1,.5,1/3,.25,1/6,.125,1/12,.0625].find(step=>
  notes.every(n=>Math.abs(n.start/step-Math.round(n.start/step))<1e-7));
 if(!step)return null;
 const slots=Array.from({length:Math.round(beats/step)},()=>[]);
 for(const n of notes)slots[Math.round(n.start/step)].push(String(n.pitch));
 // Duplicate simultaneous voices must not collapse into a single note.
 if(slots.some(s=>new Set(s).size!==s.length))return null;
 let tokens=slots.map(s=>!s.length?'~':s.length===1?s[0]:'['+s.sort().join(',')+']');
 let span=beats;
 for(let bar=4;bar<beats;bar+=4){
  const size=Math.round(bar/step);
  if(tokens.length%size===0&&tokens.every((v,i)=>v===tokens[i%size])){
   tokens=tokens.slice(0,size);span=bar;break;
  }
 }
 let code=(drum?'s':'note')+'('+JSON.stringify(compactSteps(tokens))+')';
 if(span!==4)code+='.slow('+fmt(span/4)+')';
 if(!drum)code+='.legato('+fmt(notes[0].duration/step)+')';
 return code;
}
export function exportStrudel(project) {
 const beats=project.bars*4;
 const active=audibleTracks(project.tracks).filter(t=>t.notes.length);
 const header='setcpm('+fmt(project.bpm/4)+')\n\n';
 if(!active.length)return header+'silence';
 const parts=active.map(t=>'  // '+SOUNDS[t.sound]+'\n  '+exportTrack(t,project.bars));
 return header+'stack(\n'+parts.join(',\n')+'\n)';
}
export function exportTrack(t,bars=2) {
  if(!t.notes.length)return isDrum(t.sound)?'s("~").bank("'+(t.sound==='909'?'RolandTR909':'BossDR660')+'")':'note("~").s("'+(t.sound==='supersaw'?'sawtooth':t.sound)+'")';
  const beats=bars*4;
  const drum=isDrum(t.sound),groups=new Map();
  for(const n of [...t.notes].sort((a,b)=>a.start-b.start)){
   const key=drum?n.pitch:n.duration;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(n);
  }
  const voices=[];
  for(const notes of groups.values()){
   const compact=gridPattern(notes,beats,drum);
   if(compact){voices.push(compact);continue;}
   for(const n of notes){
    const duration=Math.min(n.duration,beats),rest=beats-duration;
    let code=drum?'s('+JSON.stringify(n.pitch)+')':'note('+n.pitch+').legato(1)';
    if(rest>0)code='timecat(['+fmt(duration)+', '+code+'], ['+fmt(rest)+', silence])';
    voices.push(code+'.slow('+bars+').late('+fmt(n.start/4)+')');
   }
  }
  let code=voices.length===1?voices[0]:'stack(\n    '+voices.join(',\n    ')+'\n  )';
  if(drum)code+='.bank('+JSON.stringify(t.sound==='909'?'RolandTR909':'BossDR660')+')';
  else code+='.s('+JSON.stringify(t.sound==='supersaw'?'sawtooth':t.sound)+').attack(0.008).sustain(0.65).release(0.12)';
  if(t.sound==='supersaw')code+='.layer(x => x.detune(-12), x => x, x => x.detune(12))';
  return code+'.gain('+fmt(t.volume)+')';
}
export function validateProject(p) {
  if(!p||p.version!==1||!Number.isFinite(p.bpm)||p.bpm<40||p.bpm>240||![1,2,4,8].includes(p.bars)||!Array.isArray(p.tracks)||p.tracks.length>32) throw Error('This is not a valid Keylab project.');
  const ids=new Set();
  for(const t of p.tracks) {
    if(t?.strudel!==undefined&&(typeof t.strudel!=='string'||t.strudel.length>30000))throw Error('Invalid track code.');
    if(t?.viewNotes!==undefined&&(!Array.isArray(t.viewNotes)||t.viewNotes.length>20000||t.viewNotes.some(n=>!n||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(n.id)||typeof n.pitch!=='string'||n.pitch.length>200||!Number.isFinite(n.start)||n.start<0||n.start>=p.bars*4||!Number.isFinite(n.duration)||n.duration<=0||n.duration>p.bars*4)))throw Error('Invalid note preview.');
    if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id)||!Object.hasOwn(SOUNDS,t.sound)||!Number.isFinite(t.volume)||t.volume<0||t.volume>1||typeof t.mute!=='boolean'||typeof t.solo!=='boolean'||!Array.isArray(t.notes)||t.notes.length>20000) throw Error('Invalid track data.');
    ids.add(t.id);const noteIds=new Set();
    for(const n of t.notes) {
      if(!n||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(n.id)||noteIds.has(n.id)||!Number.isFinite(n.start)||n.start<0||n.start>=p.bars*4||!Number.isFinite(n.duration)||n.duration<=0||n.duration>p.bars*4||(isDrum(t.sound)?!DRUMS.some(d=>d[1]===n.pitch):!Number.isInteger(n.pitch)||n.pitch<12||n.pitch>119)) throw Error('Invalid note data.');
      noteIds.add(n.id);
    }
  }
  return {...p,tracks:p.tracks.map((t,i)=>({...t,name:SOUNDS[t.sound],color:COLORS[i%COLORS.length]}))};
}
