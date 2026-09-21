export const KEYS=['a','w','s','e','d','f','t','g','y','h','u','j','k'];
export const COLORS=['#8b9dff','#c4a2ed','#7fb8d4','#d6a3b6','#91b8ac','#b2b6ca'];
export const mod=(n,m)=>(n%m+m)%m;
export const noteName=m=>['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'][mod(m,12)]+(Math.floor(m/12)-1);
export function noteMidi(value) {
 if(typeof value==='number')return value;
 const m=/^([a-g])(#+|b+|x)?(-?\d+)$/i.exec(String(value));
 if(!m)return Number(value);
 const a=m[2]||'';return (+m[3]+1)*12+({c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()])+(a==='x'?2:a.startsWith('#')?a.length:-a.length);
}
const gcd=(a,b)=>b?gcd(b,a%b):a;
function compact(tokens) {
 for(let n=1;n<=tokens.length/2;n++)if(tokens.length%n===0&&tokens.every((t,i)=>t===tokens[i%n]))return (n===1?tokens[0]:'['+compact(tokens.slice(0,n))+']')+'*'+tokens.length/n;
 return tokens.join(' ');
}
// Serialize only a selected literal's finite, untransformed cycle. Never serialize
// evaluated output of user transforms, controls, variables, or other patterns.
export function literalFromEvents(events,kind) {
 if(!events.length)return '~';
 if(events.length>1024)throw Error('Too many events to edit visually.');
 let ticks=1;
 for(const value of events.flatMap(e=>[e.start,e.duration])){
  let denominator=1;
  while(denominator<=3840&&Math.abs(value*denominator-Math.round(value*denominator))>1e-9)denominator++;
  if(denominator>3840)throw Error('These timings cannot be represented exactly in this editor. Edit the code instead.');
  ticks=ticks/gcd(ticks,denominator)*denominator;
  if(ticks>1000000)throw Error('Timing is too complex for a readable visual edit. Edit the code instead.');
 }
 const list=events.map(e=>{
  const start=Math.round(e.start*ticks),duration=Math.round(e.duration*ticks);
  if(Math.abs(start/ticks-e.start)>1e-7||Math.abs(duration/ticks-e.duration)>1e-7||duration<1||start<0||start+duration>ticks)throw Error('These timings cannot be represented exactly in this editor. Edit the code instead.');
  const token=kind==='note'?noteName(noteMidi(e.pitch)):String(e.pitch);
  if(!/^[\w#.:\-]+$/.test(token))throw Error('Unsupported note or sound token.');
  return {start,duration,token};
 }).sort((a,b)=>a.start-b.start||a.token.localeCompare(b.token));
 const voices=[];
 for(const e of list) {
  let voice=voices.find(v=>(kind!=='s'||v[0].token===e.token)&&v.at(-1).start+v.at(-1).duration<=e.start);
  if(!voice){voice=[];voices.push(voice);}voice.push(e);
 }
 return voices.map(voice=>{
  const unit=voice.reduce((g,e)=>gcd(g,gcd(e.start,e.duration)),ticks);
  const tokens=[];let at=0;
  const put=(token,length)=>{if(length)tokens.push(token+(length===unit?'':'@'+length/unit));};
  for(const e of voice){put('~',e.start-at);put(e.token,e.duration);at=e.start+e.duration;}
  put('~',ticks-at);return compact(tokens);
 }).join(', ');
}

export function normalizeEvents(events,length=1) {
 return events.map(e=>({...e,start:e.start/length,duration:e.duration/length}));
}
export function expandEvents(events,length=1) {
 return events.map(e=>({...e,start:e.start*length,duration:e.duration*length}));
}
export function repeatEvents(events,period,span) {
 const result=[];
 for(let offset=0;offset<span;offset+=period)
  for(const [i,event] of events.entries())result.push({...event,id:offset+':'+i,start:event.start+offset});
 return result;
}
