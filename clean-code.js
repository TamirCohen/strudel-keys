import {parse} from 'acorn';
import {gridPattern,melodyPattern,strudelNote,noteMidi} from './core.js';

const fmt=n=>String(Number(n.toFixed(8)));
const quote=JSON.stringify;
const ast=code=>parse(code,{ecmaVersion:2022,allowAwaitOutsideFunction:true});
function pitchOf(event){
 if(event.value.note===undefined)return event.value.s;
 const pitch=event.pitch??event.value.note;
 return noteMidi(pitch);
}
// Only controls whose evaluated value can be written back without changing
// its meaning. Unknown controls fail closed rather than disappear in an edit.
const controlNames={s:'s',bank:'bank',gain:'gain',postgain:'postgain',cutoff:'lpf',hcutoff:'hpf',resonance:'lpq',
 attack:'attack',decay:'decay',sustain:'sustain',release:'release',room:'room',size:'size',pan:'pan',
 delay:'delay',delaytime:'delaytime',delayfeedback:'delayfeedback',detune:'detune',n:'n',speed:'speed',
 begin:'begin',end:'end',crush:'crush',shape:'shape',vowel:'vowel',velocity:'velocity',clip:'clip'};
const methods=new Set([...Object.keys(controlNames),...Object.values(controlNames),'clip','legato']);
const fail=()=>{throw Error('This pattern uses evolving or custom code that cannot be safely rewritten yet. Edit its Strudel directly; your code is unchanged.');};
function number(node){
 if(node?.type==='Literal'&&typeof node.value==='number')return node.value;
 if(node?.type==='UnaryExpression'&&['+','-'].includes(node.operator))return (node.operator==='-'?-1:1)*number(node.argument);
 fail();
}
function literal(node){
 if(node?.type==='Literal'&&['number','string'].includes(typeof node.value)){
  // Alternation, random/degraded choices, slow mini notation, and expressions
  // need a symbolic editor, not a fixed-window event serializer.
  if(typeof node.value==='string'&&!/^[\w\s#.,~\-\[\]*@]+$/.test(node.value))fail();
  return node.value;
 }
 return number(node);
}
const gcd=(a,b)=>b?gcd(b,a%b):a;
function commonPeriod(a,b){
 // Rational cycles with millisecond-independent exact decimal arithmetic.
 const scale=1000000,A=Math.round(a*scale),B=Math.round(b*scale);
 if(!A||!B)fail();return A/gcd(A,B)*B/scale;
}
function period(node){
 if(node?.type==='Identifier'&&node.name==='silence')return 1;
 if(node?.type!=='CallExpression')fail();
 if(node.callee.type==='Identifier'){
  const name=node.callee.name;
  if(['s','sound','note'].includes(name)&&node.arguments.length===1){literal(node.arguments[0]);return 1;}
  if(name==='stack'&&node.arguments.length)return node.arguments.map(period).reduce(commonPeriod,1);
  if(name==='timecat'){
   for(const pair of node.arguments){
    if(pair.type!=='ArrayExpression'||pair.elements.length!==2||!(number(pair.elements[0])>0)||period(pair.elements[1])!==1)fail();
   }
   return 1;
  }
  fail();
 }
 if(node.callee.type!=='MemberExpression'||node.callee.computed)fail();
 const name=node.callee.property.name,p=period(node.callee.object);
 if(['slow','fast','late','early'].includes(name)&&node.arguments.length===1){
  const n=number(node.arguments[0]);if(!Number.isFinite(n))fail();
  if(['slow','fast'].includes(name)){if(n<=0)fail();return name==='slow'?p*n:p/n;}
  return p;
 }
 if(methods.has(name)&&node.arguments.length===1){literal(node.arguments[0]);return p;}
 fail();
}
// Recognize only our old generated edit operations, not arbitrary user JS.
function legacyExpression(node){
 if(!node)return false;
 if(node.type==='CallExpression'){try{period(node);return true;}catch{}}
 if(node.type==='Literal')return true;
 if(node.type==='Identifier')return ['p','h','silence','undefined'].includes(node.name);
 if(node.type==='ArrayExpression')return node.elements.every(legacyExpression);
 if(node.type==='UnaryExpression')return ['!','-','+'].includes(node.operator)&&legacyExpression(node.argument);
 if(['BinaryExpression','LogicalExpression'].includes(node.type))return legacyExpression(node.left)&&legacyExpression(node.right);
 if(node.type==='MemberExpression')return !node.computed&&legacyExpression(node.object);
 if(node.type==='ArrowFunctionExpression')return node.params.length===1&&['p','h'].includes(node.params[0].name)&&legacyExpression(node.body);
 if(node.type==='CallExpression'){
  const c=node.callee;
  const allowed=c.type==='Identifier'?['all','stack','pure','timecat','Number'].includes(c.name):
   c.type==='MemberExpression'&&!c.computed&&(
    c.object.name==='JSON'&&c.property.name==='parse'||c.object.name==='Math'&&c.property.name==='abs'||
    ['filterHaps','slow','late','postgain'].includes(c.property.name)&&legacyExpression(c.object));
  return !!allowed&&node.arguments.every(legacyExpression);
 }
 return false;
}
function legacyPeriod(node,current){
 if(node.type==='Identifier')return node.name==='p'?current:1;
 if(node.callee?.name==='all')return legacyPeriod(node.arguments[0].body,current);
 if(node.callee?.name==='pure')return 1;
 if(node.callee?.name==='timecat'){
  for(const pair of node.arguments)if(pair.type!=='ArrayExpression'||pair.elements.length!==2||!(number(pair.elements[0])>0)||legacyPeriod(pair.elements[1],current)!==1)fail();
  return 1;
 }
 if(node.callee?.name==='stack')return node.arguments.map(n=>legacyPeriod(n,current)).reduce(commonPeriod,1);
 if(node.callee?.type==='MemberExpression'){
  const name=node.callee.property.name,base=legacyPeriod(node.callee.object,current);
  if(name==='slow')return base*number(node.arguments[0]);
  if(name==='late'||name==='postgain')return base;
  if(name==='filterHaps'){
   let result=base;
   function visit(n){
    if(!n||typeof n!=='object')return;
    if(n.type==='BinaryExpression'&&n.operator==='%')result=commonPeriod(result,number(n.right));
    for(const value of Object.values(n))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
   }
   visit(node.arguments[0]);return result;
  }
 }
 return period(node);
}
export function assertEditable(code,bars){
 const marker=code.search(/\/\/ (?:Piano-roll edit|Recorded take)/);
 const base=marker<0?code:code.slice(0,marker);
 let p=1;
 for(const node of ast(base).body){
  const expression=node.type==='LabeledStatement'?node.body.expression:node.expression;
  if(expression?.callee?.name==='all'){
   const f=expression.arguments[0],call=f?.body;
   if(f?.type!=='ArrowFunctionExpression'||call?.callee?.object?.name!==f.params[0]?.name||!methods.has(call.callee.property?.name)||call.arguments.length!==1)fail();
   literal(call.arguments[0]);
  }else p=commonPeriod(p,period(expression));
 }
 if(marker>=0)for(const node of ast(code.slice(marker)).body){
  if(node.type!=='ExpressionStatement'||!legacyExpression(node.expression))fail();
  p=legacyPeriod(node.expression,p);
 }
 if(Math.abs(bars/p-Math.round(bars/p))>1e-7)throw Error('The editor span does not cover this pattern’s full repeat. Increase Loop to cover it, or edit the Strudel directly.');
}
function controls(event){
 const result={};
 for(const [key,value]of Object.entries(event.value)){
  if(['note','id','keylabId','cps','duration'].includes(key)||key==='clip'&&event.value.note!==undefined)continue;
  if(!Object.hasOwn(controlNames,key)||!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))fail();
  result[key]=value;
 }
 if(event.pitched!==false&&event.value.note!==undefined)delete result.note;
 else delete result.s;
 return result;
}
const chain=values=>Object.entries(values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>'.'+controlNames[key]+'('+quote(value)+')').join('');
function musicalPattern(events,bars,pitched){
 const notes=events.map(n=>({start:n.start,duration:n.duration,pitch:pitched?n.pitch:n.value.s}));
 const compact=pitched?melodyPattern(notes,bars*4):gridPattern(notes,bars*4,true);
 if(compact)return compact;
 // Exact off-grid timing stays readable native Strudel, without JSON or IDs.
 const parts=notes.map(n=>{
  const duration=Math.min(n.duration,bars*4),sound=(pitched?'note':'s')+'('+quote(pitched?strudelNote(n.pitch):n.pitch)+')';
  return 'timecat(['+fmt(duration)+', '+sound+'], ['+fmt(bars*4-duration)+', silence]).slow('+bars+').late('+fmt(n.start/4)+')';
 });
 return parts.length===1?parts[0]:'stack('+parts.join(', ')+')';
}
export function cleanCode(events,bars){
 if(!events.length)return '$: silence';
 const prepared=events.map(event=>{
  const pitched=event.value.note!==undefined;
  const pitch=pitchOf(event);
  if(!Number.isFinite(event.start)||event.start<0||event.start>=bars*4||!Number.isFinite(event.duration)||event.duration<=0||pitched&&!Number.isFinite(pitch))fail();
  return {...event,pitch,pitched,controls:controls(event)};
 });
 const common={...prepared[0].controls};
 for(const key of Object.keys(common))if(!prepared.every(n=>n.controls[key]===common[key]))delete common[key];
 const groups=new Map();
 for(const n of prepared){
  const own=Object.fromEntries(Object.entries(n.controls).filter(([k])=>!(k in common)).sort(([a],[b])=>a.localeCompare(b)));
  const key=JSON.stringify([n.pitched,n.pitched?'melody':n.pitch,own]);
  if(!groups.has(key))groups.set(key,{pitched:n.pitched,own,events:[]});
  groups.get(key).events.push(n);
 }
 const voices=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>({code:musicalPattern(g.events.sort((a,b)=>a.start-b.start),bars,g.pitched),own:g.own,pitched:g.pitched}));
 // Parallel drum phrases with the same span fit in one familiar s("a, b").
 const merged=[];
 for(const voice of voices){
  const match=!voice.pitched&&/^s\(("(?:[^"\\]|\\.)*")\)(.*)$/.exec(voice.code);
  if(match){
   const previous=merged.find(v=>v.tail===match[2]&&JSON.stringify(v.own)===JSON.stringify(voice.own));
   if(previous){previous.mini.push(JSON.parse(match[1]));continue;}
   merged.push({mini:[JSON.parse(match[1])],tail:match[2],own:voice.own});
  }else merged.push(voice);
 }
 const parts=merged.map(v=>(v.mini?'s('+quote(v.mini.join(', '))+')'+v.tail:v.code)+chain(v.own));
 return '$: '+(parts.length===1?parts[0]:'stack(\n  '+parts.join(',\n  ')+'\n)')+chain(common);
}
export function rewriteNotes(code,events,{remove=[],add=[]},bars){
 assertEditable(code,bars);
 const ids=new Set(remove.map(n=>n.id));
 return cleanCode([...events.filter(n=>!ids.has(n.id)),...add],bars);
}
export function withVolume(code,value){
 const program=ast(code);
 if(program.body.length===1){
  const statement=program.body[0],node=statement.type==='LabeledStatement'?statement.body.expression:statement.expression;
  if(node){
   function withoutVolume(n){
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed){
     const base=withoutVolume(n.callee.object);
     if(n.callee.property.name==='postgain')return base;
     return base+code.slice(n.callee.object.end,n.end);
    }
    const source=code.slice(n.start,n.end);
    return ['CallExpression','Identifier'].includes(n.type)?source:'('+source+')';
   }
   return '$: '+withoutVolume(node)+'.postgain('+fmt(value)+')';
  }
 }
 return code.replace(/\n*\/\/ Track volume\s+all\(p => p\.postgain\([\d.]+\)\);?\s*$/,'').trim()+'\n\n// Track volume\nall(p => p.postgain('+fmt(value)+'))';
}
export function simpleExpression(code){
 const program=ast(code);
 if(program.body.length!==1)return null;
 const statement=program.body[0],node=statement.type==='LabeledStatement'?statement.body.expression:statement.expression;
 return node?code.slice(node.start,node.end):null;
}
export function eventSignature(events){
 return events.map(n=>{
  const value={...n.value};
  for(const key of ['note','id','keylabId','cps','duration'])delete value[key];
  const pitched=n.value.note!==undefined;
  if(pitched)delete value.clip;
  return JSON.stringify([Number(n.start.toFixed(6)),pitched?Number(n.duration.toFixed(6)):null,
   pitched?pitchOf(n):null,Object.entries(value).sort(([a],[b])=>a.localeCompare(b))]);
 }).sort().join('\n');
}
export function equivalentEvents(left,right){
 const groups=events=>{
  const map=new Map();
  for(const n of events){
   const pitched=n.value.note!==undefined,value={...n.value};
   for(const key of ['note','id','keylabId','cps','duration'])delete value[key];
   if(pitched)delete value.clip;
   const key=JSON.stringify([pitched?pitchOf(n):null,Object.entries(value).sort(([a],[b])=>a.localeCompare(b))]);
   if(!map.has(key))map.set(key,[]);map.get(key).push([n.start,pitched?n.duration:0]);
  }
  for(const list of map.values())list.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  return map;
 };
 const a=groups(left),b=groups(right);
 if(a.size!==b.size)return false;
 for(const [key,notes]of a){
  const other=b.get(key);if(!other||notes.length!==other.length)return false;
  if(notes.some((n,i)=>n.some((v,j)=>Math.abs(v-other[i][j])>1e-6)))return false;
 }
 return true;
}
