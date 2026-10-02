# Release validation

Release: **ASTRA CITY 1.0.0 · Switchback Ward**. Validation date: **2026-10-02**.

## Results

| Layer | Result | Evidence and scope |
| --- | --- | --- |
| Node unit tests | **49 passed, 0 failed** | Gameplay, all three endings, rewards, economy, upgrades, save migration/recovery/failures, physics, navigation, population, input capture and rendering mathematics |
| Generated district | **Passed** | Finite transforms; 31 supported and unobstructed interaction targets; connected target graph; sampled ramp and walking-route clearance/support; determinism; tram route; door ownership |
| Production build | **Passed** | Static web build and self-contained HTML generated without build errors |
| Native GPU execution | **Passed** | Chromium 153 / SwiftShader Vulkan; real WebGPU shader compilation and rendering; no shader, GPU-validation or browser errors |
| Browser interaction flow | **Passed** | New game, dialogue, delivery/payment, circuit buttons, repair assistance, opened-door synchronization, ending/replay, save/reload and panels |
| Rain and resize | **Passed** | Rainy-night render; 390 × 844 mobile panel viewport with no horizontal overflow |
| Standalone file | **Passed** | Opened `dist/astra-city.html` through a `file:` URL; embedded worker generated the district and native renderer initialized |
| Unsupported browser path | **Passed** | An intentionally absent WebGPU API produced a visible startup explanation |
| Resource disposal | **Passed** | Renderer disposal completed and marked the renderer unavailable |
| Optional WebMCP | **Contract tests passed; browser validation unavailable** | The test browser did not expose `document.modelContext`; the game does not depend on it |

Browser and renderer snapshots are retained in [evidence/browser.json](evidence/browser.json) and [evidence/renderer.json](evidence/renderer.json). They are observed outputs from their respective runs, not fabricated live statistics.

## What the browser check does

The checker runs the production build through its own local HTTP server, starts a real Chromium browser with native WebGPU, and operates visible menu, conversation and circuit buttons. It completes the opening clinic delivery and returns to Mara, receives payment, solves the rotating circuit, buys/equips the repair rig, verifies its two-stage sequence and one-energy mistake cost, and checks that Ivo's mission reward removes the service-door collider and panel immediately.

Later story stages use state-API fixtures to reach the final choice. The visible ending, its replay action, and the complete resulting save are then checked through the integrated application. Reload preserves all mission entries, credits and position. This is not a manual walking playthrough of the entire story; physical access is checked separately through district geometry and navigation validation.

The checker also opens the map, inventory and settings, verifies mobile width, renders rainy night conditions, disposes resources, opens the standalone HTML directly from disk, and checks the unsupported-WebGPU message.

The release run records no browser errors. It finishes with a nonzero exit code if any assertion fails. No click is forced through an obstructing overlay.

## Renderer observation

One medium-quality frame at 1280 × 720, with 4× MSAA, reported:

| Measurement | Observed value |
| --- | ---: |
| Static world instances | 57,535 |
| Total static + population instances | 59,214 |
| Main visible instances | 15,629 |
| Main triangles | 395,888 |
| Shadow-visible instances | 43,283 |
| Draw calls | 17 |
| Compute dispatches | 8 |
| Tracked GPU allocations | 57,473,056 bytes / about 54.8 MiB |

This capture preceded the final small population route filter and additional game status indicators. Counts change with camera, quality, dynamic actors, and the sampled frame. Readback is asynchronous; zero counters with `visibilityPending: true` mean no completed readback sample yet.

The software adapter took approximately two seconds of GPU time for this medium-quality frame. **That is a software validation environment, not a physical-GPU performance benchmark.** No 60 FPS claim is made. F3 reports real frame intervals, including slow frames; GPU timestamps are optional and are never substituted with a guessed value. Memory estimates cover tracked buffers and textures, not all browser or driver allocations.

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
