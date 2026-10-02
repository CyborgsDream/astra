# ASTRA CITY — Project state

Updated: 2026-10-02. Published release: **1.1.0 · Switchback Ward**.

## Recovery and durable sources

- Playable Site: https://astra-city-switchback.azurion.chatgpt.site . It retains its existing private audience. Version 1.1.0 was published successfully on 2026-10-02.
- Public source: https://github.com/CyborgsDream/astra/tree/releases/astra-city-1.1.0-20261002/games/astra-city . Final release commit: `ccdae89f9af99276751357b02c742a2587df9417`. The branch contains verified source and test evidence. The original `experiments/player-editor-001` is preserved.
- Drive checkpoints: https://drive.google.com/drive/folders/1IrebhwrQ4MianlKJ_JMglHKZRvxwaMyc . Milestones 1, 2, 3 and 4 and the six recovery files are verified there. The final complete source ZIP is `ASTRA_CITY_checkpoint_20261002_1842_m4_release_1_1_0.zip`.
- Release report: https://docs.google.com/document/d/10v7KF_XkkWcgTk7zSJD4bWfZAU66Viky8oq0okXi-18/edit .
- Recovered Site source commit: `0bf5e486b014e0b8991ec95dd23373a454ab36c6`.

## Last verified build

- **79 automated tests passed; 0 failures.** Gameplay, three endings, economy, saves, input, physics, navigation, population, rod transforms, adapter selection and cell streaming are covered.
- District validation passed: 57,793 static objects, 1,276 colliders, 9 ramps, 31 interactions, 70 signs, 16 cells, 2,345 navigation nodes.
- Five-minute population simulation passed: all 48 ambient walkers moved; zero solid intersections for walkers, road vehicles or drones; zero unsupported walkers; all 37 flight edges clear; authored walking routes passed.
- Mechanical geometry/controller checks passed all 8 trips. Four ladder paths sweep clear standing bounds; all ladder and lift landings have support.
- The combined native WebGPU browser check passed startup, keyboard movement, missions, circuit solving, equipment, opening doors, an ending/replay, saving/reloading, streamed residency, debug lighting, rainy rendering, mobile layout, standalone HTML and device-loss retry. All eight actual mechanical interactions and deliberately delayed transit scenery also passed, with no unexpected browser or renderer errors.
- Final native captures passed all six street views on the rebuilt code after the visual repairs. Immediate development teleport, new-game and death-recovery cell selection and settlement passed. There were no browser or renderer errors.
- Production web and self-contained HTML builds passed; the standalone HTML is 387,699 bytes. Evidence and precise test provenance are in docs/validation.md and docs/evidence/.

## Current task

Version 1.1.0 is published and archived, with verified source committed and a native release report saved. Implementation and the planned local verification are complete. The exact publication receipt is saved in cloud/publication-receipt.json; final source, archive and report references are in cloud/checkpoint-manifest.json. Utility rods meet their authored endpoints. A compact permanent facade layer preserves distant glazing and sparse bands, and Scales Exchange has real upper windows. The permanent layer contains 5,334 objects (9.23%); nine of sixteen cells retain full detail. Transit remains opaque until a frame using destination geometry has completed.

The public repository received additional commits during verification. The tested release is isolated on `releases/astra-city-1.1.0-20261002`, preserving the actively changing main branch. The earlier CI workflow and immediate relocation scheduling are retained, with nearest-cell coverage. Later street-density and ambient-activity work remains on main for separate reconciliation; it was not overwritten or silently imported.

## Next development

Measure physical-device performance and complete extended manual story and touch-control playthroughs. Reconcile later main-branch content against the tested release without discarding either source history. See TODO_NEXT.md.

## Scope and verification limits

- The worker retains the complete finite district. The main thread and GPU retain permanent structure/coarse facades plus nine detailed cells, with bounded asynchronous requests and actual detail eviction.
- Native WebGPU is tested in Chromium 153 with the SwiftShader Vulkan software adapter. This validates shader/API execution; it does not establish physical desktop/Android performance or 60 FPS.
- Elevators use an opaque enclosed-ride transition. Ladders use visible, collision-checked waypoint climbs.
- Saves are versioned browser-local data, with migration and a previous-save backup. They do not synchronize between devices or origins.
- The district has stylized procedural visuals. No known unresolved geometry or gameplay blocker remains in the focused checks; wider device and manual-play coverage remains future work.

## Recovery procedure

Read PROJECT_STATE.md, IMPLEMENTED.md, TODO_NEXT.md, BUILD.md and cloud/checkpoint-manifest.json. Inspect git status and log before editing. Restore the newest complete source ZIP if needed, or clone ASTRA, select the release branch and enter `games/astra-city`. Preserve the existing game and editor experiment. Continue from Current task; never use the chat as the only project memory.
