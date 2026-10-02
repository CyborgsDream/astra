import test from 'node:test';
import assert from 'node:assert/strict';
import {registerWardTools} from '../src/game/agent-tools.js';

test('optional page tools validate navigation, share visible state, and unregister',async()=>{
  const registry=new Map();let mode='menu',waypoint=null;
  const world={name:'Switchback Ward',locations:[{id:'clinic',name:'Clinic',position:[2,0,4]}]};
  const game={data:{player:{credits:90},world:{ending:null}},getQuestView:()=>[{id:'intro',title:'Medicine',status:'active'}]};
  const document={modelContext:{registerTool:(tool,{signal})=>{registry.set(tool.name,tool);signal.addEventListener('abort',()=>registry.delete(tool.name));}}};
  const dispose=registerWardTools({document,world,game,getPlayer:()=>({position:[0,0,0]}),getMode:()=>mode,setWaypoint:async p=>{waypoint=p;}});
  const inspect=registry.get('inspect_ward_progress'),navigate=registry.get('set_ward_waypoint');
  assert.equal(inspect.annotations.readOnlyHint,true);
  assert.equal(navigate.annotations.readOnlyHint,false);
  assert.equal(inspect.execute({}).credits,90);
  assert.throws(()=>inspect.execute({unknown:1}),/empty object/);
  await assert.rejects(navigate.execute({locationId:'clinic'}),/Start or continue/);
  mode='playing';
  await assert.rejects(navigate.execute({locationId:'unknown'}),/Unknown district/);
  await assert.rejects(navigate.execute({locationId:'clinic',movePlayer:true}),/one locationId/);
  assert.equal(waypoint,null);
  assert.equal((await navigate.execute({locationId:'clinic'})).waypointSet,true);
  assert.deepEqual(waypoint,[2,0,4]);
  dispose();assert.equal(registry.size,0);
});

test('the game does not depend on WebMCP availability',()=>{
  assert.doesNotThrow(()=>registerWardTools({document:{}})());
  assert.doesNotThrow(()=>registerWardTools({document:{modelContext:{registerTool(){throw new Error('Unavailable');}}}})());
});
