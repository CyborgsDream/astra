import {readFile} from 'fs/promises';
import {createHash} from 'crypto';
const source=await readFile(new URL('../src/world/district.js',import.meta.url),'utf8');
const {generateDistrict}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const required=['mara','ivo','sana','orin','relay','pump','cache','archive','clinic_drop','market_drop','rooftop_drop','rescue','home','workshop','kiosk','scooter','transit_market','transit_works','transit_roof','lift_ground','lift_roof','garden','memorial','grid_switch','service_door','rooftop_ladder'];
const radius=.32,height=1.76;
function blockers(w,p){return w.colliders.filter(c=>c.type!=='door'&&c.max[1]>p[1]+.42&&c.min[1]<p[1]+height-.015&&p[0]>c.min[0]-radius+.006&&p[0]<c.max[0]+radius-.006&&p[2]>c.min[2]-radius+.006&&p[2]<c.max[2]+radius-.006);}
function support(w,p){return w.colliders.some(c=>c.type!=='door'&&Math.abs(c.max[1]-p[1])<.15&&p[0]>c.min[0]-.02&&p[0]<c.max[0]+.02&&p[2]>c.min[2]-.02&&p[2]<c.max[2]+.02)||w.ramps.some(r=>{if(p[0]<r.x-r.width/2||p[0]>r.x+r.width/2||p[2]<r.z-r.depth/2||p[2]>r.z+r.depth/2)return false;const t=r.axis==='x'?(p[0]-r.x)/r.width+.5:(p[2]-r.z)/r.depth+.5;return Math.abs(r.y0+(r.y1-r.y0)*t-p[1])<.3;});}
const seedOption=process.argv.find(a=>a.startsWith('--seed='));
const testSeed=seedOption?Number(seedOption.slice(7)):73191;
if(!Number.isFinite(testSeed))throw new Error('--seed must be a finite number');
const start=performance.now(),w=generateDistrict(testSeed),generationMs=performance.now()-start;
const badTransforms=w.instances.filter(o=>![...o.position,...o.scale,...o.color,...(o.rotation||[])].every(Number.isFinite)||o.scale.some(v=>v<=0));
const blockedTargets=w.interactables.map(t=>({id:t.id,hits:blockers(w,t.position).map(c=>c.id)})).filter(t=>t.hits.length);
const unsupportedTargets=w.interactables.filter(t=>!support(w,t.position)).map(t=>t.id);
const sourceNode=w.navNodes.filter(n=>n.kind==='foot'&&Math.abs(n.position[1])<.1).sort((a,b)=>Math.hypot(a.position[0]-w.spawn.position[0],a.position[2]-w.spawn.position[2])-Math.hypot(b.position[0]-w.spawn.position[0],b.position[2]-w.spawn.position[2]))[0];
const nodes=new Map(w.navNodes.map(n=>[n.id,n])),seen=new Set([sourceNode.id]),queue=[sourceNode.id];
for(let i=0;i<queue.length;i++)for(const id of nodes.get(queue[i]).neighbours||[])if(!seen.has(id)){seen.add(id);queue.push(id);}
const disconnected=w.interactables.filter(t=>!seen.has('target_'+t.id)).map(t=>t.id);
const rampIssues=[];
for(const r of w.ramps){const len=r.axis==='x'?r.width:r.depth;for(let distance=.36;distance<len-.25;distance+=.38){const t=distance/len,p=[r.x+(r.axis==='x'?(t-.5)*r.width:0),r.y0+(r.y1-r.y0)*t,r.z+(r.axis==='z'?(t-.5)*r.depth:0)],hits=blockers(w,p);if(hits.length){rampIssues.push({id:r.id,p,hits:hits.map(c=>c.id)});break;}}}
const walkIssues=[];
for(const path of w.routeMetadata.paths){if(path.mode!=='walk')continue;for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],len=Math.hypot(a[0]-b[0],a[2]-b[2]);if(Math.abs(a[1]-b[1])/(len||.01)>.65)continue;for(let d=0;d<=len;d+=.38){const t=len?d/len:0,p=a.map((v,k)=>v+(b[k]-v)*t),hits=blockers(w,p);if(hits.length){walkIssues.push({id:path.id,segment:i,p,hits:hits.map(c=>c.id)});break;}}}}
const unsupportedWalk=[];
for(const path of w.routeMetadata.paths){if(path.mode!=='walk')continue;for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],len=Math.hypot(a[0]-b[0],a[2]-b[2]);if(Math.abs(a[1]-b[1])/(len||.01)>.65)continue;for(let d=0;d<=len;d+=.31){const p=a.map((v,k)=>v+(b[k]-v)*(d/len||0));if(!support(w,p)){unsupportedWalk.push({id:path.id,segment:i,p});break;}}}}
const missing=required.filter(id=>!w.interactables.some(t=>t.id===id));
const hashWorld=x=>createHash('sha256').update(JSON.stringify({instances:x.instances,colliders:x.colliders,ramps:x.ramps,interactables:x.interactables})).digest('hex');
const deterministic=hashWorld(w)===hashWorld(generateDistrict(testSeed));
const tramRouteValid=Array.isArray(w.tramRoute?.points)&&w.tramRoute.points.length>=2&&w.tramRoute.points.every(p=>p.length===3&&p.every(Number.isFinite)&&Math.abs(p[1]-8.4)<.001&&Math.abs(p[2]-61)<.001)&&w.tramRoute.stops.some(p=>Math.abs(p[0]-13)<.001);
const doorOwnershipValid=w.instances.filter(i=>i.owner==='service_door').length===1&&w.colliders.some(c=>c.type==='door'&&c.owner==='service_door');
const report={seed:w.seed,name:w.name,generationMs:Math.round(generationMs),validationMs:Math.round(performance.now()-start),instances:w.instances.length,colliders:w.colliders.length,ramps:w.ramps.length,targets:w.interactables.length,signs:w.signs.length,locations:w.locations.length,cells:w.cells.length,nodes:w.navNodes.length,edges:w.navEdges.length,badTransforms:badTransforms.length,blockedTargets,unsupportedTargets,missing,disconnected,rampIssues,walkIssues,unsupportedWalk,deterministic,tramRouteValid,doorOwnershipValid,spawn:w.spawn,tramRoute:w.tramRoute};
console.log(JSON.stringify(report,null,2));
if(badTransforms.length||blockedTargets.length||unsupportedTargets.length||missing.length||disconnected.length||rampIssues.length||walkIssues.length||unsupportedWalk.length||!deterministic||!tramRouteValid||!doorOwnershipValid)process.exitCode=1;
