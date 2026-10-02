const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class SecuritySystem {
  constructor(world,collision) {
    this.collision=collision;
    const archive=world.interactables.find(i=>i.id==='archive');
    this.sensors=archive ? [-1,1].map((side,i)=>({id:`archive-sensor-${i}`,position:[archive.position[0]+side*5,archive.position[1]+3,archive.position[2]+2],phase:i*2.3,alert:0})) : [];
    this.exposure=0;
    this.damageClock=0;
    this.list=[];
  }
  update(dt,player,state,time) {
    const disabled=state.world.flags?.securityDisabled || state.world.repaired?.includes('archive');
    if(disabled){this.exposure=0;this.damageClock=0;for(const sensor of this.sensors)sensor.alert=0;}
    let detected=false;
    this.list.length=0;
    for(const sensor of this.sensors){
      const p=sensor.position,phase=Math.sin(time*.28+sensor.phase)*1.35;
      const range=player.crouched?5.2:11;
      const near=distance(player.position,p)<range && Math.abs(player.position[1]+1-p[1])<4;
      const dx=player.position[0]-p[0],dz=player.position[2]-p[2];
      const facing=(Math.sin(phase)*dx+Math.cos(phase)*dz)/Math.max(.1,Math.hypot(dx,dz));
      const sees=!disabled && near && facing>-.15 && this.collision.lineOfSight(p,[player.position[0],player.position[1]+(player.crouched?.65:1.25),player.position[2]]);
      detected ||= sees;
      sensor.alert += ((sees?1:0)-sensor.alert)*Math.min(1,dt*3);
      const color=disabled?[.18,.32,.26]:sensor.alert>.15?[.9,.16,.09]:[.64,.3,.11];
      this.list.push({mesh:'box',position:p,scale:[.54,.35,.45],rotation:[0,phase,0],color:[.18,.21,.2],material:1,detail:0});
      this.list.push({mesh:'sphere',position:[p[0]+Math.sin(phase)*.25,p[1],p[2]+Math.cos(phase)*.25],scale:[.18,.18,.18],color,material:6,emissive:disabled?.25:2,detail:0});
      this.list.push({mesh:'cylinder',position:[p[0],p[1]-.5,p[2]],scale:[.07,1,.07],color:[.32,.34,.31],material:1,detail:0});
    }
    this.exposure=Math.max(0,Math.min(1,this.exposure+(detected?dt*.36:-dt*.27)));
    this.damageClock+=dt;
    if(!disabled && this.exposure>=.98 && this.damageClock>=1.2){this.damageClock=0;return {damage:5,message:'Security pulse. Break line of sight or crouch behind cover.'};}
    return {damage:0,detected,exposure:this.exposure};
  }
  instances(){return this.list;}
}
