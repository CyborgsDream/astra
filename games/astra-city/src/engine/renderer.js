import { createGeometry, MESH_NAMES } from './geometry.js';
import { cameraForward, clamp, cross3, dot3, frustumPlanes, invert4, lookAt, multiply4, normalize3, orthographic, packInstance, perspective } from './math.js';
import { CULL_WGSL, MAIN_WGSL, RAIN_WGSL, SHADOW_WGSL, SKY_WGSL } from './shaders.js';

const INSTANCE_BYTES = 160;
const FRAME_BYTES = 544;
const READBACK_BYTES = 1024;
const TIMESTAMP_OFFSET = 512;
const MATERIAL_ROUGHNESS = [0.85, 0.43, 0.15, 0.95, 0.77, 0.93, 0.42, 0.93, 0.62, 0.13, 0.92, 0.87];
const QUALITY = {
  low: { samples: 1, shadowSize: 1024, shadowRadius: 64, facade: 160, micro: 42, shadowMicro: 34, level: 0 },
  medium: { samples: 4, shadowSize: 1536, shadowRadius: 82, facade: 250, micro: 74, shadowMicro: 52, level: 1 },
  high: { samples: 4, shadowSize: 2048, shadowRadius: 100, facade: 380, micro: 112, shadowMicro: 74, level: 2 },
};
const VERTEX_BUFFERS = [{
  arrayStride: 32,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
  ],
}];
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const mix3 = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
const smoothstep = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const describeError = error => error?.message || String(error);

function splitInstances(instances) {
  if (!Array.isArray(instances)) throw new TypeError('Renderer instances must be an array.');
  const groups = Object.fromEntries(MESH_NAMES.map(name => [name, []]));
  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    if (!instance || !groups[instance.mesh]) throw new TypeError(`Unsupported instance mesh at index ${index}: ${instance?.mesh}`);
    groups[instance.mesh].push(instance);
  }
  return groups;
}

class InstanceBatch {
  constructor(renderer, meshName, dynamic) {
    this.renderer = renderer;
    this.meshName = meshName;
    this.dynamic = dynamic;
    this.count = 0;
    this.capacity = 0;
    this.buffers = [];
    this.infoData = new Uint32Array(4);
    this.indexData = new Uint32Array(1);
  }

  update(instances) {
    const count = instances.length;
    if (count > this.capacity) this.allocate(count);
    this.count = count;
    if (!this.capacity) return;
    for (let index = 0; index < count; index++) packInstance(this.packed, index * 40, instances[index], MATERIAL_ROUGHNESS);
    const queue = this.renderer.device.queue;
    if (count) queue.writeBuffer(this.instanceBuffer, 0, this.packed.buffer, 0, count * INSTANCE_BYTES);
    this.infoData[0] = count;
    queue.writeBuffer(this.infoBuffer, 0, this.infoData);
  }

  allocate(required) {
    this.destroy();
    const r = this.renderer;
    const capacity = this.dynamic ? Math.max(32, 2 ** Math.ceil(Math.log2(required))) : required;
    if (capacity * INSTANCE_BYTES > r.device.limits.maxStorageBufferBindingSize) {
      throw new Error(`The ${this.meshName} batch needs ${capacity * INSTANCE_BYTES} bytes, exceeding this adapter's storage-buffer limit.`);
    }
    this.capacity = capacity;
    this.packed = new Float32Array(capacity * 40);
    const name = `${this.dynamic ? 'dynamic' : 'static'} ${this.meshName}`;
    const make = (label, size, usage, data) => {
      const buffer = r._buffer(`${name}: ${label}`, size, usage, data);
      this.buffers.push(buffer);
      return buffer;
    };
    this.instanceBuffer = make('instances', capacity * INSTANCE_BYTES, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.cameraVisible = make('camera compacted indices', capacity * 4, GPUBufferUsage.STORAGE);
    this.shadowVisible = make('light compacted indices', capacity * 4, GPUBufferUsage.STORAGE);
    const geometry = r._geometry[this.meshName];
    const indirectUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.cameraArguments = make('camera indirect arguments', 20, indirectUsage,
      new Uint32Array([r._wireframe ? geometry.edgeIndexCount : geometry.indexCount, 0, 0, 0, 0]));
    this.shadowArguments = make('shadow indirect arguments', 20, indirectUsage,
      new Uint32Array([geometry.indexCount, 0, 0, 0, 0]));
    this.infoBuffer = make('count', 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, this.infoData);
    const resources = visible => [
      { binding: 0, resource: { buffer: this.instanceBuffer } },
      { binding: 1, resource: { buffer: visible } },
    ];
    this.cameraBindGroup = r.device.createBindGroup({ label: `${name}: camera`, layout: r._instanceLayout, entries: resources(this.cameraVisible) });
    this.shadowBindGroup = r.device.createBindGroup({ label: `${name}: shadow`, layout: r._instanceLayout, entries: resources(this.shadowVisible) });
    this.cullBindGroup = r.device.createBindGroup({ label: `${name}: culling`, layout: r._cullLayout, entries: [
      { binding: 0, resource: { buffer: r._frameBuffer } },
      { binding: 1, resource: { buffer: this.instanceBuffer } },
      { binding: 2, resource: { buffer: this.cameraVisible } },
      { binding: 3, resource: { buffer: this.shadowVisible } },
      { binding: 4, resource: { buffer: this.cameraArguments } },
      { binding: 5, resource: { buffer: this.shadowArguments } },
      { binding: 6, resource: { buffer: this.infoBuffer } },
    ] });
  }

  setWireframe(enabled) {
    if (!this.capacity) return;
    const mesh = this.renderer._geometry[this.meshName];
    this.indexData[0] = enabled ? mesh.edgeIndexCount : mesh.indexCount;
    this.renderer.device.queue.writeBuffer(this.cameraArguments, 0, this.indexData);
  }

  destroy() {
    for (const buffer of this.buffers) this.renderer._release(buffer);
    this.buffers = [];
    this.capacity = 0;
    this.count = 0;
    this.packed = null;
    this.cameraBindGroup = this.shadowBindGroup = this.cullBindGroup = null;
  }
}

/** Native WebGPU city renderer. No WebGL path and no external runtime dependency. */
export class Renderer {
  constructor(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('Renderer requires a canvas.');
    this.canvas = canvas;
    this.ready = false;
    this.errors = [];
    this.compilationMessages = [];
    this.lastError = null;
    this.device = null;
    this.context = null;
    this.adapterInfo = null;
    this._disposed = false;
    this._resourcesInitialized = false;
    this._initPromise = null;
    this._resourceBytes = new Map();
    this._memoryBytes = 0;
    this._worldInstances = [];
    this._dynamicInstances = [];
    this._signs = [];
    this._staticBatches = [];
    this._dynamicBatches = [];
    this._loadedCells = new Set();
    this._staticCount = 0;
    this._dynamicCount = 0;
    this._qualityName = 'medium';
    this._quality = QUALITY.medium;
    this._sampleCount = this._quality.samples;
    this._renderScale = 1;
    this._wireframe = false;
    this._frameNumber = 0;
    this._samplingGeneration = 0;
    this._previousFrameTime = null;
    this._pendingCpuMs = 0;
    this._frameData = new Float32Array(FRAME_BYTES / 4);
    this._view = new Float32Array(16);
    this._projection = new Float32Array(16);
    this._viewProjection = new Float32Array(16);
    this._inverseViewProjection = new Float32Array(16);
    this._lightView = new Float32Array(16);
    this._lightProjection = new Float32Array(16);
    this._lightViewProjection = new Float32Array(16);
    this._stats = {
      backend: 'WebGPU', frameMs: 0, cpuMs: 0, gpuMs: null, drawCalls: 0,
      instances: 0, visibleObjects: 0, triangles: 0, memoryBytes: 0, loadedCells: 0,
      shadowVisibleObjects: 0, shadowTriangles: 0, lines: 0, statsSampleFrame: 0,
      visibilityPending: true, computeDispatches: 0, adapter: null,
    };
  }

  async init() {
    if (this._disposed) throw new Error('Cannot initialize a disposed renderer.');
    if (this.ready) return this;
    if (this._initPromise) return this._initPromise;
    if (this.device) this._destroyResources();
    this._frameNumber = 0;
    this._previousFrameTime = null;
    this._stats.statsSampleFrame = 0;
    this._stats.gpuMs = null;
    this._initPromise = this._initialize().catch(error => {
      this.ready = false;
      this._recordError(`WebGPU startup failed: ${describeError(error)}`, true);
      this._destroyResources();
      throw error;
    }).finally(() => { this._initPromise = null; });
    return this._initPromise;
  }

  async _initialize() {
    if (!globalThis.navigator?.gpu) {
      throw new Error('Native WebGPU is unavailable. Open the city in a browser with WebGPU enabled on a secure origin.');
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('The browser could not acquire a WebGPU adapter. Check GPU acceleration and WebGPU support.');
    const features = [];
    this._timestampsSupported = adapter.features.has('timestamp-query');
    if (this._timestampsSupported) features.push('timestamp-query');
    this.device = await adapter.requestDevice({ label: 'ASTRA CITY native WebGPU device', requiredFeatures: features });
    const device = this.device;
    if (this._disposed) { device.destroy(); throw new Error('Renderer was disposed during initialization.'); }
    const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo().catch(() => null) : null);
    this.adapterInfo = info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
    this._stats.adapter = info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(' / ') || 'WebGPU adapter' : 'WebGPU adapter';
    this._deviceErrorListener = event => {
      this.ready = false;
      this._recordError(`WebGPU validation: ${describeError(event.error)}`, true);
    };
    device.addEventListener('uncapturederror', this._deviceErrorListener);
    device.lost.then(info => {
      if (this._disposed || this.device !== device) return;
      this.ready = false;
      this._recordError(`WebGPU device lost (${info.reason}): ${info.message || 'The GPU connection ended.'}`, true);
    });
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) throw new Error('This canvas could not create a WebGPU presentation context.');
    this._format = navigator.gpu.getPreferredCanvasFormat();
    device.pushErrorScope('validation');
    let startupScopeOpen = true;
    try {
      this._createLayouts();
      this._frameBuffer = this._buffer('frame uniforms', FRAME_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      this._shadowFrameBindGroup = device.createBindGroup({ label: 'shadow frame', layout: this._shadowFrameLayout, entries: [
        { binding: 0, resource: { buffer: this._frameBuffer } },
      ] });
      this._geometry = {};
      for (const [name, geometry] of Object.entries(createGeometry())) {
        this._geometry[name] = {
          vertex: this._buffer(`${name} vertices`, geometry.vertices.byteLength, GPUBufferUsage.VERTEX, geometry.vertices),
          index: this._buffer(`${name} triangles`, geometry.indices.byteLength, GPUBufferUsage.INDEX, geometry.indices),
          edges: this._buffer(`${name} edges`, geometry.edges.byteLength, GPUBufferUsage.INDEX, geometry.edges),
          indexCount: geometry.indices.length, edgeIndexCount: geometry.edges.length, triangles: geometry.triangles,
        };
      }
      this._signTexture = this._texture('semantic sign atlas', 2048, 1024, 'rgba8unorm-srgb', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT);
      this._signSampler = device.createSampler({ label: 'atlas linear clamp', minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      this._shadowSampler = device.createSampler({ label: 'stable shadow comparison', compare: 'less-equal', minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      await this._createPipelines();
      this._readbackSlots = Array.from({ length: 3 }, (_, index) => ({
        buffer: this._buffer(`asynchronous stats ${index}`, READBACK_BYTES, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), busy: false,
      }));
      if (this._timestampsSupported) {
        this._timestampQueries = device.createQuerySet({ label: 'native GPU frame timestamps', type: 'timestamp', count: 2 });
        this._timestampResolve = this._buffer('GPU timestamp resolve', 256, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC);
      }
      this._applyQuality(this._qualityName, true);
      this._resourcesInitialized = true;
      this._replaceWorld(this._worldInstances, this._signs);
      this._updateDynamic(this._dynamicInstances);
      const validationError = await device.popErrorScope();
      startupScopeOpen = false;
      if (validationError) throw new Error(`GPU resource validation failed: ${validationError.message}`);
      if (this._disposed) throw new Error('Renderer was disposed during initialization.');
      this.ready = true;
      return this;
    } finally {
      if (startupScopeOpen) {
        const error = await device.popErrorScope();
        if (error) this._recordError(`GPU startup validation: ${error.message}`);
      }
    }
  }

  _createLayouts() {
    const device = this.device;
    const allGraphics = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this._frameLayout = device.createBindGroupLayout({ label: 'frame and environment layout', entries: [
      { binding: 0, visibility: allGraphics, buffer: { type: 'uniform', minBindingSize: FRAME_BYTES } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ] });
    this._shadowFrameLayout = device.createBindGroupLayout({ label: 'shadow frame layout', entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', minBindingSize: FRAME_BYTES } },
    ] });
    this._instanceLayout = device.createBindGroupLayout({ label: 'instanced geometry layout', entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage', minBindingSize: INSTANCE_BYTES } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage', minBindingSize: 4 } },
    ] });
    this._cullLayout = device.createBindGroupLayout({ label: 'compute visibility layout', entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: FRAME_BYTES } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage', minBindingSize: INSTANCE_BYTES } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', minBindingSize: 4 } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', minBindingSize: 4 } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', minBindingSize: 20 } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage', minBindingSize: 20 } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 16 } },
    ] });
  }

  async _createPipelines() {
    const device = this.device;
    const modules = {};
    for (const [name, code] of Object.entries({ culling: CULL_WGSL, shadow: SHADOW_WGSL, material: MAIN_WGSL, sky: SKY_WGSL, rain: RAIN_WGSL })) {
      const module = device.createShaderModule({ label: `ASTRA ${name} WGSL`, code });
      modules[name] = module;
      if (typeof module.getCompilationInfo === 'function') {
        const info = await module.getCompilationInfo();
        for (const message of info.messages) {
          this.compilationMessages.push({ module: name, type: message.type, lineNum: message.lineNum, linePos: message.linePos, message: message.message });
          if (message.type === 'error') this._recordError(`${name}.wgsl:${message.lineNum}:${message.linePos}: ${message.message}`);
        }
        if (info.messages.some(message => message.type === 'error')) throw new Error(`The ${name} WGSL shader failed compilation. See renderer.errors for diagnostics.`);
      }
    }
    const mainLayout = device.createPipelineLayout({ label: 'main pipeline layout', bindGroupLayouts: [this._frameLayout, this._instanceLayout] });
    const fullscreenLayout = device.createPipelineLayout({ label: 'fullscreen pipeline layout', bindGroupLayouts: [this._frameLayout] });
    const shadowLayout = device.createPipelineLayout({ label: 'shadow pipeline layout', bindGroupLayouts: [this._shadowFrameLayout, this._instanceLayout] });
    const cullLayout = device.createPipelineLayout({ label: 'compute pipeline layout', bindGroupLayouts: [this._cullLayout] });
    this._cullPipeline = await device.createComputePipelineAsync({ label: 'frustum compaction and indirect counts', layout: cullLayout, compute: { module: modules.culling, entryPoint: 'csCull' } });
    this._shadowPipeline = await device.createRenderPipelineAsync({
      label: 'directional shadow depth', layout: shadowLayout,
      vertex: { module: modules.shadow, entryPoint: 'vsShadow', buffers: VERTEX_BUFFERS },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 1, depthBiasSlopeScale: 1.25 },
    });
    this._mainPipelines = {};
    this._wirePipelines = {};
    this._skyPipelines = {};
    this._rainPipelines = {};
    for (const samples of [1, 4]) {
      this._mainPipelines[samples] = await device.createRenderPipelineAsync({
        label: `PBR city / ${samples} samples`, layout: mainLayout,
        vertex: { module: modules.material, entryPoint: 'vsMain', buffers: VERTEX_BUFFERS },
        fragment: { module: modules.material, entryPoint: 'fsMain', targets: [{ format: this._format }] },
        primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        multisample: { count: samples },
      });
      this._wirePipelines[samples] = await device.createRenderPipelineAsync({
        label: `native mesh edges / ${samples} samples`, layout: mainLayout,
        vertex: { module: modules.material, entryPoint: 'vsMain', buffers: VERTEX_BUFFERS },
        fragment: { module: modules.material, entryPoint: 'fsWire', targets: [{ format: this._format }] },
        primitive: { topology: 'line-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        multisample: { count: samples },
      });
      this._skyPipelines[samples] = await device.createRenderPipelineAsync({
        label: `atmosphere / ${samples} samples`, layout: fullscreenLayout,
        vertex: { module: modules.sky, entryPoint: 'vsFullscreen' },
        fragment: { module: modules.sky, entryPoint: 'fsSky', targets: [{ format: this._format }] },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        primitive: { topology: 'triangle-list' }, multisample: { count: samples },
      });
      this._rainPipelines[samples] = await device.createRenderPipelineAsync({
        label: `rain / ${samples} samples`, layout: fullscreenLayout,
        vertex: { module: modules.rain, entryPoint: 'vsFullscreen' },
        fragment: { module: modules.rain, entryPoint: 'fsRain', targets: [{ format: this._format, blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        } }] },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        primitive: { topology: 'triangle-list' }, multisample: { count: samples },
      });
    }
  }

  setWorld(instances, signs = []) {
    if (this._disposed) throw new Error('Cannot upload a world to a disposed renderer.');
    if (!Array.isArray(instances) || !Array.isArray(signs)) throw new TypeError('setWorld expects instance and sign arrays.');
    this._worldInstances = instances;
    this._signs = signs.slice(0, 128).map(value => String(value ?? ''));
    this._staticCount = instances.length;
    this._loadedCells = new Set(instances.map(instance => instance.cell).filter(Boolean));
    if (this._resourcesInitialized) this._replaceWorld(instances, this._signs);
  }

  _replaceWorld(instances, signs) {
    const grouped = splitInstances(instances);
    for (const batch of this._staticBatches) batch.destroy();
    this._staticBatches = [];
    for (const name of MESH_NAMES) {
      if (!grouped[name].length) continue;
      const batch = new InstanceBatch(this, name, false);
      batch.update(grouped[name]);
      this._staticBatches.push(batch);
    }
    this._staticCount = instances.length;
    this._loadedCells = new Set(instances.map(instance => instance.cell).filter(Boolean));
    this._samplingGeneration++;
    this._stats.visibleObjects = 0;
    this._stats.triangles = 0;
    this._stats.visibilityPending = true;
    this._drawSignAtlas(signs);
  }

  setDynamic(instances) {
    if (this._disposed) return;
    if (!Array.isArray(instances)) throw new TypeError('setDynamic expects an instance array.');
    this._dynamicInstances = instances;
    this._dynamicCount = instances.length;
    if (this._resourcesInitialized) {
      const start = clock();
      this._updateDynamic(instances);
      this._pendingCpuMs += clock() - start;
    }
  }

  _updateDynamic(instances) {
    const grouped = splitInstances(instances);
    for (const name of MESH_NAMES) {
      let batch = this._dynamicBatches.find(value => value.meshName === name);
      if (!batch && grouped[name].length) {
        batch = new InstanceBatch(this, name, true);
        this._dynamicBatches.push(batch);
      }
      if (batch) batch.update(grouped[name]);
    }
    this._dynamicCount = instances.length;
  }

  _drawSignAtlas(signs) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2048, 1024) : document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas2D is required to build the semantic city-sign atlas.');
    context.fillStyle = '#152023';
    context.fillRect(0, 0, 2048, 1024);
    const accents = ['#b9d8cb', '#ead7a2', '#c5cbd6', '#bad6df'];
    for (let index = 0; index < Math.min(signs.length, 128); index++) {
      const label = String(signs[index] ?? '').trim();
      if (!label) continue;
      const x = (index % 8) * 256, y = Math.floor(index / 8) * 64;
      context.fillStyle = '#172326';
      context.fillRect(x + 2, y + 2, 252, 60);
      context.strokeStyle = '#647576';
      context.lineWidth = 1;
      context.strokeRect(x + 5.5, y + 5.5, 245, 53);
      context.fillStyle = accents[index % accents.length];
      context.fillRect(x + 7, y + 8, 3, 48);
      context.fillStyle = '#ecede3';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const words = label.replace(/\s+/g, ' ').split(' ');
      let lines = [label];
      if (label.length > 23 && words.length > 1) {
        let first = '';
        while (words.length > 1 && (!first || first.length + words[0].length < label.length * 0.57)) first += `${first ? ' ' : ''}${words.shift()}`;
        lines = [first, words.join(' ')];
      }
      const fontSize = lines.length === 1 ? (label.length > 24 ? 19 : 25) : 20;
      context.font = `700 ${fontSize}px system-ui, sans-serif`;
      if (lines.length === 1) context.fillText(lines[0], x + 131, y + 33, 226);
      else {
        context.fillText(lines[0], x + 131, y + 23, 226);
        context.fillText(lines[1], x + 131, y + 44, 226);
      }
    }
    this.device.queue.copyExternalImageToTexture({ source: canvas, flipY: false }, { texture: this._signTexture }, { width: 2048, height: 1024 });
  }

  resize(scale = 1) {
    this._renderScale = clamp(Number.isFinite(scale) ? scale : 1, 0.5, 1);
    if (!this.device || !this.context) return;
    const rect = this.canvas.getBoundingClientRect?.();
    const cssWidth = this.canvas.clientWidth || rect?.width || this.canvas.width || 1;
    const cssHeight = this.canvas.clientHeight || rect?.height || this.canvas.height || 1;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const limit = this.device.limits.maxTextureDimension2D;
    const width = clamp(Math.round(cssWidth * dpr * this._renderScale), 1, limit);
    const height = clamp(Math.round(cssHeight * dpr * this._renderScale), 1, limit);
    const signature = `${width}x${height}@${this._sampleCount}`;
    if (signature === this._targetSignature) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this._format, alphaMode: 'opaque', colorSpace: 'srgb', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this._release(this._mainDepth);
    this._release(this._msaaColor);
    this._mainDepth = this._texture('main depth', width, height, 'depth24plus', GPUTextureUsage.RENDER_ATTACHMENT, this._sampleCount);
    this._mainDepthView = this._mainDepth.createView();
    this._msaaColor = this._sampleCount > 1 ? this._texture('MSAA color', width, height, this._format, GPUTextureUsage.RENDER_ATTACHMENT, this._sampleCount) : null;
    this._msaaColorView = this._msaaColor?.createView() ?? null;
    this._targetSignature = signature;
    this._width = width;
    this._height = height;
  }

  _applyQuality(name, force = false) {
    if (!QUALITY[name]) name = 'medium';
    if (!force && name === this._qualityName) return;
    this._qualityName = name;
    this._quality = QUALITY[name];
    this._sampleCount = this._quality.samples;
    this._release(this._shadowTexture);
    this._shadowTexture = this._texture('directional sunlight depth', this._quality.shadowSize, this._quality.shadowSize,
      'depth32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    this._shadowView = this._shadowTexture.createView();
    this._frameBindGroup = this.device.createBindGroup({ label: 'frame environment', layout: this._frameLayout, entries: [
      { binding: 0, resource: { buffer: this._frameBuffer } },
      { binding: 1, resource: this._shadowView },
      { binding: 2, resource: this._shadowSampler },
      { binding: 3, resource: this._signTexture.createView() },
      { binding: 4, resource: this._signSampler },
    ] });
    this.resize(this._renderScale);
  }

  _updateFrame(camera, environment, options) {
    const position = camera?.position;
    if (!position || position.length < 3 || !position.every(Number.isFinite)) throw new TypeError('The camera position must contain three finite numbers.');
    const yaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
    const pitch = clamp(Number.isFinite(camera.pitch) ? camera.pitch : 0, -1.565, 1.565);
    const forward = cameraForward(yaw, pitch);
    const near = Math.max(0.01, Number.isFinite(camera.near) ? camera.near : 0.08);
    const far = Math.max(near + 1, Number.isFinite(camera.far) ? camera.far : 1000);
    lookAt(position, position.map((value, index) => value + forward[index]), [0, 1, 0], this._view);
    perspective(clamp(Number.isFinite(camera.fov) ? camera.fov : 75, 25, 125) * Math.PI / 180, this._width / this._height, near, far, this._projection);
    multiply4(this._projection, this._view, this._viewProjection);
    invert4(this._viewProjection, this._inverseViewProjection);

    const hour = (((Number.isFinite(environment.hour) ? environment.hour : 14) % 24) + 24) % 24;
    const angle = (hour - 6) / 24 * Math.PI * 2;
    if (environment.sunDirection && (environment.sunDirection.length < 3 || !environment.sunDirection.every(Number.isFinite))) {
      throw new TypeError('The environment sunDirection must contain three finite numbers.');
    }
    const solar = environment.sunDirection?.length >= 3 ? normalize3(environment.sunDirection) : normalize3([Math.cos(angle) * 0.68, Math.sin(angle) * 0.88, -0.32]);
    const day = smoothstep(-0.09, 0.23, solar[1]);
    const night = 1 - day;
    const twilight = 1 - smoothstep(0.03, 0.5, Math.abs(solar[1]));
    const rain = environment.weather === 'rain' ? 1 : 0;
    const cloudiness = rain || (environment.weather === 'overcast' ? 0.7 : 0);
    const wetness = clamp(Number.isFinite(environment.wetness) ? environment.wetness : (rain ? 0.7 : 0), 0, 1);
    const invertSun = solar[1] < -0.04 ? -1 : 1;
    const light = normalize3([solar[0] * invertSun, Math.max(0.13, Math.abs(solar[1])), solar[2] * invertSun]);
    let zenith = mix3([0.008, 0.018, 0.045], [0.16, 0.34, 0.60], day);
    let horizon = mix3([0.039, 0.057, 0.091], [0.81, 0.86, 0.89], day);
    horizon = mix3(horizon, [0.73, 0.40, 0.23], twilight * 0.43 * (1 - cloudiness * 0.8));
    zenith = mix3(zenith, mix3([0.016, 0.023, 0.036], [0.34, 0.39, 0.42], day), cloudiness * 0.83);
    horizon = mix3(horizon, mix3([0.043, 0.052, 0.066], [0.60, 0.65, 0.66], day), cloudiness * 0.82);
    const sunlight = mix3([0.43, 0.57, 0.86], mix3([1, 0.66, 0.36], [1, 0.96, 0.86], smoothstep(0.20, 0.95, solar[1])), day);
    const sunIntensity = day * 3.6 * (1 - cloudiness * 0.7) + night * 0.085;

    const radius = this._quality.shadowRadius;
    const center = [position[0] + forward[0] * radius * 0.18, Math.max(8, position[1] - 3), position[2] + forward[2] * radius * 0.18];
    let right = cross3([0, 1, 0], light);
    if (Math.hypot(...right) < 0.001) right = [1, 0, 0];
    right = normalize3(right);
    const up = cross3(light, right);
    const worldTexel = radius * 2 / this._quality.shadowSize;
    const rightAmount = dot3(center, right), upAmount = dot3(center, up);
    const rightSnap = Math.round(rightAmount / worldTexel) * worldTexel - rightAmount;
    const upSnap = Math.round(upAmount / worldTexel) * worldTexel - upAmount;
    for (let index = 0; index < 3; index++) center[index] += right[index] * rightSnap + up[index] * upSnap;
    const eye = center.map((value, index) => value + light[index] * 190);
    lookAt(eye, center, [0, 1, 0], this._lightView);
    orthographic(-radius, radius, -radius, radius, 0.1, 440, this._lightProjection);
    multiply4(this._lightProjection, this._lightView, this._lightViewProjection);
    const f = this._frameData;
    f.set(this._viewProjection, 0);
    f.set(this._inverseViewProjection, 16);
    f.set(this._lightViewProjection, 32);
    f.set([...position, Number.isFinite(environment.time) ? environment.time : clock() / 1000], 48);
    f.set([...light, sunIntensity], 52);
    f.set([...sunlight, day], 56);
    f.set([...zenith, wetness], 60);
    f.set([...horizon, rain], 64);
    f.set([day * (0.24 + cloudiness * 0.16) + night * 0.135, day * 0.12 + night * 0.11, night, 1 + night * 0.12], 68);
    f.set([this._width, this._height, 1 / this._width, 1 / this._height], 72);
    f.set([1 / this._quality.shadowSize, day * 0.97 * (1 - cloudiness * 0.59) + night * 0.26, cloudiness, options.fog === false ? 0 : 1], 76);
    f.set([this._quality.facade, this._quality.micro, this._quality.shadowMicro, this._quality.level], 80);
    frustumPlanes(this._viewProjection, f, 84);
    frustumPlanes(this._lightViewProjection, f, 108);
    f.set([...center, 0.00125 + cloudiness * 0.0008 + rain * 0.00055], 132);
    this.device.queue.writeBuffer(this._frameBuffer, 0, f);
    return { rain };
  }

  render(camera, environment = {}, options = {}) {
    if (!this.ready || this._disposed) return false;
    const start = clock();
    const device = this.device;
    const scoped = this._frameNumber < 3 || this._frameNumber % 120 === 0;
    if (scoped) device.pushErrorScope('validation');
    let scopeOpen = scoped;
    try {
      this._applyQuality(options.quality ?? this._qualityName);
      this.resize(options.renderScale ?? this._renderScale);
      const wireframe = Boolean(options.wireframe);
      if (wireframe !== this._wireframe) {
        this._wireframe = wireframe;
        for (const batch of [...this._staticBatches, ...this._dynamicBatches]) batch.setWireframe(wireframe);
      }
      const { rain } = this._updateFrame(camera, environment, options);
      const batches = [...this._staticBatches, ...this._dynamicBatches].filter(batch => batch.count > 0);
      const encoder = device.createCommandEncoder({ label: `ASTRA city frame ${this._frameNumber + 1}` });
      for (const batch of batches) {
        encoder.clearBuffer(batch.cameraArguments, 4, 4);
        encoder.clearBuffer(batch.shadowArguments, 4, 4);
      }
      const computeDescriptor = { label: 'camera and light frustum culling' };
      if (this._timestampQueries) computeDescriptor.timestampWrites = { querySet: this._timestampQueries, beginningOfPassWriteIndex: 0 };
      const compute = encoder.beginComputePass(computeDescriptor);
      compute.setPipeline(this._cullPipeline);
      for (const batch of batches) {
        compute.setBindGroup(0, batch.cullBindGroup);
        compute.dispatchWorkgroups(Math.ceil(batch.count / 64));
      }
      compute.end();

      const shadow = encoder.beginRenderPass({ label: 'independently culled directional shadows', colorAttachments: [],
        depthStencilAttachment: { view: this._shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      shadow.setPipeline(this._shadowPipeline);
      shadow.setBindGroup(0, this._shadowFrameBindGroup);
      for (const batch of batches) {
        const mesh = this._geometry[batch.meshName];
        shadow.setBindGroup(1, batch.shadowBindGroup);
        shadow.setVertexBuffer(0, mesh.vertex);
        shadow.setIndexBuffer(mesh.index, 'uint16');
        shadow.drawIndexedIndirect(batch.shadowArguments, 0);
      }
      shadow.end();

      const currentView = this.context.getCurrentTexture().createView();
      const colorAttachment = this._sampleCount > 1
        ? { view: this._msaaColorView, resolveTarget: currentView, clearValue: { r: 0.04, g: 0.06, b: 0.09, a: 1 }, loadOp: 'clear', storeOp: 'discard' }
        : { view: currentView, clearValue: { r: 0.04, g: 0.06, b: 0.09, a: 1 }, loadOp: 'clear', storeOp: 'store' };
      const mainDescriptor = { label: 'city, atmosphere, and weather', colorAttachments: [colorAttachment],
        depthStencilAttachment: { view: this._mainDepthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      };
      if (this._timestampQueries) mainDescriptor.timestampWrites = { querySet: this._timestampQueries, endOfPassWriteIndex: 1 };
      const pass = encoder.beginRenderPass(mainDescriptor);
      pass.setPipeline(this._skyPipelines[this._sampleCount]);
      pass.setBindGroup(0, this._frameBindGroup);
      pass.draw(3);
      pass.setPipeline(wireframe ? this._wirePipelines[this._sampleCount] : this._mainPipelines[this._sampleCount]);
      pass.setBindGroup(0, this._frameBindGroup);
      for (const batch of batches) {
        const mesh = this._geometry[batch.meshName];
        pass.setBindGroup(1, batch.cameraBindGroup);
        pass.setVertexBuffer(0, mesh.vertex);
        pass.setIndexBuffer(wireframe ? mesh.edges : mesh.index, 'uint16');
        pass.drawIndexedIndirect(batch.cameraArguments, 0);
      }
      if (rain > 0.01) {
        pass.setPipeline(this._rainPipelines[this._sampleCount]);
        pass.setBindGroup(0, this._frameBindGroup);
        pass.draw(3);
      }
      pass.end();

      let readback = null;
      if (this._frameNumber === 0 || this._frameNumber % 12 === 0 || this._stats.visibilityPending) {
        readback = this._readbackSlots.find(slot => !slot.busy) ?? null;
        if (readback) {
          readback.busy = true;
          for (let index = 0; index < batches.length; index++) {
            encoder.copyBufferToBuffer(batches[index].cameraArguments, 0, readback.buffer, index * 40, 20);
            encoder.copyBufferToBuffer(batches[index].shadowArguments, 0, readback.buffer, index * 40 + 20, 20);
          }
          if (this._timestampQueries) {
            encoder.resolveQuerySet(this._timestampQueries, 0, 2, this._timestampResolve, 0);
            encoder.copyBufferToBuffer(this._timestampResolve, 0, readback.buffer, TIMESTAMP_OFFSET, 16);
          }
        }
      }
      device.queue.submit([encoder.finish()]);
      this._frameNumber++;
      if (readback) this._collectStats(readback, batches.map(batch => ({ mesh: batch.meshName, count: batch.count })), this._frameNumber, this._samplingGeneration, wireframe);
      this._stats.frameMs = this._previousFrameTime === null ? 0 : start - this._previousFrameTime;
      this._previousFrameTime = start;
      this._stats.cpuMs = clock() - start + this._pendingCpuMs;
      this._pendingCpuMs = 0;
      this._stats.drawCalls = batches.length * 2 + 1 + (rain > 0.01 ? 1 : 0);
      this._stats.computeDispatches = batches.length;
      if (scopeOpen) {
        scopeOpen = false;
        device.popErrorScope().then(error => {
          if (error && !this._disposed) {
            this.ready = false;
            this._recordError(`WebGPU frame validation failed: ${error.message}`, true);
          }
        }).catch(error => { if (!this._disposed) this._recordError(`WebGPU error-scope failure: ${describeError(error)}`, true); });
      }
      return true;
    } catch (error) {
      if (scopeOpen) device.popErrorScope().then(gpuError => { if (gpuError) this._recordError(`WebGPU frame validation: ${gpuError.message}`, true); }).catch(() => {});
      this.ready = false;
      this._recordError(`WebGPU frame failed: ${describeError(error)}`, true);
      throw error;
    }
  }

  async _collectStats(slot, batches, frameNumber, generation, wireframe) {
    try {
      await slot.buffer.mapAsync(GPUMapMode.READ);
      if (this._disposed) return;
      const data = slot.buffer.getMappedRange();
      const argumentsView = new Uint32Array(data);
      let visible = 0, triangles = 0, lines = 0, shadowVisible = 0, shadowTriangles = 0;
      for (let index = 0; index < batches.length; index++) {
        const cameraCount = argumentsView[index * 10 + 1];
        const shadowCount = argumentsView[index * 10 + 6];
        const mesh = this._geometry[batches[index].mesh];
        visible += cameraCount;
        shadowVisible += shadowCount;
        triangles += wireframe ? 0 : cameraCount * mesh.triangles;
        lines += wireframe ? cameraCount * mesh.edgeIndexCount / 2 : 0;
        shadowTriangles += shadowCount * mesh.triangles;
      }
      if (generation === this._samplingGeneration && frameNumber >= this._stats.statsSampleFrame) {
        Object.assign(this._stats, { visibleObjects: visible, triangles, lines, shadowVisibleObjects: shadowVisible, shadowTriangles,
          statsSampleFrame: frameNumber, visibilityPending: false });
        if (this._timestampQueries) {
          const timestamps = new BigUint64Array(data, TIMESTAMP_OFFSET, 2);
          if (timestamps[1] >= timestamps[0] && timestamps[1] > 0n) this._stats.gpuMs = Number(timestamps[1] - timestamps[0]) / 1e6;
        }
      }
    } catch (error) {
      if (!this._disposed && this.ready) this._recordError(`GPU statistics readback failed: ${describeError(error)}`);
    } finally {
      if (slot.buffer.mapState === 'mapped') slot.buffer.unmap();
      slot.busy = false;
    }
  }

  getStats() {
    return { ...this._stats, backend: 'WebGPU', instances: this._staticCount + this._dynamicCount,
      memoryBytes: this._memoryBytes, loadedCells: this._loadedCells.size,
      renderWidth: this._width ?? 0, renderHeight: this._height ?? 0, samples: this._sampleCount,
      quality: this._qualityName, timestampQueries: Boolean(this._timestampsSupported),
    };
  }

  _recordError(message, dispatch = false) {
    message = String(message);
    this.lastError = message;
    if (!this.errors.includes(message)) {
      this.errors.push(message);
      if (this.errors.length > 64) this.errors.shift();
    }
    if (dispatch && typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('astra-gpu-error', { detail: message }));
    }
  }

  _buffer(label, bytes, usage, data = null) {
    const size = Math.max(4, Math.ceil(bytes / 4) * 4);
    const buffer = this.device.createBuffer({ label, size, usage, mappedAtCreation: Boolean(data) });
    if (data) {
      new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      buffer.unmap();
    }
    this._resourceBytes.set(buffer, size);
    this._memoryBytes += size;
    return buffer;
  }

  _texture(label, width, height, format, usage, sampleCount = 1) {
    const texture = this.device.createTexture({ label, size: { width, height, depthOrArrayLayers: 1 }, format, usage, sampleCount });
    // All formats used here have a nominal four-byte texel. Driver-private overhead is unknowable.
    const bytes = width * height * 4 * sampleCount;
    this._resourceBytes.set(texture, bytes);
    this._memoryBytes += bytes;
    return texture;
  }

  _release(resource) {
    if (!resource) return;
    const bytes = this._resourceBytes.get(resource);
    if (bytes !== undefined) {
      this._memoryBytes -= bytes;
      this._resourceBytes.delete(resource);
    }
    resource.destroy();
  }

  _destroyResources() {
    const device = this.device;
    this.device = null;
    this._resourcesInitialized = false;
    for (const resource of this._resourceBytes.keys()) resource.destroy();
    this._resourceBytes.clear();
    this._memoryBytes = 0;
    this._staticBatches = [];
    this._dynamicBatches = [];
    this._timestampQueries?.destroy();
    this._timestampQueries = null;
    this._readbackSlots = [];
    this._targetSignature = null;
    this._shadowTexture = this._mainDepth = this._msaaColor = null;
    this._frameBuffer = this._timestampResolve = null;
    if (device && this._deviceErrorListener) device.removeEventListener('uncapturederror', this._deviceErrorListener);
    try { this.context?.unconfigure(); } catch { /* A lost context may already be unconfigured. */ }
    device?.destroy();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.ready = false;
    this._samplingGeneration++;
    this._destroyResources();
    this._worldInstances = [];
    this._dynamicInstances = [];
    this._signs = [];
    this._staticCount = this._dynamicCount = 0;
  }
}

export default Renderer;
