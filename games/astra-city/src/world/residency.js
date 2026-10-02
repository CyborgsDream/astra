/* GPU residency selection for Switchback Ward. CPU world data stays deterministic;
   only the nearby static cell neighborhood is uploaded to the renderer. */
const finitePoint=p=>Array.isArray(p)&&p.length>=3&&Number.isFinite(p[0])&&Number.isFinite(p[2]);
const distanceToBounds=(x,z,b)=>{
  const dx=x<b[0]?b[0]-x:x>b[2]?x-b[2]:0;
  const dz=z<b[1]?b[1]-z:z>b[3]?z-b[3]:0;
  return dx*dx+dz*dz;
};

export function selectResidentCells(cells,position,radius=1){
  if(!Array.isArray(cells)||!cells.length)return new Set();
  const p=finitePoint(position)?position:[0,0,0];
  radius=Math.max(0,Math.floor(Number.isFinite(radius)?radius:1));
  let current=null,best=Infinity;
  for(const cell of cells){
    if(!cell||!Array.isArray(cell.bounds)||cell.bounds.length<4)continue;
    const b=cell.bounds;
    if(p[0]>=b[0]&&p[0]<b[2]&&p[2]>=b[1]&&p[2]<b[3]){current=cell;break;}
    const d=distanceToBounds(p[0],p[2],b);
    if(d<best){best=d;current=cell;}
  }
  if(!current)return new Set();
  const hasGrid=Number.isFinite(current.x)&&Number.isFinite(current.z);
  const selected=new Set();
  for(const cell of cells){
    if(!cell?.id)continue;
    if(hasGrid&&Number.isFinite(cell.x)&&Number.isFinite(cell.z)){
      if(Math.abs(cell.x-current.x)<=radius&&Math.abs(cell.z-current.z)<=radius)selected.add(cell.id);
    }else if(cell===current)selected.add(cell.id);
  }
  if(!selected.size&&current.id)selected.add(current.id);
  return selected;
}
