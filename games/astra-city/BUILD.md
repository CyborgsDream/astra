# Build, run and validate ASTRA CITY

Run commands from the source root (the directory containing package.json).

```bash
npm ci
```

```bash
npm start
```

Open http://localhost:4173 in a WebGPU-capable browser. Production requires HTTPS. The game keeps WebGPU as its renderer and exposes a readable startup state when an adapter is unavailable.

```bash
npm test
```

```bash
npm run test:district
```

```bash
npm run build
```

```bash
npm run test:browser
```

Browser tests need a usable Chrome installation. Set ASTRA_CHROME_EXECUTABLE to its absolute executable path or ASTRA_BROWSER_LAUNCHER to an ES module exporting launchWebGPU(). These variables are for testing only.

Build output: dist/index.html with bundled assets and dist/astra-city.html with embedded code/worker/styles. Source and checkpoint archives must not include dependencies, temporary browsers, credentials or local browser profiles.

See tools/checkpoint.mjs for reproducible source checkpoints and cloud/checkpoint-manifest.json for retained archive metadata. See PROJECT_STATE.md before resuming development.
