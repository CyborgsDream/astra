import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionWorld,PlayerController} from '../src/engine/physics.js';
import {generateDistrict} from '../src/world/district.js';

test('scripted movement sweeps the complete standing volume and respects doors',()=>{
  const floor={id:'floor',min:[-10,-.5,-10],max:[10,0,10]};
  const panel={id:'panel',owner:'door',min:[2,0,-1],max:[2.05,3,1]};
  const collision=new CollisionWorld([floor,panel]);
  assert.equal(collision.canTraverse([0,0,0],[1,0,0]),true);
  assert.equal(collision.canTraverse([0,0,0],[4,0,0]),false);
  assert.equal(collision.canTraverse([0,0,1.2],[4,0,1.2]),false,'body edges should hit the door even when the centre misses');
  collision.setOpen(['door']);
  assert.equal(collision.canTraverse([0,0,0],[4,0,0]),true);
});

test('authored ladders climb through clear waypoints and land on supported floors',()=>{
  const world=generateDistrict(),collision=new CollisionWorld(world.colliders,world.ramps);
  const ladders=world.interactables.filter(t=>t.type==='ladder');assert.equal(ladders.length,4);
  for(const target of ladders) {
    const player=new PlayerController(collision,{position:target.position});
    assert.equal(player.moveAlongPath([target.target],1,'ladder'),false,`${target.id}: former diagonal route unexpectedly clear`);
    assert.equal(player.moveAlongPath(target.travelPath,2,'ladder'),true,`${target.id}: authored route rejected`);
    for(let i=0;i<250&&player.travel;i++) {
      player.update(1/120,{},{});
      assert.equal(collision.blocked(player.position,.32,1.76),false,`${target.id}: visible climb entered architecture`);
    }
    assert.equal(player.travel,null);
    for(let i=0;i<3;i++)assert.ok(Math.abs(player.position[i]-target.target[i])<.0001);
    assert.ok(Math.abs(collision.floorAt(player.position,.32,.05,.15)-player.position[1])<.05);
  }
});

test('every enclosed lift has a supported unobstructed departure and arrival',()=>{
  const world=generateDistrict(),collision=new CollisionWorld(world.colliders,world.ramps);
  const lifts=world.interactables.filter(t=>t.type==='elevator');assert.equal(lifts.length,4);
  for(const lift of lifts)for(const endpoint of [lift.position,lift.target]) {
    assert.equal(collision.blocked(endpoint,.32,1.76),false,`${lift.id}: obstructed landing`);
    assert.ok(Math.abs(collision.floorAt(endpoint,.32,.05,.15)-endpoint[1])<.05,`${lift.id}: unsupported landing`);
  }
});
