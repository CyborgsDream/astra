import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, SAVE_KEY, SAVE_VERSION, BACKUP_KEY } from '../src/game/state.js';
import { QUESTS, ITEMS, FACTIONS, ENDINGS } from '../src/game/content.js';

class MemoryStorage {
  constructor() { this.values = new Map(); this.failWrite = null; this.failRead = false; }
  getItem(key) { if (this.failRead) throw new Error('Storage is unavailable'); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite === key) throw new Error('Quota exceeded'); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const fresh = (options = {}) => new GameState({ storage: new MemoryStorage(), autoSave: false, ...options });
const snapshot = value => JSON.parse(JSON.stringify(value));
const ok = answer => { assert.equal(answer.ok, true, answer.message); return answer; };

function finishIntro(game) {
  ok(game.acceptQuest('intro'));
  ok(game.interact('clinic_drop'));
  ok(game.interact('mara'));
}

function reachArchive(game) {
  finishIntro(game);
  ok(game.acceptQuest('static_below'));
  ok(game.emit('hack', { target: 'relay' }));
  ok(game.emit('repair', { target: 'pump' }));
  ok(game.interact('ivo'));
  ok(game.acceptQuest('missing_shift'));
  ok(game.interact('cache'));
  ok(game.interact('rescue'));
  ok(game.interact('sana'));
  ok(game.interact('orin'));
  ok(game.acceptQuest('sealed_orders'));
}

function reachChoice(game) {
  reachArchive(game);
  ok(game.emit('hack', { target: 'archive' }));
  ok(game.discover('memorial'));
  ok(game.interact('mara'));
  ok(game.acceptQuest('district_choice'));
  ok(game.emit('repair', { target: 'grid_switch' }));
  ok(game.interact('orin'));
}

test('authored missions and economy reference real targets, items, and prerequisite paths', () => {
  assert.ok(Object.keys(QUESTS).length >= 12);
  assert.equal(FACTIONS.length, 3);
  const targets = new Set(['mara', 'ivo', 'sana', 'orin', 'relay', 'pump', 'cache', 'archive', 'clinic_drop', 'market_drop', 'rooftop_drop', 'rescue', 'home', 'workshop', 'kiosk', 'scooter', 'transit_market', 'transit_works', 'transit_roof', 'lift_ground', 'lift_roof', 'garden', 'memorial', 'grid_switch', 'service_door', 'rooftop_ladder']);
  const seen = new Set();
  const visit = (id, trail = []) => {
    assert.ok(!trail.includes(id), `Cyclic prerequisites at ${id}`);
    assert.ok(QUESTS[id], `Missing prerequisite ${id}`);
    if (seen.has(id)) return;
    for (const prerequisite of QUESTS[id].prerequisites) visit(prerequisite, [...trail, id]);
    seen.add(id);
  };
  for (const quest of Object.values(QUESTS)) {
    visit(quest.id);
    assert.ok(targets.has(quest.giver));
    assert.ok(quest.stages.length >= 2);
    for (const stage of quest.stages) {
      assert.ok(targets.has(stage.target), `Unknown target ${stage.target}`);
      if (stage.requiredItem) assert.ok(ITEMS[stage.requiredItem]);
      if (typeof stage.rewardItem === 'string') assert.ok(ITEMS[stage.rewardItem]);
    }
    for (const id of Object.keys(quest.onAcceptItems ?? {})) assert.ok(ITEMS[id]);
    for (const id of Object.keys(quest.reward.items ?? {})) assert.ok(ITEMS[id]);
    for (const id of Object.keys(quest.reward.reputation ?? {})) assert.ok(FACTIONS.some(faction => faction.id === id));
  }
});

test('the introduction needs clinic delivery and a returned receipt; payment happens once', () => {
  const game = fresh();
  assert.ok(game.data.player.credits >= 60);
  assert.equal(game.data.player.inventory.scanner, 1);
  assert.equal(game.data.player.inventory.hack_tool, 1);
  assert.ok(game.getAvailableQuests('mara').some(quest => quest.id === 'intro'));
  assert.equal(game.acceptQuest('district_choice').ok, false);
  const credits = game.data.player.credits;
  ok(game.acceptQuest('intro'));
  ok(game.interact('mara'));
  assert.equal(game.data.quests.intro.stage, 0);
  assert.equal(game.data.player.inventory.clinic_supplies, 1);
  ok(game.interact('clinic_drop'));
  assert.equal(game.data.quests.intro.stage, 1);
  assert.equal(game.data.player.inventory.clinic_supplies, undefined);
  assert.equal(game.data.player.inventory.clinic_receipt, 1);
  ok(game.interact('clinic_drop'));
  assert.equal(game.data.player.credits, credits);
  const completion = ok(game.interact('mara'));
  assert.equal(completion.completed, true);
  assert.deepEqual(completion.completedQuests, ['intro']);
  assert.equal(game.data.quests.intro.status, 'completed');
  assert.equal(game.data.player.inventory.clinic_receipt, undefined);
  assert.equal(game.data.player.credits, credits + 55);
  ok(game.interact('mara'));
  assert.equal(game.acceptQuest('intro').ok, false);
  assert.equal(game.data.player.credits, credits + 55);
});

test('interaction cannot bypass a hack or a repair, and repaired access persists', () => {
  const game = fresh();
  finishIntro(game);
  ok(game.acceptQuest('static_below'));
  ok(game.interact('relay'));
  assert.equal(game.data.quests.static_below.stage, 0);
  assert.deepEqual(game.data.world.hacked, []);
  ok(game.emit('repair', { target: 'relay' }));
  assert.equal(game.data.quests.static_below.stage, 0);
  ok(game.emit('hack', { target: 'relay' }));
  assert.equal(game.data.quests.static_below.stage, 1);
  ok(game.interact('pump'));
  assert.equal(game.data.quests.static_below.stage, 1);
  ok(game.emit('repair', { target: 'pump' }));
  assert.equal(game.data.quests.static_below.stage, 2);
  assert.ok(game.data.world.repaired.includes('pump'));
  ok(game.interact('ivo'));
  assert.ok(game.data.world.opened.includes('service_door'));
});

for (const choice of Object.keys(ENDINGS)) {
  test(`the full missing-crew arc resolves the ${choice} agreement without duplicate rewards`, () => {
    const game = fresh();
    reachChoice(game);
    assert.ok(game.data.world.rescued.includes('rescue'));
    assert.equal(game.data.world.flags.securityDisabled, true);
    assert.equal(game.data.player.inventory.bridge_capacitor, undefined);
    const before = snapshot(game.data);
    const prompt = game.interact('grid_switch');
    assert.equal(prompt.ok, false);
    assert.equal(prompt.needsChoice, true);
    assert.equal(prompt.choices.length, 3);
    assert.equal(game.interact('grid_switch', { choice: 'invented' }).needsChoice, true);
    assert.deepEqual(game.data, before);
    const ending = ok(game.interact('grid_switch', { choice }));
    assert.equal(ending.completed, true);
    assert.equal(ending.ending.id, choice);
    assert.equal(game.data.quests.district_choice.status, 'completed');
    assert.equal(game.data.world.policy, choice);
    assert.equal(game.data.world.power, true);
    assert.equal(game.data.world.flags.storyComplete, true);
    assert.equal(game.data.player.credits, before.player.credits + 180);
    for (const [faction, amount] of Object.entries(ENDINGS[choice].reputation)) {
      assert.equal(game.data.reputation[faction], before.reputation[faction] + amount);
    }
    for (const [id, amount] of Object.entries(ENDINGS[choice].items)) {
      assert.equal(game.data.player.inventory[id], (before.player.inventory[id] ?? 0) + amount);
    }
    const after = snapshot(game.data);
    ok(game.interact('grid_switch', { choice }));
    ok(game.emit('repair', { target: 'grid_switch' }));
    assert.deepEqual(game.data, after);
    assert.equal(ok(game.replayEnding()).ending.id, choice);
    assert.deepEqual(game.data, after);
    assert.ok(game.getAvailableQuests('mara').some(quest => quest.id === 'courier_loop'));
    assert.ok(game.getAvailableQuests('sana').some(quest => quest.id === 'night_shift'));
  });
}

test('repeatable courier runs require a fresh parcel and returned receipt each time', () => {
  const game = fresh();
  finishIntro(game);
  const balance = game.data.player.credits;
  for (let run = 1; run <= 3; run++) {
    ok(game.acceptQuest('courier_loop'));
    assert.equal(game.acceptQuest('courier_loop').ok, false);
    ok(game.interact('mara'));
    assert.equal(game.data.player.credits, balance + (run - 1) * 28);
    ok(game.interact('market_drop'));
    ok(game.interact('mara'));
    ok(game.interact('mara'));
    ok(game.interact('market_drop'));
    assert.equal(game.data.player.credits, balance + run * 28);
    assert.equal(game.data.player.inventory.courier_parcel, undefined);
    assert.equal(game.data.player.inventory.courier_receipt, undefined);
    assert.equal(game.data.quests.courier_loop.completions, run);
    assert.equal(game.data.quests.courier_loop.paidRuns, run);
    assert.ok(game.getAvailableQuests('mara').some(quest => quest.id === 'courier_loop'));
  }
  assert.equal(game.save(), true);
  const resumed = fresh({ storage: game.storage });
  assert.equal(resumed.load(), true);
  ok(resumed.interact('mara'));
  assert.equal(resumed.data.player.credits, balance + 84);
  ok(resumed.acceptQuest('courier_loop'));
  ok(resumed.interact('mara'));
  assert.equal(resumed.data.player.credits, balance + 84);
});

test('prior discoveries and successful circuits remain useful to later jobs', () => {
  const game = fresh();
  ok(game.discover('memorial'));
  ok(game.discover('garden'));
  ok(game.acceptQuest('ward_walk'));
  assert.equal(game.data.quests.ward_walk.stage, 2);
  ok(game.interact('orin'));
  finishIntro(game);
  ok(game.emit('hack', { target: 'relay' }));
  ok(game.acceptQuest('signal_map'));
  assert.equal(game.data.quests.signal_map.stage, 2);
  ok(game.interact('orin'));
  assert.equal(game.data.quests.signal_map.status, 'completed');
});

test('salvage recovery and optional repair missions use their own items and work', () => {
  const game = fresh();
  ok(game.acceptQuest('salvage_claim'));
  ok(game.interact('cache'));
  assert.equal(game.data.player.inventory.copper_coil, 1);
  ok(game.emit('loot', { target: 'cache' }));
  ok(game.interact('workshop'));
  assert.equal(game.data.quests.salvage_claim.status, 'completed');
  assert.equal(game.data.player.inventory.copper_coil, undefined);
  finishIntro(game);
  ok(game.acceptQuest('relay_tuning'));
  ok(game.interact('relay'));
  assert.equal(game.data.quests.relay_tuning.stage, 0);
  ok(game.emit('repair', { target: 'relay' }));
  assert.equal(game.data.player.inventory.calibration_note, 1);
  ok(game.interact('rooftop_drop'));
  ok(game.interact('ivo'));
  assert.equal(game.data.quests.relay_tuning.status, 'completed');
});

test('economy cannot overdraw credits, duplicate permanent tools, or spend invalid quantities', () => {
  const game = fresh();
  const before = snapshot(game.data);
  assert.equal(game.buy('runner_soles').ok, false);
  assert.equal(game.buy('battery', -1).ok, false);
  assert.equal(game.buy('battery', 1.5).ok, false);
  assert.equal(game.buy('clinic_supplies').ok, false);
  assert.equal(game.buy('__proto__').ok, false);
  assert.deepEqual(game.data, before);
  finishIntro(game);
  ok(game.buy('signal_decoder'));
  assert.equal(game.data.player.credits, 20);
  assert.equal(game.buy('signal_decoder').ok, false);
  assert.equal(game.buy('medkit').ok, false);
  assert.equal(game.data.player.credits, 20);
  ok(game.equip('signal_decoder'));
  assert.ok(game.data.player.equipment.includes('signal_decoder'));
  assert.ok(!game.data.player.equipment.includes('hack_tool'));
  assert.equal(game.data.player.inventory.hack_tool, 1);
  assert.equal(game.getEquipmentEffects().hackAssist, 1);
});

test('consumables restore useful resources, and equipped upgrades have measurable effects', () => {
  const game = fresh();
  assert.equal(game.use('medkit').ok, false);
  assert.equal(game.data.player.inventory.medkit, 1);
  ok(game.emit('damage', { amount: 60 }));
  ok(game.use('medkit'));
  assert.equal(game.data.player.health, 85);
  assert.equal(game.data.player.inventory.medkit, undefined);
  ok(game.emit('energy', { amount: 60 }));
  ok(game.use('battery'));
  assert.equal(game.data.player.energy, 85);
  finishIntro(game);
  ok(game.buy('runner_soles'));
  ok(game.equip('runner_soles'));
  assert.equal(game.getEquipmentEffects().moveSpeed, 1.12);
  assert.equal(game.getEquipmentEffects().energyRegen, 1.25);
  ok(game.tick(1));
  assert.equal(game.data.player.energy, 88);
  assert.equal(game.use('runner_soles').ok, false);
  ok(game.emit('restore'));
  assert.equal(game.data.player.health, 100);
  assert.equal(game.data.player.energy, 100);
});

test('loot, door access, power, and mechanism flags persist without repeated salvage payouts', () => {
  const game = fresh();
  const before = game.data.player.credits;
  ok(game.emit('loot', { target: 'cache' }));
  assert.equal(game.data.player.credits, before + 20);
  assert.equal(game.data.player.inventory.battery, 2);
  assert.equal(game.emit('loot', { target: 'cache' }).ok, false);
  assert.equal(game.data.player.credits, before + 20);
  ok(game.emit('power', { enabled: true }));
  ok(game.emit('open', { target: 'service_door' }));
  ok(game.emit('flag', { name: 'securityDisabled', value: true }));
  assert.equal(game.emit('flag', { name: 'constructor', value: true }).ok, false);
  assert.equal(game.save(), true);
  const resumed = fresh({ storage: game.storage });
  assert.equal(resumed.load(), true);
  assert.equal(resumed.data.world.power, true);
  assert.equal(resumed.data.world.flags.securityDisabled, true);
  assert.ok(resumed.data.world.opened.includes('service_door'));
  assert.equal(resumed.emit('loot', { target: 'cache' }).ok, false);
  assert.equal(resumed.data.player.credits, before + 20);
  ok(resumed.emit('close', { target: 'service_door' }));
  assert.ok(!resumed.data.world.opened.includes('service_door'));
});

test('save and reload preserve the complete active choice, location, economy, and world state', () => {
  const storage = new MemoryStorage();
  const game = fresh({ storage });
  reachChoice(game);
  ok(game.setPlayer([18, 24.6, -40], 0.6, -0.25));
  ok(game.emit('loot', { target: 'cache' }));
  ok(game.emit('flag', { name: 'serviceGateInspected', value: true }));
  game.data.settings.adaptive = false;
  game.data.world.weather = 'rain';
  ok(game.tick(10));
  assert.equal(game.save(), true);
  const expected = snapshot(game.data);
  const raw = storage.getItem(SAVE_KEY);
  const resumed = fresh({ storage });
  assert.equal(storage.getItem(SAVE_KEY), raw, 'Constructing GameState must not overwrite a save.');
  assert.equal(resumed.load(), true);
  assert.deepEqual(resumed.data, expected);
  assert.equal(resumed.interact('grid_switch').needsChoice, true);
  ok(resumed.interact('grid_switch', { choice: 'cooperative' }));
  assert.equal(resumed.save(), true);
  const finished = fresh({ storage });
  assert.equal(finished.load(), true);
  const credits = finished.data.player.credits;
  ok(finished.interact('grid_switch', { choice: 'commons' }));
  assert.equal(finished.data.player.credits, credits);
  assert.equal(finished.data.world.ending.id, 'cooperative');
});

test('version-one migration preserves completed rewards and takes a backup on the next save', () => {
  const game = fresh();
  finishIntro(game);
  const legacy = snapshot(game.data);
  legacy.version = 1;
  delete legacy.world.hacked;
  delete legacy.world.rescued;
  delete legacy.world.flags;
  delete legacy.settings.adaptive;
  for (const record of Object.values(legacy.quests)) {
    delete record.run;
    delete record.paidRuns;
    delete record.completions;
    delete record.acceptedAt;
    delete record.completedAt;
    record.progress = {};
  }
  const storage = new MemoryStorage();
  const raw = JSON.stringify(legacy);
  storage.setItem(SAVE_KEY, raw);
  const resumed = fresh({ storage });
  assert.equal(resumed.load(), true);
  assert.equal(resumed.loadStatus.code, 'migrated');
  assert.equal(resumed.data.version, SAVE_VERSION);
  assert.equal(resumed.data.quests.intro.paidRuns, 1);
  const credits = resumed.data.player.credits;
  ok(resumed.interact('mara'));
  assert.equal(resumed.data.player.credits, credits);
  assert.equal(storage.getItem(SAVE_KEY), raw, 'Loading/migration must not alter the original.');
  assert.equal(resumed.save(), true);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
});

test('corrupt and unknown future saves are protected from loading and automatic overwrite', () => {
  for (const raw of ['{broken json', JSON.stringify({ ...fresh().data, version: SAVE_VERSION + 1 })]) {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const game = new GameState({ storage });
    assert.equal(game.hasSave(), true);
    assert.equal(game.load(), false);
    assert.equal(game.loadStatus.protected, true);
    ok(game.buy('battery'));
    assert.equal(game.save(), false);
    assert.equal(storage.getItem(SAVE_KEY), raw);
  }
});

test('malicious or inconsistent save objects are rejected without prototype pollution', () => {
  const malformed = ['{"version":1}'];
  const negative = snapshot(fresh().data); negative.player.credits = -10; malformed.push(JSON.stringify(negative));
  const unknownItem = snapshot(fresh().data); unknownItem.player.inventory.unlisted = 1; malformed.push(JSON.stringify(unknownItem));
  const duplicateEquipment = snapshot(fresh().data); duplicateEquipment.player.inventory.field_scanner = 1; duplicateEquipment.player.equipment.push('field_scanner'); malformed.push(JSON.stringify(duplicateEquipment));
  const game = fresh(); finishIntro(game);
  const wrongPayment = snapshot(game.data); wrongPayment.quests.intro.paidRuns = 0; malformed.push(JSON.stringify(wrongPayment));
  const pollution = JSON.stringify(fresh().data).replace('"flags":{}', '"flags":{"__proto__":{"polluted":true}}'); malformed.push(pollution);
  const invalidFlag = snapshot(fresh().data); invalidFlag.world.flags.securityDisabled = 'yes'; malformed.push(JSON.stringify(invalidFlag));
  const falseEnding = snapshot(fresh().data); falseEnding.world.ending = { id: 'commons' }; falseEnding.world.policy = 'commons'; malformed.push(JSON.stringify(falseEnding));
  for (const raw of malformed) {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const resumed = fresh({ storage });
    assert.equal(resumed.load(), false);
    assert.equal(resumed.save(), false);
    assert.equal(storage.getItem(SAVE_KEY), raw);
  }
  assert.equal({}.polluted, undefined);
});

test('a valid backup can recover a corrupt primary without destroying the damaged original', () => {
  const storage = new MemoryStorage();
  const game = fresh({ storage });
  assert.equal(game.save(), true);
  const first = storage.getItem(SAVE_KEY);
  finishIntro(game);
  assert.equal(game.save(), true);
  assert.equal(storage.getItem(BACKUP_KEY), first);
  storage.setItem(SAVE_KEY, 'damaged original');
  const resumed = fresh({ storage });
  assert.equal(resumed.load(), true);
  assert.equal(resumed.loadStatus.code, 'backup-loaded');
  assert.equal(resumed.loadStatus.protected, true);
  assert.deepEqual(resumed.data, JSON.parse(first));
  assert.equal(resumed.save(), false);
  assert.equal(storage.getItem(SAVE_KEY), 'damaged original');
  const reset = ok(resumed.reset(29));
  assert.equal(storage.getItem(reset.archivedAs), 'damaged original');
  assert.equal(resumed.data.seed, 29);
  assert.equal(resumed.save(), true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).seed, 29);
});

test('future primary versions are not silently replaced by an older valid backup', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify({ ...fresh().data, version: SAVE_VERSION + 1 });
  storage.setItem(SAVE_KEY, raw);
  storage.setItem(BACKUP_KEY, JSON.stringify(fresh().data));
  const game = fresh({ storage });
  assert.equal(game.load(), false);
  assert.equal(game.loadStatus.code, 'future-version');
  assert.equal(game.save(), false);
  assert.equal(storage.getItem(SAVE_KEY), raw);
});

test('a future or damaged backup is preserved when a new save is requested', () => {
  for (const backup of ['broken backup', JSON.stringify({ ...fresh().data, version: SAVE_VERSION + 1 })]) {
    const storage = new MemoryStorage();
    const game = fresh({ storage });
    assert.equal(game.save(), true);
    const primary = storage.getItem(SAVE_KEY);
    storage.setItem(BACKUP_KEY, backup);
    finishIntro(game);
    assert.equal(game.save(), false);
    assert.equal(storage.getItem(SAVE_KEY), primary);
    assert.equal(storage.getItem(BACKUP_KEY), backup);
  }
});

test('failed backup and primary writes retain the last valid primary', () => {
  const storage = new MemoryStorage();
  const game = fresh({ storage });
  assert.equal(game.save(), true);
  const original = storage.getItem(SAVE_KEY);
  finishIntro(game);
  storage.failWrite = BACKUP_KEY;
  assert.equal(game.save(), false);
  assert.equal(storage.getItem(SAVE_KEY), original);
  storage.failWrite = SAVE_KEY;
  assert.equal(game.save(), false);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(BACKUP_KEY), original);
  storage.failWrite = null;
  assert.equal(game.save(), true);
  game.data.player.credits = NaN;
  const lastValid = storage.getItem(SAVE_KEY);
  assert.equal(game.save(), false);
  assert.equal(storage.getItem(SAVE_KEY), lastValid);
  storage.failRead = true;
  assert.equal(game.hasSave(), false);
  assert.equal(game.load(), false);
});

test('journal and objective views have stable UI shapes, and subscriptions unsubscribe', () => {
  const game = fresh();
  let changes = 0;
  const unsubscribe = game.onChange((data, event) => { assert.equal(data, game.data); assert.equal(typeof event.type, 'string'); changes++; });
  game.onChange(() => { throw new Error('A broken UI listener'); });
  ok(game.acceptQuest('intro'));
  const row = game.getQuestView()[0];
  assert.equal(row.text, 'Deliver Mara’s medicine to the clinic.');
  assert.deepEqual(row.progress, { current: 0, total: 2, count: 0, needed: 1, ratio: 0 });
  assert.deepEqual(game.getObjectiveTargets()[0], { id: 'intro:0', target: 'clinic_drop', label: row.text, questId: 'intro', kind: 'deliver' });
  assert.ok(game.getAvailableQuests('workshop').some(quest => quest.id === 'salvage_claim'));
  assert.equal(changes, 1);
  unsubscribe();
  ok(game.interact('clinic_drop'));
  assert.equal(changes, 1);
});

test('tick is bounded, preserves player position and chosen weather, and advances a 24-minute day', () => {
  const game = fresh();
  ok(game.setPlayer([1, 2, 3], 0.8, 0.2));
  game.data.world.weather = 'rain';
  const hour = game.data.world.hour;
  ok(game.tick(30));
  assert.deepEqual(game.data.player.position, [1, 2, 3]);
  assert.equal(game.data.world.weather, 'rain');
  assert.equal(game.data.world.hour, hour + 0.5);
  assert.equal(game.data.playTime, 30);
  const before = snapshot(game.data);
  assert.equal(game.tick(NaN).ok, false);
  assert.equal(game.tick(-1).ok, false);
  assert.equal(game.setPlayer([1, 2, NaN]).ok, false);
  assert.deepEqual(game.data, before);
});
