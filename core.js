export const DRUMS = [ ['a','bd','Kick'], ['s','sd','Snare'], ['d','hh','Closed hat'], ['f','oh','Open hat'], ['g','cp','Clap'], ['h','lt','Low tom'], ['j','ht','High tom'], ['k','cr','Crash'] ];
export const SYNTH_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];
export const SOUNDS = {'909':'Roland TR-909', acoustic:'Acoustic drums', sawtooth:'Sawtooth synth', supersaw:'Supersaw synth', triangle:'Triangle synth', sine:'Sine synth', square:'Square synth'};
export const COLORS = ['#ccff6b','#ffae70','#93c7ff','#d1a4ff','#ff8caa','#78e4c6'];
export const isDrum = sound => sound === '909' || sound === 'acoustic';
export const noteName = midi => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12) - 1);
export const mod = (n,m) => ((n%m)+m)%m;
export function newTrack(sound='909', index=0) { return {id:crypto.randomUUID(), sound, name:SOUNDS[sound], volume:.8, mute:false, solo:false, color:COLORS[index%COLORS.length], notes:[]}; }
export function quantizeNotes(notes, grid, beats) {
  return notes.map(n=>({...n, start:mod(Math.round(n.start/grid)*grid,beats), duration:Math.min(beats,Math.max(grid,Math.round(n.duration/grid)*grid))}));
}
export function audibleTracks(tracks) { const solo=tracks.some(t=>t.solo); return tracks.filter(t=>!t.mute && (!solo || t.solo)); }
const fmt=n=>String(Number(n.toFixed(8)));
export function exportStrudel(project, samples) {
  const beats=project.bars*4, lines=[]; const active=audibleTracks(project.tracks).filter(t=>t.notes.length);
  const used={};
  for(const t of active) if(isDrum(t.sound)) for(const n of t.notes) { const name=`keylab_${t.sound}_${n.pitch}`;used[name]=samples[t.sound][n.pitch]; }
  if(Object.keys(used).length) lines.push('samples('+JSON.stringify(used,null,2)+')\n');
  lines.push(`setcpm(${fmt(project.bpm/4)})\n`);
  if(!active.length) return lines.join('\n')+'// Record a track to see your pattern here.\nsilence';
  lines.push('// One cycle = one bar. Timing is preserved, including overlaps.');
  const parts=active.map(t=>{
    const ns=[...t.notes].sort((a,b)=>a.start-b.start);
    const drum=isDrum(t.sound);
    // Each event has its own cycle so simultaneous notes and sustained overlaps survive export.
    const voices=ns.map(n=>{
      const value=drum?`s(${JSON.stringify(`keylab_${t.sound}_${n.pitch}`)})`:`note(${n.pitch}).s(${JSON.stringify(t.sound==='supersaw'?'sawtooth':t.sound)})`;
      const duration=Math.min(n.duration,beats), start=n.start;
      let p=drum?value:`${value}.legato(1)`;
      if(!drum) p+='.attack(0.008).sustain(0.65).release(0.12)';
      if(t.sound==='supersaw') p+='.layer(x => x.detune(-12), x => x, x => x.detune(12))';
      const rest=beats-duration;
      p=rest>0?`timecat([${fmt(duration)}, ${p}], [${fmt(rest)}, silence])`:`${p}`;
      return `${p}.slow(${project.bars}).late(${fmt(start/4)})`;
    });
    return `  // ${SOUNDS[t.sound]}\n  stack(\n    ${voices.join(',\n    ')}\n  ).gain(${fmt(t.volume*(drum?.7:.22))})`;
  });
  return lines.join('\n')+'\nstack(\n'+parts.join(',\n')+'\n)';
}
export function validateProject(p) {
  if(!p||p.version!==1||!Number.isFinite(p.bpm)||p.bpm<40||p.bpm>240||![1,2,4,8].includes(p.bars)||!Array.isArray(p.tracks)||p.tracks.length<1||p.tracks.length>32) throw Error('This is not a valid Keylab project.');
  const ids=new Set();
  for(const t of p.tracks) {
    if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id)||!Object.hasOwn(SOUNDS,t.sound)||!Number.isFinite(t.volume)||t.volume<0||t.volume>1||typeof t.mute!=='boolean'||typeof t.solo!=='boolean'||!Array.isArray(t.notes)||t.notes.length>20000) throw Error('Invalid track data.');
    ids.add(t.id);const noteIds=new Set();
    for(const n of t.notes) {
      if(!n||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(n.id)||noteIds.has(n.id)||!Number.isFinite(n.start)||n.start<0||n.start>=p.bars*4||!Number.isFinite(n.duration)||n.duration<=0||n.duration>p.bars*4||(isDrum(t.sound)?!DRUMS.some(d=>d[1]===n.pitch):!Number.isInteger(n.pitch)||n.pitch<12||n.pitch>119)) throw Error('Invalid note data.');
      noteIds.add(n.id);
    }
  }
  return {...p,tracks:p.tracks.map((t,i)=>({...t,name:SOUNDS[t.sound],color:COLORS[i%COLORS.length]}))};
}
