/* Procedural city acoustics. Nothing starts before the explicit gesture start(). */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const point=p=>p&&p.length>=3&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Number.isFinite(p[2]);
function random(seed) {let s=seed>>>0;return()=>{s+=0x6d2b79f5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const NOTES={
  interact:[[440,0,.12,'sine',.035],[660,.06,.15,'sine',.022]],
  pickup:[[740,0,.13,'sine',.035],[1110,.06,.20,'sine',.022]],
  complete:[[392,0,.22,'sine',.035],[494,.11,.24,'sine',.034],[587,.22,.27,'sine',.033],[784,.35,.40,'sine',.028]],
  damage:[[92,0,.17,'triangle',.055],[69,.04,.22,'sine',.05]],
  jump:[[170,0,.11,'sine',.022]],
  hack:[[550,0,.08,'triangle',.022],[825,.10,.08,'triangle',.02],[1100,.21,.18,'sine',.029]],
  buy:[[880,0,.11,'sine',.028],[660,.065,.14,'sine',.027],[990,.14,.24,'sine',.024]]
};

export class CityAudio {
  constructor({volume=.45,seed=73191}={}) {
    this.volume=Number.isFinite(volume)?clamp(volume,0,1):.45;
    this.context=null;this.started=false;this.disposed=false;this.supported=true;
    this._nodes=[];this._loops=[];this._voices=new Set();this._maxVoices=16;
    this._random=random(seed);this._time=0;this._updateClock=0;this._stepDistance=0;this._lastStep=-1;this._foot=0;
    this._position=[0,0,0];this._sources={};this._startPromise=null;this._noise=null;
  }
  async start() {
    if(this.disposed)return false;
    if(this.context?.state==='running') {this.started=true;return true;}
    if(this._startPromise)return this._startPromise;
    // Browsers without UserActivation still enforce their own audio gesture gate.
    if(globalThis.navigator?.userActivation&&globalThis.navigator.userActivation.isActive===false)return false;
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio) {this.supported=false;return false;}
    const pending=(async()=>{
      try {
        if(!this.context) {
          this.context=new Audio({latencyHint:'interactive'});
          this._build();
        }
        if(this.context.state==='suspended')await this.context.resume();
        this.started=this.context.state==='running';return this.started;
      } catch {
        // Audio failure leaves a fully playable, silent simulation.
        this.started=false;this._release();return false;
      }
    })();
    this._startPromise=pending;
    try {return await pending;}finally{if(this._startPromise===pending)this._startPromise=null;}
  }
  _track(node) {this._nodes.push(node);return node;}
  _gain(value) {const n=this._track(this.context.createGain());n.gain.value=value;return n;}
  _filter(type,freq,q=.6) {const n=this._track(this.context.createBiquadFilter());n.type=type;n.frequency.value=freq;n.Q.value=q;return n;}
  _panner(x,y,z,ref=9) {
    const p=this._track(this.context.createPanner());
    p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=ref;p.maxDistance=140;p.rolloffFactor=.65;p.coneInnerAngle=360;p.coneOuterAngle=360;
    this._place(p,x,y,z,0,true);return p;
  }
  _param(param,value,time,constant=.12) {
    if(!param||!Number.isFinite(value))return;
    try {if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(time);else param.cancelScheduledValues(time);param.setTargetAtTime(value,time,constant);} catch {param.value=value;}
  }
  _place(n,x,y,z,time,immediate=false) {
    if(n.positionX) {
      if(immediate) {n.positionX.value=x;n.positionY.value=y;n.positionZ.value=z;}
      else {this._param(n.positionX,x,time,.09);this._param(n.positionY,y,time,.09);this._param(n.positionZ,z,time,.09);}
    } else if(n.setPosition)n.setPosition(x,y,z);
  }
  _buffer() {
    const ctx=this.context,length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),out=buffer.getChannelData(0);
    let pink=0;
    for(let i=0;i<length;i++) {const white=this._random()*2-1;pink=.985*pink+.015*white;out[i]=white*.62+pink*1.6;}
    // Wrap the loop gently: its end meets its beginning without a broadband click.
    const blend=Math.min(512,length>>3);
    for(let i=0;i<blend;i++){const t=i/blend;out[length-blend+i]=out[length-blend+i]*(1-t)+out[i]*t;}
    return buffer;
  }
  _noiseBed(name,{gain=0,frequency=1000,type='lowpass',q=.6,position=null}={}) {
    const ctx=this.context,source=this._track(ctx.createBufferSource()),filter=this._filter(type,frequency,q),volume=this._gain(gain);
    source.buffer=this._noise;source.loop=true;source.connect(filter);filter.connect(volume);
    let panner=null;if(position){panner=this._panner(...position);volume.connect(panner);panner.connect(this._master);}else volume.connect(this._master);
    source.start(0,this._random()*1.9);this._loops.push(source);
    return this._sources[name]={source,filter,gain:volume,panner};
  }
  _toneBed(name,frequencies,{gain=.01,type='sine',frequency=1000,position=[0,0,0]}={}) {
    const volume=this._gain(gain),filter=this._filter('lowpass',frequency),panner=this._panner(...position),oscillators=[];
    for(const hz of frequencies) {const osc=this._track(this.context.createOscillator());osc.type=type;osc.frequency.value=hz;osc.connect(filter);osc.start();this._loops.push(osc);oscillators.push(osc);}
    filter.connect(volume);volume.connect(panner);panner.connect(this._master);
    return this._sources[name]={gain:volume,filter,panner,oscillators};
  }
  _build() {
    const ctx=this.context;
    this._master=this._gain(0);this._master.gain.setTargetAtTime(this.volume*.65,ctx.currentTime,.3);
    const limiter=this._track(ctx.createDynamicsCompressor());limiter.threshold.value=-17;limiter.knee.value=14;limiter.ratio.value=5;limiter.attack.value=.006;limiter.release.value=.23;
    this._master.connect(limiter);limiter.connect(ctx.destination);this._noise=this._buffer();
    this._noiseBed('air',{gain:.011,frequency:1300});
    this._noiseBed('traffic',{gain:.026,frequency:650,position:[16,.8,-12]});
    this._toneBed('engine',[51,76.5],{gain:.009,type:'triangle',frequency:550,position:[16,.8,-12]});
    this._toneBed('machinery',[48,96.3],{gain:.007,frequency:850,position:[-18,2,7]});
    this._noiseBed('vents',{gain:.012,frequency:350,type:'bandpass',q:1.1,position:[-18,3,7]});
    this._toneBed('drone',[139,141.7,209],{gain:.0035,type:'triangle',frequency:950,position:[4,17,-15]});
    this._noiseBed('rain',{gain:0,frequency:3200,type:'highpass',q:.45});
    this._noiseBed('rainLow',{gain:0,frequency:1700,type:'lowpass'});
  }
  setVolume(value) {
    if(!Number.isFinite(value))return;
    this.volume=clamp(value,0,1);
    if(this.context&&this._master)this._param(this._master.gain,this.volume*.65,this.context.currentTime,.08);
  }
  update(dt,player={},environment={},movement={}) {
    if(this.disposed)return;
    dt=Number.isFinite(dt)?clamp(dt,0,.25):0;this._time+=dt;
    if(point(player?.position))for(let i=0;i<3;i++)this._position[i]=player.position[i];
    const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.started)return;
    movement=movement||{};environment=environment||{};
    const speed=Number.isFinite(movement.speed)?Math.max(0,movement.speed):0,grounded=movement.grounded!==false,interior=clamp(Number(movement.interior)||0,0,1),riding=!!movement.riding;
    if(grounded&&!riding&&speed>.3) {
      this._stepDistance+=speed*dt;
      const stride=speed>4?1.52:1.12;
      if(this._stepDistance>=stride&&ctx.currentTime-this._lastStep>.14) {this._stepDistance%=stride;this._lastStep=ctx.currentTime;this._footstep(speed,environment.weather==='rain',interior);}
    } else this._stepDistance=0;
    this._updateClock+=dt;if(this._updateClock<1/30)return;this._updateClock=0;
    const t=ctx.currentTime,p=this._position,yaw=Number.isFinite(player?.yaw)?player.yaw:0,pitch=Number.isFinite(player?.pitch)?player.pitch:0;
    const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),listener=ctx.listener;
    this._place(listener,p[0],p[1]+1.6,p[2],t);
    if(listener.forwardX) {
      this._param(listener.forwardX,-sy*cp,t,.04);this._param(listener.forwardY,sp,t,.04);this._param(listener.forwardZ,-cy*cp,t,.04);
      this._param(listener.upX,sy*sp,t,.04);this._param(listener.upY,cp,t,.04);this._param(listener.upZ,cy*sp,t,.04);
    } else if(listener.setOrientation)listener.setOrientation(-sy*cp,sp,-cy*cp,sy*sp,cp,cy*sp);
    const hour=Number.isFinite(environment.hour)?((environment.hour%24)+24)%24:12,night=hour<6||hour>22,wet=environment.weather==='rain'?1:0;
    const s=this._sources,phase=this._time*.095,traffic=night?.54:1,muffle=1-interior*.67;
    this._param(s.air.gain.gain,.010*(1-interior*.76),t,.8);
    this._param(s.air.filter.frequency,interior?680:1400,t,.5);
    this._param(s.traffic.gain.gain,(.023+.006*Math.sin(phase*2.3))*traffic*muffle,t,.7);
    this._param(s.traffic.filter.frequency,interior?290:750+Math.sin(phase)*130,t,.4);
    this._param(s.engine.gain.gain,(riding?.017:.008)*traffic*muffle,t,.4);
    this._param(s.engine.oscillators[0].frequency,48+(riding?Math.min(speed,18)*3:Math.sin(phase*1.3)*7),t,.25);
    this._param(s.engine.oscillators[1].frequency,73+(riding?Math.min(speed,18)*4.5:Math.sin(phase*1.3)*10),t,.25);
    const tx=p[0]+Math.sin(phase)*27,tz=p[2]-18+Math.cos(phase)*13;
    this._place(s.traffic.panner,tx,p[1]+.7,tz,t);this._place(s.engine.panner,tx,p[1]+.7,tz,t);
    const mx=Math.floor((p[0]+12)/24)*24-6,mz=Math.floor((p[2]+12)/24)*24+8;
    this._place(s.machinery.panner,mx,p[1]+2,mz,t);this._place(s.vents.panner,mx,p[1]+3,mz,t);
    this._param(s.machinery.gain.gain,(environment.power===false?.0015:.0065)*(1-interior*.4),t,.9);
    this._param(s.vents.gain.gain,.010*(1-interior*.45),t,.7);
    const orbit=this._time*.14;
    this._place(s.drone.panner,p[0]+Math.cos(orbit)*20,p[1]+16,p[2]+Math.sin(orbit)*23,t);
    this._param(s.drone.gain.gain,.0033*(1-interior*.8)*(1+Math.sin(orbit*.6)*.25),t,.7);
    this._param(s.drone.oscillators[0].frequency,139+Math.sin(this._time*.6)*4,t,.2);
    this._param(s.rain.gain.gain,wet*.037*(1-interior*.86),t,1.1);
    this._param(s.rainLow.gain.gain,wet*.021*(1-interior*.67),t,1.1);
  }
  _admit(source,nodes,stopTime) {
    while(this._voices.size>=this._maxVoices) {
      const oldest=this._voices.values().next().value;this._finish(oldest,true);
    }
    const voice={source,nodes,done:false};this._voices.add(voice);
    source.onended=()=>this._finish(voice,false);source.stop(stopTime);return voice;
  }
  _finish(voice,stop) {
    if(!voice||voice.done)return;voice.done=true;voice.source.onended=null;
    if(stop)try{voice.source.stop();}catch{}
    for(const n of voice.nodes)try{n.disconnect();}catch{}
    this._voices.delete(voice);
  }
  _eventPanner(position) {
    if(!point(position))return null;
    const n=this.context.createPanner();n.panningModel='HRTF';n.distanceModel='inverse';n.refDistance=3;n.maxDistance=65;n.rolloffFactor=.8;
    this._place(n,position[0],position[1]+.7,position[2],this.context.currentTime,true);n.connect(this._master);return n;
  }
  _note(frequency,offset,duration,type,gain,position,slide=1) {
    const ctx=this.context,osc=ctx.createOscillator(),envelope=ctx.createGain(),at=ctx.currentTime+offset;
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);if(slide!==1)osc.frequency.exponentialRampToValueAtTime(Math.max(20,frequency*slide),at+duration);
    envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(gain,at+.012);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
    const panner=this._eventPanner(position),nodes=[osc,envelope];osc.connect(envelope);envelope.connect(panner||this._master);if(panner)nodes.push(panner);
    osc.start(at);this._admit(osc,nodes,at+duration+.025);
  }
  _footstep(speed,wet,interior) {
    const ctx=this.context,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain(),at=ctx.currentTime;
    source.buffer=this._noise;source.playbackRate.value=.78+this._random()*.34;
    filter.type='bandpass';filter.frequency.value=(wet?1550:interior?720:1050)*( .82+this._random()*.36);filter.Q.value=wet?.45:.8;
    const gain=(speed>4?.055:.037)*(.83+this._random()*.26),duration=wet?.13:.085;
    envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(gain,at+.004);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(envelope);
    const nodes=[source,filter,envelope];
    if(ctx.createStereoPanner) {const pan=ctx.createStereoPanner();pan.pan.value=(this._foot++%2?1:-1)*.14;envelope.connect(pan);pan.connect(this._master);nodes.push(pan);}else envelope.connect(this._master);
    source.start(at,this._random()*1.6);this._admit(source,nodes,at+duration+.015);
    this._note(72+this._random()*23,0,.085,'sine',speed>4?.026:.018,null,.68);
  }
  play(name,position) {
    if(this.disposed||!this.started||this.context?.state!=='running'||!NOTES[name])return false;
    for(const n of NOTES[name])this._note(n[0],n[1],n[2],n[3],n[4],position,name==='damage'?.57:name==='jump'?1.8:1);
    return true;
  }
  _release() {
    for(const voice of this._voices)this._finish(voice,true);
    for(const source of this._loops)try{source.stop();}catch{}
    for(const n of this._nodes)try{n.disconnect();}catch{}
    this._loops.length=0;this._nodes.length=0;this._voices.clear();this._sources={};this._master=null;this._noise=null;
    const ctx=this.context;this.context=null;this.started=false;
    if(ctx&&ctx.state!=='closed')try{const closing=ctx.close();if(closing?.catch)closing.catch(()=>{});}catch{}
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this._release();
  }
}
