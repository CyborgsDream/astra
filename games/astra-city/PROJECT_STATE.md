# ASTRA CITY — Project state

Updated: 2026-10-02. Current task: completed street-level density and realism pass on the existing Switchback Ward / Switchback Court district; map bounds and gameplay topology preserved.

## Recovery baseline

- Recovered complete modular source from the existing private Site repository, commit `0bf5e486b014e0b8991ec95dd23373a454ab36c6`.
- Existing playable address: https://astra-city-switchback.azurion.chatgpt.site
- Existing public source repository: https://github.com/CyborgsDream/astra . Its `main` currently contains a separate player/editor experiment; preserve it.
- Source checkout: `/workspace/scratch/0e54ad0a22f3/astra-site`.
- Drive archive folder: https://drive.google.com/drive/folders/1IrebhwrQ4MianlKJ_JMglHKZRvxwaMyc
- The recovered source has native WebGPU rendering, a generated district, movement/collision, people/traffic, 15 missions, equipment, trading, save schema 2, weather/audio and functional menus. Existing validation reports are historical evidence, not verification of this recovery run.

## Last verified build

Current density-pass release: 55 unit tests passed, 0 failed. District validation passed with 75,764 static instances, 1,236 colliders, 31 interaction targets, 16 cells, 2,339 navigation nodes, zero invalid transforms, zero blocked/unsupported targets, zero route failures, and deterministic regeneration. Production and portable HTML builds passed.

A fresh headed Chromium/WebGPU release flow also passed under Xvfb with SwiftShader Vulkan: native WebGPU initialization, the density view, mission interaction flow, hacking, assisted repair, opened-door synchronization, final-story fixtures, save/reload, rain, mobile layout, standalone HTML, unsupported-WebGPU messaging, and disposal completed with no browser or renderer errors. This software adapter validates the API/runtime path; it is not a physical-GPU performance benchmark.

## Current work

1. Preserve the existing district bounds, 16-cell topology, missions, traversal, collision and save/gameplay systems.
2. Keep the density pass semantically placed and deterministic rather than uniformly scattered.
3. Retain the 3×3 GPU cell-residency limit and shared primitive/instanced rendering while increasing street-level information.
4. Maintain automated source, district, build and headed-WebGPU browser evidence on the recovered game.

## Next work

Do not expand the map unless explicitly requested. The next release work is physical-hardware WebGPU validation and republishing the private Site from this source when the publishing connector is available. Continue to treat SwiftShader results as functional validation only, not desktop/mobile performance evidence.

## Known limitations / blockers

- Static GPU geometry now uses bounded 3×3 cell residency (4–9 cells depending on position); CPU world data remains deterministic and resident for navigation/collision.
- WebGPU initialization now retries adapter acquisition with high-performance, default, and low-power preferences; the startup error offers a real retry via page reinitialization.
- Public GitHub shell push lacks credentials; connected GitHub write operations are available and will be used without altering existing experiment files.
- Physical Android and desktop GPU performance cannot be inferred from software-renderer testing.
- Drive folder initially contained only the prompt; source checkpoints are being established now.
- Startup retry, compass east/west orientation, and pedestrian sidestep wall-clipping were repaired in the source recovery pass.

## Recovery procedure

Read this file, IMPLEMENTED.md, TODO_NEXT.md, BUILD.md and cloud/checkpoint-manifest.json. Inspect git status and log before editing. Restore the newest complete source ZIP if the workspace is missing. Preserve existing work and continue from the current task.
