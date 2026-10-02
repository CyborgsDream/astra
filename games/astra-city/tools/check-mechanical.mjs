import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';

const argument=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const source=resolve(argument('source',new URL('..',import.meta.url).pathname));
const {generateDistrict}=await import(pathToFileURL(resolve(source,'src/world/district.js')));
const {CollisionWorld,PlayerController}=await import(pathToFileURL(resolve(source,'src/engine/physics.js')));
const world=generateDistrict(Number(argument('seed',73191)));
const collision=new CollisionWorld(world.colliders,world.ramps);
const results=[];
for(const target of world.interactables.filter(t=>t.type==='ladder'||t.type==='elevator')) {
  const from=[...target.position],to=[...target.target];
  const fromFloor=collision.floorAt(from,.32,.05,.15),toFloor=collision.floorAt(to,.32,.05,.15);
  const row={id:target.id,type:target.type,from,to,fromFloor,toFloor,
    fromSupported:Number.isFinite(fromFloor)&&Math.abs(fromFloor-from[1])<.05,
    toSupported:Number.isFinite(toFloor)&&Math.abs(toFloor-to[1])<.05,
    fromClear:!collision.blocked(from,.32,1.76),toClear:!collision.blocked(to,.32,1.76)};
  if(target.type==='elevator') {
    row.mode='opaque ride transition';
    row.passed=row.fromSupported&&row.toSupported&&row.fromClear&&row.toClear;
  } else {
    row.mode='visible waypoint climb';row.waypoints=target.travelPath;
    const player=new PlayerController(collision,{position:from,yaw:0});
    const path=target.travelPath||[];
    const length=path.reduce((n,p,i)=>n+Math.hypot(...p.map((v,k)=>v-(i?path[i-1]:from)[k])),0);
    const duration=Math.max(1,length/2.5);
    row.accepted=player.moveAlongPath?.(path,duration,'ladder')??false;
    row.blockedFrames=0;row.sweptSegmentsClear=true;
    for(let i=1;i<path.length;i++)if(!collision.canTraverse(path[i-1],path[i],.32,1.76))row.sweptSegmentsClear=false;
    const input={forward:0,right:0,sprint:false,crouch:false,jumpHeld:false};
    const state={player:{energy:100,equipment:[]}};
    if(row.accepted)for(let i=0;i<Math.ceil(duration*120)+1&&player.travel;i++) {
      player.update(1/120,input,state);
      if(collision.blocked(player.position,.32,1.76))row.blockedFrames++;
    }
    row.arrived=player.position.every((v,i)=>Math.abs(v-to[i])<.0001)&&!player.travel;
    row.passed=row.fromSupported&&row.toSupported&&row.fromClear&&row.toClear&&row.accepted&&row.sweptSegmentsClear&&!row.blockedFrames&&row.arrived;
  }
  results.push(row);
}
const report={source,seed:world.seed,trips:results.length,passed:results.every(r=>r.passed),results};
const output=JSON.stringify(report,null,2);
if(argument('output',null))await writeFile(resolve(argument('output','')),`${output}\n`);
console.log(output);if(!report.passed)process.exitCode=1;
