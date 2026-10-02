import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDistrict } from '../src/world/district.js';
import { partitionWorld, selectResidentCells } from '../src/world/cell-stream-data.js';

const authored = generateDistrict(73191);
const partition = partitionWorld(authored);

test('distant market towers retain glazing while their detailed cells are evicted', () => {
  const ids = selectResidentCells(authored.cells, [-20.8, 0, -13]);
  assert.equal(ids.length, 9);
  assert.ok(!ids.includes('1,-1'), 'Parcel 28 detail cell must be outside this view budget');
  assert.ok(!ids.includes('0,1'), 'Needle House detail cell must be outside this view budget');
  const resident = new Set(partition.globalInstances.concat(...ids.map(id => partition.chunks.get(id))));
  for (const owner of ['parcel_28', 'needle_house']) {
    const glazing = authored.instances.filter(i => i.coarseFacade === owner && i.coarsePart === 'glazing' && i.position[1] > 3);
    assert.ok(glazing.length > 100, `${owner} needs a readable upper facade`);
    assert.ok(glazing.every(i => resident.has(i)), `${owner} glazing must survive detail eviction`);
  }
  assert.ok(authored.instances.length - resident.size > 15000, 'substantial detailed geometry must remain evicted');
  assert.ok(partition.globalInstances.length < authored.instances.length / 10, 'coarse architecture must keep the existing global budget');
  const coarse = authored.instances.filter(i => i.coarseFacade);
  assert.ok(coarse.every(i => i.detail === 0 && partition.globalInstances.includes(i)));
  assert.ok(coarse.every(i => ['glazing', 'band', 'parapet'].includes(i.coarsePart)), 'only essential facade elements belong in this layer');
});

test('Scales Exchange upper windows occupy real wall openings on all four sides', () => {
  const windows = authored.colliders.filter(c => c.id.startsWith('scales_exchange_') && c.id.includes('_clerestory_'));
  assert.equal(windows.length, 20);
  for (const side of ['north', 'south', 'east', 'west']) {
    assert.ok(windows.some(c => c.id.startsWith(`scales_exchange_${side}_`)));
  }
  for (const window of windows) {
    assert.ok(Math.abs(window.min[1] - 6.6) < 1e-9);
    assert.ok(Math.abs(window.max[1] - 8.85) < 1e-9);
    const centre = window.min.map((value, axis) => (value + window.max[axis]) / 2);
    assert.ok(!authored.colliders.some(c => c !== window && centre.every((value, axis) => value > c.min[axis] + 1e-6 && value < c.max[axis] - 1e-6)), `${window.id} must not be buried in an opaque wall collider`);
    assert.ok(partition.globalInstances.some(i => i.coarseFacade === 'scales_exchange' && i.coarsePart === 'glazing' && i.position.every((value, axis) => Math.abs(value - centre[axis]) < 1e-6)), `${window.id} needs matching permanent glazing`);
  }
});
