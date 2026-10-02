/* ASTRA CITY — dependency-free interface. All game mutations belong to onAction. */

const DEFAULT_SETTINGS = Object.freeze({ quality: 'high', renderScale: 1, fov: 75, sensitivity: 1, volume: 0.65, invertY: false, showMinimap: true });
const PANEL_NAMES = { map: 'District map', journal: 'Journal', inventory: 'Inventory', settings: 'Settings', pause: 'Paused', shop: 'Trade', dialogue: 'Conversation', hack: 'Circuit access' };
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = (s) => String(s ?? '').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
const number = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : '—';
const posOf = (p) => Array.isArray(p) ? p : p?.position;

function icon(name, size = 20) {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
    journal: '<path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4M3 7h3M3 12h3M3 17h3"/>',
    inventory: '<path d="M8 7V5a4 4 0 0 1 8 0v2M5 7h14l1 14H4L5 7Zm4 5h6"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
    energy: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
    credit: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm3 6H9v8h6"/>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    transit: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M9 18l-2 3m8-3 2 3M9 7h6"/><path d="M8 15h.01M16 15h.01"/>',
    tool: '<path d="m14 4 1 5 5 1a7 7 0 0 1-8 7l-6 5-4-4 5-6a7 7 0 0 1 7-8Z"/>',
    scanner: '<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M7 12h10M12 7v10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    rain: '<path d="M6 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9M7 18l-1 3m6-3-1 3m6-3-1 3"/>',
    cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11H6Z"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    save: '<path d="M4 3h13l3 3v15H4V3Zm4 0v7h8V3M8 21v-7h8v7"/>',
    jump: '<path d="m6 9 6-6 6 6M12 3v14M5 21h14"/>',
    sprint: '<circle cx="15" cy="4" r="2"/><path d="m8 9 4-2 4 5 4 1M12 7l-2 7-5 3m5-3 5 3-1 5M3 9h3M2 13h3"/>',
    crouch: '<circle cx="14" cy="5" r="2"/><path d="m12 9-4 4 7 2-1 6m-4-11 5 2 5-1M8 13l-4 5h5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    warning: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v.01"/>',
    circuit: '<path d="M3 5h8v6h10M3 19h8v-8m6 0V3M7 5V2M7 19v3"/><circle cx="3" cy="5" r="1"/><circle cx="21" cy="11" r="1"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.location}</svg>`;
}

function itemIcon(item) {
  const label = `${item.id || ''} ${item.kind || ''}`;
  return /scanner|sensor/.test(label) ? 'scanner' : /hack|circuit/.test(label) ? 'circuit' : item.health ? 'health' : item.energy ? 'energy' : /tool|repair|equipment/.test(label) ? 'tool' : 'inventory';
}

export class GameUI {
  constructor(root, onAction = () => {}) {
    if (!(root instanceof HTMLElement)) throw new TypeError('GameUI requires a root HTMLElement.');
    this.root = root;
    this.onAction = onAction;
    this.isOpen = false;
    this.panel = '';
    this.playing = false;
    this.world = null;
    this.last = {};
    this.catalog = { quests: [], items: {}, factions: [] };
    this._panelData = {};
    this._mapLevel = 'ground';
    this._mapZoom = 1;
    this._mapCenter = null;
    this._waypoint = null;
    this._journalTab = 'active';
    this._selectedQuest = null;
    this._selectedItem = null;
    this._lastUpdate = -Infinity;
    this._lastPanelRefresh = -Infinity;
    this._performanceEnabled = false;
    this._timers = new Set();
    this._abort = new AbortController();
    this._destroyed = false;
    this.root.classList.add('astra-interface');
    this.root.innerHTML = `
      <section class="menu-screen" aria-label="Main menu">
        <header class="menu-masthead"><span class="astra-sigil" aria-hidden="true"><i></i><i></i><i></i></span><span>ASTRA<span class="masthead-divider">/</span>AN OPEN WORLD</span></header>
        <div class="menu-main"><div class="eyebrow"><span class="status-dot"></span> SWITCHBACK WARD</div><h1 class="menu-title">ASTRA<br>CITY<span class="title-period">.</span></h1><p class="menu-description">A thousand lives. A place for yours.</p><nav class="menu-actions" aria-label="Start playing"></nav></div>
        <footer class="menu-footer"><p class="desktop-hint"><kbd>W A S D</kbd> Move <span>·</span> Mouse Look <span>·</span> <kbd>E</kbd> Interact</p><p class="touch-hint">Explore with the on-screen controls.</p><div class="menu-coordinate"><span class="live-indicator"></span> THE CITY IS ALIVE</div></footer>
      </section>
      <section class="loading-screen" hidden aria-live="polite" aria-label="Loading game"><div class="loading-content"><span class="eyebrow">ASTRA CITY</span><h2>Finding your way in.</h2><p class="loading-message">Preparing the district…</p><div class="loading-track" role="progressbar" aria-label="Loading progress" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="loading-caption"><span>SWITCHBACK WARD</span><span class="loading-value"></span></div></div></section>
      <section class="error-screen" hidden aria-live="assertive"><div class="error-content">${icon('warning', 32)}<span class="eyebrow">ASTRA CITY</span><h2>Unable to open the city.</h2><p class="error-message"></p><button class="primary-button" data-action="main-menu">Return to menu ${icon('arrow')}</button></div></section>
      <section class="game-hud" hidden aria-label="Game status">
        <header class="hud-top"><div class="hud-place"><span class="eyebrow">SWITCHBACK WARD</span><span class="hud-location">Astra City</span><span class="hud-environment"></span></div><div class="hud-compass" aria-label="Compass"><span class="compass-neighbor compass-left"></span><i></i><span class="compass-current">N</span><i></i><span class="compass-neighbor compass-right"></span><span class="compass-degrees">000°</span></div><div class="hud-resources"><span class="hud-credits">${icon('credit', 17)}<b>—</b><span>CR</span></span><button class="minimap-button" data-action="open-panel" data-panel="map" aria-label="Open district map"><canvas class="minimap-canvas" aria-hidden="true"></canvas><span>District map <kbd>M</kbd></span></button></div></header>
        <div class="hud-objective" hidden><span class="objective-line"></span><div><span class="eyebrow">CURRENT OBJECTIVE</span><p></p><span class="objective-distance"></span></div></div>
        <div class="crosshair" aria-hidden="true"></div>
        <button class="interact-prompt" hidden data-action="interact"><kbd>E</kbd><span><b></b><small></small></span>${icon('arrow', 18)}</button>
        <div class="ride-status" hidden>${icon('transit', 18)}<span></span><kbd>E</kbd><small>Dismount</small></div>
        <div class="hud-bottom"><div class="vitals"><div class="vital health-vital"><span>${icon('health', 15)}<span>Health</span><b>—</b></span><div class="vital-track"><i></i></div></div><div class="vital energy-vital"><span>${icon('energy', 15)}<span>Energy</span><b>—</b></span><div class="vital-track"><i></i></div></div></div><p class="game-controls-hint"><kbd>W A S D</kbd> Move <span>·</span> <kbd>Space</kbd> Jump <span>·</span> <kbd>Shift</kbd> Sprint <span>·</span> <kbd>C</kbd> Crouch</p><nav class="hud-shortcuts" aria-label="Game menus"><button data-action="open-panel" data-panel="journal" aria-label="Open journal, J">${icon('journal', 18)}<span>Journal</span><kbd>J</kbd></button><button data-action="open-panel" data-panel="inventory" aria-label="Open inventory, I">${icon('inventory', 18)}<span>Inventory</span><kbd>I</kbd></button><button data-action="open-panel" data-panel="pause" aria-label="Pause game">${icon('pause', 18)}<kbd>Esc</kbd></button></nav></div>
        <div class="hud-notice" hidden aria-live="polite"></div>
      </section>
      <div class="touch-controls" aria-label="Touch controls"><div id="touch-look" aria-label="Drag to look"></div><div id="touch-move" role="group" aria-label="Movement joystick"><span class="joystick-guide"></span><span class="joystick-knob"></span></div><button id="touch-jump" aria-label="Jump">${icon('jump', 24)}</button><button id="touch-interact" data-action="interact" aria-label="Interact">${icon('tool', 23)}</button><button id="touch-sprint" aria-label="Sprint">${icon('sprint', 23)}</button><button id="touch-crouch" aria-label="Crouch">${icon('crouch', 23)}</button><button id="touch-menu" data-action="open-panel" data-panel="pause" aria-label="Open pause menu">${icon('menu', 22)}</button></div>
      <div class="panel-backdrop" hidden><section class="panel-shell" role="dialog" aria-modal="true" aria-labelledby="astra-panel-title"><header class="panel-header"><div class="panel-heading"><span class="eyebrow">ASTRA CITY <span>/</span> SWITCHBACK WARD</span><h2 id="astra-panel-title"></h2></div><nav class="panel-navigation" aria-label="Views"><button data-action="open-panel" data-panel="map" aria-label="Map">${icon('map')}<span>Map</span></button><button data-action="open-panel" data-panel="journal" aria-label="Journal">${icon('journal')}<span>Journal</span></button><button data-action="open-panel" data-panel="inventory" aria-label="Inventory">${icon('inventory')}<span>Inventory</span></button><button data-action="open-panel" data-panel="settings" aria-label="Settings">${icon('settings')}<span>Settings</span></button></nav><button class="close-panel-button" data-ui="close" aria-label="Close panel">${icon('close', 22)}<kbd>Esc</kbd></button></header><div class="panel-content"></div></section></div>
      <div class="toast-stack" role="status" aria-live="polite" aria-atomic="false"></div>
      <aside class="performance-panel" hidden aria-label="Performance statistics"></aside>
    `;
    this.el = {};
    for (const name of ['menu-screen', 'loading-screen', 'error-screen', 'game-hud', 'panel-backdrop', 'panel-shell', 'panel-content', 'toast-stack', 'performance-panel', 'minimap-canvas']) this.el[name] = root.querySelector(`.${name}`);
    root.addEventListener('click', e => this._click(e), { signal: this._abort.signal });
    root.addEventListener('input', e => this._setting(e, 'input'), { signal: this._abort.signal });
    root.addEventListener('change', e => this._setting(e, 'change'), { signal: this._abort.signal });
    root.addEventListener('keydown', e => this._keyDown(e), { signal: this._abort.signal });
    root.addEventListener('wheel', e => {
      if (this.panel !== 'map' || !e.target.closest('.district-map')) return;
      e.preventDefault();
      this._mapZoom = clamp(this._mapZoom * (e.deltaY < 0 ? 1.13 : 1 / 1.13), 0.65, 5);
      this._drawMap();
    }, { passive: false, signal: this._abort.signal });
    this._resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this._drawMap(); this._drawMinimap(); }) : null;
    this._resize?.observe(root);
    this.showMenu(false);
  }

  _emit(action, payload = {}) { if (!this._destroyed) this.onAction(action, payload); }

  _data(source = this._panelData.state || this.last.state) { return source?.data || source || {}; }

  _player() { return this.last.player || this._data(this.last.state).player || this._panelData.player || this._data().player || {}; }

  _settings() { return { ...DEFAULT_SETTINGS, ...(this._data(this.last.state).settings || {}), ...(this._data().settings || {}), ...(this._localSettings || {}) }; }

  _delay(fn, ms) {
    const id = setTimeout(() => { this._timers.delete(id); if (!this._destroyed) fn(); }, ms);
    this._timers.add(id);
    return id;
  }

  showMenu(hasSave = false) {
    this.closePanel();
    this.playing = false;
    this.root.classList.remove('is-playing');
    this.el['menu-screen'].hidden = false;
    this.el['loading-screen'].hidden = true;
    this.el['error-screen'].hidden = true;
    this.el['game-hud'].hidden = true;
    this.root.querySelector('.menu-actions').innerHTML = `${hasSave ? `<button class="menu-primary" data-action="continue"><span class="menu-action-index">01</span><span>Continue</span>${icon('arrow', 26)}</button>` : ''}<button class="${hasSave ? 'menu-secondary' : 'menu-primary'}" data-action="new-game"><span class="menu-action-index">${hasSave ? '02' : '01'}</span><span>New game</span>${icon('arrow', 26)}</button><button class="menu-secondary" data-action="open-panel" data-panel="settings"><span class="menu-action-index">${hasSave ? '03' : '02'}</span><span>Settings</span>${icon('settings', 22)}</button>`;
  }

  loading(message = 'Preparing the district…', progress = null) {
    this.closePanel();
    this.playing = false;
    this.root.classList.remove('is-playing');
    this.el['menu-screen'].hidden = true;
    this.el['game-hud'].hidden = true;
    this.el['error-screen'].hidden = true;
    this.el['loading-screen'].hidden = false;
    this.root.querySelector('.loading-message').textContent = message;
    const track = this.root.querySelector('.loading-track');
    const hasValue = progress !== null && Number.isFinite(Number(progress));
    const value = hasValue ? clamp(Number(progress) <= 1 ? Number(progress) * 100 : Number(progress), 0, 100) : 0;
    track.classList.toggle('indeterminate', !hasValue);
    track.firstElementChild.style.width = hasValue ? `${value}%` : '30%';
    if (hasValue) track.setAttribute('aria-valuenow', String(Math.round(value))); else track.removeAttribute('aria-valuenow');
    this.root.querySelector('.loading-value').textContent = hasValue ? `${Math.round(value)}%` : '';
  }

  showError(message) {
    this.closePanel();
    this.playing = false;
    this.root.classList.remove('is-playing');
    this.el['menu-screen'].hidden = true;
    this.el['game-hud'].hidden = true;
    this.el['loading-screen'].hidden = true;
    this.el['error-screen'].hidden = false;
    this.root.querySelector('.error-message').textContent = String(message || 'The graphics device could not initialize.');
  }

  setPlaying(value) {
    this.playing = Boolean(value);
    this.root.classList.toggle('is-playing', this.playing);
    this.el['game-hud'].hidden = !this.playing;
    if (this.playing) {
      this.el['menu-screen'].hidden = true;
      this.el['loading-screen'].hidden = true;
      this.el['error-screen'].hidden = true;
      this._drawMinimap();
    }
  }

  /** Optional convenience: gives the minimap geometry before the first map open. */
  setWorld(world) {
    this.world = world || null;
    this._mapCenter = null;
    this._mapZoom = 1;
    this._drawMap();
    this._drawMinimap();
  }

  update(next = {}) {
    this.last = { ...this.last, ...next };
    if ((next.state?.data || next.state)?.settings) this._localSettings = null;
    if (next.world?.roads && next.world !== this.world) this.setWorld(next.world);
    if ('waypoint' in next) this._waypoint = posOf(next.waypoint) || null;
    if (next.state && this.isOpen) this._panelData.state = next.state;
    if (next.player && this.isOpen) this._panelData.player = next.player;
    if (next.state?.player && this.isOpen) this._panelData.player = next.state.player;
    if (next.state?.data?.player && this.isOpen) this._panelData.player = next.state.data.player;
    const now = performance.now();
    if (now - this._lastUpdate < 110) return;
    this._lastUpdate = now;
    const data = this._data(this.last.state);
    const player = this.last.player || data.player || this._panelData.player || {};
    const environment = this.last.environment || data.world || {};
    const loc = typeof this.last.location === 'string' ? this.last.location : this.last.location?.name;
    this.root.querySelector('.hud-location').textContent = loc || this.world?.name || 'Astra City';
    const hour = finite(environment.hour, 12);
    const hh = Math.floor(((hour % 24) + 24) % 24);
    const mm = Math.floor((hour - Math.floor(hour)) * 60);
    const weather = environment.weather || 'clear';
    const weatherIcon = weather === 'rain' ? 'rain' : weather === 'overcast' ? 'cloud' : (hour < 6 || hour >= 19) ? 'moon' : 'sun';
    const env = this.root.querySelector('.hud-environment');
    const envText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${pretty(weather)}`;
    if (env.dataset.value !== envText) { env.innerHTML = `${icon(weatherIcon, 14)}<span>${esc(envText)}</span>`; env.dataset.value = envText; }
    const yaw = finite(this.last.heading, finite(player.yaw));
    const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
    const idx = Math.round(deg / 45) % 8;
    this.root.querySelector('.compass-current').textContent = CARDINALS[idx];
    this.root.querySelector('.compass-left').textContent = CARDINALS[(idx + 7) % 8];
    this.root.querySelector('.compass-right').textContent = CARDINALS[(idx + 1) % 8];
    this.root.querySelector('.compass-degrees').textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
    this.root.querySelector('.hud-credits b').textContent = number(player.credits);
    for (const key of ['health', 'energy']) {
      const vital = this.root.querySelector(`.${key}-vital`);
      const value = player[key];
      vital.querySelector('b').textContent = number(value);
      vital.querySelector('.vital-track i').style.width = `${clamp(finite(value), 0, 100)}%`;
      vital.classList.toggle('is-low', finite(value, 100) < 25);
    }
    const objectives = this._objectiveEntries();
    const objective = objectives[0];
    const objectiveEl = this.root.querySelector('.hud-objective');
    objectiveEl.hidden = !objective;
    if (objective) {
      objectiveEl.querySelector('p').textContent = objective.label;
      const dist = objective.position && player.position ? Math.hypot(objective.position[0] - player.position[0], objective.position[2] - player.position[2]) : null;
      const floor = objective.position && player.position ? objective.position[1] - player.position[1] : 0;
      objectiveEl.querySelector('.objective-distance').textContent = dist === null ? '' : `${Math.round(dist)} m${floor > 4 ? ' · Above you' : floor < -3 ? ' · Below you' : ''}`;
    }
    const nearby = Array.isArray(this.last.nearby) ? this.last.nearby[0] : this.last.nearby;
    const prompt = this.root.querySelector('.interact-prompt');
    prompt.hidden = !nearby || this.isOpen;
    if (nearby) {
      prompt.querySelector('b').textContent = nearby.name || nearby.label || 'Interact';
      prompt.querySelector('small').textContent = nearby.prompt || nearby.actionLabel || ({ npc: 'Talk', shop: 'Browse goods', terminal: 'Access terminal', vehicle: 'Ride', container: 'Search', transit: 'Choose a destination', elevator: 'Use lift', ladder: 'Climb', door: 'Open door', repair: 'Inspect', vending: 'Browse goods' }[nearby.type] || 'Interact');
    }
    const riding = this.last.riding;
    const rideEl = this.root.querySelector('.ride-status');
    rideEl.hidden = !riding;
    if (riding) rideEl.querySelector('span').textContent = typeof riding === 'object' ? riding.name || 'Riding' : 'Riding';
    const notice = this.last.notice;
    const noticeEl = this.root.querySelector('.hud-notice');
    noticeEl.hidden = !notice;
    if (notice) noticeEl.textContent = typeof notice === 'string' ? notice : notice.message || notice.text || '';
    this.root.querySelector('.minimap-button').hidden = !this._settings().showMinimap || !this.world;
    this._drawMinimap();
    if (this.panel === 'map') this._drawMap();
    if (this.isOpen && ['journal', 'inventory', 'shop'].includes(this.panel) && now - this._lastPanelRefresh > 300) {
      this._lastPanelRefresh = now;
      const stamp = JSON.stringify([data.quests, data.player?.inventory, data.player?.equipment, data.player?.credits, data.reputation]);
      if (stamp !== this._panelStamp) { this._panelStamp = stamp; this._renderPanel(); }
    }
    if (this._performanceEnabled && this.last.stats) this.setPerformance(this.last.stats, true);
  }

  openPanel(name, payload = {}) {
    const wasOpen = this.isOpen;
    if (!wasOpen) this._previousFocus = document.activeElement;
    this._panelData = { ...payload, state: payload.state || this.last.state, world: payload.world || this.world };
    if (payload.world && payload.world !== this.world) this.setWorld(payload.world);
    for (const key of ['quests', 'items', 'factions']) if (payload[key]) this.catalog[key] = payload[key];
    if ('waypoint' in payload) this._waypoint = posOf(payload.waypoint) || null;
    this.panel = name;
    this.isOpen = true;
    this.root.classList.add('has-panel');
    this.el['panel-backdrop'].hidden = false;
    this.el['panel-shell'].className = `panel-shell panel-${name}`;
    this.root.querySelector('#astra-panel-title').textContent = PANEL_NAMES[name] || pretty(name);
    this.root.querySelector('.panel-navigation').hidden = ['dialogue', 'hack', 'shop'].includes(name);
    this.root.querySelectorAll('.panel-navigation button').forEach(b => { const current = b.dataset.panel === name; b.classList.toggle('is-active', current); b.setAttribute('aria-current', current ? 'page' : 'false'); });
    if (name === 'map' && !wasOpen) this._mapLevel = this._levelFor({ position: this._player().position || [0, 0, 0] });
    this._renderPanel();
    this._delay(() => {
      if (this.panel === name && this.isOpen) {
        this.el['panel-content'].querySelector('button, input, select, [tabindex="0"]')?.focus({ preventScroll: true });
        if (name === 'map') this._drawMap();
      }
    }, 0);
  }

  closePanel() {
    const hadPanel = this.isOpen;
    this.isOpen = false;
    this.panel = '';
    this.root.classList.remove('has-panel');
    if (this.el?.['panel-backdrop']) this.el['panel-backdrop'].hidden = true;
    this.hack = null;
    if (hadPanel && this._previousFocus?.isConnected && this._previousFocus !== document.body) this._previousFocus.focus?.({ preventScroll: true });
    this._previousFocus = null;
  }

  _requestClose() {
    const abandoned = this.panel === 'hack' && this.hack && !this.hack.solved ? this.hack.targetId : null;
    this.closePanel();
    if (abandoned !== null) this._emit('hack-failed', { target: abandoned, reason: 'abandoned' });
    this._emit('close-panel');
  }

  _renderPanel() {
    if (!this.isOpen) return;
    const content = this.el['panel-content'];
    if (this.panel === 'map') content.innerHTML = this._mapHTML();
    else if (this.panel === 'journal') content.innerHTML = this._journalHTML();
    else if (this.panel === 'inventory') content.innerHTML = this._inventoryHTML();
    else if (this.panel === 'settings') content.innerHTML = this._settingsHTML();
    else if (this.panel === 'pause') content.innerHTML = this._pauseHTML();
    else if (this.panel === 'shop') content.innerHTML = this._shopHTML();
    else if (this.panel === 'dialogue') content.innerHTML = this._dialogueHTML();
    else if (this.panel === 'hack') content.innerHTML = this._hackHTML();
    else content.innerHTML = '<div class="empty-state"><p>This view is unavailable.</p><button class="text-button" data-ui="close">Close</button></div>';
    if (this.panel === 'map') this._drawMap();
    if (this.panel === 'hack') this._renderCircuit();
  }

  _pauseHTML() {
    const data = this._data();
    const time = finite(data.playTime);
    return `<div class="pause-layout"><div class="pause-intro"><span class="eyebrow">A MOMENT TO YOURSELF</span><h3>Take a breath.</h3><p>The next street can wait.</p><div class="pause-session">${icon('location', 18)}<span>${esc(typeof this.last.location === 'string' ? this.last.location : this.last.location?.name || this.world?.name || 'Switchback Ward')}</span></div>${time > 0 ? `<p class="session-time">${Math.floor(time / 3600)}h ${Math.floor(time / 60) % 60}m explored</p>` : ''}</div><div class="pause-actions"><button class="primary-button" data-action="resume">Resume ${icon('arrow')}</button><button class="flat-action" data-action="save">${icon('save')}<span>Save game</span><span class="action-caption">On this device</span></button><button class="flat-action" data-action="open-panel" data-panel="map">${icon('map')}<span>District map</span><kbd>M</kbd></button><button class="flat-action" data-action="open-panel" data-panel="journal">${icon('journal')}<span>Journal</span><kbd>J</kbd></button><button class="flat-action" data-action="open-panel" data-panel="inventory">${icon('inventory')}<span>Inventory</span><kbd>I</kbd></button><button class="flat-action" data-action="open-panel" data-panel="settings">${icon('settings')}<span>Settings</span>${icon('arrow', 17)}</button><button class="text-button menu-return" data-action="main-menu">Return to main menu</button></div></div><div class="controls-strip"><span><kbd>W A S D</kbd> Move</span><span>Mouse Look</span><span><kbd>E</kbd> Interact</span><span><kbd>Space</kbd> Jump</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>C</kbd> Crouch</span></div>`;
  }

  _quests() {
    const data = this._data();
    const raw = this.catalog.quests;
    const quests = Array.isArray(raw) ? raw : Object.values(raw || {});
    return quests.map((quest, index) => {
      const id = quest.id || `quest-${index}`;
      const record = data.quests?.[id] || {};
      let status = record.status || quest.status || (quest.completed ? 'completed' : quest.active ? 'active' : 'available');
      if (status === 'available' && (quest.available === false || quest.prerequisites?.some(p => data.quests?.[p]?.status !== 'completed'))) status = 'locked';
      return { ...quest, id, _status: status, _stage: finite(record.stage, finite(quest.stage)), _progress: record.progress ?? quest.progress };
    });
  }

  _stage(quest) {
    const value = quest.stages?.[quest._stage] || quest.currentStage || quest.currentObjective || quest.objective;
    if (typeof value === 'string') return { text: value };
    return value || { text: quest.objectiveText || quest.stageText || quest.text || '', target: quest.target };
  }

  _journalHTML() {
    const quests = this._quests();
    const list = quests.filter(q => q._status === this._journalTab);
    if (!list.some(q => q.id === this._selectedQuest)) this._selectedQuest = list[0]?.id || null;
    const selected = list.find(q => q.id === this._selectedQuest);
    const tabNames = { active: 'Active', available: 'Available', completed: 'Completed' };
    return `<div class="journal-layout"><aside class="journal-list-pane"><div class="segment-tabs" role="tablist" aria-label="Mission status">${Object.entries(tabNames).map(([id, label]) => `<button role="tab" aria-selected="${this._journalTab === id}" class="${this._journalTab === id ? 'is-active' : ''}" data-ui="journal-tab" data-value="${id}">${label}<span>${quests.filter(q => q._status === id).length}</span></button>`).join('')}</div><div class="entry-list">${list.length ? list.map(q => `<button class="entry-row ${q.id === this._selectedQuest ? 'is-selected' : ''}" data-ui="quest-select" data-id="${esc(q.id)}"><span class="entry-symbol ${q._status === 'completed' ? 'is-complete' : ''}">${q._status === 'completed' ? icon('check', 18) : icon('journal', 18)}</span><span class="entry-copy"><b>${esc(q.title || q.name || q.id)}</b><small>${esc(q._status === 'completed' ? 'Completed' : this._stage(q).text || q.description || 'A new lead')}</small></span>${icon('arrow', 16)}</button>`).join('') : `<div class="empty-state"><span class="eyebrow">${tabNames[this._journalTab].toUpperCase()}</span><p>${this._journalTab === 'active' ? 'No active missions.' : this._journalTab === 'completed' ? 'Your story is just beginning.' : 'No new leads right now.'}</p><small>${this._journalTab === 'active' ? 'Meet people around the ward or browse available leads.' : this._journalTab === 'completed' ? 'Completed missions will appear here.' : 'Keep exploring and follow your current leads.'}</small></div>`}</div></aside><article class="entry-detail">${selected ? this._questDetailHTML(selected) : `<div class="empty-state">${icon('journal', 34)}<h3>Room for a new story.</h3><p>Select a mission to see its details.</p></div>`}</article></div>`;
  }

  _questDetailHTML(q) {
    const giver = this.world?.interactables?.find(i => i.id === q.giver);
    const stage = this._stage(q);
    const target = this.world?.interactables?.find(i => i.id === stage.target);
    const reward = q.reward || {};
    const stages = q.stages || [];
    const rewards = [];
    if (reward.credits) rewards.push(`${number(reward.credits)} credits`);
    for (const [id, amount] of Object.entries(reward.items || {})) rewards.push(`${amount} × ${this.catalog.items?.[id]?.name || pretty(id)}`);
    for (const [id, amount] of Object.entries(reward.reputation || {})) rewards.push(`${amount > 0 ? '+' : ''}${amount} ${this.catalog.factions?.find?.(f => f.id === id)?.name || pretty(id)} reputation`);
    return `<div class="detail-eyebrow"><span class="eyebrow">${esc(q.category || (q.repeatable ? 'COURIER CONTRACT' : 'DISTRICT MISSION'))}</span><span class="status-label status-${esc(q._status)}">${pretty(q._status)}</span></div><h3>${esc(q.title || q.name || q.id)}</h3>${giver || q.giver ? `<p class="detail-giver">From ${esc(giver?.name || pretty(q.giver))}${giver?.role ? ` · ${esc(giver.role)}` : ''}</p>` : ''}<p class="detail-description">${esc(q.description || '')}</p>${stages.length ? `<h4>Objectives</h4><ol class="quest-stages">${stages.map((s, index) => { const done = q._status === 'completed' || index < q._stage; const current = q._status === 'active' && index === q._stage; return `<li class="${done ? 'is-complete' : current ? 'is-current' : ''}"><span class="stage-number">${done ? icon('check', 14) : String(index + 1).padStart(2, '0')}</span><span>${esc(s.text)}${current && q.progressText ? `<small>${esc(q.progressText)}</small>` : ''}</span></li>`; }).join('')}</ol>` : stage.text ? `<h4>Current objective</h4><p class="single-objective">${esc(stage.text)}</p>` : ''}${rewards.length ? `<div class="mission-reward"><h4>Rewards</h4><p>${rewards.map(esc).join('<span>·</span>')}</p></div>` : ''}<div class="detail-actions">${q._status === 'available' ? `<button class="primary-button" data-action="accept-quest" data-id="${esc(q.id)}">Accept mission ${icon('arrow')}</button>` : target && q._status === 'active' ? `<button class="primary-button" data-ui="target-waypoint" data-target="${esc(target.id)}">Mark destination ${icon('location')}</button>` : q._status === 'completed' ? `<span class="completed-note">${icon('check', 18)} Mission completed</span>` : ''}</div>`;
  }

  _inventoryHTML() {
    const data = this._data();
    const player = data.player || this._player();
    const inventory = player.inventory || {};
    const equipment = player.equipment || [];
    const owned = Object.entries(inventory).filter(([, count]) => count > 0).map(([id, count]) => ({ ...this.catalog.items?.[id], id, count, name: this.catalog.items?.[id]?.name || pretty(id) }));
    if (!owned.some(item => item.id === this._selectedItem)) this._selectedItem = owned[0]?.id || null;
    const selected = owned.find(item => item.id === this._selectedItem);
    const factions = Array.isArray(this.catalog.factions) ? this.catalog.factions : Object.values(this.catalog.factions || {});
    return `<div class="inventory-layout"><aside class="inventory-list-pane"><div class="inventory-summary"><span>YOUR PACK</span><span>${owned.length} ${owned.length === 1 ? 'item type' : 'item types'}</span></div><div class="entry-list">${owned.length ? owned.map(item => `<button class="entry-row ${item.id === this._selectedItem ? 'is-selected' : ''}" data-ui="item-select" data-id="${esc(item.id)}"><span class="entry-symbol">${icon(itemIcon(item), 22)}</span><span class="entry-copy"><b>${esc(item.name)}</b><small>${equipment.includes(item.id) ? 'Equipped' : pretty(item.kind || 'Item')}</small></span><span class="item-count">×${number(item.count)}</span></button>`).join('') : '<div class="empty-state"><p>Your pack is empty.</p><small>Pick up supplies or visit a trader.</small></div>'}</div><div class="wallet-line">${icon('credit', 21)}<span>Credits</span><b>${number(player.credits)}</b><small>CR</small></div></aside><article class="entry-detail inventory-detail">${selected ? this._itemDetailHTML(selected, equipment) : `<div class="empty-state">${icon('inventory', 34)}<h3>Travel light.</h3><p>Select an item to inspect it.</p></div>`}${factions.length ? `<section class="reputation-section"><h4>Standing in the ward</h4><div class="reputation-list">${factions.map(f => `<div class="reputation-row"><span class="faction-dot" style="--faction-color:${this._factionColor(f.color)}"></span><span>${esc(f.name)}</span><b>${number(data.reputation?.[f.id] || 0)}</b></div>`).join('')}</div></section>` : ''}</article></div>`;
  }

  _factionColor(value) {
    if (Array.isArray(value) && value.length >= 3) return `rgb(${value.slice(0, 3).map(c => Math.round(clamp(finite(c), 0, 1) * 255)).join(',')})`;
    if (typeof value === 'string' && /^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d., %]+\))$/i.test(value)) return esc(value);
    return '#88a999';
  }

  _itemDetailHTML(item, equipment = []) {
    const equipped = equipment.includes(item.id);
    const usable = item.usable || item.health || item.energy || /consumable|food|medicine|drink|supply/.test(item.kind || '');
    const equippable = item.equippable || /tool|equipment|gear|upgrade|scanner/.test(item.kind || '') || (Array.isArray(equipment) && equipped);
    return `<div class="detail-eyebrow"><span class="eyebrow">${esc(pretty(item.kind || 'Personal item'))}</span>${equipped ? '<span class="status-label status-completed">Equipped</span>' : `<span class="muted">${number(item.count)} owned</span>`}</div><div class="item-illustration" aria-hidden="true">${icon(itemIcon(item), 72)}</div><h3>${esc(item.name)}</h3><p class="detail-description">${esc(item.description || '')}</p>${item.health || item.energy ? `<div class="item-effects">${item.health ? `<span>${icon('health', 18)} +${number(item.health)} health</span>` : ''}${item.energy ? `<span>${icon('energy', 18)} +${number(item.energy)} energy</span>` : ''}</div>` : ''}<div class="detail-actions">${usable ? `<button class="primary-button" data-action="use" data-id="${esc(item.id)}">Use item ${icon('arrow')}</button>` : ''}${equippable ? `<button class="${usable ? 'secondary-button' : 'primary-button'}" data-action="equip" data-id="${esc(item.id)}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'} ${icon(equipped ? 'check' : 'tool')}</button>` : ''}${!usable && !equippable ? '<p class="muted carried-note">Carried with you. Available when an interaction requires it.</p>' : ''}</div>`;
  }

  _settingsHTML() {
    const s = this._settings();
    const range = (key, title, caption, min, max, step, display) => `<label class="setting-row range-setting"><span><b>${title}</b><small>${caption}</small></span><div class="setting-range"><output data-output="${key}">${display(s[key])}</output><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" aria-label="${title}"></div></label>`;
    const toggle = (key, title, caption) => `<label class="setting-row"><span><b>${title}</b><small>${caption}</small></span><span class="toggle-control"><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''} aria-label="${title}"><i></i></span></label>`;
    return `<div class="settings-layout"><aside class="settings-intro"><span class="eyebrow">MAKE YOURSELF AT HOME</span><h3>Your city.<br> Your pace.</h3><p>Changes apply as you explore.</p><div class="settings-controls-note"><h4>On foot</h4><p><kbd>W A S D</kbd> Move</p><p>Mouse Look</p><p><kbd>E</kbd> Interact / dismount</p><p><kbd>Space</kbd> Jump</p><p><kbd>Shift</kbd> Sprint</p><p><kbd>C</kbd> Crouch</p><p><kbd>M</kbd> Map <span>·</span> <kbd>J</kbd> Journal <span>·</span> <kbd>I</kbd> Inventory</p><p><kbd>Esc</kbd> Pause / close</p></div></aside><div class="settings-form"><section class="settings-section"><h4>Graphics</h4><label class="setting-row"><span><b>Quality</b><small>Scene detail and lighting quality.</small></span><select data-setting="quality" aria-label="Graphics quality">${[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([value, label]) => `<option value="${value}" ${s.quality === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${range('renderScale', 'Render resolution', 'Lower the resolution for smoother movement.', 0.5, 1, 0.05, v => `${Math.round(v * 100)}%`)}${range('fov', 'Field of view', 'How much of the world you see.', 55, 100, 1, v => `${Math.round(v)}°`)}</section><section class="settings-section"><h4>Look & movement</h4>${range('sensitivity', 'Look sensitivity', 'Adjust mouse and touch camera movement.', 0.25, 2.5, 0.05, v => `${Number(v).toFixed(2)}×`)}${toggle('invertY', 'Invert vertical look', 'Reverse up and down camera movement.')}</section><section class="settings-section"><h4>Sound & interface</h4>${range('volume', 'Master volume', 'City ambience and interaction sounds.', 0, 1, 0.05, v => `${Math.round(v * 100)}%`)}${toggle('showMinimap', 'District minimap', 'Keep nearby streets in view.')}</section><div class="settings-footer"><button class="text-button" data-ui="reset-settings">Restore defaults</button><span>Settings apply immediately</span></div></div></div>`;
  }

  _setting(event, type) {
    const input = event.target.closest('[data-setting]');
    if (!input) return;
    if (input.type === 'range' ? type !== 'input' : type !== 'change') return;
    const key = input.dataset.setting;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    this._localSettings = { ...this._localSettings, [key]: value };
    const output = this.root.querySelector(`[data-output="${key}"]`);
    if (output) output.textContent = key === 'fov' ? `${Math.round(value)}°` : key === 'sensitivity' ? `${Number(value).toFixed(2)}×` : `${Math.round(value * 100)}%`;
    this._emit('settings', { [key]: value });
  }

  _shopHTML() {
    const data = this._data();
    const shop = this._panelData.shop || this._panelData.target || {};
    const stock = this._panelData.stock || shop.stock || [];
    const rows = (Array.isArray(stock) ? stock : Object.entries(stock).filter(([, count]) => count > 0).map(([id, count]) => ({ id, count }))).map(entry => {
      const id = typeof entry === 'string' ? entry : entry.id || entry.itemId;
      const item = { ...this.catalog.items?.[id], ...(typeof entry === 'object' ? entry : {}), id };
      const price = item.price;
      const affordable = Number.isFinite(price) && finite(data.player?.credits) >= price;
      return `<article class="shop-row"><span class="entry-symbol">${icon(itemIcon(item), 24)}</span><div><h3>${esc(item.name || pretty(id))}</h3><p>${esc(item.description || '')}</p><small>${number(data.player?.inventory?.[id] || 0)} owned</small></div><button class="secondary-button" data-action="buy" data-id="${esc(id)}" ${affordable ? '' : 'disabled'}>${number(price)} <span>CR</span>${icon('arrow', 17)}</button></article>`;
    });
    return `<div class="shop-layout"><header class="shop-heading"><div><span class="eyebrow">${esc(shop.role || 'NEIGHBOURHOOD TRADER')}</span><h3>${esc(shop.name || this._panelData.name || 'Supplies')}</h3><p>${esc(shop.description || '')}</p></div><div class="shop-wallet">${icon('credit', 20)}<b>${number(data.player?.credits)}</b><span>CR</span></div></header><div class="shop-stock">${rows.length ? rows.join('') : '<div class="empty-state"><p>No stock is available.</p></div>'}</div></div>`;
  }

  dialogue(dialogue) {
    this._dialogue = dialogue || {};
    this.openPanel('dialogue', { state: this.last.state });
  }

  _dialogueHTML() {
    const d = this._dialogue || {};
    const initials = String(d.name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('');
    return `<article class="dialogue-layout"><header class="dialogue-person"><span class="person-monogram" aria-hidden="true">${esc(initials)}</span><div><span class="eyebrow">${esc(d.role || 'SWITCHBACK RESIDENT')}</span><h3>${esc(d.name || 'Conversation')}</h3></div><span class="dialogue-live-dot" aria-hidden="true"></span></header><p class="dialogue-text">${esc(d.text || '')}</p><div class="dialogue-choices">${(d.choices || []).map((choice, index) => `<button class="dialogue-choice" data-ui="dialogue-choice" data-index="${index}" ${choice.disabled ? 'disabled' : ''}><span class="choice-index">${String(index + 1).padStart(2, '0')}</span><span><b>${esc(choice.label)}</b>${choice.description ? `<small>${esc(choice.description)}</small>` : ''}</span>${icon('arrow', 19)}</button>`).join('')}</div><button class="text-button dialogue-leave" data-ui="close">Leave conversation</button></article>`;
  }

  _levelFor(location) {
    const raw = location?.level;
    if (typeof raw === 'string') {
      if (/underground|basement|below|sublevel|lower/i.test(raw)) return 'underground';
      if (/upper|roof|sky|elevated|terrace/i.test(raw)) return 'upper';
      if (/ground|street/i.test(raw)) return 'ground';
    }
    if (typeof raw === 'number') return raw < 0 ? 'underground' : raw > 0 ? 'upper' : 'ground';
    const y = finite(location?.position?.[1]);
    return y < -1.5 ? 'underground' : y >= 4 ? 'upper' : 'ground';
  }

  _floorY() {
    const positions = (this.world?.locations || []).filter(l => this._levelFor(l) === this._mapLevel).map(l => l.position?.[1]).filter(Number.isFinite).sort((a, b) => a - b);
    if (positions.length) return positions[Math.floor(positions.length / 2)];
    if (this._mapLevel === 'upper') return 10;
    if (this._mapLevel === 'underground') return -6;
    return this.world?.spawn?.position?.[1] || 0;
  }

  _mapHTML() {
    const world = this.world;
    this._mapLocations = (world?.locations || []).filter(l => this._levelFor(l) === this._mapLevel);
    const stops = (world?.interactables || []).filter(i => i.type === 'transit' && this._levelFor(i) === this._mapLevel);
    return `<div class="map-layout"><div class="map-main"><div class="map-toolbar"><div class="segment-tabs floor-tabs" role="tablist" aria-label="Map floor">${[['ground', 'Ground'], ['upper', 'Upper'], ['underground', 'Underground']].map(([id, label]) => `<button role="tab" aria-selected="${this._mapLevel === id}" class="${this._mapLevel === id ? 'is-active' : ''}" data-ui="map-level" data-value="${id}">${label}</button>`).join('')}</div><div class="map-zoom"><button data-ui="map-zoom" data-value="out" aria-label="Zoom out">−</button><button data-ui="map-center" aria-label="Center map on player">${icon('scanner', 18)}</button><button data-ui="map-zoom" data-value="in" aria-label="Zoom in">+</button></div></div><div class="map-canvas-wrap"><canvas class="district-map" data-ui="map-canvas" tabindex="0" aria-label="District map. Click to set a waypoint. Use the location list for keyboard navigation."></canvas>${!world ? '<div class="map-unavailable"><p>District geometry is not available yet.</p></div>' : ''}<span class="map-north" aria-hidden="true">N<i></i></span><div class="map-scale" aria-hidden="true"><i></i><span></span></div></div><footer class="map-legend"><span><i class="legend-player"></i>You</span><span><i class="legend-objective"></i>Objective</span><span>${icon('transit', 14)} Transit</span><span class="map-instruction">Click the map to set a waypoint</span></footer></div><aside class="map-sidebar"><div class="map-sidebar-heading"><span class="eyebrow">${esc(this._mapLevel.toUpperCase())} LEVEL</span><h3>${esc(world?.name || 'Switchback Ward')}</h3></div><div class="map-destination-summary">${this._waypoint ? `${icon('location', 18)}<span>Waypoint set</span><button data-ui="clear-waypoint" aria-label="Clear waypoint">${icon('close', 16)}</button>` : `${icon('location', 18)}<span>Choose your next stop.</span>`}</div><h4>Places</h4><div class="map-places">${this._mapLocations.length ? this._mapLocations.map((l, index) => `<button class="map-place" data-ui="map-location" data-index="${index}"><span><b>${esc(l.name)}</b><small>${esc(l.description || '')}</small></span>${icon('arrow', 17)}</button>`).join('') : '<p class="muted">No named places on this level.</p>'}</div>${stops.length ? `<h4 class="transit-title">Transit network</h4><div class="map-transit">${stops.map(stop => `<button class="map-place transit-place" data-ui="transit-waypoint" data-target="${esc(stop.id)}">${icon('transit', 19)}<span><b>${esc(stop.name)}</b><small>Mark transit stop</small></span>${icon('arrow', 16)}</button>`).join('')}</div>` : ''}<p class="map-level-note">Stairs, ladders, and lifts connect the ward’s levels. A marker above or below you may need a different route.</p></aside></div>`;
  }

  _mapBounds() {
    const b = this.world?.bounds;
    if (b && [b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) return b;
    const points = (this.world?.locations || []).map(l => l.position).filter(Array.isArray);
    if (!points.length) return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    return { minX: Math.min(...points.map(p => p[0])) - 20, maxX: Math.max(...points.map(p => p[0])) + 20, minZ: Math.min(...points.map(p => p[2])) - 20, maxZ: Math.max(...points.map(p => p[2])) + 20 };
  }

  _canvasContext(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, width: rect.width, height: rect.height };
  }

  _drawMap() {
    if (this._destroyed || this.panel !== 'map' || !this.isOpen || !this.world) return;
    const canvas = this.root.querySelector('.district-map');
    const surface = this._canvasContext(canvas);
    if (!surface) return;
    const { width, height } = surface;
    const bounds = this._mapBounds();
    const center = this._mapCenter || [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
    const scale = Math.min((width - 68) / Math.max(1, bounds.maxX - bounds.minX), (height - 58) / Math.max(1, bounds.maxZ - bounds.minZ)) * this._mapZoom;
    this._mapTransform = { scale, center, width, height };
    this._paintMap(surface, this._mapTransform, this._mapLevel, false);
    const meters = scale > 2 ? 20 : scale > 0.7 ? 50 : 100;
    const scaleEl = this.root.querySelector('.map-scale');
    if (scaleEl) { scaleEl.querySelector('i').style.width = `${meters * scale}px`; scaleEl.querySelector('span').textContent = `${meters} m`; }
  }

  _drawMinimap() {
    if (this._destroyed || !this.playing || this.isOpen || !this.world || !this._settings().showMinimap) return;
    const canvas = this.el['minimap-canvas'];
    const surface = this._canvasContext(canvas);
    if (!surface) return;
    const player = this._player();
    const position = player.position || this.world.spawn?.position || [0, 0, 0];
    const transform = { scale: surface.width / 105, center: [position[0], position[2]], width: surface.width, height: surface.height };
    this._paintMap(surface, transform, this._levelFor({ position }), true);
  }

  _paintMap(surface, transform, level, mini) {
    const { ctx, width, height } = surface;
    const { center, scale } = transform;
    const sx = x => (x - center[0]) * scale + width / 2;
    const sz = z => (z - center[1]) * scale + height / 2;
    ctx.fillStyle = mini ? '#101b1b' : '#111c1d';
    ctx.fillRect(0, 0, width, height);
    if (!mini) {
      ctx.strokeStyle = 'rgba(147,177,161,.065)'; ctx.lineWidth = 1;
      const step = 24;
      const left = center[0] - width / 2 / scale, top = center[1] - height / 2 / scale;
      ctx.beginPath();
      for (let x = Math.floor(left / step) * step; x < left + width / scale; x += step) { ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), height); }
      for (let z = Math.floor(top / step) * step; z < top + height / scale; z += step) { ctx.moveTo(0, sz(z)); ctx.lineTo(width, sz(z)); }
      ctx.stroke();
    }
    const roads = this.world.roads || [];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const road of roads) {
      if (!road.points?.length) continue;
      ctx.strokeStyle = level === 'ground' ? '#2d3a39' : '#202c2c';
      ctx.lineWidth = Math.max(1, finite(road.width, 6) * scale);
      ctx.beginPath(); road.points.forEach(([x, z], i) => i ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z))); ctx.stroke();
      if (!mini && level === 'ground') { ctx.strokeStyle = '#4a5550'; ctx.lineWidth = 0.7; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.lineJoin = 'miter';
    for (const col of this.world.colliders || []) {
      if (!col.min || !col.max) continue;
      const [x, y, z] = col.min, [x2, y2, z2] = col.max;
      const dy = y2 - y;
      const relevant = level === 'ground' ? y < 3.5 && y2 > -0.6 : level === 'upper' ? y2 >= 4 && y < 40 : y < -1.5 && y2 > -30;
      if (!relevant || (dy < 0.6 && level === 'ground') || (x2 - x) * (z2 - z) > 35000) continue;
      const cx = sx(x), cz = sz(z), cw = (x2 - x) * scale, ch = (z2 - z) * scale;
      if (cx > width || cz > height || cx + cw < 0 || cz + ch < 0) continue;
      ctx.fillStyle = col.type === 'door' ? '#806747' : level === 'upper' && y >= 4 ? '#344742' : '#263732';
      ctx.strokeStyle = col.type === 'door' ? '#d5a678' : '#53675b';
      ctx.lineWidth = mini ? 0.45 : 0.75;
      ctx.fillRect(cx, cz, Math.max(cw, 0.7), Math.max(ch, 0.7));
      ctx.strokeRect(cx, cz, Math.max(cw, 0.7), Math.max(ch, 0.7));
    }
    if (!mini) {
      for (const ramp of this.world.ramps || []) {
        const low = Math.min(ramp.y0, ramp.y1), high = Math.max(ramp.y0, ramp.y1);
        if ((level === 'underground' && low >= -1.5) || (level === 'upper' && high < 4) || (level === 'ground' && (high < -1.5 || low > 4))) continue;
        const x = sx(ramp.x), z = sz(ramp.z);
        ctx.strokeStyle = '#9b9474'; ctx.lineWidth = 1.2;
        ctx.strokeRect(x - ramp.width * scale / 2, z - ramp.depth * scale / 2, ramp.width * scale, ramp.depth * scale);
      }
      const bounds = this._mapBounds();
      ctx.strokeStyle = 'rgba(163,187,163,.22)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.strokeRect(sx(bounds.minX), sz(bounds.minZ), (bounds.maxX - bounds.minX) * scale, (bounds.maxZ - bounds.minZ) * scale); ctx.setLineDash([]);
    }
    for (const stop of (this.world.interactables || []).filter(i => i.type === 'transit')) {
      if (!stop.position || this._levelFor(stop) !== level) continue;
      const x = sx(stop.position[0]), z = sz(stop.position[2]);
      ctx.fillStyle = '#c1cab9'; ctx.beginPath(); ctx.arc(x, z, mini ? 3.4 : 6, 0, Math.PI * 2); ctx.fill();
      if (!mini) { ctx.fillStyle = '#15201e'; ctx.font = 'bold 8px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('T', x, z + 0.3); }
    }
    if (!mini) {
      ctx.font = '500 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const location of this.world.locations || []) {
        if (!location.position || this._levelFor(location) !== level) continue;
        const x = sx(location.position[0]), z = sz(location.position[2]);
        if (x < -20 || x > width + 20 || z < -10 || z > height + 10) continue;
        ctx.strokeStyle = '#111c1d'; ctx.lineWidth = 4; ctx.strokeText(location.name, x, z - 13); ctx.fillStyle = '#c3cdbf'; ctx.fillText(location.name, x, z - 13);
      }
    }
    const objectives = this._objectiveEntries();
    for (const objective of objectives) {
      if (!objective.position) continue;
      const x = sx(objective.position[0]), z = sz(objective.position[2]);
      const sameLevel = this._levelFor({ position: objective.position }) === level;
      if (!sameLevel && !mini) continue;
      ctx.save(); ctx.translate(x, z); ctx.rotate(Math.PI / 4); ctx.fillStyle = sameLevel ? '#e0a172' : '#938578'; ctx.strokeStyle = '#17211e'; ctx.lineWidth = 2; const size = mini ? 4.5 : 6; ctx.fillRect(-size, -size, size * 2, size * 2); ctx.strokeRect(-size, -size, size * 2, size * 2); ctx.restore();
    }
    if (this._waypoint) {
      const x = sx(this._waypoint[0]), z = sz(this._waypoint[2]);
      ctx.strokeStyle = '#edc49f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, z, mini ? 6 : 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, z); ctx.lineTo(x + 3, z); ctx.moveTo(x, z - 3); ctx.lineTo(x, z + 3); ctx.stroke();
      if (!mini) { ctx.fillStyle = '#efd2b3'; ctx.font = '500 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('WAYPOINT', x, z + 21); }
    }
    const player = this._player();
    const position = player.position || this.world.spawn?.position;
    if (position) {
      const x = sx(position[0]), z = sz(position[2]);
      const yaw = finite(this.last.heading, finite(player.yaw));
      ctx.save(); ctx.translate(x, z); ctx.rotate(yaw);
      ctx.fillStyle = 'rgba(156,200,166,.11)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, mini ? 28 : 23, -Math.PI / 2 - 0.47, -Math.PI / 2 + 0.47); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b6d4b0'; ctx.strokeStyle = '#101a17'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 4); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  _objectiveEntries() {
    const source = this.last.objective;
    const entries = Array.isArray(source) ? source : source ? [source] : [];
    if (entries.length) return entries.map(o => {
      if (typeof o === 'string') return { label: o };
      const target = typeof o.target === 'string' ? this.world?.interactables?.find(i => i.id === o.target) : o.target;
      return { ...o, label: o.label || o.text || o.title || o.name || '', position: posOf(o.position) || posOf(target) || posOf(o) };
    }).filter(o => o.label || o.position);
    return this._quests().filter(q => q._status === 'active').map(q => {
      const stage = this._stage(q);
      const target = this.world?.interactables?.find(i => i.id === stage.target);
      return { label: stage.text || q.title || q.name, position: target?.position, target: stage.target };
    });
  }

  _setWaypoint(position) {
    this._waypoint = position ? [...position] : null;
    this._emit('waypoint', { position: this._waypoint });
    if (this.panel === 'map') { this.el['panel-content'].innerHTML = this._mapHTML(); this._drawMap(); }
  }

  openHack({ targetId, name = 'Access terminal', difficulty = 1 } = {}) {
    this.hack = this._createCircuit(targetId, name, difficulty);
    this.openPanel('hack', { state: this.last.state });
  }

  _createCircuit(targetId, name, difficulty) {
    const n = difficulty >= 2 ? 4 : 3;
    const flip = Math.random() < 0.5;
    const path = [];
    for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) {
      const y = c % 2 === 0 ? r : n - 1 - r;
      path.push([flip ? n - 1 - y : y, c]);
    }
    const masks = Array(n * n).fill(0);
    const direction = ([r, c], [r2, c2]) => r2 < r ? 1 : c2 > c ? 2 : r2 > r ? 4 : 8;
    path.forEach((cell, index) => {
      masks[cell[0] * n + cell[1]] = (index === 0 ? 8 : direction(cell, path[index - 1])) | (index === path.length - 1 ? 2 : direction(cell, path[index + 1]));
    });
    const rotate = mask => ((mask << 1) & 15) | ((mask & 8) >> 3);
    const tiles = masks.map(mask => { let value = mask; const turns = 1 + Math.floor(Math.random() * 3); for (let t = 0; t < turns; t++) value = rotate(value); return value; });
    const circuit = { n, targetId, name, difficulty, tiles, source: path[0][0] * n, output: path.at(-1)[0] * n + n - 1, rotations: 0, solved: false, powered: new Set() };
    this._powerCircuit(circuit);
    // A scrambled circuit must never award access without a player move.
    if (circuit.powered.has(circuit.output) && (circuit.tiles[circuit.output] & 2)) { circuit.tiles[circuit.source] = rotate(circuit.tiles[circuit.source]); this._powerCircuit(circuit); }
    return circuit;
  }

  _powerCircuit(hack) {
    const powered = new Set();
    const queue = (hack.tiles[hack.source] & 8) ? [hack.source] : [];
    const dirs = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]];
    while (queue.length) {
      const index = queue.shift();
      if (powered.has(index)) continue;
      powered.add(index);
      const r = Math.floor(index / hack.n), c = index % hack.n;
      for (const [bit, dr, dc, opposite] of dirs) {
        if (!(hack.tiles[index] & bit)) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= hack.n || cc < 0 || cc >= hack.n) continue;
        const next = rr * hack.n + cc;
        if (hack.tiles[next] & opposite) queue.push(next);
      }
    }
    hack.powered = powered;
    return powered.has(hack.output) && Boolean(hack.tiles[hack.output] & 2);
  }

  _hackHTML() {
    const h = this.hack;
    if (!h) return '<div class="empty-state"><p>No active circuit.</p></div>';
    const sourceRow = Math.floor(h.source / h.n), outputRow = Math.floor(h.output / h.n);
    return `<div class="hack-layout"><div class="hack-intro"><div><span class="eyebrow">${h.n} × ${h.n} CIRCUIT</span><h3>${esc(h.name)}</h3></div><span class="hack-status">${icon('circuit', 18)}<span>Connection required</span></span></div><p class="hack-instructions">Turn each tile to connect the <b>source</b> on the left to the <b>output</b> on the right. Click or tap a tile to rotate it clockwise. Lit segments carry power.</p><div class="circuit-wrap" style="--circuit-size:${h.n}"><div class="circuit-port source-port" style="--port-row:${sourceRow}"><span>IN</span><i></i></div><div class="circuit-grid" role="group" aria-label="Rotating circuit puzzle"></div><div class="circuit-port output-port" style="--port-row:${outputRow}"><i></i><span>OUT</span></div></div><div class="hack-feedback" role="status" aria-live="polite"><span class="circuit-powered"></span><span class="circuit-rotations"></span></div><footer class="hack-footer"><button class="text-button" data-ui="reset-circuit">${icon('reset', 16)} Shuffle circuit</button><button class="secondary-button" data-ui="close">Abandon access</button></footer></div>`;
  }

  _renderCircuit() {
    const h = this.hack;
    const grid = this.root.querySelector('.circuit-grid');
    if (!h || !grid) return;
    const active = document.activeElement?.dataset?.tile;
    grid.innerHTML = h.tiles.map((mask, index) => {
      const arms = [[1, 50, 0], [2, 100, 50], [4, 50, 100], [8, 0, 50]].filter(([bit]) => mask & bit);
      const directions = [[1, 'north'], [2, 'east'], [4, 'south'], [8, 'west']].filter(([bit]) => mask & bit).map(([, name]) => name).join(' and ');
      return `<button class="circuit-tile ${h.powered.has(index) ? 'is-powered' : ''}" data-ui="rotate-tile" data-tile="${index}" aria-label="Row ${Math.floor(index / h.n) + 1}, column ${index % h.n + 1}. Connects ${directions}. ${h.powered.has(index) ? 'Powered. ' : ''}Rotate clockwise." ${h.solved ? 'disabled' : ''}><svg viewBox="0 0 100 100" aria-hidden="true"><path class="circuit-track" d="${arms.map(([, x, y]) => `M50 50L${x} ${y}`).join(' ')}"/><path class="circuit-wire" d="${arms.map(([, x, y]) => `M50 50L${x} ${y}`).join(' ')}"/><circle cx="50" cy="50" r="5"/></svg><span class="tile-turn-hint" aria-hidden="true">↻</span></button>`;
    }).join('');
    this.root.querySelector('.circuit-powered').textContent = h.solved ? 'Circuit connected. Access granted.' : `${h.powered.size} / ${h.tiles.length} tiles powered`;
    this.root.querySelector('.circuit-rotations').textContent = `${h.rotations} ${h.rotations === 1 ? 'turn' : 'turns'}`;
    this.root.querySelector('.hack-status').classList.toggle('is-solved', h.solved);
    this.root.querySelector('.hack-status span').textContent = h.solved ? 'Access granted' : 'Connection required';
    this.root.querySelector('.output-port').classList.toggle('is-powered', h.solved);
    if (h.solved) {
      this.root.querySelector('.hack-footer [data-ui="close"]').textContent = 'Continue';
      this.root.querySelector('[data-ui="reset-circuit"]').disabled = true;
    }
    if (active !== undefined && !h.solved) grid.querySelector(`[data-tile="${active}"]`)?.focus({ preventScroll: true });
  }

  _rotateTile(index) {
    const h = this.hack;
    if (!h || h.solved || !Number.isInteger(index) || index < 0 || index >= h.tiles.length) return;
    h.tiles[index] = ((h.tiles[index] << 1) & 15) | ((h.tiles[index] & 8) >> 3);
    h.rotations += 1;
    h.solved = this._powerCircuit(h);
    this._renderCircuit();
    if (h.solved) this._emit('hack-complete', { target: h.targetId });
  }

  toast(message, kind = 'info') {
    if (!message || this._destroyed) return;
    const toast = document.createElement('div');
    toast.className = `astra-toast toast-${['info', 'success', 'error', 'warning'].includes(kind) ? kind : 'info'}`;
    toast.innerHTML = `${icon(kind === 'success' ? 'check' : kind === 'error' || kind === 'warning' ? 'warning' : 'location', 18)}<span>${esc(message)}</span><button aria-label="Dismiss notification">${icon('close', 16)}</button>`;
    toast.querySelector('button').addEventListener('click', () => toast.remove(), { once: true, signal: this._abort.signal });
    this.el['toast-stack'].append(toast);
    while (this.el['toast-stack'].children.length > 4) this.el['toast-stack'].firstElementChild.remove();
    this._delay(() => { toast.classList.add('is-leaving'); this._delay(() => toast.remove(), 250); }, kind === 'error' ? 7000 : 4500);
  }

  setPerformance(stats = {}, enabled = false) {
    this._performanceEnabled = Boolean(enabled);
    const el = this.el['performance-panel'];
    el.hidden = !enabled;
    if (!enabled) return;
    const ms = v => Number.isFinite(v) ? `${v.toFixed(1)} ms` : '—';
    const rows = [['Frame', ms(stats.frameMs)], ['CPU', ms(stats.cpuMs)], ['GPU', ms(stats.gpuMs)], ['Draw calls', number(stats.drawCalls)], ['Visible objects', number(stats.visibleObjects)], ['Triangles', number(stats.triangles)], ['Loaded cells', number(stats.loadedCells)], ['GPU memory', Number.isFinite(stats.memoryBytes) ? `${(stats.memoryBytes / 1048576).toFixed(1)} MiB` : '—']];
    el.innerHTML = `<header>${esc(stats.backend || 'Renderer')}<span>${Number.isFinite(stats.frameMs) && stats.frameMs > 0 ? `${Math.round(1000 / stats.frameMs)} FPS` : ''}</span></header>${rows.map(([label, value]) => `<div><span>${label}</span><b>${esc(value)}</b></div>`).join('')}${stats.adapter ? `<small>${esc(typeof stats.adapter === 'string' ? stats.adapter : stats.adapter.description || stats.adapter.device || '')}</small>` : ''}`;
  }

  _click(event) {
    const button = event.target.closest('[data-action], [data-ui]');
    if (!button || !this.root.contains(button) || button.disabled) return;
    const ui = button.dataset.ui;
    if (ui === 'close') { this._requestClose(); return; }
    if (ui === 'journal-tab') { this._journalTab = button.dataset.value; this._selectedQuest = null; this._renderPanel(); return; }
    if (ui === 'quest-select') { this._selectedQuest = button.dataset.id; this._renderPanel(); return; }
    if (ui === 'item-select') { this._selectedItem = button.dataset.id; this._renderPanel(); return; }
    if (ui === 'map-level') { this._mapLevel = button.dataset.value; this._renderPanel(); return; }
    if (ui === 'map-zoom') { this._mapZoom = clamp(this._mapZoom * (button.dataset.value === 'in' ? 1.3 : 1 / 1.3), 0.65, 5); this._drawMap(); return; }
    if (ui === 'map-center') { const p = this._player().position; if (p) this._mapCenter = [p[0], p[2]]; this._drawMap(); return; }
    if (ui === 'map-location') { const l = this._mapLocations?.[Number(button.dataset.index)]; if (l?.position) this._setWaypoint(l.position); return; }
    if (ui === 'target-waypoint' || ui === 'transit-waypoint') { const target = this.world?.interactables?.find(i => i.id === button.dataset.target); if (target?.position) { this._setWaypoint(target.position); if (ui === 'target-waypoint') this.toast('Destination marked on your map.'); } return; }
    if (ui === 'clear-waypoint') { this._setWaypoint(null); return; }
    if (ui === 'map-canvas') {
      if (!this._mapTransform || !this.world) return;
      const rect = button.getBoundingClientRect(), t = this._mapTransform, bounds = this._mapBounds();
      const x = (event.clientX - rect.left - t.width / 2) / t.scale + t.center[0];
      const z = (event.clientY - rect.top - t.height / 2) / t.scale + t.center[1];
      this._setWaypoint([clamp(x, bounds.minX, bounds.maxX), this._floorY(), clamp(z, bounds.minZ, bounds.maxZ)]);
      return;
    }
    if (ui === 'reset-settings') { this._localSettings = { ...DEFAULT_SETTINGS }; this._emit('settings', { ...DEFAULT_SETTINGS }); this._renderPanel(); return; }
    if (ui === 'dialogue-choice') {
      const choice = this._dialogue?.choices?.[Number(button.dataset.index)];
      if (choice && !choice.disabled) this._emit(choice.action || 'dialogue-choice', choice.payload ?? { id: choice.id });
      return;
    }
    if (ui === 'rotate-tile') { this._rotateTile(Number(button.dataset.tile)); return; }
    if (ui === 'reset-circuit' && this.hack && !this.hack.solved) { const { targetId, name, difficulty } = this.hack; this.hack = this._createCircuit(targetId, name, difficulty); this._renderPanel(); return; }
    const action = button.dataset.action;
    if (!action) return;
    const payload = action === 'open-panel' ? { panel: button.dataset.panel } : button.dataset.id ? { id: button.dataset.id } : {};
    this._emit(action, payload);
  }

  _keyDown(event) {
    if (!this.isOpen) return;
    // Escape is deliberately owned by the game controller.
    if (event.key === 'Tab') {
      const focusable = [...this.el['panel-shell'].querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !this.el['panel-shell'].contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !this.el['panel-shell'].contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    if (this.panel === 'hack' && /^Arrow(Up|Down|Left|Right)$/.test(event.key) && document.activeElement?.dataset.tile !== undefined) {
      event.preventDefault();
      const h = this.hack, index = Number(document.activeElement.dataset.tile), r = Math.floor(index / h.n), c = index % h.n;
      const nextR = clamp(r + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0), 0, h.n - 1);
      const nextC = clamp(c + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), 0, h.n - 1);
      this.root.querySelector(`[data-tile="${nextR * h.n + nextC}"]`)?.focus();
    }
  }

  destroy() {
    this._destroyed = true;
    this._abort.abort();
    this._resize?.disconnect();
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this.root.replaceChildren();
    this.root.classList.remove('astra-interface', 'is-playing', 'has-panel');
    this.isOpen = false;
    this.panel = '';
    this.world = null;
    this.hack = null;
  }
}

export { DEFAULT_SETTINGS };
