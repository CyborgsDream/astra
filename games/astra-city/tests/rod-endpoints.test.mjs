import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// An explicit source root permits checking another snapshot with the same
// authored endpoint assertions without changing the current source or build.
const root = process.env.ASTRA_ROD_TEST_ROOT
  ? pathToFileURL(resolve(process.env.ASTRA_ROD_TEST_ROOT) + sep)
  : new URL('../', import.meta.url);
const { generateDistrict } = await import(new URL('src/world/district.js', root));
const { packInstance } = await import(new URL('src/engine/math.js', root));
const world = generateDistrict(73191);
const materialDefaults = Array(12).fill(.7);
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

function checkAuthoredRod(a, b, diameter) {
  const midpoint = a.map((value, index) => (value + b[index]) / 2);
  const length = distance(a, b);
  const candidates = world.instances.filter(instance => instance.mesh === 'cylinder'
    && distance(instance.position, midpoint) < 1e-7
    && Math.abs(instance.scale[0] - diameter) < 1e-8
    && Math.abs(instance.scale[1] - length) < 1e-7);
  assert.ok(candidates.length, `Authored rod is absent at ${midpoint.join(', ')}`);
  for (const instance of candidates) {
    const packed = new Float32Array(40);
    packInstance(packed, 0, instance, materialDefaults);
    // Cylinder geometry runs from local Y=-0.5 to Y=+0.5. Verify the actual
    // renderer transform, allowing either endpoint order for a symmetric rod.
    const ends = [-1, 1].map(sign => [
      packed[12] + sign * packed[4] / 2,
      packed[13] + sign * packed[5] / 2,
      packed[14] + sign * packed[6] / 2,
    ]);
    const error = Math.min(
      Math.max(distance(ends[0], a), distance(ends[1], b)),
      Math.max(distance(ends[0], b), distance(ends[1], a)),
    );
    assert.ok(error < 1e-5,
      `Rod at ${midpoint.join(', ')} misses its authored endpoints by ${error.toFixed(6)} metres`);
  }
}

function checkAuthoredCable(a, b, sag, diameter) {
  const segments = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2.4));
  let previous = a;
  for (let index = 1; index <= segments; index++) {
    const t = index / segments;
    const next = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag,
      a[2] + (b[2] - a[2]) * t,
    ];
    checkAuthoredRod(previous, next, diameter);
    previous = next;
  }
}

test('utility crossarm connects its authored horizontal X endpoints', () => {
  checkAuthoredRod([-22.7, 6.4, -29], [-21.3, 6.4, -29], .08);
});

test('market sign crossbar connects its supporting posts', () => {
  checkAuthoredRod([-10.65, 6, -14.7], [-3.35, 6, -14.7], .10);
});

test('vertical market post and yard pipe retain their intended axes', () => {
  checkAuthoredRod([-10.65, 0, -14.7], [-10.65, 6.15, -14.7], .12);
  checkAuthoredRod([57, 5.5, -49], [57, 5.5, -36], .20);
});

test('every segment of a diagonal utility cable meets the next segment', () => {
  // Authored utility spine connection 0 -> 4, first of its two conductors.
  checkAuthoredCable([-22.45, 6.6, -29], [16.55, 6.6, -20], .6, .032);
});

test('a utility cable reversing Z keeps its authored endpoints', () => {
  // Authored utility spine connection 4 -> 5.
  checkAuthoredCable([16.55, 6.6, -20], [40.55, 6.6, -27], .6, .032);
});

test('a utility cable reversing X keeps its authored endpoints', () => {
  // Authored utility spine connection 6 -> 7.
  checkAuthoredCable([55.55, 6.6, 5], [44.15, 6.6, 39], .6, .032);
});
