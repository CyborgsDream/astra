# ASTRA CITY: architecture and limitations

## Scope

ASTRA CITY implements one finite, deterministic district with traversable streets, selected interiors, rooftops, underground routes, fifteen authored missions, a five-part main story, and three concluding agreements. Its architecture keeps gameplay state independent of rendering so mission and save logic can be exercised without a browser or GPU.

The default seed is `73191`. The current generated district contains:

| World asset | Count |
| --- | ---: |
| Static geometry instances | 57,793 |
| Colliders | 1,276 |
| Traversable ramps | 9 |
| Interactables | 31 |
| Named locations | 12 |
| Cells | 16 |
| Navigation nodes | 2,345 |

These are generated-world counts. Renderer instance totals also include dynamic population, equipment/status indicators, and any enabled diagnostic geometry. Visible counts vary with the camera and quality settings.

## Modules and data flow

| Module | Responsibility |
| --- | --- |
| `world-worker.js`, `src/world/district.js`, `cell-stream.js`, `cell-stream-data.js` | Generate the district off the main thread: primitive instances, colliders, ramps, interaction targets, signs, locations, and connected navigation data |
| `src/engine/renderer.js`, `shaders.js`, `geometry.js`, `math.js` | Own WebGPU resources, procedural mesh/material data, visibility compute, shadows, scene rendering, and graphics measurements |
| `src/engine/physics.js`, `input.js`, `navigation.js` | Player movement, spatial collision queries, assisted vertical traversal, input, route guidance, and projected markers |
| `src/game/content.js`, `state.js` | Authored missions/items/factions, event-driven progression, economy, equipment, world records, and validated saves |
| `src/world/population.js`, `security.js` | Ambient people, road vehicles, robots, drones, rail traffic, and archive sensor exposure |
| `src/engine/audio.js` | Procedural WebAudio ambience, spatial machinery and traffic, footsteps, weather, and action cues |
| `src/ui/ui.js`, `style.css` | Menu, HUD, map, journal, inventory, dialogue, circuit puzzle, settings, and diagnostics |
| `src/main.js` | Coordinate the frame loop, interaction rules, repairs, travel, save checkpoints, state-to-world synchronization, and ending presentation |

World generation runs once in a persistent worker. It sends a structural manifest and supplies detailed cells on demand. The main thread retains nine detailed cells, permanent structure and coarse facade glazing/bands and compact gameplay/collision/navigation metadata. Selection runs at most four times per second, with hysteresis and one outstanding request of at most two cells. The previous detailed set remains visible until its replacement is complete, then the old arrays and graphics buffers are released. Dynamic buffers update only when the renderer can submit a frame. The HUD, projected markers, and menus use DOM and 2D canvas independently of the WebGPU scene.

## Rendering pipeline

The renderer uses **native WebGPU and WGSL**. It does not call a third-party game renderer or route through WebGL.

1. Static and dynamic instances are grouped by primitive mesh. Instance records carry transforms, inverse-transpose normal data, material parameters, and conservative bounds.
2. A compute pass tests camera and directional-light frusta, applies distance/detail limits, compacts visible instance indices, and writes indirect instance counts.
3. A directional depth pass renders shadow casters with `drawIndexedIndirect` using its independently culled list.
4. The main pass draws the sky and opaque scene with indirect draws, depth testing, procedural material variation, a tiled sign atlas, emissive surfaces, sunlight, filtered shadows, and an analytical sky contribution to reflections.
5. A rain overlay is added when selected. Exposure/tone mapping, fog, wetness, and changing sky/sun values provide time and weather variation.

This is actual GPU compute culling followed by indirect draws. The GPU-generated instance counts are used by the draw commands. The implementation also reads those buffers asynchronously for visibility statistics.

| Quality | Scene samples | Shadow map | Main tradeoff |
| --- | ---: | ---: | --- |
| Low | 1 | 1024 × 1024 | Shorter facade/detail ranges and cheaper shadows |
| Medium | 4 | 1536 × 1536 | Intermediate detail range and shadow coverage |
| High | 4 | 2048 × 2048 | Longer detail range and larger shadow coverage |

Render scale is adjustable from 0.5 to 1. Adaptive scaling can respond to observed frame intervals. These controls change workload; they do not guarantee a particular frame rate.

## Gameplay and world synchronization

Mission definitions describe prerequisites, typed stages, required/consumed items, dialogue, and rewards. Ordinary interaction advances conversation, delivery, and rescue stages. Terminal and repair stages require their corresponding successful gameplay event. Remembered discoveries and explicitly reusable prior circuit successes prevent late job acceptance from invalidating completed world work.

Completion records track each accepted run and its paid runs, so a repeated event does not duplicate a reward. The repeatable market route issues a new parcel and requires a returned receipt for every payment. Reputation is bounded, purchases cannot overdraw credits, equipment occupies defined slots, and consumables are retained when they would have no effect.

Upgrade effects are used by scanning, archive puzzle difficulty, repair assistance, movement, damage reduction, and energy recovery. Completing a story stage can open a service door; the integration synchronizes the changed door list with both collision and visible geometry. Power state reaches machinery audio and local status lights. The final choice persists its agreement, reputation effects, reward item, and conclusion. Its dialogue can be revisited while exploration continues.

## Saves and persistence

`GameState` accepts injected storage and exposes plain JSON state. The application supplies browser `localStorage`, saves fresh player position with progress, and uses schema version 2. The primary key is `astra-city-save`; the backup is `astra-city-save.backup`.

Validation checks finite numeric bounds, known items and missions, equipment ownership/slots, prerequisites, payment consistency, bounded world flags and collections, and unsafe JSON keys. Version-one migration fills new fields while retaining existing progress and completed payments. Writes preserve a validated previous primary before replacing it. Failed reads/writes, corrupt data, and unsupported future versions receive explicit statuses; protected raw saves are retained. An intentional reset archives the previous primary and backup under recovery keys.

Storage is local to one browser and origin. There is no account system, cloud sync, or cross-device transfer interface. Validation protects application integrity and accidental corruption; it is not a cryptographic anti-cheat system.

## Measurements and verification

F3 exposes live measurements. Frame intervals summarize completed GPU work over a sampling window; simulation frame intervals are tracked separately. At most two submitted frames may remain pending. CPU timings measure code execution. GPU duration is reported only when the adapter supports timestamp queries and a sample has completed; otherwise it remains unavailable. Visible-instance and triangle counts derive from asynchronously read indirect counts and the actual primitive meshes, so they can lag the current frame. Renderer memory reports tracked GPU buffer/texture allocations rather than total browser memory or complete driver residency.

`npm test` runs Node tests for gameplay, save behavior, movement/collision, navigation, population, rendering mathematics/contracts, and optional page tools. These tests do not establish hardware rendering performance. `node tools/validate-district.mjs` checks generated transforms, required targets, target support/obstructions, graph reachability, sampled walking and ramp routes, deterministic generation, door ownership, and the tram route. Browser/GPU execution is a separate validation layer. Release-specific outcomes and measurements should accompany the final build.

## Deliberate limits

- **The finite authored district remains in the generation worker.** Main-thread and GPU detail residency is bounded to nine cells and supports actual asynchronous eviction. This version does not fetch cells from a network service or generate an unbounded city. Permanent structure, coarse facades and collision/navigation metadata remain available throughout the district.
- **Lighting uses one directional shadow map.** There are no cascaded shadow maps. Shadow coverage and detail are bounded around the camera, with quality-dependent resolution and reach.
- **There is no SSR or SSAO.** Reflective materials use the analytical sky rather than screen-space scene reflections. Material shading includes local procedural variation, not a screen-space ambient-occlusion pass. There is no ray tracing or global-illumination system.
- **The visual world is built from procedural primitives.** It aims for a consistent illustrated city style, without claims of photorealism. Some facades are scenery; the authored interiors and routes define the playable spaces.
- **Simulation is bounded.** Ambient actors follow finite navigation graphs with nearby updates and coarser distant updates. They do not implement a persistent citywide economy or unrestricted daily lives. Scooters use the player movement controller, vertical traversal is assisted, and ward transit uses a short relocation transition.
- **The browser must provide WebGPU.** There is no alternative graphics backend. Mobile controls exist, but graphics availability and speed depend on the browser/device. Shader diagnostics and device-loss errors are surfaced instead of substituting fabricated performance results.

These limits keep the playable district, native renderer, authored missions, and inspectable state manageable within a compact browser application.
