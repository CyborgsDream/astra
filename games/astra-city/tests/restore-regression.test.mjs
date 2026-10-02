import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, PlayerController } from '../src/engine/physics.js';
import { GameState } from '../src/game/state.js';

const spawn = { position: [0, 0, 0], yaw: 0, pitch: 0 };
const idle = { forward: 0, right: 0, sprint: false, crouch: false, jumpHeld: false };

test('restoring a journey cancels the previous scripted lift route', () => {
  const controller = new PlayerController(new CollisionWorld([], []), spawn);
  const game = new GameState({ storage: null, autoSave: false });
  controller.moveTo([40, 20, 30], 4, 'elevator');
  controller.update(1, idle, game.data);
  controller.restore({ position: [0, 0, 0], yaw: 0, pitch: 0 });
  controller.update(0.016, idle, game.data);
  assert.equal(controller.position[0], 0, 'A restored player must not resume a previous lift movement.');
  assert.equal(controller.position[2], 0, 'The old scripted destination must not override the restored position.');
  assert.equal(controller.travel, null);
});

test('restoring a fresh player does not retain the former journey scooter or buffered jump', () => {
  const controller = new PlayerController(new CollisionWorld([], []), spawn);
  controller.riding = true;
  controller.jumpBuffer = 0.18;
  controller.coyote = 0.12;
  controller.restore({ position: [0, 0, 0], yaw: 0, pitch: 0 });
  assert.equal(controller.riding, false, 'A fresh or saved on-foot player must not inherit an earlier scooter.');
  assert.equal(controller.jumpBuffer, 0, 'A prior button press must not execute in the restored journey.');
  assert.equal(controller.coyote, 0);
});
