export const DRUMS = [ ['a','bd','Kick'], ['s','sd','Snare'], ['d','hh','Closed hat'], ['f','oh','Open hat'], ['g','cp','Clap'], ['h','lt','Low tom'], ['j','ht','High tom'], ['k','cr','Crash'] ];
export const SYNTH_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];
export const SOUNDS = {'909':'Roland TR-909', acoustic:'Acoustic drums', sawtooth:'Sawtooth synth', supersaw:'Supersaw synth', triangle:'Triangle synth', sine:'Sine synth', square:'Square synth'};
export const COLORS = ['#8b9dff','#c4a2ed','#7fb8d4','#d6a3b6','#91b8ac','#b2b6ca'];
export const isDrum = sound => sound === '909' || sound === 'acoustic';
export const noteName = midi => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12) - 1);
export const strudelNote = midi => Number.isInteger(midi)?['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'][mod(midi,12)]+(Math.floor(midi/12)-1):midi;
export function noteMidi(value){
 if(typeof value!=='string')return value;
 const m=/^([a-g])(#+|b+|x)?(-?\d+)$/i.exec(value);
 if(!m)return Number(value);
 const accidental=m[2]||'';
 return (Number(m[3])+1)*12+({c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()])+(accidental.toLowerCase()==='x'?2:accidental.startsWith('#')?accidental.length:-accidental.length);
}
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
 if(!drum)return melodyPattern(notes,beats);
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
 return code;
}
// Express note lengths with mini-notation weights, not an extra legato control.
export function melodyPattern(notes,beats){
 let span=beats,list=[...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 for(let candidate=4;candidate<beats;candidate+=4){
  if(beats%candidate)continue;
  const first=list.filter(n=>n.start<candidate);
  if(first.length*(beats/candidate)!==list.length)continue;
  const signature=ns=>ns.map(n=>[Number(n.start.toFixed(7)),n.pitch,Number(n.duration.toFixed(7))].join(':')).sort().join('|');
  if(Array.from({length:beats/candidate},(_,i)=>signature(list.filter(n=>n.start>=i*candidate&&n.start<(i+1)*candidate).map(n=>({...n,start:n.start-i*candidate})))).every(s=>s===signature(first))){span=candidate;list=first;break;}
 }
 const step=[4,2,1,.5,1/3,.25,1/6,.125,1/12,.0625,1/24,1/48].find(step=>
  Math.abs(span/step-Math.round(span/step))<1e-7&&list.every(n=>[n.start,n.duration].every(v=>Math.abs(v/step-Math.round(v/step))<1e-7)));
 if(!step||list.some(n=>n.start+n.duration>span+1e-7))return null;
 const chords=[];
 for(const n of list){
  const chord=chords.find(c=>Math.abs(c.start-n.start)<1e-7&&Math.abs(c.duration-n.duration)<1e-7&&!c.pitches.includes(n.pitch));
  if(chord)chord.pitches.push(n.pitch);else chords.push({start:n.start,duration:n.duration,pitches:[n.pitch]});
 }
 const voices=[];
 for(const chord of chords){
  let voice=voices.find(v=>v.at(-1).start+v.at(-1).duration<=chord.start+1e-7);
  if(!voice){voice=[];voices.push(voice);}voice.push(chord);
 }
 const patterns=voices.map(voice=>{
  const tokens=[];let cursor=0;
  const push=(token,duration)=>{const weight=Math.round(duration/step);if(weight>0)tokens.push(token+(weight===1?'':'@'+weight));};
  for(const chord of voice){
   push('~',chord.start-cursor);
   const names=chord.pitches.map(strudelNote);
   push(names.length===1?names[0]:'['+names.join(',')+']',chord.duration);cursor=chord.start+chord.duration;
  }
  push('~',span-cursor);
  return 'note('+JSON.stringify(compactSteps(tokens))+')'+(span===4?'':'.slow('+fmt(span/4)+')');
 });
 return patterns.length===1?patterns[0]:'stack('+patterns.join(', ')+')';
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
   const key=drum?n.pitch:'melody';
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(n);
  }
  const voices=[];
  for(const notes of groups.values()){
   const compact=drum?gridPattern(notes,beats,true):melodyPattern(notes,beats);
   if(compact){voices.push(compact);continue;}
   for(const n of notes){
    const duration=Math.min(n.duration,beats),rest=beats-duration;
    let code=drum?'s('+JSON.stringify(n.pitch)+')':'note('+JSON.stringify(strudelNote(n.pitch))+')';
    if(rest>0)code='timecat(['+fmt(duration)+', '+code+'], ['+fmt(rest)+', silence])';
    voices.push(code+'.slow('+bars+').late('+fmt(n.start/4)+')');
   }
  }
  let code=voices.length===1?voices[0]:'stack(\n    '+voices.join(',\n    ')+'\n  )';
  if(drum)code+='.bank('+JSON.stringify(t.sound==='909'?'RolandTR909':'BossDR660')+')';
  else code+='.s('+JSON.stringify(t.sound==='supersaw'?'sawtooth':t.sound)+')';
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
