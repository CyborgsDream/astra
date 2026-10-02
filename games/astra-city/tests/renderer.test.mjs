import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeometry } from '../src/engine/geometry.js';
import { cameraForward, frustumPlanes, invert4, lookAt, multiply4, packInstance, perspective } from '../src/engine/math.js';
import { Renderer } from '../src/engine/renderer.js';

const transform = (matrix, point) => [0, 1, 2, 3].map(row => matrix[row] * point[0] + matrix[row + 4] * point[1] + matrix[row + 8] * point[2] + matrix[row + 12]);
const roughness = Array(12).fill(0.8);

test('all mesh triangles face their outward normals and all attributes are finite', () => {
  for (const [name, mesh] of Object.entries(createGeometry())) {
    assert.equal(mesh.vertices.length % 8, 0, name);
    assert.ok(mesh.vertices.every(Number.isFinite), name);
    assert.ok(mesh.indices.every(index => index < mesh.vertices.length / 8), name);
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const [a, b, c] = [0, 1, 2].map(offset => mesh.indices[triangle + offset] * 8);
      const v = mesh.vertices;
      const ab = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
      const ac = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const averageNormal = [0, 1, 2].map(axis => v[a + 3 + axis] + v[b + 3 + axis] + v[c + 3 + axis]);
      assert.ok(cross.reduce((sum, value, axis) => sum + value * averageNormal[axis], 0) > 1e-7, `${name} triangle ${triangle / 3}`);
    }
  }
});

test('WebGPU near/far planes and camera yaw convention agree', () => {
  const matrix = perspective(Math.PI / 2, 1, 0.08, 1000);
  const planes = new Float32Array(24);
  frustumPlanes(matrix, planes);
  const inside = point => Array.from({ length: 6 }, (_, index) => {
    const offset = index * 4;
    return planes[offset] * point[0] + planes[offset + 1] * point[1] + planes[offset + 2] * point[2] + planes[offset + 3] >= -0.00001;
  }).every(Boolean);
  assert.ok(inside([0, 0, -10]));
  assert.ok(!inside([0, 0, 10]));
  assert.ok(!inside([0, 0, -0.04]));
  assert.ok(!inside([0, 0, -1100]));
  assert.ok(!inside([20, 0, -10]));
  const forward = cameraForward(Math.PI / 2, 0);
  assert.ok(Math.abs(forward[0] + 1) < 1e-6);
  assert.ok(Math.abs(forward[2]) < 1e-6);
  const camera = [17, 6, -22];
  const view = lookAt(camera, camera.map((value, axis) => value + forward[axis]));
  const projected = transform(multiply4(matrix, view), camera.map((value, axis) => value + forward[axis] * 10));
  assert.ok(Math.abs(projected[0] / projected[3]) < 1e-5);
  assert.ok(Math.abs(projected[1] / projected[3]) < 1e-5);
  assert.ok(projected[2] / projected[3] > 0 && projected[2] / projected[3] < 1);
});

test('inverse view-projection reconstructs rays with rotated, translated cameras', () => {
  for (const [yaw, pitch] of [[0, 0], [0.6, -0.3], [-2.4, 0.8]]) {
    const camera = [124, 16, -95];
    const forward = cameraForward(yaw, pitch);
    const view = lookAt(camera, camera.map((value, axis) => value + forward[axis]));
    const vp = multiply4(perspective(1.3, 16 / 9, 0.08, 1000), view);
    const identity = multiply4(vp, invert4(vp));
    for (let index = 0; index < 16; index++) assert.ok(Math.abs(identity[index] - (index % 5 === 0 ? 1 : 0)) < 0.0002, `${yaw}, ${pitch}, ${index}`);
  }
});

test('rotated nonuniform transforms stay inside conservative GPU culling bounds', () => {
  const meshes = createGeometry();
  for (const [name, mesh] of Object.entries(meshes)) {
    const packed = new Float32Array(40);
    packInstance(packed, 0, { mesh: name, position: [54, -3, 87], scale: [23, 0.07, 5], rotation: [0.7, -0.9, 1.2], color: [0.5, 0.4, 0.3] }, roughness);
    for (let vertex = 0; vertex < mesh.vertices.length; vertex += 8) {
      const world = transform(packed, mesh.vertices.subarray(vertex, vertex + 3));
      const distance = Math.hypot(world[0] - packed[36], world[1] - packed[37], world[2] - packed[38]);
      assert.ok(distance <= packed[39] + 0.0001, `${name}: ${distance} > ${packed[39]}`);
    }
  }
});

test('inverse-transpose instance normals remain perpendicular after nonuniform scaling', () => {
  const packed = new Float32Array(40);
  packInstance(packed, 0, { position: [0, 0, 0], scale: [3, 0.1, 11], rotation: [0.2, 1.1, -0.6], color: [1, 1, 1] }, roughness);
  const tangent = [packed[0], packed[1], packed[2]];
  const normal = [packed[20], packed[21], packed[22]];
  assert.ok(Math.abs(tangent.reduce((sum, value, axis) => sum + value * normal[axis], 0)) < 1e-5);
});

test('renderer exposes the complete integration contract', () => {
  for (const method of ['init', 'setWorld', 'setDynamic', 'render', 'resize', 'dispose', 'getStats']) assert.equal(typeof Renderer.prototype[method], 'function', method);
  const renderer = new Renderer({ getContext() { return null; } });
  assert.equal(renderer.ready, false);
  assert.deepEqual(renderer.errors, []);
  assert.equal(renderer.getStats().gpuMs, null);
  assert.equal(renderer.getStats().backend, 'WebGPU');
  renderer.dispose();
});
