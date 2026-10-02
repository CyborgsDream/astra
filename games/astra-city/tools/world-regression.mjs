import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';

const value=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const source=resolve(value('source',new URL('..',import.meta.url).pathname));
const seconds=Number(value('seconds',300)),seed=Number(value('seed',73191));
const {generateDistrict}=await import(pathToFileURL(resolve(source,'src/world/district.js')));
const {Population}=await import(pathToFileURL(resolve(source,'src/world/population.js')));
const {CollisionWorld}=await import(pathToFileURL(resolve(source,'src/engine/physics.js')));
const world=generateDistrict(seed),collision=new CollisionWorld(world.colliders,world.ramps);
collision.setOpen(['service_door']);
const population=new Population(world,seed,collision);
const issueMaps={pedestrians:new Map(),vehicles:new Map(),drones:new Map(),unsupported:new Map()};
const initial=new Map(population._people.map(a=>[a.id,[...a.position]]));
for(let frame=0;frame<seconds*30;frame++) {
  population.update(1/30,{position:world.spawn.position},{hour:14,weather:'clear'});
  if(frame%5)continue;
  for(const actor of population._actors) {
    if(actor.authored||actor.rail)continue;
    const radius=actor.motor?actor.width/2:actor.kind==='drone'?.75:.27;
    const height=actor.motor?1.7:actor.kind==='drone'?.5:1.76;
    const hits=collision.query(actor.position[0],actor.position[2],radius+.1).filter(c=>
      c.max[1]>actor.position[1]+.42&&c.min[1]<actor.position[1]+height-.01&&collision.horizontalOverlap(actor.position,c,radius));
    const group=actor.motor?'vehicles':actor.kind==='drone'?'drones':'pedestrians';
    const entry=()=>({id:actor.id,time:frame/30,position:actor.position.map(v=>+v.toFixed(4)),
      hits:hits.map(c=>c.id),path:actor.path.slice(actor.segment,actor.segment+2).map(n=>actor.graph.nodes[n].id)});
    if(hits.length&&!issueMaps[group].has(actor.id))issueMaps[group].set(actor.id,entry());
    if(!actor.motor&&actor.kind!=='drone'&&!Number.isFinite(collision.floorAt(actor.position,.23,.5,.5))&&!issueMaps.unsupported.has(actor.id))issueMaps.unsupported.set(actor.id,entry());
  }
}

// Check whole flight segments, not just the two drones' sampled positions.
const nodeById=new Map(world.navNodes.map(n=>[n.id,n]));
function intersects(a,b,c,padding=.75) {
  let enter=0,leave=1;
  for(let axis=0;axis<3;axis++) {
    const delta=b[axis]-a[axis],lo=c.min[axis]-padding,hi=c.max[axis]+padding;
    if(Math.abs(delta)<1e-9) {if(a[axis]<lo||a[axis]>hi)return false;}
    else {const p=(lo-a[axis])/delta,q=(hi-a[axis])/delta;enter=Math.max(enter,Math.min(p,q));leave=Math.min(leave,Math.max(p,q));if(enter>leave)return false;}
  }
  return true;
}
const airEdges=world.navEdges.filter(([a,b])=>nodeById.get(a).kind==='air'&&nodeById.get(b).kind==='air');
const obstructedAirEdges=airEdges.map(([a,b])=>({edge:[a,b],hits:world.colliders.filter(c=>intersects(nodeById.get(a).position,nodeById.get(b).position,c)).map(c=>c.id)})).filter(e=>e.hits.length);

// Exercise the real controller collision solver on every authored walking route.
const routeFailures=[];
for(const route of world.routeMetadata.paths) {
  let position=[...route.points[0]],velocity=[0,0,0],grounded=true;
  for(let segment=1;segment<route.points.length;segment++) {
    if(route.segments[segment-1].mode!=='walk'){position=[...route.points[segment]];continue;}
    const target=route.points[segment],distance=Math.hypot(target[0]-position[0],target[2]-position[2]);
    let reached=false;
    for(let frame=0;frame<Math.ceil((distance/2+4)*100);frame++) {
      const dx=target[0]-position[0],dz=target[2]-position[2],remaining=Math.hypot(dx,dz);
      if(remaining<.035&&Math.abs(target[1]-position[1])<.14){reached=true;break;}
      const speed=Math.min(2,remaining/.01);velocity[0]=dx/(remaining||1)*speed;velocity[2]=dz/(remaining||1)*speed;velocity[1]=Math.max(-30,velocity[1]-.19);
      grounded=collision.move(position,velocity,.01,{grounded}).grounded;
    }
    if(!reached){routeFailures.push({route:route.id,segment,target,position});break;}
  }
}
const walkers=population._people.filter(a=>!a.authored);
const movingWalkers=walkers.filter(a=>Math.hypot(...a.position.map((v,i)=>v-initial.get(a.id)[i]))>4).length;
const report={source,seed,seconds,population:population.getStats(),movingWalkers,totalWalkers:walkers.length,
  roadNodes:population._road.nodes.length,roadComponents:population._road.components.length,
  roadWidths:[...new Set(population._road.edges.map(e=>e.width))].sort((a,b)=>a-b),
  physicalRoadWidths:[...new Set(world.roads.map(r=>r.width))].sort((a,b)=>a-b),
  issues:Object.fromEntries(Object.entries(issueMaps).map(([name,issues])=>[name,{count:issues.size,examples:[...issues.values()].slice(0,6)}])),
  airEdges:airEdges.length,obstructedAirEdges,routeFailures};
report.passed=!Object.values(issueMaps).some(m=>m.size)&&!obstructedAirEdges.length&&!routeFailures.length&&movingWalkers>=walkers.length*.5&&JSON.stringify(report.roadWidths)===JSON.stringify(report.physicalRoadWidths);
const output=JSON.stringify(report,null,2);
if(value('output',null))await writeFile(resolve(value('output','')),`${output}\n`);
console.log(output);
if(!report.passed)process.exitCode=1;
