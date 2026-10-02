import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { generateDistrict } from '../src/world/district.js';
import { partitionWorld, isGlobalInstance, selectResidentCells } from '../src/world/cell-stream-data.js';
import { CellStream } from '../src/world/cell-stream.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const key = values => [...values].sort().join('|');

function fixture() {
  const cells = [];
  for (let z = -2; z <= 1; z++) for (let x = -2; x <= 1; x++) {
    cells.push({ id: `${x},${z}`, x, z, bounds: [x * 48, z * 48, (x + 1) * 48, (z + 1) * 48] });
  }
  const instance = (id, cell, detail, scale = [1, 1, 1]) => ({
    id, cell, detail, scale, mesh: 'box', position: [0, 0, 0], color: [.4, .5, .6], material: 0,
  });
  return {
    seed: 73191, cells,
    instances: [instance('ground', '0,0', 0, [174, .2, 120]), ...cells.map(c => instance(`detail:${c.id}`, c.id, 2))],
    colliders: [{ id: 'floor', min: [-90, -.2, -90], max: [90, 0, 90] }],
    interactables: [{ id: 'mara', position: [3, 0, 5] }],
    navNodes: [{ id: 'street', position: [3, 0, 4] }], ramps: [], signs: ['MARKET'],
  };
}

class FakeWorker {
  constructor() { this.requests = []; this.listeners = new Map(); this.terminated = false; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  postMessage(message) { this.requests.push(structuredClone(message)); }
  reply(message) {
    for (const listener of this.listeners.get('message') || []) listener({ data: structuredClone(message) });
  }
  terminate() { this.terminated = true; }
}

function respond(worker, request, partition) {
  worker.reply({
    type: 'cells', requestId: request.requestId, generation: request.generation,
    cells: request.ids.map(id => ({ id, instances: partition.chunks.get(id) })),
  });
}

async function setup(options = {}) {
  const partition = partitionWorld(fixture());
  const worker = new FakeWorker();
  const stream = new CellStream(worker, { checkInterval: 0, ...options });
  const ready = stream.init(73191);
  const request = worker.requests.shift();
  worker.reply({ type: 'world', requestId: request.requestId, world: partition.world, generationMs: 1 });
  await ready;
  return { partition, worker, stream };
}

async function drain(worker, stream, partition) {
  for (let cycle = 0; cycle < 30; cycle++) {
    if (worker.requests.length) respond(worker, worker.requests.shift(), partition);
    await flush();
    if (!worker.requests.length && stream._inFlight === null) return;
  }
  throw new Error('The bounded stream did not settle.');
}

test('partition preserves every object once, metadata, long geometry and the real skyline layer', () => {
  const authored = generateDistrict(73191);
  const result = partitionWorld(authored);
  const all = result.globalInstances.concat(...result.chunks.values());
  assert.equal(all.length, authored.instances.length);
  assert.equal(new Set(all).size, authored.instances.length);
  assert.equal(result.world.instanceCount, authored.instances.length);
  assert.equal(result.world.colliders, authored.colliders);
  assert.equal(result.world.interactables, authored.interactables);
  assert.equal(result.world.navNodes, authored.navNodes);
  assert.equal(result.chunks.size, 16);
  assert.ok(result.globalInstances.length>1000 && result.globalInstances.length<authored.instances.length/10);
  assert.ok(authored.instances.filter(i => (i.detail ?? 0) === 0).every(i => result.globalInstances.includes(i)));
  assert.ok(authored.instances.filter(i => Math.max(i.scale[0], i.scale[2]) > 48).every(i => result.globalInstances.includes(i)));
  assert.equal(isGlobalInstance({ detail: 2, scale: [.1, 70, .1], rotation: [Math.PI / 2, 0, 0] }), true);
});

test('cell selection has a strict bound, valid negative coordinates, and boundary hysteresis', () => {
  const { cells } = fixture();
  const initial = selectResidentCells(cells, [0, 0, 0]);
  assert.equal(initial.length, 9);
  for (const position of [[.2, 0, -.3], [-.4, 0, .1], [.1, 0, .2]]) {
    assert.equal(key(selectResidentCells(cells, position, initial)), key(initial));
  }
  for (const position of [[-96, 0, -96], [96, 0, 96], [-10000, 4, 10000]]) {
    const ids = selectResidentCells(cells, position);
    assert.equal(ids.length, 9);
    assert.ok(ids.every(id => cells.some(cell => cell.id === id)));
  }
  assert.throws(() => selectResidentCells(cells, [NaN, 0, 0]), /finite/);
});

test('outside district focus selects the nearest cell with a one-cell budget', () => {
  const { cells } = fixture();
  assert.deepEqual(selectResidentCells(cells, [500, 0, 500], [], { maxCells: 1, hysteresis: 0 }), ['1,1']);
  assert.deepEqual(selectResidentCells(cells, [-500, 0, -500], [], { maxCells: 1, hysteresis: 0 }), ['-2,-2']);
});

test('details arrive asynchronously in bounded payloads while permanent geometry remains present', async t => {
  let commits = 0;
  const { worker, stream, partition } = await setup({ onChange: () => commits++ });
  t.after(() => stream.dispose());
  stream.update([-75, 0, -65]);
  assert.equal(commits, 0);
  assert.equal(stream.world.instances.length, 1);
  assert.equal(worker.requests.length, 1);
  assert.equal(worker.requests[0].ids.length, 2);
  const settled = stream.whenSettled();
  await drain(worker, stream, partition);
  await settled;
  assert.equal(commits, 1);
  assert.equal(stream.getStats().loadedCells, 9);
  assert.equal(stream.world.instances.length, 10);
  assert.equal(stream.world.instanceCount, 17);
  assert.equal(stream.getStats().requests, 5);
  assert.ok(stream.world.instances.some(i => i.id === 'ground'));
});

test('stale responses cannot install old cells and only one worker request is ever pending', async t => {
  const { worker, stream, partition } = await setup();
  t.after(() => stream.dispose());
  stream.update([-75, 0, -65]);
  const old = worker.requests.shift();
  stream.update([75, 0, 65]);
  assert.equal(worker.requests.length, 0);
  respond(worker, old, partition);
  await flush();
  assert.equal(stream.getStats().staleResponses, 1);
  assert.equal(stream.getStats().loadedCells, 0);
  assert.equal(worker.requests.length, 1);
  const expected = selectResidentCells(stream.world.cells, [75, 0, 65]);
  await drain(worker, stream, partition);
  assert.equal(key(stream.resident.keys()), key(expected));
  assert.equal(stream.getStats().commits, 1);
});

test('moving across the ward evicts old detailed objects without holes during replacement', async t => {
  const { worker, stream, partition } = await setup();
  t.after(() => stream.dispose());
  stream.update([-75, 0, -65]);
  await drain(worker, stream, partition);
  const oldIds = [...stream.resident.keys()];
  const oldArray = stream.world.instances;
  const permanent = stream.globalInstances[0];
  stream.update([75, 0, 65]);
  assert.equal(stream.world.instances, oldArray);
  await drain(worker, stream, partition);
  const removed = oldIds.filter(id => !stream.resident.has(id));
  assert.ok(removed.length > 0);
  assert.equal(stream.resident.size, 9);
  assert.ok(removed.every(id => !stream.world.instances.some(i => i.id === `detail:${id}`)));
  assert.ok(stream.world.instances.includes(permanent));
  assert.equal(stream.getStats().evictedCells, removed.length);
});

test('repeated and boundary-jitter focus checks cause no cell churn or uploads', async t => {
  const { worker, stream, partition } = await setup();
  t.after(() => stream.dispose());
  stream.update([0, 0, 0]);
  await drain(worker, stream, partition);
  const requests = stream.getStats().requests;
  const currentArray = stream.world.instances;
  for (let index = 0; index < 100; index++) {
    stream.update([Math.sin(index) * .3, 0, Math.cos(index) * .3]);
  }
  assert.equal(worker.requests.length, 0);
  assert.equal(stream.getStats().requests, requests);
  assert.equal(stream.getStats().commits, 1);
  assert.equal(stream.world.instances, currentArray);
});

test('a malformed response reports one handled failure and keeps the current world', async t => {
  const failures = [];
  const { worker, stream } = await setup({ onError: error => failures.push(error.message) });
  t.after(() => stream.dispose());
  stream.update([0, 0, 0]);
  const pending = assert.rejects(stream.whenSettled(), /omitted/);
  const request = worker.requests.shift();
  worker.reply({ type: 'cells', requestId: request.requestId, generation: request.generation, cells: [] });
  await pending;
  await flush();
  assert.equal(failures.length, 1);
  assert.equal(stream.world.instances.length, 1);
  assert.equal(worker.requests.length, 0);
});

test('a render callback failure is handled without an unhandled rejection', async t => {
  const failures = [];
  const { worker, stream, partition } = await setup({
    onChange: () => { throw new Error('upload failed'); },
    onError: error => failures.push(error.message),
  });
  t.after(() => stream.dispose());
  stream.update([0, 0, 0]);
  const pending = assert.rejects(stream.whenSettled(), /upload failed/);
  await drain(worker, stream, partition);
  await pending;
  assert.deepEqual(failures, ['upload failed']);
});

test('disposal cancels pending work, rejects a held arrival, and terminates the worker', async () => {
  const { worker, stream } = await setup();
  stream.update([0, 0, 0]);
  const pending = assert.rejects(stream.whenSettled(), /disposed/);
  stream.dispose();
  await pending;
  await flush();
  assert.equal(worker.terminated, true);
  assert.equal(stream.getStats().loadedCells, 0);
  assert.equal(stream.getStats().residentInstances, 0);
});

test('the actual worker protocol preserves seed zero and serves bounded cell payloads', async t => {
  let source = await readFile(new URL('../world-worker.js', import.meta.url), 'utf8');
  source = source.replace("'./src/world/district.js'", JSON.stringify(new URL('../src/world/district.js', import.meta.url).href))
    .replace("'./src/world/cell-stream-data.js'", JSON.stringify(new URL('../src/world/cell-stream-data.js', import.meta.url).href));
  const bridge = `import { parentPort } from 'node:worker_threads';\nconst self = { postMessage: value => parentPort.postMessage(value) };\nparentPort.on('message', data => self.onmessage({ data }));\n`;
  const worker = new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(bridge + source)}`));
  t.after(() => worker.terminate());
  const request = message => new Promise((resolve, reject) => {
    const done = value => { worker.removeListener('error', reject); resolve(value); };
    worker.once('message', done);
    worker.once('error', reject);
    worker.postMessage(message);
  });
  const manifest = await request({ type: 'init', seed: 0, requestId: 1 });
  assert.equal(manifest.type, 'world');
  assert.equal(manifest.world.seed, 0);
  assert.equal(manifest.requestId, 1);
  assert.equal(manifest.world.cells.length, 16);
  assert.ok(manifest.world.instanceCount > manifest.world.instances.length);
  assert.ok(manifest.world.instances.every(instance => isGlobalInstance(instance)));
  const id = manifest.world.cells[0].id;
  const detail = await request({ type: 'load-cells', ids: [id], generation: 4, requestId: 2 });
  assert.equal(detail.type, 'cells');
  assert.equal(detail.generation, 4);
  assert.deepEqual(detail.cells.map(cell => cell.id), [id]);
  assert.ok(detail.cells[0].instances.every(instance => instance.cell === id && !isGlobalInstance(instance)));
  const rejected = await request({ type: 'load-cells', ids: manifest.world.cells.slice(0, 5).map(cell => cell.id), generation: 5, requestId: 3 });
  assert.equal(rejected.type, 'error');
  assert.match(rejected.message, /four/);
});
