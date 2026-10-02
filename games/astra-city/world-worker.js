import {generateDistrict} from './src/world/district.js';
self.onmessage = event => {
  const seed = Number(event.data.seed) || 73191;
  try {
    const start = performance.now();
    const world = generateDistrict(seed);
    self.postMessage({type: 'world', world, generationMs: performance.now() - start});
  } catch (error) {
    self.postMessage({type: 'error', message: error.message || String(error)});
  }
};
