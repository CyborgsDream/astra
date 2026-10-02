# ASTRA CITY — Project state

Updated: 2026-10-02. Release in preparation: **1.1.0 · Switchback Ward**.

## Recovery and durable sources

- Playable Site: https://astra-city-switchback.azurion.chatgpt.site . It retains its existing private audience. The 1.1.0 update is not yet published.
- Public source: https://github.com/CyborgsDream/astra/tree/main/games/astra-city . Milestone 1 is committed as `5ed380e230e41464cd406bdbcd357800a389dc5e`. The original `experiments/player-editor-001` is preserved.
- Drive checkpoints: https://drive.google.com/drive/folders/1IrebhwrQ4MianlKJ_JMglHKZRvxwaMyc . Milestones 1 and 2 and the six state files are verified there.
- Recovered Site source commit: `0bf5e486b014e0b8991ec95dd23373a454ab36c6`.
- Active source checkout: `/workspace/scratch/0e54ad0a22f3/astra-site`.

## Last verified build

- **71 automated tests passed; 0 failures.** Gameplay, three endings, economy, saves, input, physics, navigation, population, adapter selection and cell streaming are covered.
- District validation passed: 57,533 static objects, 1,236 colliders, 9 ramps, 31 interactions, 70 signs, 16 cells, 2,345 navigation nodes.
- Five-minute population simulation passed: all 48 ambient walkers moved; zero solid intersections for walkers, road vehicles or drones; zero unsupported walkers; all 37 flight edges clear; authored walking routes passed.
- Mechanical geometry/controller check passed all 8 trips. Four ladder paths sweep clear standing bounds; all ladder and lift landings have support.
- The combined native WebGPU browser check passed startup, keyboard movement, missions, circuit solving, equipment, opening doors, an ending/replay, saving/reloading, streamed residency, debug lighting, rainy rendering, mobile layout, standalone HTML and device-loss retry. It recorded no unexpected browser or renderer errors. All eight actual mechanical interactions and deliberately delayed transit scenery also passed.
- Production web and standalone HTML build passed. The final native view capture and immediate-relocation regression are next.

## Current task

Milestone 2 is archived as `ASTRA_CITY_checkpoint_20261002_1804_m2_integrated.zip`. The integrated browser gate passed. Six street-level captures and all three immediate relocation checks passed. Visual inspection found misoriented cable/pipe segments and blank distant towers when detail cells are evicted. Repair rod transforms, retain a compact coarse facade layer, and recheck the affected views before publication. Maintain an opaque ride until a frame using destination geometry has completed.

The public repository received additional commits during verification. Their CI workflow is retained. Immediate relocation scheduling and nearest-cell test coverage are integrated; the alternate synchronous selector is explicitly superseded without rewriting history.

## Next task

Record final evidence, publish version 1.1.0 to the existing private Site, commit the final source to the existing ASTRA repository, archive the release, and save the release report.

## Scope and verification limits

- The worker retains the complete finite district. The main thread and GPU retain permanent structure plus nine detailed cells, with bounded asynchronous requests and actual detail eviction.
- Native WebGPU is tested in Chromium 153 with the SwiftShader Vulkan software adapter. This validates shader/API execution; it does not establish physical desktop/Android performance or 60 FPS.
- Elevators use an opaque enclosed-ride transition. Ladders use visible, collision-checked waypoint climbs.
- Saves are versioned browser-local data, with migration and a previous-save backup. They do not synchronize between devices or origins.
- No known unresolved geometry or gameplay blocker remains in the focused checks. The remaining release gate is the visual rod-transform repair and affected-view confirmation, followed by publication.

## Recovery procedure

Read PROJECT_STATE.md, IMPLEMENTED.md, TODO_NEXT.md, BUILD.md and cloud/checkpoint-manifest.json. Inspect git status and log before editing. Restore the newest complete source ZIP if needed, or clone ASTRA and enter `games/astra-city`. Preserve the existing game and editor experiment. Continue from Current task; never use the chat as the only project memory.
