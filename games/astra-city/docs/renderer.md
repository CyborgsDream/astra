# ASTRA CITY native WebGPU renderer asset

Copy these five modules together into `src/engine/`:

- `gpu-device.js` — supported-adapter selection and optional-feature fallback.
- `renderer.js` — the public `Renderer` class, GPU resources, batching, frame orchestration, sign atlas, and measured statistics.
- `shaders.js` — native WGSL modules for visibility compaction, shadow depth, material lighting, atmosphere, rain, and diagnostic mesh edges.
- `geometry.js` — position/normal/UV meshes and edge index buffers.
- `math.js` — column-major WebGPU projection, camera, frustum, and instance packing functions.

No dependency, WebGL path, remote asset, or screenshot generation is included.

## Public API

```js
import { Renderer } from './renderer.js';

const renderer = new Renderer(canvas);
await renderer.init();                    // Rejects with a meaningful startup error.
renderer.setWorld(world.instances, world.signs);
renderer.setDynamic(population.instances());
renderer.render(camera, environment, {
  quality: 'medium', renderScale: 1, fog: true, wireframe: false, lightingDebug: 0,
});
const stats = renderer.getStats();
renderer.resize(0.8);
renderer.dispose();
```

`setWorld` and `setDynamic` can be called before initialization; their most recent values are uploaded at the end of `init`. Command encoding is synchronous; GPU execution is asynchronous. `canRender()` reports whether another frame fits the two-frame queue. `render` returns `false` while unavailable or when that queue is full, and `true` after submission. JavaScript frame failures throw, mark the renderer unavailable, and report an error. Disposal is idempotent. An explicit `init` after a device loss recreates resources from the last supplied world and dynamic arrays.

`ready`, `errors`, `lastError`, and `compilationMessages` are exposed. Native WGSL compilation information includes module name, severity, line, and column. Initialization and sampled frames use GPU validation error scopes; uncaptured errors are also recorded. Real device loss marks the renderer unavailable and dispatches `CustomEvent('astra-gpu-error', { detail: message })`. Intentional disposal does not announce an error.

## Geometry and coordinates

- Metres, Y up; camera yaw zero faces negative Z. The integration camera convention is `[-sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)]`.
- Instance XYZ Euler rotation uses `Rx * Ry * Rz`.
- Box extents are ±0.5. Cylinder/cone radius is 0.5 and height is 1. Sphere radius is 0.5. Quad lies in XY and faces +Z.
- Meshes have outward CCW winding. The shaded and shadow passes cull back faces. Authored instances should use nonnegative scales; negative scales that reverse handedness require the author to reverse their geometry instead.
- The canvas should receive its display dimensions from CSS. Rendering follows its display size, with device pixel ratio capped at two and the requested scale applied to the backing dimensions.

## GPU architecture

Static geometry and frequently updated population use separate batches and storage buffers. There are at most five mesh batches in each collection. Dynamic buffers grow geometrically and are reused, so population changes do not reupload the static district.

Each instance is 160 bytes: a model matrix, three padded inverse-transpose normal columns, color/material, roughness/emission/tile/detail parameters, and world-space sphere bounds. The sphere radius is half the length of the entire nonuniform scale vector, which conservatively contains every supported primitive after rotation. No sphere is mistakenly culled using only one scale axis.

A 64-thread compute kernel tests all six WebGPU camera frustum planes and all six independent directional-light planes. Atomic compaction writes separate camera and shadow visibility arrays and separate native indexed indirect argument buffers. Each mesh is subsequently submitted with `drawIndexedIndirect`. `firstInstance` stays zero, so the optional indirect-first-instance feature is unnecessary. Shadow casters outside the camera view remain eligible.

The quality tiers are:

| Tier | MSAA | Shadow map | Shadow half-width | Facade range | Micro-detail range |
|---|---:|---:|---:|---:|---:|
| Low | 1× | 1024² | 64 m | 160 m | 42 m |
| Medium | 4× | 1536² | 82 m | 250 m | 74 m |
| High | 4× | 2048² | 100 m | 380 m | 112 m |

Structure detail level zero follows the camera far plane. Detail thresholds account for the instance's bounds radius, which avoids prematurely removing large facades. The directional map is snapped to world-space texels for translation stability. PCF uses one, four, or nine fixed comparison taps by quality; the shadow boundary fades over a narrow border. It is one local directional map, not a cascaded shadow system. Distant buildings therefore retain illumination and atmosphere without distant small-object shadows.

The diagnostic lighting selector exposes lit output, surface normals, base colour and direct-light/shadow response. The diagnostic wireframe option uses native line-list pipelines with actual mesh edge index buffers. It does not depend on a nonexistent WebGPU polygon wireframe mode.

## Appearance

The material shader uses GGX-style direct specular, Fresnel, roughness, metallic response, warm directional sunlight, and cooler hemispheric ambient. The district palette is authored as familiar display RGB swatches; the vertex stage converts these colors to linear for lighting. This conversion was added after reviewing the actual GPU screenshot and the supplied reference, which showed that treating the swatches as linear caused pale pavement and washed-out facades. The already sRGB-decoded sign atlas is not decoded again.

All twelve contract material IDs are implemented: concrete, metal, dark glass, patched asphalt, timber, fabric, emissive surfaces, vegetation, signs, water, brick, and paving. World-space procedural patterns avoid the stretching that would result from relying on primitive UVs for texture frequency. Concrete streaks, asphalt aggregate and repairs, metal brushing and wear, fabric weave, brick mortar, and pavement joints have distinct responses. Small derivative-based surface relief and crevice shading add depth at millimetre scales without texture assets or extra render passes.

Glass is deliberately dark and opaque, with inexpensive analytic sky reflection; there is no transparent-surface sorting or screen-space scene reflection. Wetness darkens susceptible surfaces and selectively reduces roughness on horizontal patches. Rain adds a restrained screen-space streak layer, while cloud cover, direct sunlight, sky colors, and wetness respond to environment values. Time of day changes the sun/moon direction, sky, shade, and restrained window/sign emission. The renderer includes no bloom and does not use fog to conceal missing geometry.

The semantic sign atlas uses Canvas2D, 8 columns by 16 rows, and 256×64-pixel tiles in one 2048×1024 sRGB texture. Supplied labels are wrapped into one or two lines, with stable padding and linear filtering. At most 128 labels are retained. Sign UVs are upright on a +Z-facing quad. The atlas has no mip chain, so very small distant lettering can alias; micro/facade culling and MSAA help geometry edges, but are not substitutes for text minification.

## Statistics

The required fields are returned with additional diagnostic context:

- `frameMs`: elapsed time divided by completed GPU frames over a sampling window of at least 400 milliseconds. This measures completed work rather than animation callbacks. `submissionFrameMs` and `simulationFrameMs` distinguish submission and simulation pacing.
- `cpuMs`: measured CPU encoding time plus dynamic instance packing/upload time since the preceding render.
- `gpuMs`: native timestamps, in milliseconds, only when the adapter exposes `timestamp-query`; otherwise `null`. The interval spans compute culling, the shadow pass, and the final color pass. No FPS-derived GPU estimate is used.
- `visibleObjects`, `triangles`, `shadowVisibleObjects`, `shadowTriangles`, and `lines`: asynchronous readback of the actual GPU indirect counts, multiplied by known mesh topology. The main `triangles` field excludes the shadow pass. In wireframe mode it is zero and `lines` describes the submitted main geometry.
- `statsSampleFrame` identifies the last completed readback, normally sampled every twelve submitted frames. `visibilityPending` is true before a valid sample arrives. Counts therefore describe the most recently completed sample, not an invented current-frame estimate.
- `drawCalls` and `computeDispatches`: actual encoded API commands; a culled-to-zero indirect call still counts as a draw command.
- `instances`: supplied static plus dynamic resident instances. `loadedCells`: explicit detailed-cell residency from `setResidentCells(ids)`; the permanent structure may retain tags from all sixteen cells. `inFlightFrames`, `submittedFrames` and `completedFrames` expose the bounded queue.
- `memoryBytes`: allocated buffer sizes and nominal texture footprints owned by the renderer. This is derived GPU resource memory, not a measurement of driver overhead or presentation-chain memory. `depth24plus` uses its nominal four-byte footprint.
- `adapter`, `renderWidth`, `renderHeight`, `samples`, `quality`, and `timestampQueries` make the measurement context explicit.

Three readback buffers avoid blocking the render loop. Mapping is asynchronous. No fabricated GPU timing, visibility, memory, or performance claim is included.

## Verification

Run:

```sh
node --check renderer.js
node --check shaders.js
node --check geometry.js
node --check math.js
node --test renderer.test.mjs
```

The six CPU tests cover every primitive's outward triangle winding, finite vertex data, WebGPU near/far planes, the integration yaw convention, inverse view-projection, conservative rotated nonuniform bounds, inverse-transpose normals, and API availability. These tests address mathematical failure cases that can otherwise survive JavaScript syntax checks.

Current and historical native WebGPU execution evidence is recorded in `docs/validation.md` and `docs/evidence/`. Software-adapter checks establish shader/runtime behavior, not physical desktop or phone performance.

## Deliberate limits

This is a compact native renderer suitable for the authored district, not a full engine. It has frustum/detail culling rather than GPU occlusion culling, one local directional shadow map, analytic sky reflection rather than ray tracing, procedural material crevice shading rather than a screen-space ambient-occlusion buffer, no point-light array, and no transparency sorting. The rain overlay has no geometry collision and should be suppressed by the owner for sheltered scenes if that distinction is required. A single mesh batch that exceeds the adapter's storage-buffer limit rejects with an explicit error instead of silently dropping instances.
