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

Complete fresh WebGPU runtime validation, archive the validated source, publish the same private Site, and retain objective evidence.

## Known limitations / blockers

- Current renderer keeps all 16 cells resident; actual residency streaming is still required.
- Previous user-visible startup reported failure to acquire a WebGPU adapter. Investigate initialization and distinguish unsupported hardware from source defects.
- Public GitHub shell push lacks credentials; connected GitHub write operations are available and will be used without altering existing experiment files.
- Physical Android and desktop GPU performance cannot be inferred from software-renderer testing.
- Drive folder initially contained only the prompt; source checkpoints are being established now.
- Fresh review found nonfunctional retry after startup failure, reversed east/west compass labels, and population obstacle issues. Repairs are in progress.

## Recovery procedure

Read this file, IMPLEMENTED.md, TODO_NEXT.md, BUILD.md and cloud/checkpoint-manifest.json. Inspect git status and log before editing. Restore the newest complete source ZIP if the workspace is missing. Preserve existing work and continue from the current task.
