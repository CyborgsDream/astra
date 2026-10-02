import { selectResidentCells } from './cell-stream-data.js';

const now = () => globalThis.performance?.now?.() ?? Date.now();
const signature = ids => [...ids].sort().join('|');

/**
 * A persistent worker owns the full authored district. The main thread owns only
 * permanent structure and a bounded set of detailed cells. Existing rendering
 * continues from the committed set until its replacement is completely ready.
 */
export class CellStream {
  constructor(worker, {
    maxCells = 9, hysteresis = 8, checkInterval = 250,
    cellsPerRequest = 2, timeoutMs = 30000,
    onChange = () => {}, onError = () => {}, clock = now, cleanup = () => {},
  } = {}) {
    this.worker = worker;
    this.maxCells = Math.max(1, Math.min(16, Math.floor(maxCells)));
    this.hysteresis = Math.max(0, hysteresis);
    this.checkInterval = Math.max(0, checkInterval);
    this.cellsPerRequest = Math.max(1, Math.min(4, Math.floor(cellsPerRequest)));
    this.timeoutMs = timeoutMs;
    this.onChange = onChange;
    this.onError = onError;
    this.clock = clock;
    this.cleanup = cleanup;
    this.world = null;
    this.globalInstances = [];
    this.resident = new Map();
    this._working = new Map();
    this._desired = [];
    this._signature = '';
    this._generation = 0;
    this._committedGeneration = -1;
    this._nextCheck = 0;
    this._requestId = 0;
    this._pending = new Map();
    this._inFlight = null;
    this._waiters = [];
    this._disposed = false;
    this._failure = null;
    this._stats = { requests: 0, staleResponses: 0, commits: 0, evictedCells: 0 };
    this._messageListener = event => this._receive(event.data);
    this._errorListener = event => {
      event.preventDefault?.();
      this._fail(new Error(event.message || 'The district worker stopped.'));
    };
    worker.addEventListener('message', this._messageListener);
    worker.addEventListener('error', this._errorListener);
    worker.addEventListener('messageerror', this._errorListener);
  }

  async init(seed) {
    if (this._disposed) throw new Error('This city stream has been disposed.');
    if (this.world) throw new Error('This city stream is already initialized.');
    const response = await this._request({ type: 'init', seed });
    if (!response.world || !Array.isArray(response.world.instances) || !Array.isArray(response.world.cells)) {
      throw new Error('The district worker returned an invalid world manifest.');
    }
    this.world = response.world;
    this.globalInstances = this.world.instances;
    this.generationMs = response.generationMs || 0;
    return this.world;
  }

  /** Safe to call every frame; selection runs at most four times per second. */
  update(position, { force = false } = {}) {
    if (this._disposed || this._failure || !this.world) return false;
    const time = this.clock();
    if (!force && time < this._nextCheck) return false;
    this._nextCheck = time + this.checkInterval;
    const ids = selectResidentCells(this.world.cells, position, this.resident.keys(), this);
    const next = signature(ids);
    if (next === this._signature) return false;
    this._signature = next;
    this._desired = ids;
    this._generation++;
    // Uncommitted payloads belong to their old request generation and are dropped.
    this._working = new Map(ids.filter(id => this.resident.has(id)).map(id => [id, this.resident.get(id)]));
    this._pump();
    return true;
  }

  /** Await before the initial upload or before revealing a transit destination. */
  whenSettled() {
    if (this._disposed) return Promise.reject(new Error('This city stream has been disposed.'));
    if (this._failure) return Promise.reject(this._failure);
    if (this._committedGeneration === this._generation) return Promise.resolve(this.world);
    return new Promise((resolve, reject) => this._waiters.push({ resolve, reject }));
  }

  getStats() {
    return {
      ...this._stats,
      loadedCells: this.resident.size,
      worldCells: this.world?.cells.length || 0,
      pendingCells: this._desired.filter(id => !this._working.has(id)).length,
      residentInstances: this.world?.instances.length || 0,
      worldInstances: this.world?.instanceCount || 0,
      globalInstances: this.globalInstances.length,
      generation: this._generation,
      settled: this._committedGeneration === this._generation,
    };
  }

  _pump() {
    if (this._disposed || this._failure || this._inFlight) return;
    const missing = this._desired.filter(id => !this._working.has(id));
    if (!missing.length) {
      if (this._committedGeneration !== this._generation) this._commit();
      return;
    }
    const request = { generation: this._generation, ids: missing.slice(0, this.cellsPerRequest) };
    this._inFlight = request;
    this._stats.requests++;
    this._request({ type: 'load-cells', generation: request.generation, ids: request.ids })
      .then(response => {
        if (this._disposed) return;
        if (request.generation !== this._generation) {
          this._stats.staleResponses++;
          return;
        }
        if (response.generation !== request.generation || !Array.isArray(response.cells)) {
          throw new Error('The district worker returned an invalid cell response.');
        }
        const received = new Map(response.cells.map(cell => [cell.id, cell.instances]));
        if (received.size !== request.ids.length || request.ids.some(id => !Array.isArray(received.get(id)))) {
          throw new Error('The district worker omitted a requested cell.');
        }
        for (const id of request.ids) this._working.set(id, received.get(id));
      })
      .catch(error => { if (!this._disposed) this._fail(error); })
      .finally(() => {
        if (this._inFlight === request) this._inFlight = null;
        this._pump();
      });
  }

  _commit() {
    const previous = this.resident;
    this.resident = new Map(this._desired.map(id => [id, this._working.get(id)]));
    this._working = new Map(this.resident);
    // Preserve the public world.instances interface; its content is now resident.
    this.world.instances = this.globalInstances.concat(...this.resident.values());
    this._stats.evictedCells += [...previous.keys()].filter(id => !this.resident.has(id)).length;
    this._stats.commits++;
    this._committedGeneration = this._generation;
    try { this.onChange(this.world.instances, [...this.resident.keys()]); }
    catch (error) { this._fail(error); return; }
    for (const waiter of this._waiters.splice(0)) waiter.resolve(this.world);
  }

  _request(message) {
    if (this._disposed || this._failure) return Promise.reject(this._failure || new Error('City streaming stopped.'));
    const requestId = ++this._requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(requestId);
        reject(new Error('The district worker did not respond in time.'));
      }, this.timeoutMs);
      this._pending.set(requestId, { resolve, reject, timer });
      try { this.worker.postMessage({ ...message, requestId }); }
      catch (error) {
        clearTimeout(timer);
        this._pending.delete(requestId);
        reject(error);
      }
    });
  }

  _receive(response) {
    const pending = this._pending.get(response?.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this._pending.delete(response.requestId);
    if (response.type === 'error') pending.reject(new Error(response.message || 'District streaming failed.'));
    else pending.resolve(response);
  }

  _fail(error) {
    if (this._disposed || this._failure) return;
    this._failure = error instanceof Error ? error : new Error(String(error));
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this._failure);
    }
    this._pending.clear();
    for (const waiter of this._waiters.splice(0)) waiter.reject(this._failure);
    this.onError(this._failure);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const error = new Error('The city stream was disposed.');
    this.worker.removeEventListener('message', this._messageListener);
    this.worker.removeEventListener('error', this._errorListener);
    this.worker.removeEventListener('messageerror', this._errorListener);
    this.worker.terminate();
    this.cleanup();
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this._pending.clear();
    for (const waiter of this._waiters.splice(0)) waiter.reject(error);
    this.resident.clear();
    this._working.clear();
    this.globalInstances = [];
    if (this.world) this.world.instances = [];
  }
}

/** Supports both the hosted bundle and the existing embedded single-file build. */
export async function createWorldStream(seed, options = {}) {
  const source = globalThis.window?.__ASTRA_WORKER_SOURCE__;
  const url = source
    ? URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    : new URL('./world-worker.js', document.baseURI).href;
  let stream;
  try {
    const worker = new Worker(url, { type: source ? 'classic' : 'module' });
    stream = new CellStream(worker, { ...options, cleanup: () => { if (source) URL.revokeObjectURL(url); } });
    await stream.init(seed);
    return stream;
  } catch (error) {
    if (stream) stream.dispose();
    else if (source) URL.revokeObjectURL(url);
    throw error;
  }
}
