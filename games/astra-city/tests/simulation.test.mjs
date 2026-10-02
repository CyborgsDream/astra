import test from 'node:test';
import assert from 'node:assert/strict';
import { Population } from '../src/world/population.js';
import { CityAudio } from '../src/engine/audio.js';

function world() {
  const navNodes=[],navEdges=[],xs=[-80,-40,0,40,80],zs=[-60,-20,20,60];
  for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++) {
    const id=`foot-${x}-${z}`;navNodes.push({id,position:[xs[x],0,zs[z]],kind:'foot'});
    if(x)navEdges.push([`foot-${x-1}-${z}`,id]);if(z)navEdges.push([`foot-${x}-${z-1}`,id]);
  }
  navNodes.push({id:'upper-a',position:[-30,12.6,30],kind:'foot'},{id:'upper-b',position:[10,12.6,30],kind:'foot'});
  navEdges.push(['upper-a','upper-b']);
  navNodes.push({id:'air-a',position:[-70,19,-15],kind:'air'},{id:'air-b',position:[70,19,-15],kind:'air'},{id:'air-c',position:[70,19,45],kind:'air'});
  navEdges.push(['air-a','air-b'],['air-b','air-c']);
  const roads=[-60,0,60].map(z=>({points:[[-90,z],[90,z]],width:10}));
  for(const x of [-80,0,80])roads.push({points:[[x,-75],[x,75]],width:9});
  return {seed:73191,navNodes,navEdges,roads,spawn:{position:[-15,0,-25]},interactables:[
    {id:'mara',name:'Mara',type:'npc',position:[-17,0,-17]},
    {id:'ivo',name:'Ivo',type:'npc',position:[-36,0,-17]},
    {id:'sana',name:'Sana',type:'npc',position:[-47,0,11]},
    {id:'orin',name:'Orin',type:'npc',position:[38,0,23]},
    {id:'rescue',name:'Maintenance worker',type:'npc',position:[8,12.6,33]},
    {id:'home',type:'door',position:[-34,4.2,-47]},
    {id:'market_drop',type:'container',position:[8,0,20]},
    {id:'workshop',type:'shop',position:[-32,0,-11]}
  ],tramRoute:{points:[[-80,8.4,61],[80,8.4,61]],stops:[[13,8.4,61]]}};
}
const finiteInstances=p=>{
  for(const i of p.instances()) {
    assert.ok(['box','sphere','cylinder','cone','quad'].includes(i.mesh));
    for(const key of ['position','rotation','scale','color']) assert.ok(i[key].length===3&&i[key].every(Number.isFinite),`${key}: ${JSON.stringify(i[key])}`);
    assert.ok(i.scale.every(n=>n>0));assert.ok(i.color.every(n=>n>=0&&n<=1));
  }
};
const positionSnapshot=p=>p._actors.map(a=>[a.id,...a.position,a.yaw,a.speed,a.path.join(':')]);

test('ambient pedestrians retain stairs and steps while excluding lift and ladder edges',()=>{
  for(const neighboursOnly of [false,true]){
    const navNodes=[
      {id:'a',kind:'foot',position:[0,0,0],neighbours:['b','lift']},
      {id:'b',kind:'foot',position:[6,0,0],neighbours:['stairs','step']},
      {id:'stairs',kind:'foot',position:[12,3,0]},
      {id:'step',kind:'foot',position:[6,.2,.1]},
      {id:'lift',kind:'foot',position:[0,8.4,0],neighbours:['upper']},
      {id:'upper',kind:'foot',position:[6,8.4,0]}
    ];
    const navEdges=neighboursOnly?[]:[['a','b'],['a','lift'],['b','stairs'],['b','step'],['lift','upper']];
    const p=new Population({navNodes,navEdges,interactables:[]});
    const linked=(a,b)=>p._foot.nodes[p._foot.ids.get(a)].links.some(e=>e.to===p._foot.ids.get(b));
    assert.equal(linked('a','lift'),false);
    assert.equal(linked('b','stairs'),true);
    assert.equal(linked('b','step'),true);
    for(let i=0;i<60;i++)p.update(1/30,{position:[50,0,50]},{});
    for(const actor of p._people)for(let i=1;i<actor.path.length;i++){
      const a=actor.graph.nodes[actor.path[i-1]].p,b=actor.graph.nodes[actor.path[i]].p;
      assert.ok(Math.abs(b[1]-a[1])<=.35 || Math.abs(b[1]-a[1])<=Math.hypot(b[0]-a[0],b[2]-a[2])*.8);
    }
    p.dispose();
  }
});

test('contract instances contain recognisable articulated actors and bounded traffic',()=>{
  const p=new Population(world());
  assert.deepEqual(p.getStats(),{npcCount:53,trafficCount:14});
  assert.deepEqual(new Set(p._people.map(a=>a.role)),new Set(['resident','worker','vendor','security','courier']));
  assert.ok(p._people.every(a=>a.human&&a.human.arms.length===2&&a.human.legs.length===2&&a.parts.length>=22));
  assert.deepEqual(new Set(p._traffic.map(a=>a.kind)),new Set(['car','scooter','van','robot','drone','tram']));
  assert.ok(p.instances().length>1500&&p.instances().length<3000);finiteInstances(p);
  const instances=p.instances(),part=instances[0];p.update(1/60,{position:[0,0,0]},{hour:13,weather:'clear'});
  assert.equal(p.instances(),instances);assert.equal(p.instances()[0],part);
  p.dispose();
});

test('same seed and inputs produce deterministic routes, variations, and animation',()=>{
  const a=new Population(world(),654),b=new Population(world(),654),c=new Population(world(),655);
  assert.deepEqual(positionSnapshot(a),positionSnapshot(b));assert.notDeepEqual(positionSnapshot(a),positionSnapshot(c));
  for(let i=0;i<240;i++){const player={position:[Math.sin(i*.02)*12,0,-25]},env={hour:8+i/120,weather:i<120?'clear':'rain'};a.update(1/30,player,env);b.update(1/30,player,env);}
  assert.deepEqual(positionSnapshot(a),positionSnapshot(b));
  assert.deepEqual(a.instances(),b.instances());a.dispose();b.dispose();c.dispose();
});

test('long run stays on connected graph routes and keeps authored interaction space clear',()=>{
  const p=new Population(world()),initial=new Map(p._actors.map(a=>[a.id,[...a.position]]));
  let stoppedVehicles=0,stationDwell=false;
  for(let frame=0;frame<2100;frame++) {
    p.update(1/30,{position:[-15,0,-25]},{hour:frame<1000?14:1,weather:frame<800?'clear':'rain'});
    if(frame%100===0) {
      finiteInstances(p);
      for(const a of p._actors) {
        assert.ok(a.position.every(Number.isFinite));
        if(a.authored) {assert.deepEqual(a.position,initial.get(a.id));continue;}
        if(a.rail) {assert.ok(Math.abs(a.position[1]-8.4)<1e-8);assert.ok(Math.abs(a.position[2]-61)<1e-8);continue;}
        for(let i=1;i<a.path.length;i++) assert.ok(a.graph.nodes[a.path[i-1]].links.some(e=>e.to===a.path[i]),`disconnected route ${a.id}`);
        assert.equal(a.graph.nodes[a.path[0]].component,a.graph.nodes[a.path.at(-1)].component);
        if(a.motor){assert.equal(a.graph,p._road);if(a.idleLeft>0||a.speed<.3)stoppedVehicles++;}
        if(a.segment<a.path.length-1) {
          const u=a.graph.nodes[a.path[a.segment]].p,v=a.graph.nodes[a.path[a.segment+1]].p;
          const t=a.progress/Math.hypot(v[0]-u[0],v[1]-u[1],v[2]-u[2]);
          assert.ok(t>=-1e-8&&t<=1.000001);
          assert.ok(Math.abs(a.position[1]-a.altitude-(u[1]+(v[1]-u[1])*t))<1e-6,`vertical route drift ${a.id}`);
          assert.ok(Math.hypot(a.position[0]-(u[0]+(v[0]-u[0])*t),a.position[2]-(u[2]+(v[2]-u[2])*t))<=2.41);
        }
      }
    }
    const tram=p._traffic.find(a=>a.kind==='tram');
    if(Math.abs(tram.position[0]-13)<.01&&tram.idleLeft>1)stationDwell=true;
  }
  const walking=p._people.filter(a=>!a.authored),moved=walking.filter(a=>Math.hypot(...a.position.map((v,i)=>v-initial.get(a.id)[i]))>4).length;
  assert.ok(moved>=walking.length*.7,`only ${moved} walkers moved`);assert.ok(stoppedVehicles>0);assert.ok(stationDwell);
  for(const a of walking)for(const b of p._authored)assert.ok(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))>1.15,`${a.id} crowds ${b.id}`);
  p.dispose();
});

test('road intersections generate connected fallback routes without inventing diagonal links',()=>{
  const p=new Population({roads:[{points:[[-30,0],[30,0]],width:8},{points:[[0,-30],[0,30]],width:8}],interactables:[]});
  assert.equal(p._road.components.length,1);assert.equal(p._road.edges.length,4);assert.equal(p._foot,p._road);
  for(const e of p._road.edges) {const a=p._road.nodes[e.a].p,b=p._road.nodes[e.b].p;assert.ok(a[0]===b[0]||a[2]===b[2]);}
  for(let i=0;i<180;i++)p.update(1/30,{position:[200,0,200]},{});
  finiteInstances(p);p.dispose();
});

test('sparse and malformed world fields remain safe; corrupt motion recovers',()=>{
  for(const w of [{},null,{navNodes:[{id:'bad',position:[NaN,1,0]}],navEdges:[null,['bad','missing']],roads:[null,{points:[]}],interactables:[null,{}]}]) {
    const p=new Population(w);p.update(undefined,null,null);p.update(Infinity,{},{});p.update(-4);finiteInstances(p);p.dispose();
  }
  const p=new Population(world());
  p._people[0].position[0]=NaN;p._people[8].speed=Infinity;p._traffic[0].position[2]=Infinity;
  p._traffic[1].path[1]=100000;p._people[9].yaw=NaN;p._people[10].progress=Infinity;
  p.update(.1,{position:[NaN,0,0]},{hour:NaN});finiteInstances(p);
  assert.ok(p._actors.every(a=>a.position.every(Number.isFinite)&&Number.isFinite(a.speed)&&Number.isFinite(a.yaw)));
  assert.deepEqual(p._people[0].position,world().interactables[0].position);p.dispose();
});

test('nearby is sorted and returns safe snapshots; dispose releases references',()=>{
  const p=new Population(world()),near=p.nearby([-17,0,-17],4);
  assert.equal(near[0].id,'mara');assert.ok(near[0].authored);
  for(let i=1;i<near.length;i++)assert.ok(near[i].distance>=near[i-1].distance);
  near[0].position[0]=999;assert.equal(p._people[0].position[0],-17);
  const instances=p.instances();p.dispose();p.dispose();p.update(.1,{position:[0,0,0]},{});
  assert.equal(instances.length,0);assert.equal(p._actors.length,0);assert.equal(p._foot,null);
  assert.deepEqual(p.getStats(),{npcCount:0,trafficCount:0});assert.deepEqual(p.nearby([0,0,0],1000),[]);
});

test('audio stays silent before gesture start and handles unsupported contexts',async()=>{
  const a=new CityAudio();assert.equal(a.context,null);
  a.update(.1,{position:[0,0,0]},{weather:'rain'},{speed:4,grounded:true});assert.equal(a.context,null);assert.equal(a.play('complete'),false);
  a.setVolume(4);assert.equal(a.volume,1);a.setVolume(-4);assert.equal(a.volume,0);a.setVolume(NaN);assert.equal(a.volume,0);
  if(!globalThis.AudioContext&&!globalThis.webkitAudioContext)assert.equal(await a.start(),false);
  a.dispose();a.dispose();assert.equal(await a.start(),false);assert.equal(a.play('interact'),false);
});

test('developer spawn snaps to foot navigation, moves, and observes the people limit',()=>{
  const p=new Population(world()),result=p.spawn('security',[41,0,-17]);assert.equal(result.ok,true);assert.equal(result.role,'security');
  assert.deepEqual(result.position,[40,0,-20]);assert.equal(p.getStats().npcCount,54);
  const actor=p._people.at(-1),start=[...actor.position];for(let i=0;i<180;i++)p.update(1/30,{position:[0,0,0]},{});
  assert.notDeepEqual(actor.position,start);assert.equal(actor.graph,p._foot);
  while(p.getStats().npcCount<128)assert.ok(p.spawn('resident',[80,0,60]).ok);
  assert.equal(p.spawn('resident',[0,0,0]).ok,false);finiteInstances(p);p.dispose();assert.equal(p.spawn().ok,false);
  const empty=new Population();assert.equal(empty.spawn().ok,false);empty.dispose();
});
