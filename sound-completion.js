import {syntaxTree} from '@codemirror/language';

// Small registry bridge for the two unfinished providers in Strudel 1.3.0.
// Function suggestions and their docs continue to come from upstream unchanged.
export function soundContext(state,pos=state.selection.main.head){
 const node=syntaxTree(state).resolveInner(pos,-1);
 if(/Comment/.test(node.name))return null;
 const before=state.sliceDoc(Math.max(0,pos-4096),pos);
 const match=/\b(s|sound|bank)\(\s*(["'`])([^"'`\\]*)$/.exec(before);
 if(!match)return null;
 const fragment=/[\w-]*$/.exec(match[3])[0];
 return {kind:match[1]==='bank'?'bank':'sound',from:pos-fragment.length};
}
export function registryCompletion(getSounds){
 let previous=null,sounds=[],banks=[];
 return context=>{
  const where=soundContext(context.state,context.pos);if(!where)return null;
  const registry=getSounds();
  if(registry!==previous){
   previous=registry;sounds=registry.map(label=>({label,type:'constant'}));
   banks=[...new Set(registry.filter(s=>s.includes('_')).map(s=>s.split('_')[0]))].sort().map(label=>({label,type:'constant'}));
  }
  return {from:where.from,options:where.kind==='bank'?banks:sounds,validFor:/^[\w-]*$/};
 };
}
