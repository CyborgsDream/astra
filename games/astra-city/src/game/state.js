import { QUESTS, ITEMS, FACTIONS, ENDINGS, DIALOGUE } from './content.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'astra-city-save';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
const DEFAULT_SEED = 73191;
const MAX_CREDITS = 1_000_000_000;
const MAX_STACK = 9999;
const MAX_SAVE_BYTES = 1_000_000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value);
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const result = (ok, message, extra = {}) => ({ ok, message, ...extra });

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function initialState(seed = DEFAULT_SEED) {
  return {
    version: SAVE_VERSION,
    seed: Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : DEFAULT_SEED,
    player: {
      position: [0, 0, 0], yaw: 0, pitch: 0, health: 100, energy: 100, credits: 90,
      inventory: { scanner: 1, hack_tool: 1, medkit: 1, battery: 1 },
      equipment: ['scanner', 'hack_tool'],
    },
    quests: {},
    reputation: Object.fromEntries(FACTIONS.map(faction => [faction.id, 0])),
    discoveries: [],
    world: {
      opened: [], looted: [], repaired: [], hacked: [], rescued: [],
      power: false, hour: 15.5, weather: 'clear', policy: null, ending: null, flags: {},
    },
    settings: { quality: 'high', renderScale: 1, sensitivity: 1, volume: 0.35, fov: 75, invertY: false, showMinimap: true, adaptive: true },
    playTime: 0,
  };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function numberIn(value, low, high, integer = false) {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
    && (!integer || Number.isInteger(value));
}

/** Reject dangerous keys, exotic objects, excessive nesting, and excessive collection sizes. */
function checkJSONTree(value, depth = 0, budget = { remaining: 20000 }) {
  requireValue(depth <= 20 && --budget.remaining >= 0, 'The save is too complex.');
  if (value === null || typeof value !== 'object') {
    requireValue(['string', 'number', 'boolean'].includes(typeof value) || value === null, 'The save contains unsupported values.');
    if (typeof value === 'string') requireValue(value.length <= 10000, 'The save contains an oversized value.');
    if (typeof value === 'number') requireValue(Number.isFinite(value), 'The save contains an invalid number.');
    return;
  }
  requireValue(Array.isArray(value) || isPlain(value), 'The save contains an unsupported object.');
  for (const key of Object.keys(value)) {
    requireValue(!['__proto__', 'constructor', 'prototype'].includes(key), 'The save contains an unsafe property.');
    checkJSONTree(value[key], depth + 1, budget);
  }
}

function idList(value, name) {
  requireValue(Array.isArray(value) && value.length <= 512 && value.every(validId), `Invalid ${name}.`);
  requireValue(new Set(value).size === value.length, `Duplicate ${name}.`);
  return [...value];
}

function migrateV1(raw) {
  requireValue(isPlain(raw.player) && numberIn(raw.seed, 0, 0xffffffff, true), 'The legacy save is missing its player or district record.');
  const base = initialState(raw.seed);
  const migrated = {
    ...base, ...clone(raw), version: SAVE_VERSION,
    player: { ...base.player, ...raw.player },
    world: { ...base.world, ...raw.world },
    settings: { ...base.settings, ...raw.settings },
    reputation: { ...base.reputation, ...raw.reputation },
    quests: {},
  };
  requireValue(isPlain(raw.quests ?? {}), 'Invalid legacy mission record.');
  for (const [id, entry] of Object.entries(raw.quests ?? {})) {
    requireValue(own(QUESTS, id) && isPlain(entry), 'Unknown legacy mission.');
    const completed = entry.status === 'completed';
    const paid = entry.completions ?? entry.paidRuns ?? (completed ? 1 : 0);
    requireValue(numberIn(paid, completed ? 1 : 0, 1_000_000, true), 'Invalid legacy mission payment count.');
    migrated.quests[id] = {
      ...entry,
      stage: completed ? QUESTS[id].stages.length : entry.stage,
      progress: typeof entry.progress === 'number' ? entry.progress : (entry.progress?.count ?? 0),
      run: paid + (completed ? 0 : 1), paidRuns: paid, completions: paid, choice: entry.choice ?? null,
      acceptedAt: entry.acceptedAt ?? 0,
      completedAt: completed ? (entry.completedAt ?? raw.playTime ?? 0) : null,
    };
  }
  if (typeof migrated.world.ending === 'string' && own(ENDINGS, migrated.world.ending)) {
    const ending = ENDINGS[migrated.world.ending];
    migrated.world.ending = { id: ending.id, title: ending.title, text: ending.text };
  }
  return migrated;
}

/** Validate and copy only supported fields; never trust object prototypes or saved UI text. */
function normalizeSave(raw) {
  checkJSONTree(raw);
  requireValue(isPlain(raw), 'The save must be an object.');
  requireValue(Number.isInteger(raw.version) && raw.version >= 1, 'The save version is missing or invalid.');
  if (raw.version > SAVE_VERSION) {
    const error = new Error(`This save uses version ${raw.version}; this build supports version ${SAVE_VERSION}. The original is protected.`);
    error.code = 'future-version';
    throw error;
  }
  const migrated = raw.version === 1;
  const source = migrated ? migrateV1(raw) : raw;
  const base = initialState();
  requireValue(numberIn(source.seed, 0, 0xffffffff, true), 'Invalid district seed.');
  requireValue(isPlain(source.player), 'Invalid player record.');
  const player = source.player;
  requireValue(Array.isArray(player.position) && player.position.length === 3 && player.position.every(n => numberIn(n, -100000, 100000)), 'Invalid player position.');
  requireValue(numberIn(player.yaw, -1e9, 1e9) && numberIn(player.pitch, -Math.PI / 2 - 0.01, Math.PI / 2 + 0.01), 'Invalid view direction.');
  requireValue(numberIn(player.health, 0, 100) && numberIn(player.energy, 0, 100), 'Invalid health or energy.');
  requireValue(numberIn(player.credits, 0, MAX_CREDITS, true), 'Invalid credit balance.');
  requireValue(isPlain(player.inventory) && Object.keys(player.inventory).length <= Object.keys(ITEMS).length, 'Invalid inventory.');
  const inventory = {};
  for (const [id, count] of Object.entries(player.inventory)) {
    requireValue(own(ITEMS, id) && numberIn(count, 0, MAX_STACK, true), 'Unknown item or invalid item count.');
    if (count > 0) inventory[id] = count;
  }
  const equipment = idList(player.equipment, 'equipment');
  const slots = new Set();
  for (const id of equipment) {
    requireValue(own(ITEMS, id) && inventory[id] > 0 && ITEMS[id].slot, 'Equipped item is not owned or cannot be equipped.');
    requireValue(!slots.has(ITEMS[id].slot), 'More than one item occupies an equipment slot.');
    slots.add(ITEMS[id].slot);
  }
  requireValue(isPlain(source.quests) && Object.keys(source.quests).length <= Object.keys(QUESTS).length, 'Invalid mission record.');
  const quests = {};
  for (const [id, entry] of Object.entries(source.quests)) {
    requireValue(own(QUESTS, id) && isPlain(entry), 'Unknown mission in save.');
    const definition = QUESTS[id];
    requireValue(['active', 'completed'].includes(entry.status), 'Invalid mission status.');
    requireValue(numberIn(entry.stage, 0, definition.stages.length, true), 'Invalid mission stage.');
    requireValue(entry.status === 'completed' ? entry.stage === definition.stages.length : entry.stage < definition.stages.length, 'Mission stage does not match its status.');
    const progressLimit = entry.status === 'active' ? (definition.stages[entry.stage].count ?? 1) - 1 : 0;
    requireValue(numberIn(entry.progress, 0, progressLimit, true), 'Invalid mission progress.');
    requireValue(numberIn(entry.run, 1, 1_000_000, true) && numberIn(entry.paidRuns, 0, 1_000_000, true), 'Invalid mission payment record.');
    requireValue(entry.completions === entry.paidRuns, 'Mission completion and payment records disagree.');
    requireValue(entry.paidRuns === entry.run - (entry.status === 'active' ? 1 : 0), 'Invalid mission payment sequence.');
    requireValue(definition.repeatable || entry.run === 1, 'A unique mission has repeated rewards.');
    const choice = entry.choice ?? null;
    requireValue(choice === null || (id === 'district_choice' && own(ENDINGS, choice)), 'Invalid mission choice.');
    requireValue(numberIn(entry.acceptedAt, 0, 1e10), 'Invalid mission start time.');
    requireValue(entry.completedAt === null || numberIn(entry.completedAt, 0, 1e10), 'Invalid mission completion time.');
    quests[id] = {
      status: entry.status, stage: entry.stage, progress: entry.progress,
      run: entry.run, paidRuns: entry.paidRuns, completions: entry.completions,
      choice, acceptedAt: entry.acceptedAt, completedAt: entry.completedAt,
    };
  }
  for (const id of Object.keys(quests)) {
    requireValue(QUESTS[id].prerequisites.every(prerequisite => quests[prerequisite]?.status === 'completed'), 'A mission is missing its prerequisite record.');
  }
  requireValue(isPlain(source.reputation), 'Invalid faction record.');
  const reputation = {};
  for (const faction of FACTIONS) {
    requireValue(numberIn(source.reputation[faction.id], -100, 100, true), 'Invalid faction reputation.');
    reputation[faction.id] = source.reputation[faction.id];
  }
  requireValue(isPlain(source.world), 'Invalid world record.');
  const world = source.world;
  requireValue(typeof world.power === 'boolean', 'Invalid power state.');
  requireValue(numberIn(world.hour, 0, 24) && ['clear', 'overcast', 'rain'].includes(world.weather), 'Invalid time or weather.');
  requireValue(world.policy == null || own(ENDINGS, world.policy), 'Invalid grid agreement.');
  requireValue(isPlain(world.flags ?? {}) && Object.keys(world.flags ?? {}).length <= 128, 'Invalid mechanism flags.');
  const flags = {};
  for (const [name, value] of Object.entries(world.flags ?? {})) {
    requireValue(validId(name) && typeof value === 'boolean', 'Invalid mechanism flag.');
    flags[name] = value;
  }
  let ending = null;
  if (world.ending != null) {
    requireValue(isPlain(world.ending) && own(ENDINGS, world.ending.id), 'Invalid ending record.');
    requireValue(quests.district_choice?.status === 'completed' && quests.district_choice.choice === world.ending.id, 'Ending does not match the completed mission.');
    requireValue(world.policy === world.ending.id, 'Ending does not match grid control.');
    const authored = ENDINGS[world.ending.id];
    ending = { id: authored.id, title: authored.title, text: authored.text };
  }
  requireValue(isPlain(source.settings), 'Invalid settings.');
  const settings = source.settings;
  requireValue(['low', 'medium', 'high'].includes(settings.quality), 'Invalid graphics quality.');
  requireValue(numberIn(settings.renderScale, 0.5, 1) && numberIn(settings.sensitivity, 0.05, 5), 'Invalid rendering or input settings.');
  requireValue(numberIn(settings.volume, 0, 1) && numberIn(settings.fov, 45, 120), 'Invalid audio or view settings.');
  requireValue(typeof settings.invertY === 'boolean' && typeof settings.showMinimap === 'boolean', 'Invalid display settings.');
  requireValue(settings.adaptive === undefined || typeof settings.adaptive === 'boolean', 'Invalid adaptive rendering setting.');
  requireValue(numberIn(source.playTime, 0, 1e10), 'Invalid play time.');
  return {
    migrated,
    data: {
      version: SAVE_VERSION, seed: source.seed,
      player: { position: [...player.position], yaw: player.yaw, pitch: player.pitch, health: player.health, energy: player.energy, credits: player.credits, inventory, equipment },
      quests, reputation, discoveries: idList(source.discoveries, 'discoveries'),
      world: {
        opened: idList(world.opened, 'open doors'), looted: idList(world.looted, 'looted containers'),
        repaired: idList(world.repaired, 'repairs'), hacked: idList(world.hacked ?? base.world.hacked, 'hacked circuits'),
        rescued: idList(world.rescued ?? base.world.rescued, 'rescued workers'),
        power: world.power, hour: world.hour % 24, weather: world.weather, policy: world.policy ?? null, ending, flags,
      },
      settings: { quality: settings.quality, renderScale: settings.renderScale, sensitivity: settings.sensitivity, volume: settings.volume, fov: settings.fov, invertY: settings.invertY, showMinimap: settings.showMinimap, adaptive: settings.adaptive ?? true },
      playTime: source.playTime,
    },
  };
}

function parseSave(text) {
  requireValue(typeof text === 'string' && text.length > 0 && text.length <= MAX_SAVE_BYTES, 'Save data is empty or too large.');
  return normalizeSave(JSON.parse(text));
}

/**
 * Stateful, renderer-independent gameplay. Events represent actions the caller has verified.
 * Successful hacks/repairs MUST arrive through emit; proximity/UI interaction cannot substitute.
 * All public mutations return {ok,message,...}; load/save/hasSave return booleans.
 */
export class GameState {
  constructor({ storage = browserStorage(), seed = DEFAULT_SEED, autoSave = true, saveKey = SAVE_KEY } = {}) {
    this.storage = storage;
    this.saveKey = saveKey;
    this.backupKey = `${saveKey}.backup`;
    this.autoSave = autoSave;
    this.data = initialState(seed);
    this.listeners = new Set();
    this.loadStatus = { ok: true, code: 'new-session', message: 'A new shift is ready.' };
    this.saveStatus = { ok: true, code: 'not-saved', message: 'This shift has not been saved yet.' };
    this.statusMessage = this.loadStatus.message;
    this._notifyTime = 0;
    this._saveTime = 0;
    this._archiveSequence = 0;
  }

  onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify(type, message = '') {
    for (const fn of [...this.listeners]) {
      try { fn(this.data, { type, message }); } catch { /* A UI subscriber must not break gameplay. */ }
    }
  }

  _changed(type, message = '', persist = true) {
    if (persist && this.autoSave && this.storage) this.save();
    this._notify(type, message);
  }

  _status(which, status) {
    this[which] = status;
    this.statusMessage = status.message;
    return status.ok;
  }

  newGame(seed = this.data.seed, options = {}) {
    if (options.overwrite === true) return this.reset(seed);
    this.data = initialState(seed);
    this._notifyTime = 0;
    this._saveTime = 0;
    this._notify('new-game', 'Your next shift in Switchback begins.');
    return result(true, 'Your next shift in Switchback begins.', { changed: true });
  }

  /** Explicit reset archives the previous raw save before allowing a fresh one. */
  reset(seed = this.data.seed) {
    let archivedAs = null;
    if (this.storage) {
      try {
        const previous = this.storage.getItem(this.saveKey);
        const backup = this.storage.getItem(this.backupKey);
        const prefix = `${this.saveKey}.recovery.${Date.now()}.${++this._archiveSequence}`;
        if (previous != null) {
          archivedAs = prefix;
          this.storage.setItem(archivedAs, previous);
        }
        if (backup != null) this.storage.setItem(`${prefix}.backup`, backup);
        this.storage.removeItem(this.saveKey);
        this.storage.removeItem(this.backupKey);
      } catch {
        return result(false, 'The previous save could not be archived. It has not been replaced.');
      }
    }
    this.newGame(seed);
    this.loadStatus = { ok: true, code: 'new-game', message: 'A fresh shift is ready; the previous save was archived.' };
    this.statusMessage = this.loadStatus.message;
    return result(true, 'A fresh shift is ready.', { changed: true, archivedAs });
  }

  hasSave() {
    if (!this.storage) return false;
    try { return this.storage.getItem(this.saveKey) != null || this.storage.getItem(this.backupKey) != null; }
    catch { return false; }
  }

  load() {
    if (!this.storage) return this._status('loadStatus', { ok: false, code: 'unavailable', message: 'Save storage is unavailable in this session.' });
    let primary;
    let backup;
    try {
      primary = this.storage.getItem(this.saveKey);
      backup = this.storage.getItem(this.backupKey);
    } catch {
      return this._status('loadStatus', { ok: false, code: 'storage-error', message: 'The browser could not read this save. Your stored data is unchanged.' });
    }
    if (primary == null && backup == null) return this._status('loadStatus', { ok: false, code: 'missing', message: 'No saved shift was found.' });
    let primaryError = null;
    if (primary != null) {
      try {
        const decoded = parseSave(primary);
        this.data = decoded.data;
        this._notifyTime = 0;
        this._saveTime = 0;
        this._status('loadStatus', { ok: true, code: decoded.migrated ? 'migrated' : 'loaded', message: decoded.migrated ? 'Your earlier save has been upgraded. Progress and rewards are preserved.' : 'Your saved shift is ready.' });
        this._notify('load', this.statusMessage);
        return true;
      } catch (error) { primaryError = error; }
    }
    // Future saves are never downgraded to a backup from an older build.
    if (primaryError?.code === 'future-version') {
      return this._status('loadStatus', { ok: false, code: 'future-version', protected: true, message: primaryError.message });
    }
    if (backup != null) {
      try {
        this.data = parseSave(backup).data;
        this._notifyTime = 0;
        this._saveTime = 0;
        this._status('loadStatus', {
          ok: true, code: 'backup-loaded', protected: primary != null,
          message: primary != null
            ? 'The last valid backup was recovered. The damaged original is protected; start a fresh shift to archive it before saving over it.'
            : 'The last valid backup was recovered.',
        });
        this._notify('load', this.statusMessage);
        return true;
      } catch (error) {
        if (error.code === 'future-version') return this._status('loadStatus', { ok: false, code: 'future-version', protected: true, message: `The backup belongs to a newer build. ${error.message}` });
        // Keep both raw strings intact for recovery.
      }
    }
    return this._status('loadStatus', { ok: false, code: 'invalid-save', protected: true, message: 'The save could not be read safely. The original data is protected and has not been changed.' });
  }

  save() {
    if (!this.storage) return this._status('saveStatus', { ok: false, code: 'unavailable', message: 'Save storage is unavailable in this session.' });
    let next;
    try { next = JSON.stringify(normalizeSave(this.data).data); }
    catch (error) { return this._status('saveStatus', { ok: false, code: 'invalid-state', message: `This shift could not be saved: ${error.message} The previous save is unchanged.` }); }
    try {
      const previous = this.storage.getItem(this.saveKey);
      const previousBackup = this.storage.getItem(this.backupKey);
      if (previousBackup != null) {
        try { parseSave(previousBackup); }
        catch (error) {
          return this._status('saveStatus', { ok: false, code: error.code ?? 'protected-backup', protected: true, message: error.code === 'future-version' ? `The backup belongs to a newer build. ${error.message}` : 'The existing backup is damaged and protected. Start a fresh shift to archive it before replacing it.' });
        }
      }
      if (previous != null) {
        try { parseSave(previous); }
        catch (error) {
          return this._status('saveStatus', { ok: false, code: error.code ?? 'protected-save', protected: true, message: error.code === 'future-version' ? error.message : 'The existing save is damaged and protected. Start a fresh shift to archive it before replacing it.' });
        }
        if (previous === next) return this._status('saveStatus', { ok: true, code: 'saved', message: 'Shift saved.' });
        // Write the old, validated primary first. Failure leaves primary untouched.
        this.storage.setItem(this.backupKey, previous);
      }
      this.storage.setItem(this.saveKey, next);
      this._saveTime = 0;
      return this._status('saveStatus', { ok: true, code: 'saved', message: 'Shift saved.' });
    } catch {
      return this._status('saveStatus', { ok: false, code: 'storage-error', message: 'The browser could not store this shift. The last valid save is still available.' });
    }
  }

  _addItems(items = {}) {
    for (const [id, amount] of Object.entries(items)) {
      if (own(ITEMS, id) && Number.isInteger(amount) && amount > 0) {
        this.data.player.inventory[id] = Math.min(MAX_STACK, (this.data.player.inventory[id] ?? 0) + amount);
      }
    }
  }

  _removeItem(id, count = 1) {
    const remaining = (this.data.player.inventory[id] ?? 0) - count;
    if (remaining > 0) this.data.player.inventory[id] = remaining;
    else delete this.data.player.inventory[id];
  }

  _reward(reward = {}) {
    this.data.player.credits = Math.min(MAX_CREDITS, this.data.player.credits + (reward.credits ?? 0));
    for (const [id, amount] of Object.entries(reward.reputation ?? {})) {
      if (own(this.data.reputation, id)) this.data.reputation[id] = clamp(this.data.reputation[id] + amount, -100, 100);
    }
    this._addItems(reward.items);
    if (reward.world) {
      for (const key of ['opened', 'looted', 'repaired', 'hacked', 'rescued']) {
        for (const target of reward.world[key] ?? []) this._record(this.data.world[key], target);
      }
      if (typeof reward.world.power === 'boolean') this.data.world.power = reward.world.power;
      if (own(ENDINGS, reward.world.policy)) this.data.world.policy = reward.world.policy;
      for (const [name, value] of Object.entries(reward.world.flags ?? {})) {
        if (validId(name) && !['constructor', 'prototype'].includes(name) && typeof value === 'boolean') this.data.world.flags[name] = value;
      }
    }
  }

  _record(list, id) {
    if (list.includes(id) || list.length >= 512) return false;
    list.push(id);
    return true;
  }

  acceptQuest(id) {
    if (!own(QUESTS, id)) return result(false, 'That job is not on the ward board.');
    const quest = QUESTS[id];
    const previous = this.data.quests[id];
    if (previous?.status === 'active') return result(false, 'That job is already in your journal.', { questId: id });
    if (previous?.status === 'completed' && !quest.repeatable) return result(false, 'That job is already complete.', { questId: id });
    if (!quest.prerequisites.every(key => this.data.quests[key]?.status === 'completed')) {
      return result(false, 'Finish the earlier part of this route first.', { questId: id });
    }
    const paidRuns = previous?.paidRuns ?? 0;
    if (paidRuns >= 1_000_000) return result(false, 'This route has reached its recorded run limit.');
    this.data.quests[id] = {
      status: 'active', stage: 0, progress: 0, run: paidRuns + 1,
      paidRuns, completions: paidRuns, choice: null, acceptedAt: this.data.playTime, completedAt: null,
    };
    this._addItems(quest.onAcceptItems);
    const detail = { messages: [], completedQuests: [], advanced: [], rewardCredits: 0 };
    this._advanceRecorded(id, detail);
    const message = `${quest.title} added to your journal.`;
    this._changed('quest-accepted', message);
    return result(true, message, { changed: true, questId: id, ...detail, completed: detail.completedQuests.length > 0 });
  }

  _finishQuest(id, detail) {
    const quest = QUESTS[id];
    const entry = this.data.quests[id];
    if (entry.status === 'completed' || entry.paidRuns >= entry.run) return;
    entry.status = 'completed';
    entry.stage = quest.stages.length;
    entry.progress = 0;
    entry.completedAt = this.data.playTime;
    // Record payment before applying any effects or notifying external listeners.
    entry.paidRuns = entry.run;
    entry.completions = entry.paidRuns;
    this._reward(quest.reward);
    detail.rewardCredits += quest.reward.credits ?? 0;
    if (id === 'district_choice' && entry.choice && own(ENDINGS, entry.choice)) {
      const ending = ENDINGS[entry.choice];
      this._reward(ending);
      this.data.world.ending = { id: ending.id, title: ending.title, text: ending.text };
      this.data.world.flags.storyComplete = true;
      detail.ending = clone(this.data.world.ending);
      detail.messages.push(ending.text);
    }
    detail.completedQuests.push(id);
    detail.messages.push(`${quest.title} complete. +${quest.reward.credits ?? 0} credits. ${quest.completionText ?? ''}`.trim());
  }

  _advanceStage(id, payload, detail) {
    const quest = QUESTS[id];
    const entry = this.data.quests[id];
    const stage = quest.stages[entry.stage];
    if (!stage) return false;
    if (stage.requiredItem && (this.data.player.inventory[stage.requiredItem] ?? 0) < (stage.requiredCount ?? 1)) {
      detail.blocked ??= [];
      detail.blocked.push({ questId: id, message: `You need ${ITEMS[stage.requiredItem].name.toLowerCase()} for this step.` });
      return false;
    }
    if (stage.choices) {
      if (!stage.choices.some(choice => choice.id === payload.choice)) {
        detail.needsChoice = true;
        detail.choices = clone(stage.choices);
        detail.questId = id;
        return false;
      }
      entry.choice = payload.choice;
    }
    entry.progress += 1;
    if (entry.progress < (stage.count ?? 1)) return true;
    if (stage.requiredItem && stage.consumeItem) this._removeItem(stage.requiredItem, stage.requiredCount ?? 1);
    if (stage.rewardItem) this._addItems(typeof stage.rewardItem === 'string' ? { [stage.rewardItem]: 1 } : stage.rewardItem);
    if (stage.dialogue) detail.messages.push(stage.dialogue);
    entry.stage += 1;
    entry.progress = 0;
    if (!detail.advanced.includes(id)) detail.advanced.push(id);
    if (entry.stage >= quest.stages.length) this._finishQuest(id, detail);
    return true;
  }

  _advanceRecorded(id, detail) {
    // Discovery is persistent. Authored retroactive circuit stages require a real earlier success.
    for (let guard = 0; guard < QUESTS[id].stages.length; guard++) {
      const entry = this.data.quests[id];
      if (entry.status !== 'active') return;
      const stage = QUESTS[id].stages[entry.stage];
      const recorded = stage.type === 'discover' ? this.data.discoveries.includes(stage.target)
        : stage.retroactive && stage.type === 'hack' ? this.data.world.hacked.includes(stage.target)
          : stage.retroactive && stage.type === 'repair' ? this.data.world.repaired.includes(stage.target)
            : false;
      if (!recorded || !this._advanceStage(id, {}, detail)) return;
    }
  }

  interact(targetId, payload = {}) {
    return this.emit('interact', { ...payload, target: targetId });
  }

  emit(type, payload = {}) {
    if (!isPlain(payload)) return result(false, 'The action data is invalid.');
    if (type === 'flag') {
      const value = payload.value ?? true;
      if (!validId(payload.name) || ['constructor', 'prototype'].includes(payload.name) || typeof value !== 'boolean') return result(false, 'Invalid mechanism flag.');
      if (!own(this.data.world.flags, payload.name) && Object.keys(this.data.world.flags).length >= 128) return result(false, 'The mechanism record is full.');
      const changed = this.data.world.flags[payload.name] !== value;
      this.data.world.flags[payload.name] = value;
      if (changed) this._changed('flag', 'Mechanism state updated.');
      return result(true, 'Mechanism state updated.', { changed, name: payload.name, value });
    }
    if (type === 'damage') {
      if (!numberIn(payload.amount, 0, 10000)) return result(false, 'Invalid damage amount.');
      const amount = payload.amount * (1 - this.getEquipmentEffects().damageReduction);
      this.data.player.health = Math.max(0, this.data.player.health - amount);
      this._changed('damage');
      return result(true, 'Health updated.', { changed: amount > 0, health: this.data.player.health, dead: this.data.player.health <= 0 });
    }
    if (type === 'restore') {
      this.data.player.health = 100;
      this.data.player.energy = 100;
      this._changed('rest', 'Rested and ready for the next route.');
      return result(true, 'Rested and ready for the next route.', { changed: true });
    }
    if (type === 'power') {
      const enabled = payload.enabled ?? payload.value ?? !this.data.world.power;
      if (typeof enabled !== 'boolean') return result(false, 'Invalid power setting.');
      const changed = this.data.world.power !== enabled;
      this.data.world.power = enabled;
      const message = enabled ? 'The district feeder is on.' : 'The district feeder is in standby.';
      if (changed) this._changed('power', message);
      return result(true, message, { changed, power: enabled });
    }
    if (type === 'energy') {
      if (!numberIn(payload.amount, 0, 100)) return result(false, 'Invalid energy cost.');
      if (this.data.player.energy < payload.amount) return result(false, 'You need a moment to recover energy.');
      this.data.player.energy -= payload.amount;
      this._changed('energy', '', false);
      return result(true, 'Energy used.', { changed: payload.amount > 0 });
    }
    const target = payload.target ?? payload.targetId;
    if (!validId(target)) return result(false, 'That action has no valid destination.');
    if (type === 'open' || type === 'close') {
      const changed = type === 'open'
        ? this._record(this.data.world.opened, target)
        : this.data.world.opened.includes(target);
      if (type === 'close') this.data.world.opened = this.data.world.opened.filter(id => id !== target);
      const message = type === 'open' ? 'Service access opened.' : 'Service access closed.';
      if (changed) this._changed(type, message);
      return result(true, message, { changed });
    }
    if (type === 'loot') {
      if (this.data.world.looted.includes(target)) return result(false, 'This salvage has already been collected.', { changed: false });
      if (!this._record(this.data.world.looted, target)) return result(false, 'The salvage record is full.');
      const reward = target === 'cache' ? { credits: 20, items: { battery: 1 } } : { credits: 12 };
      this._reward(reward);
      const message = target === 'cache' ? 'Recovered 20 credits and a charge cell from the salvage tray.' : 'Recovered 12 credits in reusable salvage.';
      this._changed('loot', message);
      return result(true, message, { changed: true, rewardCredits: reward.credits, items: reward.items ?? {} });
    }
    if (!['interact', 'hack', 'repair', 'discover', 'deliver', 'rescue'].includes(type)) return result(false, 'That action is not supported.');
    const detail = { messages: [], completedQuests: [], advanced: [], rewardCredits: 0 };
    let changed = false;
    if (type === 'discover') changed = this._record(this.data.discoveries, target) || changed;
    if (type === 'hack') changed = this._record(this.data.world.hacked, target) || changed;
    if (type === 'hack' && target === 'archive' && !this.data.world.flags.securityDisabled) {
      this.data.world.flags.securityDisabled = true;
      changed = true;
    }
    if (type === 'repair') changed = this._record(this.data.world.repaired, target) || changed;
    if (type === 'rescue') changed = this._record(this.data.world.rescued, target) || changed;
    const acceptedTypes = type === 'interact' ? ['interact', 'deliver', 'rescue'] : [type];
    // Snapshot the current stage per quest: one event cannot perform two sequential actions.
    for (const [id, entry] of Object.entries(this.data.quests)) {
      if (entry.status !== 'active') continue;
      const stage = QUESTS[id].stages[entry.stage];
      if (stage.target !== target || !acceptedTypes.includes(stage.type)) continue;
      if (this._advanceStage(id, payload, detail)) {
        changed = true;
        if (stage.type === 'rescue') this._record(this.data.world.rescued, target);
        this._advanceRecorded(id, detail);
      }
    }
    if (type === 'interact' && target === 'home') {
      this.data.player.health = 100;
      this.data.player.energy = 100;
      detail.messages.push('You rest at home. Health and energy restored.');
      changed = true;
    }
    const completed = detail.completedQuests.length > 0;
    const defaultMessage = type === 'hack' ? 'Service circuit connected.'
      : type === 'repair' ? 'Circuit repaired.'
        : type === 'discover' ? (DIALOGUE[target] ?? 'A new part of the ward has been recorded.')
          : (DIALOGUE[target] ?? 'You check the destination.');
    const message = detail.needsChoice ? 'Choose who will maintain the ward’s power.'
      : detail.messages.length ? detail.messages.join('\n\n')
        : detail.blocked?.length ? detail.blocked[0].message
          : defaultMessage;
    if (changed) this._changed(completed ? 'quest-completed' : type, message);
    return result(!detail.needsChoice && !(detail.blocked?.length && !detail.advanced.length), message, {
      changed, completed, ...detail, questId: detail.questId ?? detail.advanced[0] ?? null,
    });
  }

  buy(itemId, quantity = 1) {
    if (!own(ITEMS, itemId)) return result(false, 'That item is not stocked.');
    const item = ITEMS[itemId];
    if (item.purchasable === false || item.kind === 'quest') return result(false, 'That item is not for sale.');
    if (!numberIn(quantity, 1, 99, true)) return result(false, 'Choose a valid quantity.');
    const owned = this.data.player.inventory[itemId] ?? 0;
    if (item.slot && (owned > 0 || quantity !== 1)) return result(false, 'You already own that tool, or have selected more than one.');
    if (owned + quantity > MAX_STACK) return result(false, 'There is no room for that many items.');
    const cost = item.price * quantity;
    if (this.data.player.credits < cost) return result(false, `You need ${cost - this.data.player.credits} more credits.`, { cost });
    this.data.player.credits -= cost;
    this._addItems({ [itemId]: quantity });
    const message = `${item.name}${quantity > 1 ? ` ×${quantity}` : ''} purchased for ${cost} credits.`;
    this._changed('buy', message);
    return result(true, message, { changed: true, itemId, cost, equippable: Boolean(item.slot) });
  }

  use(itemId) {
    if (!own(ITEMS, itemId) || !(this.data.player.inventory[itemId] > 0)) return result(false, 'You do not have that item.');
    const item = ITEMS[itemId];
    if (item.kind !== 'consumable') return result(false, item.slot ? 'Equip this tool from your inventory.' : 'This item belongs to a job.');
    const player = this.data.player;
    const health = Math.min(100, player.health + (item.health ?? 0));
    const energy = Math.min(100, player.energy + (item.energy ?? 0));
    if (health === player.health && energy === player.energy) return result(false, 'You are already fully supplied for that item’s effect.');
    const restoredHealth = health - player.health;
    const restoredEnergy = energy - player.energy;
    player.health = health;
    player.energy = energy;
    this._removeItem(itemId);
    const message = `${item.name} used.${restoredHealth ? ` +${Math.round(restoredHealth)} health.` : ''}${restoredEnergy ? ` +${Math.round(restoredEnergy)} energy.` : ''}`;
    this._changed('use', message);
    return result(true, message, { changed: true, itemId, restoredHealth, restoredEnergy });
  }

  equip(itemId) {
    if (!own(ITEMS, itemId) || !(this.data.player.inventory[itemId] > 0)) return result(false, 'You do not own that tool.');
    const item = ITEMS[itemId];
    if (!item.slot) return result(false, 'That item cannot be equipped.');
    if (this.data.player.equipment.includes(itemId)) return result(true, `${item.name} is already equipped.`, { changed: false });
    this.data.player.equipment = this.data.player.equipment.filter(id => ITEMS[id].slot !== item.slot);
    this.data.player.equipment.push(itemId);
    const message = `${item.name} equipped.`;
    this._changed('equip', message);
    return result(true, message, { changed: true, itemId });
  }

  getEquipmentEffects() {
    const effects = { scanRadius: 12, hackAssist: 0, repairAssist: 0, moveSpeed: 1, energyRegen: 1, damageReduction: 0 };
    for (const id of this.data.player.equipment) {
      const effect = ITEMS[id]?.effect;
      if (!effect) continue;
      for (const key of ['scanRadius', 'hackAssist', 'repairAssist', 'damageReduction']) {
        if (Number.isFinite(effect[key])) effects[key] = Math.max(effects[key], effect[key]);
      }
      for (const key of ['moveSpeed', 'energyRegen']) if (Number.isFinite(effect[key])) effects[key] *= effect[key];
    }
    return effects;
  }

  getEffects() { return this.getEquipmentEffects(); }

  setPlayer(position, yaw = this.data.player.yaw, pitch = this.data.player.pitch) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(n => numberIn(n, -100000, 100000))
      || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return result(false, 'Invalid player position or view.');
    this.data.player.position = [...position];
    this.data.player.yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.data.player.pitch = clamp(pitch, -Math.PI / 2, Math.PI / 2);
    return result(true, 'Position updated.', { changed: true });
  }

  discover(id) { return this.emit('discover', { target: id }); }

  tick(dt) {
    if (!numberIn(dt, 0, 1e8)) return result(false, 'Invalid elapsed time.');
    const step = Math.min(dt, 60);
    if (step === 0) return result(true, '', { changed: false });
    this.data.playTime = Math.min(1e10, this.data.playTime + step);
    this.data.world.hour = (this.data.world.hour + step / 60) % 24;
    this.data.player.energy = Math.min(100, this.data.player.energy + step * 2.4 * this.getEquipmentEffects().energyRegen);
    this._notifyTime += step;
    this._saveTime += step;
    if (this._saveTime >= 30 && this.autoSave && this.storage) {
      this.save();
      this._saveTime = 0;
    }
    if (this._notifyTime >= 1) {
      this._notifyTime %= 1;
      this._notify('tick');
    }
    return result(true, '', { changed: true });
  }

  /** Definitions for jobs that can be accepted now; completed repeatable jobs reappear. */
  getAvailableQuests(npcId) {
    const giver = npcId === 'workshop' ? 'ivo' : npcId;
    return Object.values(QUESTS).filter(quest => {
      if (giver && quest.giver !== giver) return false;
      const entry = this.data.quests[quest.id];
      return (!entry || (quest.repeatable && entry.status === 'completed'))
        && quest.prerequisites.every(id => this.data.quests[id]?.status === 'completed');
    });
  }

  /** Journal rows: definition metadata, status, text, objective, choices, and progress counts. */
  getQuestView() {
    return Object.entries(this.data.quests).map(([id, entry]) => {
      const quest = QUESTS[id];
      const stage = entry.status === 'active' ? quest.stages[entry.stage] : null;
      const text = stage?.text ?? quest.completionText ?? 'Job complete.';
      return {
        id, title: quest.title, giver: quest.giver, category: quest.category, description: quest.description,
        status: entry.status, stage: entry.stage, stageCount: quest.stages.length,
        text, stageText: text, target: stage?.target ?? null,
        objective: stage ? { target: stage.target, type: stage.type, text: stage.text, requiredItem: stage.requiredItem ?? null } : null,
        progress: { current: entry.stage, total: quest.stages.length, count: entry.progress, needed: stage?.count ?? 1, ratio: entry.stage / quest.stages.length },
        choices: stage?.choices ? clone(stage.choices) : [],
        repeatable: Boolean(quest.repeatable), completions: entry.completions,
        choice: entry.choice, reward: quest.reward,
      };
    }).sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || Number(b.category === 'story') - Number(a.category === 'story'));
  }

  getObjectiveTargets() {
    return this.getQuestView().filter(quest => quest.objective).map(quest => ({
      id: `${quest.id}:${quest.stage}`, target: quest.objective.target,
      label: quest.text, questId: quest.id, kind: quest.objective.type,
    }));
  }

  /** Replay the recorded conclusion without changing choices, inventory, or rewards. */
  replayEnding() {
    if (!this.data.world.ending) return result(false, 'The ward’s power agreement has not been decided yet.');
    return result(true, this.data.world.ending.text, { replay: true, changed: false, ending: clone(this.data.world.ending) });
  }
}
