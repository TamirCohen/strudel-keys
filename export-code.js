import {parse} from 'acorn';
const parseCode=code=>parse(code,{ecmaVersion:2022,allowAwaitOutsideFunction:true});
// Export musical expressions only. The runtime's REPL isolation helpers must
// never become part of the user's musical source or copied project.
export function readableExpression(code){
 const program=parseCode(code),parts=[],all=[];let each=null;
 const source=node=>code.slice(node.start,node.end);
 for(const statement of program.body){
  if(statement.type==='EmptyStatement')continue;
  if(statement.type==='LabeledStatement'&&statement.body.type==='ExpressionStatement')parts.push(source(statement.body.expression));
  else if(statement.type==='ExpressionStatement'){
   const node=statement.expression;
   if(node.type==='CallExpression'&&['all','each'].includes(node.callee.name)&&node.arguments.length===1&&node.arguments[0].type==='ArrowFunctionExpression'){
    if(node.callee.name==='all')all.push(source(node.arguments[0]));else each=source(node.arguments[0]);
   }else if(program.body.length===1)parts.push(source(node));
   else throw Error('This track uses custom JavaScript. Share the project to preserve its code; automatic musical export is unavailable.');
  }else throw Error('This track uses custom JavaScript. Share the project to preserve its code; automatic musical export is unavailable.');
 }
 const apply=(expression,fn)=>{
  const arrow=parseCode('('+fn+')').body[0].expression;
  if(arrow.params.length===1&&arrow.params[0].type==='Identifier'&&arrow.body.type==='CallExpression'){
   let root=arrow.body;
   while(root.type==='CallExpression'&&root.callee.type==='MemberExpression'&&!root.callee.computed)root=root.callee.object;
   // Only inline a chain if the parameter occurs once, at its root.
   let uses=0;function visit(n){if(!n||typeof n!=='object')return;if(n.type==='Identifier'&&n.name===arrow.params[0].name)uses++;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
   visit(arrow.body);
   if(root.type==='Identifier'&&root.name===arrow.params[0].name&&uses===1){
    const base=parseCode('('+expression+')').body[0].expression;
    return (['CallExpression','Identifier','MemberExpression'].includes(base.type)?expression:'('+expression+')')+('('+fn+')').slice(root.end,arrow.body.end);
   }
  }
  return '('+fn+')('+expression+')';
 };
 let expressions=each?parts.map(p=>apply(p,each)):parts;
 let result=expressions.length===0?'silence':expressions.length===1?expressions[0]:'stack(\n  '+expressions.join(',\n  ')+'\n)';
 for(const fn of all)result=apply(result,fn);
 return result;
}
