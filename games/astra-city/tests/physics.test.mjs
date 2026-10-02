import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionWorld,PlayerController} from '../src/engine/physics.js';

const floor = {id:'floor',min:[-30,-.5,-30],max:[30,0,30]};
test('falling player lands without passing through floor at low frame rate',()=>{
  const world = new CollisionWorld([floor]);
  const p=[0,3,0],v=[0,-25,0];
  const r=world.move(p,v,.2);
  assert.equal(p[1],0); assert.equal(v[1],0); assert.equal(r.grounded,true);
});
test('fast vehicle cannot tunnel through a narrow wall',()=>{
  const world=new CollisionWorld([floor,{id:'wall',min:[2,0,-4],max:[2.15,4,4]}]);
  const p=[0,0,0],v=[25,0,0];
  world.move(p,v,.25,{grounded:true});
  assert.ok(p[0]<=1.681); assert.ok(p[0]>=1.5);
});
test('small steps climb and tall solids block',()=>{
  const world=new CollisionWorld([floor,{id:'step',min:[1,0,-2],max:[2,.25,2]},{id:'solid',min:[3,0,-2],max:[4,2,2]}]);
  const p=[0,0,0],v=[3,0,0];
  for(let i=0;i<30;i++)world.move(p,v,.02,{grounded:true});
  assert.ok(p[1]>=.249);
  for(let i=0;i<40;i++)world.move(p,v,.02,{grounded:true});
  assert.ok(p[0]<2.69);
});
test('analytic stair ramp reaches its landing without a ground teleport',()=>{
  const world=new CollisionWorld([floor,{id:'landing',min:[-.8,1.9,4],max:[.8,2,6]}],[{id:'stairs',x:0,z:2,width:1.6,depth:4,y0:0,y1:2,axis:'z'}]);
  const p=[0,0,0],v=[0,0,2];
  for(let i=0;i<110;i++)world.move(p,v,.02,{grounded:true});
  assert.ok(Math.abs(p[1]-2)<.01);
});
test('door opening only disables its own collider',()=>{
  const world=new CollisionWorld([floor,{id:'panel',owner:'service_door',min:[1,0,-1],max:[1.2,3,1]}]);
  assert.equal(world.lineOfSight([0,1,0],[2,1,0]),false);
  world.setOpen(['service_door']);
  assert.equal(world.lineOfSight([0,1,0],[2,1,0]),true);
});
test('standing up is blocked by a low ceiling',()=>{
  const world=new CollisionWorld([floor,{id:'ceiling',min:[-2,1.2,-2],max:[2,1.5,2]}]);
  assert.equal(world.blocked([0,0,0],.32,1.76),true);
  assert.equal(world.blocked([0,0,0],.32,1.04),false);
});
test('controller uses matching first person yaw and camera',()=>{
  const world=new CollisionWorld([floor]);
  const p=new PlayerController(world,{position:[0,0,0],yaw:0});
  const state={player:{energy:100,equipment:[]}};
  for(let i=0;i<60;i++)p.update(1/60,{forward:1,right:0,sprint:false,crouch:false,jumpHeld:false},state);
  assert.ok(p.position[2]<-3);assert.ok(Math.abs(p.position[0])<.01);
  assert.ok(p.camera().position[1]>1.5);
});
