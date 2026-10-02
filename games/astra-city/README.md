# ASTRA CITY

ASTRA CITY is a first-person exploration and courier game set in Switchback Ward: a dense district of street markets, repair shops, rooftop gardens, apartments, and underground infrastructure. Take useful jobs, investigate a failing power grid and a missing maintenance shift, then decide who will keep the ward’s lights on.

The city uses an original procedural visual style, native WebGPU rendering, and synthesized audio. Game code has no external runtime engine dependency.

## Run locally

From the source directory containing `package.json`:

```bash
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). Use a browser that exposes WebGPU and can acquire a GPU adapter. The game must be served from an appropriate secure origin or localhost. There is no WebGL fallback; unsupported devices receive a startup error.

Validation and build commands, from the same source directory:

```bash
npm test
npm run test:district
npm run build
npm run test:browser
```

The browser check requires installed Chrome with a usable WebGPU adapter. See [release validation](docs/validation.md) for its coverage and setup.

The build writes `dist/index.html` with bundled JavaScript, its worker, and CSS, plus `dist/astra-city.html`, which embeds the game, styles, and worker. Preview the output with `node tools/serve.mjs --dist`. Production hosting should serve the files over HTTPS.

## Begin your shift

Choose **New game**, then find Mara under the market awning. Her first job supplies medicine for the clinic. Deliver it at the clinic counter, then bring the receipt back to Mara. The objective marker and district map show the current destination.

You begin at 15:30 with 90 credits, a scanner, a signal bridge for terminal access, a medkit, and a charge cell. Talk to Ivo at the workshop for tools and recovery work, Sana for supplies and clinic jobs, and Orin for the ward’s history and the missing crew investigation.

The game contains **15 missions**, including a five-part story:

1. Medicine Before Midnight
2. A Voice in the Static
3. The Names on the Roster
4. What the Archive Kept
5. Who Keeps the Lights

The other ten jobs cover deliveries, salvage recovery, water sampling, relay repairs, exploration, and publishing the crew’s account. **The Market Run** is repeatable: deliver a fresh parcel and return its receipt for 28 credits each time.

The final agreement has **three endings**: resident and worker control through the Switchback Commons, audited city control through the Civic Grid Directorate, or shared maintenance through the Open Loop Cooperative. Each changes faction reputation and grants a different tool or garment. Afterward, keep exploring and finish side jobs. Return to the grid switch to review the chosen agreement, or start a new journey to make a different choice.

## Controls

| Action | Control |
| --- | --- |
| Move | W A S D |
| Look | Mouse; drag on the city if pointer lock is unavailable |
| Sprint / scooter boost | Shift |
| Jump / contextual mantle | Space |
| Crouch | C or Ctrl |
| Interact / dismount scooter | E |
| Scan nearby infrastructure | Q |
| District map | M |
| Mission journal | J |
| Inventory | I or Tab |
| Use medkit / charge cell | 1 / 2 |
| Dismount scooter | R |
| Pause / close panel | Esc |
| Save | F8, or the pause menu |
| Performance panel | F3 |
| Development controls | F4 |

Touch controls provide movement, drag look, jump, sprint, crouch, interaction, and menus. Browser and device WebGPU support still apply.

Terminal access uses a circuit-routing puzzle. Repairs use an ordered service sequence. Finishing either sends a distinct success event; ordinary interaction does not substitute for the work. Free ward transit, elevators, ladders, and a shared scooter connect the district’s levels and streets. Crouching and cover help avoid the archive’s security sensors.

## Equipment and supplies

Buy upgrades at Ivo’s bench and equip them in the inventory. Only equipped upgrades provide their benefits.

| Item | Credits | Effect |
| --- | ---: | --- |
| Survey scanner | 85 | Extends scan range from 28 to 52 metres |
| Phase decoder | 125 | Simplifies the archive’s circuit puzzle |
| Induction repair rig | 110 | Automates pressure relief: two service steps instead of three, with lower mistake cost |
| Courier soles | 95 | Faster sprinting, higher jumps, and 25% faster energy recovery |
| Insulated work coat | 105 | Reduces damage by 25% |
| Field medkit | 28 | Restores 45 health |
| Charge cell | 18 | Restores 45 energy |
| Sesame rice wrap | 10 | Restores 12 health and 18 energy |

Rest at home to recover health and energy and save. If health reaches zero, you recover at your safe address with your work and equipment retained.

## Saves

Progress is stored locally in this browser using **save schema version 2**. It includes missions, completed payouts, inventory, equipment, reputation, position, discoveries, mechanism and security flags, power, time, weather, and settings. The game saves at mission milestones, through the save controls, and every 30 seconds of active play.

The previous valid save is retained as a backup. Version-one records migrate without paying completed rewards again. Corrupt data and unsupported future versions are protected from automatic overwrite. Choosing a fresh journey archives the previous save before resetting it. Saves do not synchronize between browsers, origins, or devices; clearing site data removes them.

## Scope and diagnostics

Switchback is a finite district. Its current default world contains 57,793 static geometry instances, 1,276 colliders, nine ramps, 31 interactables, 12 named locations, 16 cells, and 2,345 navigation nodes. Dynamic people, vehicles, and status indicators add their own geometry.

A persistent worker supplies nine nearby detailed cells, with asynchronous loading and eviction. Main building masses and long structural objects stay resident to preserve the district and skyline. GPU visibility culling then selects the geometry needed by each view. F3 displays completed-frame timing, GPU timing when supported, resident cells, population, geometry and queued frames. F4 exposes free camera, teleport, collision and population overlays, cell boundaries, lighting/material/normal views, mesh edges, detail controls, population spawning and time/weather controls. Performance depends on the actual browser, adapter, resolution, and scene. The project does not make a hardware frame-rate guarantee.

See [Architecture and limitations](docs/architecture.md) for the rendering pipeline, module boundaries, measurement definitions, and deliberate omissions.

## Recovery checkpoints

The source is archived at coherent milestones, including this README, all game modules, build and test tools, the portable build, and the six recovery files. Read PROJECT_STATE.md first when resuming. The existing ASTRA player/editor experiment is preserved separately.

```bash
node tools/checkpoint.mjs milestone_name
```

The command creates and verifies a complete ZIP in a neighbouring checkpoints directory. The manifest records source commits, byte hashes and cloud locations. Current source lives in [CyborgsDream/astra](https://github.com/CyborgsDream/astra/tree/releases/astra-city-1.1.0-20261002/games/astra-city); archives are in the [ASTRA CITY folder](https://drive.google.com/drive/folders/1IrebhwrQ4MianlKJ_JMglHKZRvxwaMyc).

## Verified source branch

This release is preserved on [`releases/astra-city-1.1.0-20261002`](https://github.com/CyborgsDream/astra/tree/releases/astra-city-1.1.0-20261002/games/astra-city). In a clone of ASTRA, select that branch before entering `games/astra-city`. Concurrent work on main is retained separately.

## Source mirror and complete release archive

This GitHub source mirror excludes generated `dist` output, the Site hosting binding, and image evidence under `docs/images/`. The complete release checkpoint ZIP retains these files, including all six final capture images. Capture paths in the validation documents refer to that complete archive; use the linked ASTRA CITY archive folder above to retrieve them.
