# Release validation

Release: **ASTRA CITY 1.0.0 · Switchback Ward**. Validation date: **2026-10-02**.

## Results

| Layer | Result | Evidence and scope |
| --- | --- | --- |
| Node unit tests | **55 passed, 0 failed** | Gameplay, all three endings, rewards, economy, upgrades, save migration/recovery/failures, physics, navigation, population, input capture, residency and density determinism/coverage |
| Generated district | **Passed** | Finite transforms; 31 supported and unobstructed interaction targets; connected target graph; sampled ramp and walking-route clearance/support; determinism; tram route; door ownership |
| Production build | **Passed** | Static web build and self-contained HTML generated without build errors |
| Native WebGPU API execution | **Passed** | Headed Chrome under Xvfb with SwiftShader Vulkan; real WebGPU shader compilation/rendering and timestamp queries; no renderer/browser errors. This validates the WebGPU path, not physical-GPU speed. |
| Browser interaction flow | **Passed** | New game, dialogue, delivery/payment, circuit buttons, repair assistance, opened-door synchronization, ending/replay, save/reload and panels |
| Rain and resize | **Passed** | Rainy-night render; 390 × 844 mobile panel viewport with no horizontal overflow |
| Standalone file | **Passed** | Opened `dist/astra-city.html` through a `file:` URL; embedded worker generated the district and native renderer initialized |
| Unsupported browser path | **Passed** | An intentionally absent WebGPU API produced a visible startup explanation |
| Resource disposal | **Passed** | Renderer disposal completed and marked the renderer unavailable |
| Optional WebMCP | **Contract tests passed; browser validation unavailable** | The test browser did not expose `document.modelContext`; the game does not depend on it |

Historical baseline snapshots remain in [evidence/browser.json](evidence/browser.json) and [evidence/renderer.json](evidence/renderer.json). The current density-pass summary is retained in [evidence/density-pass.json](evidence/density-pass.json). These are observed outputs from their respective runs, not fabricated live statistics.

## What the browser check does

The checker runs the production build through its own local HTTP server, starts a real Chromium browser with native WebGPU, and operates visible menu, conversation and circuit buttons. It completes the opening clinic delivery and returns to Mara, receives payment, solves the rotating circuit, buys/equips the repair rig, verifies its two-stage sequence and one-energy mistake cost, and checks that Ivo's mission reward removes the service-door collider and panel immediately.

Later story stages use state-API fixtures to reach the final choice. The visible ending, its replay action, and the complete resulting save are then checked through the integrated application. Reload preserves all mission entries, credits and position. This is not a manual walking playthrough of the entire story; physical access is checked separately through district geometry and navigation validation.

The checker also opens the map, inventory and settings, verifies mobile width, renders rainy night conditions, disposes resources, opens the standalone HTML directly from disk, and checks the unsupported-WebGPU message.

The release run records no browser errors. It finishes with a nonzero exit code if any assertion fails. No click is forced through an obstructing overlay.

## Density-pass WebGPU observation

The headed Linux release run captured the density-pass opening view at 640 × 360, low quality, 0.5 render scale, on the SwiftShader Vulkan software adapter. A completed asynchronous readback later in the same browser flow reported:

| Measurement | Observed value |
| --- | ---: |
| Generated static world instances | 75,764 |
| Static + dynamic instances resident in sampled frame | 54,878 |
| Loaded static cells | 9 |
| Main visible instances | 9,911 |
| Main triangles | 258,726 |
| Shadow-visible instances | 28,109 |
| Shadow triangles | 684,670 |
| Draw calls | 17 |
| Compute dispatches | 8 |
| Tracked GPU allocations | 22,864,256 bytes / about 21.8 MiB |
| NPCs | 67 |
| Traffic actors | 14 |
| Dedicated ambient-activity actors | 14 |

The density generator itself reported 12,182 newly added deterministic detail instances. No renderer or browser errors were recorded during the full interaction/save/rain/standalone flow.

SwiftShader is a CPU software rasterizer. Its measured GPU time and frame rate are therefore **functional validation data, not a physical desktop/mobile performance benchmark**. The release does not infer a 60 FPS claim from this run.

## Reproduce

From `game/`, with Node 24 and Chrome installed:

```bash
npm ci
npm test
npm run test:district
npm run build
npm run test:browser
```

`test:browser` uses the installed Chrome channel through `playwright-core`. Set `ASTRA_CHROME_EXECUTABLE` to an alternative Chrome executable. In specialized environments, `ASTRA_BROWSER_LAUNCHER` can name an ES module exporting `launchWebGPU()`, which returns a Playwright Browser. `ASTRA_TEST_PORT` changes the local test server port.

The release environment used Chromium 153.0.8010.0 supplied by `@sparticuz/chromium` 153.0.0 with SwiftShader Vulkan. Its launcher enabled native WebGPU/Vulkan and kept the GPU in a separate process. Browser binaries and temporary runtime files are not committed to this repository.

The district validator also accepts a seed:

```bash
node tools/validate-district.mjs --seed=90210
```

## Bugs resolved during verification

- A WGSL reserved identifier prevented pipeline compilation; it was renamed.
- Sky and rain pipelines were aligned with their render-pass depth attachments.
- Façade and pavement swatches now use consistent linear-light decoding.
- Upper-route endpoints and landings were aligned with physical support and clearance.
- Ambient pedestrians no longer interpolate up lift or ladder edges.
- Quest rewards now synchronize opened doors with collision and visible geometry.
- The repair rig has a meaningful service advantage; the ending has persistent presentation and replay.
- A pending pointer-lock request can no longer capture the mouse after a panel opens.
- Embedded standalone workers use classic mode so the downloaded HTML can launch from a file URL in the tested browser.

## Remaining validation limits

Physical desktop/mobile GPU performance, battery use, long sessions on physical devices, browser coverage beyond the tested Chromium build, subjective audio quality, and complete manual route traversal remain unverified. The source includes responsive touch controls, but the mobile check is viewport/layout coverage rather than a physical phone test.
