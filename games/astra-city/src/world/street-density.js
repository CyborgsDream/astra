/* ASTRA CITY street-level density pass.
   Deterministic, semantically placed shared primitive detail. This pass never
   changes district bounds, collision, mission topology, or traversal routes. */

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(seed,...parts){
  let h=(seed|0)^0x9e3779b9;
  for(const part of parts){
    const s=String(part);
    for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);h^=h>>>13;}
  }
  return h>>>0;
}
function random(seed){
  let s=seed>>>0;
  return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
const tint=(c,a)=>c.map(v=>clamp(v+a,.025,.97));
const pick=(a,r)=>a[Math.floor(r()*a.length)];
const yawFor=side=>side==='north'?0:side==='east'?Math.PI/2:side==='south'?Math.PI:-Math.PI/2;
function sidePoint(b,side,t,y,offset=0){
  if(side==='north')return[b.x+t,y,b.z+b.d/2+offset];
  if(side==='south')return[b.x+t,y,b.z-b.d/2-offset];
  if(side==='east')return[b.x+b.w/2+offset,y,b.z+t];
  return[b.x-b.w/2-offset,y,b.z+t];
}
function axisBox(box,b,side,t,y,w,h,depth,offset,color,material=0,detail=2,extra={}){
  const p=sidePoint(b,side,t,y,offset);
  return box(...p,side==='east'||side==='west'?depth:w,h,side==='east'||side==='west'?w:depth,color,material,detail,{rotation:[0,yawFor(side),0],...extra});
}

export function applyStreetDensity(api){
  const {
    seed,instances,roads,plots,bounds,colors:C,box,cylinder,sphere,rod,cable,
    crate,litter,weeds,binCluster,plant,hvac,onRoad,holeAt,ambientAnchors
  }=api;
  const before=instances.length;
  const report={groundSurface:0,drains:0,serviceCovers:0,streetEdges:0,facadeLayers:0,facadeUtilities:0,commercialLife:0,verticalLayers:0,architecturalHistory:0,paintedMarks:0,ambientAnchors:0,totalAdded:0};
  const tag=semantic=>({semantic,densityPass:true});

  function flat(x,z,w,d,color,material=11,rotation=0,semantic='ground-surface'){
    box(x,.026,z,w,.012,d,color,material,2,{rotation:[0,rotation,0],...tag(semantic)});
    report.groundSurface++;
  }
  function crack(x,z,yaw,len,r){
    const pieces=2+Math.floor(r()*3);let px=x,pz=z,angle=yaw+(r()-.5)*.8;
    for(let i=0;i<pieces;i++){
      const step=len/pieces*(.7+r()*.45),nx=px+Math.sin(angle)*step,nz=pz+Math.cos(angle)*step;
      rod([px,.046,pz],[nx,.046,nz],.012+r()*.011,C.darkConcrete,2);px=nx;pz=nz;angle+=(r()-.5)*.75;
    }
  }
  function drain(x,z,yaw,r){
    box(x,.049,z,.48,.035,.86,C.darkMetal,1,2,{rotation:[0,yaw,0],...tag('drain')});
    for(let k=-3;k<=3;k++)box(x+Math.cos(yaw)*k*.055,.071,z-Math.sin(yaw)*k*.055,.025,.015,.66,C.metal,1,2,{rotation:[0,yaw,0],...tag('drain-slat')});
    if(r()<.52)flat(x+Math.sin(yaw)*(.25+r()*.35),z+Math.cos(yaw)*(.25+r()*.35),.7+r()*.7,.35+r()*.45,C.water,9,yaw,'wet-patch');
    report.drains++;
  }
  function serviceCover(x,z,r){
    if(r()<.48){
      cylinder(x,.048,z,.58+r()*.24,.035,C.darkMetal,1,2,{...tag('service-cover')});
      cylinder(x,.071,z,.43+r()*.17,.012,C.metal,1,2,{...tag('service-cover')});
    }else{
      const yaw=r()*TAU;
      box(x,.05,z,.55+r()*.5,.035,.45+r()*.35,C.darkMetal,1,2,{rotation:[0,yaw,0],...tag('service-cover')});
      for(let k=-2;k<=2;k++)box(x+Math.cos(yaw)*k*.09,.073,z-Math.sin(yaw)*k*.09,.035,.01,.32,C.metal,1,2,{rotation:[0,yaw,0]});
    }
    report.serviceCovers++;
  }
  function bollards(x,z,yaw,r,count=2){
    for(let i=0;i<count;i++){
      const t=(i-(count-1)/2)*.72;
      cylinder(x+Math.cos(yaw)*t,.38,z-Math.sin(yaw)*t,.13,.76,pick([C.darkMetal,C.rust,C.metal],r),1,1,{...tag('street-edge')});
      box(x+Math.cos(yaw)*t,.67,z-Math.sin(yaw)*t,.17,.05,.17,C.cream,1,2);
    }
    report.streetEdges+=count;
  }
  function cart(x,z,yaw,r){
    box(x,.46,z,1.22,.16,.72,C.metal,1,1,{rotation:[0,yaw,0],...tag('commercial-edge')});
    box(x,.91,z+.02,1.16,.76,.68,pick([C.wood,C.teal,C.darkConcrete],r),4,2,{rotation:[0,yaw,0],...tag('commercial-edge')});
    for(const sx of[-.45,.45])for(const sz of[-.27,.27])sphere(x+Math.cos(yaw)*sx+Math.sin(yaw)*sz,.18,z-Math.sin(yaw)*sx+Math.cos(yaw)*sz,.22,.22,.22,C.rubber,1,2);
    rod([x-Math.cos(yaw)*.58,.55,z+Math.sin(yaw)*.58],[x-Math.cos(yaw)*.58-Math.sin(yaw)*.7,1.25,z+Math.sin(yaw)*.58-Math.cos(yaw)*.7],.055,C.darkMetal,1);
    report.commercialLife+=3;
  }
  function bike(x,z,yaw,r){
    const dx=Math.cos(yaw),dz=-Math.sin(yaw),nx=Math.sin(yaw),nz=Math.cos(yaw);
    for(const s of[-.62,.62]){
      const wx=x+dx*s,wz=z+dz*s;
      cylinder(wx,.5,wz,.66,.055,C.rubber,1,2,{rotation:[0,yaw,Math.PI/2],...tag('street-edge')});
      cylinder(wx,.5,wz,.48,.012,C.metal,1,2,{rotation:[0,yaw,Math.PI/2]});
    }
    const frame=pick([C.rust,C.teal,C.jade],r);
    rod([x+dx*.62,.5,z+dz*.62],[x,1.08,z],.042,frame,2);
    rod([x,1.08,z],[x-dx*.62,.5,z-dz*.62],.042,frame,2);
    rod([x-dx*.62,.5,z-dz*.62],[x+.12*nx,.53,z+.12*nz],.042,C.darkMetal,2);
    rod([x+.12*nx,.53,z+.12*nz],[x,1.08,z],.042,C.darkMetal,2);
    rod([x+.02*nx,1.08,z+.02*nz],[x+.36*nx,1.26,z+.36*nz],.035,C.metal,2);
    report.streetEdges+=2;
  }
  function cabinet(x,z,yaw,r,commercial=false){
    box(x,.68,z,.66,1.35,.42,pick([C.metal,C.darkConcrete,C.teal],r),1,1,{rotation:[0,yaw,0],...tag(commercial?'commercial-edge':'service-edge')});
    box(x+Math.sin(yaw)*.22,1.0,z+Math.cos(yaw)*.22,.38,.22,.025,C.yellow,1,2,{rotation:[0,yaw,0]});
    for(let k=0;k<4;k++)box(x+Math.cos(yaw)*(-.18+k*.12)+Math.sin(yaw)*.224,.46,z-Math.sin(yaw)*(-.18+k*.12)+Math.cos(yaw)*.224,.07,.22,.018,C.darkMetal,1,2,{rotation:[0,yaw,0]});
    report.streetEdges++;if(commercial)report.commercialLife++;
  }
  function facadeHistory(b,side,r){
    const horizontal=side==='north'||side==='south',len=horizontal?b.w:b.d,maxH=Math.max(3,Math.min(b.height||b.h||9,18));
    const repairCount=3+Math.floor(r()*5);
    for(let i=0;i<repairCount;i++){
      const t=(r()-.5)*len*.78,y=.55+r()*(maxH-.9),w=.3+r()*1.2,h=.18+r()*.85;
      axisBox(box,b,side,t,y,w,h,.024,.045,tint(b.color||C.concrete,(r()-.5)*.18),0,2,tag('facade-repair'));
      if(r()<.33)axisBox(box,b,side,t+w*.18,y,w*.07,h*.9,.03,.072,C.rust,1,2,tag('facade-repair'));
      report.facadeLayers++;
    }
    const pipeT=(r()-.5)*len*.72,pipe=sidePoint(b,side,pipeT,.35,.22),top=sidePoint(b,side,pipeT,maxH-.25,.22);
    rod(pipe,top,.065+r()*.045,pick([C.rust,C.metal,C.darkMetal],r),1);
    for(let y=1.1;y<maxH-.5;y+=1.8+r()*.65)axisBox(box,b,side,pipeT,y,.22,.055,.24,.20,C.metal,1,2,tag('facade-utility'));
    report.facadeUtilities+=Math.floor(maxH/2);
    const unitCount=1+Math.floor(r()*3);
    for(let i=0;i<unitCount;i++){
      const t=(r()-.5)*len*.67,y=1.7+r()*Math.max(1,maxH-3.1);
      axisBox(box,b,side,t,y,.88,.58,.46,.38,C.lightConcrete,1,1,tag('facade-utility'));
      for(let k=0;k<6;k++)axisBox(box,b,side,t,y-.2+k*.075,.65,.025,.025,.63,C.darkMetal,1,2,tag('facade-utility'));
      const q=sidePoint(b,side,t+.48,y-.25,.29),bottom=sidePoint(b,side,t+.48,.35,.29);
      rod(q,bottom,.038,C.cream,2);report.facadeUtilities+=8;
    }
    const cableY=.9+r()*Math.max(1,maxH-1.8),a=sidePoint(b,side,-len*.35,cableY,.18),c=sidePoint(b,side,len*.35,cableY+(r()-.5)*.5,.18);
    cable(a,c,.22+r()*.45,.022,2);report.verticalLayers++;
    if(r()<.62){
      const t=(r()-.5)*len*.55,y=.85+r()*Math.max(1,maxH-2);
      axisBox(box,b,side,t,y,.45,.62,.14,.18,C.darkMetal,1,1,tag('junction-box'));
      for(let k=0;k<3;k++)axisBox(box,b,side,t-.13+k*.13,y-.18,.045,.18,.02,.26,pick([C.yellow,C.metal,C.rust],r),1,2);
      report.facadeUtilities+=4;
    }
  }
  function frontLife(b,r){
    const side=b.front||'north',len=(side==='north'||side==='south'?b.w:b.d),yaw=yawFor(side),slots=1+Math.floor(r()*3);
    for(let i=0;i<slots;i++){
      const t=(i-(slots-1)/2)*Math.min(2.1,len/(slots+1))+(r()-.5)*.5,p=sidePoint(b,side,t,0,1.35+r()*.42);
      if(holeAt(p[0],p[2],.8)||onRoad(p[0],p[2],-.05))continue;
      const kind=Math.floor(r()*6);
      if(kind===0){crate(p[0],0,p[2],.65+r()*.4,.45+r()*.35,.55+r()*.35,C.wood,r);if(r()<.6)crate(p[0]+Math.cos(yaw)*.25,.55,p[2]-Math.sin(yaw)*.25,.44,.35,.42,C.wood,r);report.commercialLife+=2;}
      else if(kind===1)cart(p[0],p[2],yaw,r);
      else if(kind===2)cabinet(p[0],p[2],yaw,r,true);
      else if(kind===3)bike(p[0],p[2],yaw,r);
      else if(kind===4){plant(p[0],0,p[2],.27+r()*.16,r);report.streetEdges++;}
      else bollards(p[0],p[2],yaw,r,2);
      if(r()<.78)litter(p[0]+(r()-.5)*.8,0,p[2]+(r()-.5)*.8,r,2+Math.floor(r()*5));
      if(r()<.35)weeds(p[0]+(r()-.5)*.6,0,p[2]+(r()-.5)*.6,r,2+Math.floor(r()*4));
      const stain=sidePoint(b,side,t+(r()-.5)*.5,.02,.5+r()*.7);
      flat(stain[0],stain[2],.5+r()*1.3,.3+r()*.8,tint(C.darkConcrete,(r()-.5)*.04),11,yaw,'ground-stain');
    }
    report.streetEdges+=slots;
  }
  function backService(b,r){
    const side=b.front==='north'?'south':b.front==='south'?'north':b.front==='east'?'west':'east',len=(side==='north'||side==='south'?b.w:b.d),yaw=yawFor(side);
    const p=sidePoint(b,side,(r()-.5)*len*.3,0,1.0);
    if(!holeAt(p[0],p[2],.8)&&!onRoad(p[0],p[2],-.25)){
      if(r()<.55)binCluster(p[0],0,p[2],r);else cabinet(p[0],p[2],yaw,r,false);
      if(r()<.7)litter(p[0]+.4,0,p[2]+.4,r,5+Math.floor(r()*6));
      weeds(p[0]-.4,0,p[2]-.2,r,3+Math.floor(r()*5));serviceCover(p[0]+(r()-.5)*1.5,p[2]+(r()-.5)*1.3,r);report.streetEdges+=3;
    }
  }
  function roofHistory(b,r){
    const h=b.height||b.h||9;if(h<5)return;
    const count=1+Math.floor(r()*3);
    for(let i=0;i<count;i++){
      const x=b.x+(r()-.5)*b.w*.48,z=b.z+(r()-.5)*b.d*.45;
      if(r()<.58)hvac(x,h,z,.75+r()*1.1,.65+r()*.9);
      else{box(x,h+.42,z,.65+r()*.8,.82,.6+r()*.75,pick([C.metal,C.darkConcrete,C.lightConcrete],r),1,1,tag('roof-equipment'));rod([x,h+.86,z],[x,h+1.8+r()*1.8,z],.045,C.metal,2);}
      report.verticalLayers+=2;
    }
    if((b.era??0)<=1&&h<28&&r()<.72){
      const w=Math.max(2.2,Math.min(b.w*.44,4+r()*2.5)),d=Math.max(2,Math.min(b.d*.38,3+r()*2)),x=b.x+(r()-.5)*b.w*.2,z=b.z+(r()-.5)*b.d*.18;
      box(x,h+.75,z,w,1.5,d,tint(pick([C.brick,C.teal,C.concrete],r),(r()-.5)*.08),0,1,tag('later-roof-addition'));
      box(x,h+1.56,z,w+.18,.12,d+.18,C.darkMetal,1,1,tag('later-roof-addition'));report.architecturalHistory+=2;
    }
  }

  for(let ri=0;ri<roads.length;ri++){
    const road=roads[ri],r=random(hash(seed,'road-history',ri));
    for(let si=1;si<road.points.length;si++){
      const a=road.points[si-1],b=road.points[si],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<2)continue;
      const yaw=Math.atan2(dx,dz),nx=Math.cos(yaw),nz=-Math.sin(yaw);
      for(let d=3+r()*4;d<len-1;d+=7+r()*7){
        const t=d/len,cx=a[0]+dx*t,cz=a[1]+dz*t,side=r()<.5?-1:1,x=cx+nx*side*(road.width/2+.18),z=cz+nz*side*(road.width/2+.18);
        if(!holeAt(x,z,.7))drain(x,z,yaw,r);
        if(r()<.7){
          flat(cx+(r()-.5)*road.width*.5,cz+(r()-.5)*road.width*.5,1.1+r()*3.3,.6+r()*1.8,tint(C.asphalt,(r()-.5)*.075),3,yaw+(r()-.5)*.2,'road-repair');
          crack(cx+(r()-.5)*road.width*.5,cz+(r()-.5)*road.width*.5,yaw+(r()-.5)*1.2,.6+r()*1.8,r);
        }
        if(r()<.45)serviceCover(cx+(r()-.5)*road.width*.35,cz+(r()-.5)*road.width*.35,r);
        if(r()<.32){box(cx,.039,cz,.12,.012,1.2+r()*1.6,tint(C.yellow,-.18),11,2,{rotation:[0,yaw+(r()<.5?0:Math.PI/2),0],...tag('painted-mark')});report.paintedMarks++;}
      }
    }
  }

  for(const plot of plots){
    const r=random(hash(seed,'plot-density',plot.id));
    for(const side of['north','south','east','west'])facadeHistory(plot,side,r);
    frontLife(plot,r);backService(plot,r);roofHistory(plot,r);
    for(const sx of[-1,1])for(const sz of[-1,1]){
      if(r()>.58)continue;
      const x=plot.x+sx*(plot.w/2+.18+r()*.35),z=plot.z+sz*(plot.d/2+.18+r()*.35);if(holeAt(x,z,.5))continue;
      flat(x,z,.35+r()*.9,.25+r()*.75,tint(C.darkConcrete,(r()-.5)*.06),11,r()*TAU,'edge-grime');if(r()<.68)weeds(x,0,z,r,2+Math.floor(r()*5));
    }
  }

  const scatter=random(hash(seed,'surface-events'));
  for(let i=0;i<210;i++){
    const x=bounds.minX+2+scatter()*(bounds.maxX-bounds.minX-4),z=bounds.minZ+2+scatter()*(bounds.maxZ-bounds.minZ-4);if(holeAt(x,z,1.1))continue;
    const roadway=onRoad(x,z,.2),roll=scatter();
    if(roll<.52){flat(x,z,.35+scatter()*2.4,.25+scatter()*1.7,tint(roadway?C.asphalt:C.paving,(scatter()-.5)*.085),roadway?3:11,scatter()*TAU,roadway?'road-patch':'paving-patch');if(scatter()<.68)crack(x,z,scatter()*TAU,.45+scatter()*1.6,scatter);}
    else if(roll<.72)serviceCover(x,z,scatter);
    else if(roll<.84){flat(x,z,.45+scatter()*1.5,.25+scatter()*.8,tint(C.darkConcrete,(scatter()-.5)*.05),11,scatter()*TAU,'ground-stain');if(scatter()<.45)litter(x,0,z,scatter,2+Math.floor(scatter()*5));}
    else if(!roadway){weeds(x,0,z,scatter,2+Math.floor(scatter()*5));if(scatter()<.6)litter(x+.25,0,z-.15,scatter,2+Math.floor(scatter()*4));}
  }

  const anchors=[
    ['browse',[-13.9,0,-4.0],2.7,'vendor'],['browse',[7.0,0,-4.4],2.9,'resident'],
    ['talk',[-5.5,0,2.8],1.2,'resident'],['talk',[-4.2,0,2.2],-1.9,'courier'],
    ['sit',[-12.0,0,16.0],1.55,'resident'],['wait',[3.0,0,2.4],2.9,'resident'],
    ['delivery',[2.9,0,10.7],2.75,'courier'],['maintenance',[-24.3,.16,-21.0],1.65,'worker'],
    ['display',[21.8,0,29.3],1.55,'resident'],['rest',[-15.9,0,28.4],1.55,'worker'],
    ['carry',[58.3,0,-50.9],.1,'worker'],['wait',[61.2,0,-28.2],0,'courier'],
    ['browse',[56.9,0,43.2],1.57,'worker'],['maintenance',[69.0,0,48.0],3.14,'worker']
  ];
  anchors.forEach(([type,position,yaw,role],i)=>ambientAnchors.push({id:`ambient-${i}`,type,position,yaw,role}));
  report.ambientAnchors=anchors.length;report.totalAdded=instances.length-before;return report;
}
