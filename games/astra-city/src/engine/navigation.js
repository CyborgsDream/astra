export class Navigation {
  constructor(world) {
    this.nodes = new Map((world.navNodes || []).map(n => [n.id, n]));
    this.edges = new Map([...this.nodes.keys()].map(id => [id, []]));
    const add = (a,b) => {
      if (!this.nodes.has(a) || !this.nodes.has(b)) return;
      const p=this.nodes.get(a).position,q=this.nodes.get(b).position;
      const cost=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
      if (!this.edges.get(a).some(e=>e.id===b)) this.edges.get(a).push({id:b,cost});
    };
    for(const [a,b] of world.navEdges || []){add(a,b);add(b,a);}
    for(const n of this.nodes.values())for(const id of n.neighbours || [])add(n.id,id);
  }

  nearest(position,kind='foot') {
    let best=null,distance=Infinity;
    for(const node of this.nodes.values()){
      if(node.kind && node.kind!==kind)continue;
      const p=node.position;
      const d=Math.hypot(p[0]-position[0],(p[1]-position[1])*3,p[2]-position[2]);
      if(d<distance){distance=d;best=node.id;}
    }
    return best;
  }

  route(from,to) {
    const start=this.nearest(from),end=this.nearest(to);
    if(start===null || end===null)return [];
    const dist=new Map([[start,0]]),prev=new Map(),remaining=new Set([start]),closed=new Set();
    while(remaining.size){
      let current=null,best=Infinity;
      for(const id of remaining)if(dist.get(id)<best){best=dist.get(id);current=id;}
      if(current===end)break;
      remaining.delete(current);closed.add(current);
      for(const edge of this.edges.get(current) || []){
        if(closed.has(edge.id))continue;
        const next=best+edge.cost;
        if(next<(dist.get(edge.id)??Infinity)){dist.set(edge.id,next);prev.set(edge.id,current);remaining.add(edge.id);}
      }
    }
    if(start!==end && !prev.has(end))return [];
    const path=[end];let cursor=end;
    while(cursor!==start){cursor=prev.get(cursor);if(cursor===undefined)return [];path.unshift(cursor);}
    return [...path.map(id=>[...this.nodes.get(id).position]),[...to]];
  }
}

export function projectPoint(point,camera,width,height) {
  const dx=point[0]-camera.position[0],dy=point[1]-camera.position[1],dz=point[2]-camera.position[2];
  const sy=Math.sin(camera.yaw),cy=Math.cos(camera.yaw),sp=Math.sin(camera.pitch),cp=Math.cos(camera.pitch);
  const depth=dx*(-sy*cp)+dy*sp+dz*(-cy*cp);
  if(depth<=.15)return null;
  const right=dx*cy-dz*sy,up=dx*sy*sp+dy*cp+dz*cy*sp;
  const focal=height/(2*Math.tan(camera.fov*Math.PI/360));
  return {x:width/2+right/depth*focal,y:height/2-up/depth*focal,depth};
}
