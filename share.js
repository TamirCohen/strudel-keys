import {restoreProject} from './project.js';
const MAX_BYTES=1024*1024,MAX_URL=64000;
async function readLimited(stream){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('Shared project is too large.');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function shareURL(project,base){
 const bytes=new TextEncoder().encode(JSON.stringify(restoreProject(project)));
 if(bytes.length>MAX_BYTES)throw Error('Project is too large for a share link. Use Save instead.');
 const compressed=await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
 let binary='';for(const byte of compressed)binary+=String.fromCharCode(byte);
 const url=new URL(base);url.search='';url.hash='project=v1.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(url.href.length>MAX_URL)throw Error('Project is too large for a share link. Use Save instead.');
 return url.href;
}
export async function projectFromHash(hash){
 if(!hash.startsWith('#project='))return null;
 if(hash.length>MAX_URL||!/^#project=v1\.[A-Za-z0-9_-]+$/.test(hash))throw Error('Invalid or unsupported share link.');
 try{
  const binary=atob(hash.slice('#project=v1.'.length).replace(/-/g,'+').replace(/_/g,'/'));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const decoded=await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  return restoreProject(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded)));
 }catch{throw Error('This share link is invalid, incomplete, or too large. Your saved project is unchanged.');}
}
