# Build, run and validate ASTRA CITY

Use Node 24 or a compatible supported Node release. Run commands from the directory containing package.json: `games/astra-city` in the public repository, or `astra-city` after extracting a checkpoint.

## Source branch

The verified 1.1.0 release uses `releases/astra-city-1.1.0-20261002`. After cloning the existing ASTRA repository:

```bash
git checkout releases/astra-city-1.1.0-20261002
cd games/astra-city
```

Main contains concurrent development and is preserved separately. Checkpoint ZIPs already contain the release source; no branch selection is needed after extraction.

## Install and play locally

```bash
npm ci
npm start
```

Open http://localhost:4173 in a WebGPU-capable browser. Production uses HTTPS. Native WebGPU is required; unavailable adapters produce a readable retry screen. No WebGL fallback is included.

## Objective checks

```bash
npm test
npm run test:district
npm run test:mechanical
npm run test:world -- --seconds=300
npm run build
npm run test:browser
```

The browser check starts and closes its own local server. It needs a usable Chrome installation. Set `ASTRA_CHROME_EXECUTABLE` to an absolute executable path, or set `ASTRA_BROWSER_LAUNCHER` to an ES module exporting an asynchronous `launchWebGPU()` that returns a Playwright Browser. `ASTRA_TEST_PORT` changes its server port. These variables affect testing only.

Current-session shader/API verification uses Chromium 153.0.8010.0 with a SwiftShader Vulkan software adapter and a separate GPU process. Temporary browser binaries and launchers are not project dependencies. Software results are not physical-GPU performance benchmarks.

Optional machine-readable checks:

```bash
node tools/validate-district.mjs --seed=90210
node tools/world-regression.mjs --seconds=300 --output=test-results/world-regression.json
node tools/check-mechanical.mjs --output=test-results/mechanical-regression.json
```

Create the output directory first if invoking a check directly in a fresh clone. The browser checker creates `test-results` itself.

## Build outputs

`dist/index.html`, `dist/app.js`, `dist/world-worker.js` and `dist/style.css` form the web build. `dist/astra-city.html` embeds code, worker and styles in a portable HTML file. The portable file launched successfully through a file URL in the tested browser; other browsers may apply different local-file policies.

To serve the production build:

```bash
node tools/serve.mjs --dist
```

## Fixed camera and relocation checks

```bash
node tools/capture-views.mjs
```

This optional native check verifies immediate cell selection after new game, recovery and development teleport, then captures six supported street viewpoints into `test-results/views`. It uses the same browser environment variables.

## Recovery checkpoints

```bash
node tools/checkpoint.mjs release_name ../checkpoints
```

The tool verifies required source files, ZIP integrity, size and SHA-256. Names use Warsaw time. Archives exclude dependencies, test output, temporary runtimes, Git internals, environment files and other ZIPs. They include the complete modular source and generated playable builds. The external manifest and ZIP sidecar record the completed archive hash; a ZIP cannot contain its own final hash.

Read PROJECT_STATE.md and cloud/checkpoint-manifest.json before resuming. Source commits use the existing ASTRA repository; complete checkpoint ZIPs and the six state files use the linked ASTRA CITY Drive folder. The original player/editor experiment remains separate and intact.
