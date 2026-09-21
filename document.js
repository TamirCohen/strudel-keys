import {parse} from 'acorn';

export const DEFAULT_DOCUMENT = `setcpm(30)

$: note("c3 e3 g3 e3").s("sawtooth").lpf(1200)
`;
const ast = code => parse(code, {ecmaVersion:2022, allowAwaitOutsideFunction:true});
const calls = new Set(['note','s','sound']);
const helpers = new Set(['samples','setcpm','setCpm','setcps','setCps','all','each','hush']);
const name = node => node?.type === 'Identifier' ? node.name : null;
export const replaceRange = (code,start,end,text) => code.slice(0,start)+text+code.slice(end);

function targets(expression, code) {
 const result=[];
 function visit(node, chain=[]) {
  if(node?.type!=='CallExpression')return;
  if(node.callee.type==='MemberExpression' && !node.callee.computed) {
   visit(node.callee.object,[node,...chain]); return;
  }
  if(name(node.callee)==='stack') {node.arguments.forEach(arg=>visit(arg,chain));return;}
  if(!calls.has(name(node.callee)))return;
  const literal=node.arguments[0];
  if(node.arguments.length!==1||literal?.type!=='Literal'||typeof literal.value!=='string')return;
  const kind=name(node.callee)==='note'?'note':'s';
  // Only deterministic mini notation can be converted to an editable finite cycle.
  // Dynamic expressions remain playable and visible, never baked into a snapshot.
  const expansion=[...literal.value.matchAll(/[*!](\d+)/g)].reduce((n,m)=>n*Number(m[1]),1);
  const staticMini=literal.value.length<8192&&expansion<=1024&&/^[\w#.:\s,\[\]*!@~\-]+$/.test(literal.value) && !/[<>?{}|/]/.test(literal.value);
  const bankCall=chain.find(c=>c.callee.property.name==='bank');
  const bank=bankCall?.arguments[0]?.type==='Literal'?String(bankCall.arguments[0].value):'';
  const soundCall=chain.find(c=>['s','sound'].includes(c.callee.property.name));
  const sound=soundCall?.arguments[0]?.type==='Literal'?String(soundCall.arguments[0].value):'';
  const slows=chain.filter(c=>c.callee.property.name==='slow'&&c.start===node.start);
  const slow=slows[0],arg=slow?.arguments[0];
  const lengthEditable=!slow||(slows.length===1&&slow.arguments.length===1&&arg?.type==='Literal'&&[1,2,4,8].includes(arg.value));
  const length=slow&&lengthEditable?arg.value:1;
  result.push({key:String(literal.start),start:literal.start,end:literal.end,kind,value:literal.value,editable:staticMini,bank,sound,
   length,lengthEditable,lengthStart:slow&&lengthEditable?arg.start:null,lengthEnd:slow&&lengthEditable?arg.end:null,lengthInsert:node.end,
   expression:code.slice(node.start,(chain.at(-1)||node).end)});
 }
 visit(expression);return result;
}

export function analyze(code) {
 const program=ast(code),patterns=[];let anonymous=0;
 const hasLabels=program.body.some(n=>n.type==='LabeledStatement');
 const shadowed=new Set();
 function bindings(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&calls.has(node.id?.name))shadowed.add(node.id.name);
  if(node.type==='FunctionDeclaration'&&calls.has(node.id?.name))shadowed.add(node.id.name);
  if(node.type==='AssignmentExpression'&&calls.has(node.left?.name))shadowed.add(node.left.name);
  for(const child of Object.values(node))if(Array.isArray(child))child.forEach(bindings);else if(child&&typeof child==='object')bindings(child);
 }
 bindings(program);
 for(const node of program.body) {
  const labeled=node.type==='LabeledStatement';
  if(!labeled&&(hasLabels||node!==program.body.at(-1)))continue;
  const expression=labeled?node.body.expression:node.type==='ExpressionStatement'?node.expression:null;
  if(!expression||(!labeled&&(expression.type!=='CallExpression'||helpers.has(name(expression.callee)))))continue;
  const label=labeled?node.label.name:null;
  // IDs match Strudel's native .p() implementation. Muted labels do not consume an index.
  const muted=!!label&&(label.startsWith('_')||label.endsWith('_'));
  const runtimeId=label?(label.includes('$')&&!muted?label+(anonymous++):label):null;
  patterns.push({key:String(node.start),start:node.start,end:node.end,expressionStart:expression.start,expressionEnd:expression.end,
   label,labelStart:node.label?.start,labelEnd:node.label?.end,muted,runtimeId,
   source:code.slice(expression.start,expression.end),targets:shadowed.size?[]:targets(expression,code)});
 }
 return {patterns};
}

export function editLiteral(code,target,value) {
 if(!target.editable)throw Error('This expression is dynamic. Edit its Strudel code directly.');
 const current=analyze(code).patterns.flatMap(p=>p.targets).find(t=>t.start===target.start&&t.end===target.end);
 if(!current||current.value!==target.value)throw Error('The source changed. Select the expression again.');
 return replaceRange(code,target.start,target.end,JSON.stringify(value));
}
export function editLength(code,target,length,value) {
 if(!target.lengthEditable||![1,2,4,8].includes(length))throw Error('Edit this timing expression in the Strudel document.');
 // Apply the later timing edit first so the literal's source range stays valid.
 editLiteral(code,target,value);
 const next=target.lengthStart!==null
  ?replaceRange(code,target.lengthStart,target.lengthEnd,String(length))
  :length===1?code:replaceRange(code,target.lengthInsert,target.lengthInsert,'.slow('+length+')');
 return replaceRange(next,target.start,target.end,JSON.stringify(value));
}
export function setVolume(code,pattern,value) {
 if(!Number.isFinite(value)||value<0||value>2)throw Error('Invalid gain.');
 let expression=ast('('+pattern.source+')').body[0].expression;
 while(expression.type==='CallExpression'&&expression.callee.type==='MemberExpression') {
  if(expression.callee.property.name==='postgain') {
   const arg=expression.arguments[0];
   if(expression.arguments.length!==1||arg?.type!=='Literal'||typeof arg.value!=='number')throw Error('postgain is a pattern. Edit it in the document.');
   return replaceRange(code,pattern.expressionStart+arg.start-1,pattern.expressionStart+arg.end-1,String(value));
  }
  expression=expression.callee.object;
 }
 return replaceRange(code,pattern.expressionEnd,pattern.expressionEnd,'.postgain('+value+')');
}
export function volumeOf(pattern) {
 let expression=ast('('+pattern.source+')').body[0].expression;
 while(expression.type==='CallExpression'&&expression.callee.type==='MemberExpression') {
  if(expression.callee.property.name==='postgain')return typeof expression.arguments[0]?.value==='number'?expression.arguments[0].value:null;
  expression=expression.callee.object;
 }return 1;
}
export function mutePattern(code,pattern) {
 if(!pattern.label)throw Error('Add a $: label to mute this pattern.');
 const label=pattern.muted?pattern.label.replace(/^_+|_+$/g,''):'_'+pattern.label;
 return replaceRange(code,pattern.labelStart,pattern.labelEnd,label||'$');
}
export function setTempo(code,cpm) {
 if(!Number.isFinite(cpm)||cpm<=0||cpm>300)throw Error('CPM must be greater than 0 and at most 300.');
 const nodes=ast(code).body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&['setcpm','setCpm','setcps','setCps'].includes(name(n.expression.callee)));
 if(nodes.length>1)throw Error('Several tempo calls: edit them in the document.');
 if(!nodes.length)return 'setcpm('+cpm+')\n'+code;
 const call=nodes[0].expression;
 if(call.arguments.length!==1||call.arguments[0].type!=='Literal'||typeof call.arguments[0].value!=='number')throw Error('Tempo is an expression: edit it in the document.');
 return replaceRange(code,call.start,call.end,'setcpm('+cpm+')');
}
export function removePatterns(code,patterns) {
 return [...patterns].sort((a,b)=>b.start-a.start).reduce((s,p)=>replaceRange(s,p.start,p.end,''),code);
}
export const patternName = (pattern,index=0) => pattern.label && !pattern.label.includes('$') ? pattern.label.replace(/^_+|_+$/g,'') : 'Pattern '+(index+1);
export function nextPatternName(code) {
 const used=new Set(analyze(code).patterns.map(p=>patternName(p)));
 let i=1;while(used.has('pattern'+i))i++;return 'pattern'+i;
}
function validateName(code,label,except) {
 if(!/^[a-z][a-zA-Z0-9_]*$/.test(label)||label.endsWith('_'))throw Error('Use a lowercase first letter, then letters, numbers or underscores; no trailing underscore.');
 // Native labels starting with S solo, underscores mute, and $ labels are anonymous.
 try{ast(label+': s("~")');}catch{throw Error('This name is a reserved JavaScript word.');}
 if(analyze(code).patterns.some(p=>p.start!==except&&patternName(p)===label))throw Error('Another pattern already uses this name.');
}
export function renamePattern(code,pattern,label) {
 label=label.trim();validateName(code,label,pattern.start);
 const current=analyze(code).patterns.find(p=>p.start===pattern.start);
 if(!current||current.source!==pattern.source||current.label!==pattern.label)throw Error('The source changed. Select the pattern again.');
 return pattern.label?replaceRange(code,pattern.labelStart,pattern.labelEnd,(pattern.muted?'_':'')+label):replaceRange(code,pattern.start,pattern.start,label+': ');
}
export function addPattern(code,{kind,sound,bank='',label=nextPatternName(code)}) {
 if(!['s','note'].includes(kind)||!sound)throw Error('Choose a registered Strudel sound.');
 label=label.trim();validateName(code,label);
 const existing=analyze(code).patterns;
 if(existing.length===1&&!existing[0].label)code=replaceRange(code,existing[0].start,existing[0].start,'$: ');
 const expression=kind==='note'?'note("~").s('+JSON.stringify(sound)+')':'s("~")';
 return code.trimEnd()+'\n\n'+label+': '+expression+(bank?'.bank('+JSON.stringify(bank)+')':'')+'\n';
}
