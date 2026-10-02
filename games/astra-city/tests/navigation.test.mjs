import test from 'node:test';
import assert from 'node:assert/strict';
import {Navigation,projectPoint} from '../src/engine/navigation.js';
test('navigation chooses a connected route instead of crossing unlinked blocks',()=>{
  const nav=new Navigation({navNodes:[{id:'a',position:[0,0,0],kind:'foot'},{id:'b',position:[10,0,0],kind:'foot'},{id:'c',position:[10,0,10],kind:'foot'},{id:'d',position:[0,0,10],kind:'foot'}],navEdges:[['a','b'],['b','c'],['c','d']]});
  const route=nav.route([0,0,0],[0,0,10]);
  assert.deepEqual(route.slice(0,4),[[0,0,0],[10,0,0],[10,0,10],[0,0,10]]);
});
test('objective projection and player yaw agree',()=>{
  const cam={position:[0,1.6,0],yaw:0,pitch:0,fov:75};
  const p=projectPoint([0,1.6,-10],cam,1920,1080);
  assert.equal(p.x,960);assert.equal(p.y,540);
  assert.equal(projectPoint([0,1.6,10],cam,1920,1080),null);
});
