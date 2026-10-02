# ASTRA CITY — Project state

Updated: 2026-10-02. Current task: recover, validate, extend and republish Switchback Ward.

## Recovery baseline

- Recovered complete modular source from the existing private Site repository, commit `0bf5e486b014e0b8991ec95dd23373a454ab36c6`.
- Existing playable address: https://astra-city-switchback.azurion.chatgpt.site
- Existing public source repository: https://github.com/CyborgsDream/astra . Its `main` currently contains a separate player/editor experiment; preserve it.
- Source checkout: `/workspace/scratch/0e54ad0a22f3/astra-site`.
- Drive archive folder: https://drive.google.com/drive/folders/1IrebhwrQ4MianlKJ_JMglHKZRvxwaMyc
- The recovered source has native WebGPU rendering, a generated district, movement/collision, people/traffic, 15 missions, equipment, trading, save schema 2, weather/audio and functional menus. Existing validation reports are historical evidence, not verification of this recovery run.

## Last verified build

Current session baseline: 49 unit tests passed, 0 failed; district validation passed (57,535 static instances, 1,236 colliders, 31 interaction targets, 16 cells); production and portable HTML builds passed. Native browser/GPU verification is pending. Historical browser reports are retained separately.

## Current work

1. Preserve recovery baseline in a complete source checkpoint and GitHub subdirectory.
2. Run the existing tests/build and independently review launch, world residency, gameplay and saves.
3. Fix the first demonstrated failures and implement missing required systems.

## Next work

Run fresh native-hardware WebGPU runtime validation and republish the private Site from this recovered source when the publishing connector is available. Retain objective evidence; do not infer physical-GPU performance from software rendering.

## Known limitations / blockers

- Static GPU geometry now uses bounded 3×3 cell residency (4–9 cells depending on position); CPU world data remains deterministic and resident for navigation/collision.
- WebGPU initialization now retries adapter acquisition with high-performance, default, and low-power preferences; the startup error offers a real retry via page reinitialization.
- Public GitHub shell push lacks credentials; connected GitHub write operations are available and will be used without altering existing experiment files.
- Physical Android and desktop GPU performance cannot be inferred from software-renderer testing.
- Drive folder initially contained only the prompt; source checkpoints are being established now.
- Startup retry, compass east/west orientation, and pedestrian sidestep wall-clipping were repaired in the source recovery pass.

## Recovery procedure

Read this file, IMPLEMENTED.md, TODO_NEXT.md, BUILD.md and cloud/checkpoint-manifest.json. Inspect git status and log before editing. Restore the newest complete source ZIP if the workspace is missing. Preserve existing work and continue from the current task.
