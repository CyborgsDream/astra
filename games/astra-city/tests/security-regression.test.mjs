import test from 'node:test';
import assert from 'node:assert/strict';
import { SecuritySystem } from '../src/world/security.js';

test('a saved disabled security circuit cannot deliver a previously charged pulse', () => {
  const world = { interactables: [{ id: 'archive', position: [0, 0, 0] }] };
  const security = new SecuritySystem(world, { lineOfSight: () => true });
  security.exposure = 1;
  security.damageClock = 2;
  const restoredState = { world: { flags: { securityDisabled: true }, repaired: [] } };
  const event = security.update(0.016, { position: [0, 0, 0], crouched: false }, restoredState, 10);
  assert.equal(event.damage, 0, 'The disabled circuit must take effect before damage is evaluated.');
});
