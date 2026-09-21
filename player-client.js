// Native editor and REPL share an opaque-origin frame; persistence stays outside.
export class Player {
 constructor(onState=()=>{}) {this.onState=onState;this.requests=new Map();this.sequence=0;}
 async connect() {
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{
   const iframe=document.createElement('iframe');
   iframe.sandbox='allow-scripts';iframe.allow='autoplay';iframe.title='Strudel editor and player';
   iframe.style.cssText='width:100%;height:100%;border:0;display:block';
   iframe.src=new URL(import.meta.env.BASE_URL+'player.html',location.href).href;this.iframe=iframe;
   const channel=new MessageChannel();this.port=channel.port1;
   this.port.onmessage=({data})=>{
    if(data?.type==='state'){this.onState(data.state);return;}
    const request=this.requests.get(data?.id);if(!request)return;
    clearTimeout(request.timer);this.requests.delete(data.id);
    data.error?request.reject(Error(data.error)):request.resolve(data.result);
   };
   const timeout=setTimeout(()=>{cleanup();reject(Error('Player failed to load. Reload and try again.'));},30000);
   const receive=e=>{
    if(e.source!==iframe.contentWindow||e.data!=='strudel-player-ready')return;
    cleanup();iframe.contentWindow.postMessage({type:'connect'},'*',[channel.port2]);resolve();
   };
   const cleanup=()=>{clearTimeout(timeout);window.removeEventListener('message',receive);};
   window.addEventListener('message',receive);document.getElementById('document').append(iframe);
  });return this.ready;
 }
 async call(method,args={}) {
  await this.connect();const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.requests.delete(id);reject(Error('The player did not respond. Reset the player to recover.'));},30000);
   this.requests.set(id,{resolve,reject,timer});this.port.postMessage({id,method,args});
  });
 }
 reset() {
  this.iframe?.remove();this.port?.close();this.ready=null;
  for(const r of this.requests.values()){clearTimeout(r.timer);r.reject(Error('Player reset.'));}this.requests.clear();
 }
}
