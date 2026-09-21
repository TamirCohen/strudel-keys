// Text/state bridge only. StrudelMirror owns the editor inside the sandbox.
export function createDocumentEditor({getPlayer}){
 let value='',readOnly=false;
 const send=(method,args)=>void getPlayer().call(method,args).catch(console.error);
 return {
  acceptValue(next){value=next;},
  setValue(next){if(value===next)return;value=next;send('editorText',{text:next});},
  setReadOnly(next){if(readOnly===next)return;readOnly=next;send('editorReadOnly',{value:next});},
  blur(){send('editorBlur',{});},
 };
}
