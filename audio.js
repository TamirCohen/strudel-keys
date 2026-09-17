import {isDrum} from './core.js';
export class AudioEngine {
  context=null; buffers=new Map(); voices=new Set(); loading=null;
  async init(manifest,context) {
    if(!this.master){this.context=context||new AudioContext({latencyHint:'interactive'});this.master=this.context.createGain();this.master.gain.value=.65;const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-6;limiter.ratio.value=12;this.master.connect(limiter).connect(this.context.destination);}
    await this.context.resume();
    if(!this.loading) this.loading=Promise.all(Object.entries(manifest).flatMap(([bank,items])=>Object.entries(items).map(async([pitch,url])=>{const key=bank+':'+pitch;if(this.buffers.has(key))return;const r=await fetch(url);if(!r.ok)throw Error('Could not load drum samples. Check your connection and retry.');const buffer=await this.context.decodeAudioData(await r.arrayBuffer());this.buffers.set(key,buffer);}))).catch(e=>{this.loading=null;throw e;});
    await this.loading;
  }
  get now(){return this.context?.currentTime||0;}
  play(track,pitch,when=this.now,duration=null){
    if(!this.context)return ()=>{};
    const ctx=this.context, start=Math.max(when,ctx.currentTime), gain=ctx.createGain(), sources=[];
    gain.connect(this.master); let stoppedAt=Infinity;
    const stop=(at=this.now)=>{const time=Math.max(start+.01,at);if(time>=stoppedAt)return;stoppedAt=time;gain.gain.cancelScheduledValues(time);gain.gain.setTargetAtTime(.0001,time,.025);sources.forEach(s=>{try{s.stop(time+.15)}catch{}});};
    const cleanup=()=>{sources.forEach(s=>s.disconnect());gain.disconnect();this.voices.delete(stop);};
    if(isDrum(track.sound)){
      const buffer=this.buffers.get(track.sound+':'+pitch);if(!buffer){gain.disconnect();return ()=>{};}
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(gain);gain.gain.value=track.volume*.7;source.start(start);sources.push(source);source.onended=cleanup;
    } else {
      const detunes=track.sound==='supersaw'?[-12,0,12]:[0];
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(track.volume*.22/detunes.length,start+.008);gain.gain.setTargetAtTime(track.volume*.15/detunes.length,start+.008,.07);
      detunes.forEach(detune=>{const osc=ctx.createOscillator();osc.type=track.sound==='supersaw'?'sawtooth':track.sound;osc.frequency.value=440*2**((pitch-69)/12);osc.detune.value=detune;osc.connect(gain);osc.start(start);sources.push(osc);});
      sources[0].onended=cleanup;if(duration!==null)stop(start+duration);
    }
    this.voices.add(stop);return stop;
  }
  click(when,accent=false){if(!this.context)return;const c=this.context,o=c.createOscillator(),g=c.createGain();o.frequency.value=accent?1500:1000;g.gain.setValueAtTime(.13,when);g.gain.exponentialRampToValueAtTime(.001,when+.045);o.connect(g).connect(this.master);o.start(when);o.stop(when+.05);o.onended=()=>{o.disconnect();g.disconnect();};}
  stopAll(){for(const stop of this.voices)stop();}
}
