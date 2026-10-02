import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDistrict} from '../src/world/district.js';

test('street density pass preserves district bounds and is deterministic',()=>{
  const world=generateDistrict(73191),again=generateDistrict(73191);
  assert.deepEqual(world.bounds,{minX:-84,maxX:84,minZ:-72,maxZ:72});
  assert.deepEqual(world.densityReport,again.densityReport);
  assert.equal(world.ambientAnchors.length,world.densityReport.ambientAnchors);
});

test('street density pass adds substantial semantic information at every layer',()=>{
  const {densityReport:d,ambientAnchors}=generateDistrict(73191);
  assert.ok(d.totalAdded>12000,`expected >12000 density instances, got ${d.totalAdded}`);
  assert.ok(d.groundSurface>220);
  assert.ok(d.drains>20);
  assert.ok(d.serviceCovers>35);
  assert.ok(d.facadeLayers>300);
  assert.ok(d.facadeUtilities>900);
  assert.ok(d.commercialLife>70);
  assert.ok(d.verticalLayers>120);
  assert.ok(d.architecturalHistory>15);
  const types=new Set(ambientAnchors.map(a=>a.type));
  for(const type of ['sit','talk','browse','wait','delivery','maintenance','carry','display','rest'])assert.ok(types.has(type),`missing ambient activity ${type}`);
});

test('population realizes ambient micro-activity without navigation overhead',()=>{
  const world=generateDistrict(73191);
  return import('../src/world/population.js').then(({Population})=>{
    const population=new Population(world,world.seed);
    population.update(.16,{position:world.spawn.position},{hour:15.5,weather:'clear'});
    const stats=population.getStats();
    assert.equal(stats.ambientCount,world.ambientAnchors.length);
    assert.ok(stats.ambientActivities.length>=8);
    assert.ok(population.instances().length>0);
    const nearby=population.nearby([-5,0,2.5],12);
    assert.ok(nearby.some(a=>a.id?.startsWith('ambient-')));
    population.dispose();
  });
});
