import test from 'node:test';
import assert from 'node:assert/strict';
import {Population} from '../src/world/population.js';
import {CollisionWorld} from '../src/engine/physics.js';

test('pedestrian motion respects closed doors and follows the shared open state',()=>{
  const floor={id:'floor',min:[-2,-.5,-2],max:[10,0,2]};
  const door={id:'panel',owner:'service_door',type:'door',min:[4,0,-2],max:[4.1,3,2]};
  const world={colliders:[floor,door],navNodes:[{id:'a',kind:'foot',position:[0,0,0]},{id:'b',kind:'foot',position:[8,0,0]}],navEdges:[['a','b']],interactables:[]};
  const collision=new CollisionWorld(world.colliders),population=new Population(world,73191,collision);
  const actor=population._people[0];population._people=[actor];population._authored=[];
  actor.node=0;actor.path=[0,1];actor.segment=0;actor.progress=0;actor.idleLeft=0;actor.speed=0;actor.baseSpeed=2;actor.lane=0;actor.sidestep=0;
  population._player=[100,0,100];population._position(actor);
  for(let i=0;i<150;i++){population._move(actor,1/30);assert.ok(actor.position[0]<=3.731,'crossed a closed door');}
  assert.ok(actor.position[0]>3,'walker never approached the door');
  collision.setOpen(['service_door']);
  for(let i=0;i<60;i++)population._move(actor,1/30);
  assert.ok(actor.position[0]>4.4,'walker did not pass the opened door');
  assert.equal(collision.blocked(actor.position,.27,1.76),false);
  population.dispose();
});
