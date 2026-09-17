import {parse} from 'acorn';
const ast=code=>parse(code,{ecmaVersion:2022,allowAwaitOutsideFunction:true});
// Give every track its own labels and all()/each() transforms. This same
// expression is used by the runtime and by the portable project export.
export function scopeCode(code,withTempo=false){
 const program=ast(code);
 const body=program.body.map(node=>{
  if(node.type==='LabeledStatement'&&node.body.type==='ExpressionStatement')
   return '_klParts.push('+code.slice(node.body.expression.start,node.body.expression.end)+');';
  if(node.type==='ExpressionStatement')
   return '_klResult('+code.slice(node.expression.start,node.expression.end)+');';
  return code.slice(node.start,node.end);
 }).join('\n');
 return '(await (async () => {\n'+
 'const _klParts=[], _klAll=[]; let _klEach=x=>x, _klLast=silence, _klTempo;\n'+
 'const all=f=>{_klAll.push(f)}, each=f=>{_klEach=f}, hush=()=>{_klParts.length=0;_klLast=silence;return silence};\n'+
 'const setcpm=v=>{_klTempo=Number(v?.__pure??v);return silence}, setCpm=setcpm, setcps=v=>setcpm(Number(v?.__pure??v)*60), setCps=setcps;\n'+
 'const _klResult=v=>{if(v?.queryArc)_klLast=v;return v};\n'+body+'\n'+
 'let _klPattern=_klParts.length?stack(..._klParts.map(_klEach)):_klEach(_klLast);\n'+
 'for(const f of _klAll)_klPattern=f(_klPattern);\n'+
 (withTempo?'return {pattern:_klPattern,tempo:_klTempo};':'return _klPattern;')+'\n})())';
}
export function stripTempo(code){
 let result=code;
 for(const node of ast(code).body.reverse()){
  if(node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&['setcpm','setCpm','setcps','setCps'].includes(node.expression.callee.name))
   result=result.slice(0,node.start)+result.slice(node.end);
 }
 return result.trim();
}
