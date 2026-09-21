// Sample libraries and drum-bank aliases used by strudel.cc's startup prebake.
// Maps register URLs; audio files are still fetched on demand by Strudel.
const CDN='https://strudel.b-cdn.net';
const libraries=[
 ['piano','piano/'],['vcsl','VCSL/'],
 ['tidal-drum-machines','tidal-drum-machines/machines/'],
 ['uzu-drumkit','uzu-drumkit/'],['uzu-wavetables','uzu-wavetables/'],
 ['mridangam','mrid/'],
];
async function json(path){
 const response=await fetch(CDN+'/'+path,{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 return response.json();
}
export function defaultSoundLoader(api){
 const loaded=new Set();
 return async()=>{
  const warnings=[];
  await Promise.all(libraries.map(async([name,base])=>{
   if(loaded.has(name))return;
   try{await api.samples(await json(name+'.json'),CDN+'/'+base,{prebake:true});loaded.add(name);}
   catch{warnings.push(name);}
  }));
  if(!loaded.has('dirt-extras')){
   try{
    const map=await json('Dirt-Samples/strudel.json');
    const names=['casio','crow','insect','wind','jazz','metal','east','space','numbers','num'];
    await api.samples(Object.fromEntries(names.filter(n=>map[n]).map(n=>[n,map[n]])),CDN+'/Dirt-Samples/',{prebake:true});
    loaded.add('dirt-extras');
   }catch{warnings.push('extra samples');}
  }
  if(loaded.has('tidal-drum-machines')&&!loaded.has('aliases')){
   try{await api.aliasBank(await json('tidal-drum-machines-alias.json'));loaded.add('aliases');}
   catch{warnings.push('bank aliases');}
  }
  return warnings.length?['Could not load '+warnings.join(', ')+'. Check your connection; Play will retry.']:[];
 };
}
