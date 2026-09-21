import {StrudelMirror,codemirrorSettings,defaultSettings,compartments,extensions} from '@strudel/codemirror';
import {StateEffect,EditorState,Compartment,Prec} from '@codemirror/state';
import {EditorView,keymap} from '@codemirror/view';
import {autocompletion,acceptCompletion,closeCompletion} from '@codemirror/autocomplete';
import {soundContext,registryCompletion} from './sound-completion.js';

export function createNativeEditor(options,send,getSounds){
 codemirrorSettings.set({...defaultSettings,isAutoCompletionEnabled:true,isLineWrappingEnabled:true,isTooltipEnabled:true,fontSize:13});
 const mirror=new StrudelMirror({...options,root:document.getElementById('native-editor'),prebake:async()=>{},autodraw:false,solo:false});
 let syncing=false;
 const editable=new Compartment();
 const upstream=extensions.isAutoCompletionEnabled(true);
 const registry=autocompletion({override:[registryCompletion(getSounds)]});
 mirror.editor.dispatch({effects:StateEffect.appendConfig.of([
  editable.of([]),
  EditorView.domEventHandlers({blur:()=>{closeCompletion(mirror.editor);}}),
  EditorState.transactionExtender.of(tr=>{
   const before=!!soundContext(tr.startState),after=!!soundContext(tr.state);
   return before===after?null:{effects:compartments.isAutoCompletionEnabled.reconfigure(after?registry:upstream)};
  }),
  Prec.highest(keymap.of([
   {key:'Mod-Enter',run:()=>{send({editorAction:'evaluate'});return true;}},
   {key:'Tab',run:acceptCompletion},
  ])),
  EditorView.updateListener.of(update=>{
   if(update.docChanged&&!syncing)send({editorText:update.state.doc.toString(),typing:update.transactions.every(t=>t.isUserEvent('input.type')||t.isUserEvent('delete.backward')||t.isUserEvent('delete.forward'))});
  }),
  EditorView.contentAttributes.of({'aria-label':'Strudel document',spellcheck:'false'}),
 ])});
 mirror.editor.dom.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&['KeyZ','KeyY'].includes(event.code)){
   event.preventDefault();event.stopImmediatePropagation();
   send({editorAction:event.code==='KeyY'||event.shiftKey?'redo':'undo'});
  }
 },true);
 mirror.evaluate=()=>send({editorAction:'evaluate'});
 mirror.stop=()=>send({editorAction:'stop'});
 return {
  mirror,
  setText(text){
   const before=mirror.editor.state.doc.toString();if(text===before)return;
   let from=0,to=before.length,end=text.length;
   while(from<to&&from<end&&before[from]===text[from])from++;
   while(to>from&&end>from&&before[to-1]===text[end-1]){to--;end--;}
   syncing=true;
   try{mirror.editor.dispatch({changes:{from,to,insert:text.slice(from,end)}});}finally{syncing=false;}
  },
  setReadOnly(value){mirror.editor.dispatch({effects:editable.reconfigure([EditorState.readOnly.of(value),EditorView.editable.of(!value)])});},
 };
}
