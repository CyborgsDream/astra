import { generateDistrict } from './src/world/district.js';
import { partitionWorld } from './src/world/cell-stream-data.js';

let district = null;

self.onmessage = event => {
  const message = event.data || {};
  const requestId = message.requestId;
  try {
    if (message.type === 'init' || !message.type) {
      const value = Number(message.seed ?? 73191);
      const seed = Number.isFinite(value) ? value >>> 0 : 73191;
      const start = performance.now();
      district = partitionWorld(generateDistrict(seed));
      self.postMessage({ type: 'world', requestId, world: district.world, generationMs: performance.now() - start });
    } else if (message.type === 'load-cells') {
      if (!district) throw new Error('Initialize the district before loading cells.');
      if (!Array.isArray(message.ids) || message.ids.length < 1 || message.ids.length > 4 || new Set(message.ids).size !== message.ids.length) {
        throw new Error('Request between one and four distinct district cells.');
      }
      const cells = message.ids.map(id => {
        if (!district.chunks.has(id)) throw new Error(`Unknown district cell: ${id}`);
        return { id, instances: district.chunks.get(id) };
      });
      self.postMessage({ type: 'cells', requestId, generation: message.generation, cells });
    } else {
      throw new Error(`Unknown district request: ${message.type}`);
    }
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message || String(error) });
  }
};
