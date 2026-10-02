# Release validation

Release: **ASTRA CITY 1.1.0 · Switchback Ward**. Validation date: **2026-10-02**.

## Results

| Layer | Result | Evidence and scope |
| --- | --- | --- |
| Automated tests | **71 passed, 0 failed** | Gameplay, all three endings, economy/equipment, save migration/recovery/failures, physics, navigation, population, input capture, rendering math, adapter selection and asynchronous residency |
| Generated district | **Passed** | 57,533 objects; finite transforms; 31 supported and unobstructed interactions; connected graph; ramps, walking routes, door ownership and deterministic generation |
| Five-minute population simulation | **Passed** | 48/48 ambient walkers moved; zero solid intersections for walkers, vehicles and drones; zero unsupported walkers; all 37 flight edges clear; authored walking routes passed |
| Mechanical geometry and movement | **8/8 trips passed** | Four ladders use continuously checked standing-volume paths; four lifts have clear supported landings; zero blocked ladder frames at 120 updates/second |
| Production build | **Passed** | Web assets and a 386,570-byte self-contained HTML build generated without errors |
| Native GPU execution | **Passed** | Chromium 153 / SwiftShader Vulkan; actual WebGPU pipeline compilation and rendering with no unexpected shader, validation or browser errors |
| Browser interaction flow | **Passed** | Actual keyboard walking and all eight mechanical interactions; menu/dialogue buttons; delivery/payment; circuit solving; repair assistance; door removal; ending/replay; full save/reload |
| Delayed destination streaming | **Passed** | A real worker cell response was held until transit arrived. The opaque ride stayed visible while unsettled, then revealed only after a frame with the destination detail completed |
| Scenery residency | **Passed** | Nine of sixteen detailed cells resident; actual eviction; permanent structures retained; fewer resident than authored objects; no more than two queued frames |
| Rain, diagnostics and resize | **Passed** | Rainy-night render; normal/material/shadow inspections; NPC debug control; correct west compass; 390 × 844 panel layout without horizontal overflow |
| Standalone file | **Passed** | Portable HTML launched through a file URL, with an embedded worker and native WebGPU renderer |
| Device loss and retry | **Passed** | Intentional device destruction stopped rendering; Retry graphics reloaded successfully and retained the save |
| Unsupported API and disposal | **Passed** | Readable unsupported-WebGPU message; explicit resource disposal marks renderer unavailable |
| Optional WebMCP | **Contract tests passed** | The native test browser lacks document.modelContext; the game does not depend on it |

The full main browser result is [evidence/browser.json](evidence/browser.json). Geometry and population evidence are in [evidence/mechanical-regression.json](evidence/mechanical-regression.json) and [evidence/world-regression.json](evidence/world-regression.json). The earlier 1.0.0 validation and evidence remain separately labelled historical records.

## Browser test scope

The checker starts a local production-build server and a real Chromium browser. It operates the visible New game, dialogue, circuit, service and ending controls, and moves the player with a real keyboard event. It uses the game's development positioning interface to set up interaction locations; it does not claim a manual walking playthrough of the whole story.

Every authored ladder and lift is activated with E. The checker verifies that climbs actually begin, lifts display an opaque ride, repeated interaction does not interrupt a lift, and every arrival is clear, supported and fully resident. The workshop climb rises outside the facade before crossing the existing roof opening. The utility climb passes vertically through the hatch before stepping onto the street. Elevators represent enclosed rides with an opaque transition rather than rendering a cabin.

The transit regression temporarily holds a real worker response. Transit reaches its destination behind the overlay while cells remain unsettled. Releasing the response uploads destination detail and re-arms the completed-frame requirement. The observed reveal occurred at completed frame 547, after required frame 533.

The opening delivery, rotating circuit, repair-rig purchase/equipment effect, two-stage service sequence and one-energy mistake cost are checked through integrated controls. The rewarded service door disappears from both collision and visible geometry immediately. Later story stages use state fixtures to reach the final choice; its presentation, replay and resulting persistent state are checked in the application. All three story outcomes are also covered in the automated state tests.

Save/reload compares the complete quest map, credits and player position. The suite additionally exercises settings, inventory, map, rainy rendering, detailed-cell eviction, diagnostic lighting, device-loss recovery and the embedded standalone worker. Assertions fail the process with a nonzero exit code. No click is forced through an obstructing overlay.

## Rendering and residency observations

At the authored spawn, the runtime retained **40,132 static objects**. Moving to an opposite district sample retained **34,651**, then returning restored 40,132. The complete authored district contains **57,533**. Both views used nine detailed cells; ten evictions were observed over the round trip. The permanent structural set contains 1,140 objects.

The persistent worker still owns the complete finite district. Streaming controls main-thread and GPU detail residency; this release does not claim independent network-loaded district generation. Main rendering uses mesh batches, compute culling and indirect draws instead of a per-frame CPU traversal of every authored static object.

F3 distinguishes completed render intervals from simulation intervals. At most two rendering submissions remain pending. Optional GPU timestamps are reported only when supported; tracked memory is an estimate of allocated buffers/textures, not total browser or driver memory. Visibility readback is asynchronous: zero counters with visibilityPending set are not a completed sample.

The software adapter is a shader/API verification environment. It is not a physical-GPU benchmark, and no 60 FPS claim is made.

## Reproduce

From the directory containing package.json, using Node 24 and Chrome:

```bash
npm ci
npm test
npm run test:district
npm run test:mechanical
npm run test:world -- --seconds=300
npm run build
npm run test:browser
```

Use ASTRA_CHROME_EXECUTABLE for another Chrome executable, ASTRA_BROWSER_LAUNCHER for an ES module exporting launchWebGPU(), and ASTRA_TEST_PORT to change the local test port. The test run used Chromium 153.0.8010.0, provided by @sparticuz/chromium 153.0.0, with SwiftShader Vulkan and a separate GPU process. Browser binaries and temporary runtime files are not committed.

The browser matrix ran before the three reconciled immediate-residency scheduling calls. The final focused native check in tools/capture-views.mjs exercises those new-game, recovery and teleport calls on the rebuilt source and records six fixed street-level views. Its evidence is recorded separately so the provenance of each check remains clear.

## Remaining limits

Physical desktop/mobile GPU performance, battery use, extended physical-device sessions, coverage beyond the tested Chromium build, subjective audio quality and complete manual story playthroughs remain unverified. Responsive touch controls are implemented; viewport checks do not substitute for a phone test. The district uses stylized procedural geometry and materials. Its density reference is not a claim of photoreal equivalence, and the automated five-minute population simulation is not a subjective five-minute visual-repetition review.
