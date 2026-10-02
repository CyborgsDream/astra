# ASTRA CITY integration contracts

Native WebGPU; no external runtime dependencies or WebGL fallback. Metres, Y up; player feet at `position`; forward at yaw 0 is negative Z. Unit box is [-.5,.5], cylinder/cone radius .5 height 1, sphere radius .5, quad XY with normal +Z. Instance colours are display-style RGB swatches in [0,1]; the renderer decodes them to linear light. Euler rotations are radians, XYZ order. All modules are ECMAScript modules, imports relative with .js.

## World asset (`src/world/district.js`)

Export `generateDistrict(seed = 73191)`. Return `{ seed, name, instances, colliders, ramps, interactables, locations, navNodes, navEdges, roads, spawn, bounds, cells, signs }`.

`instances`: `{ mesh:'box'|'cylinder'|'sphere'|'cone'|'quad', position:[x,y,z], scale:[x,y,z], rotation:[x,y,z] (optional), color:[r,g,b], material:number (optional), roughness:number (optional), emissive:number (optional), tile:number (optional), detail:number (0 structure, 1 facade, 2 micro-detail), cell:string (optional) }`. Material values: 0 concrete/plaster, 1 metal, 2 glass, 3 asphalt, 4 timber, 5 fabric, 6 emissive, 7 vegetation, 8 sign-atlas, 9 water, 10 brick, 11 paving. Each cell is 48 metres. Do not depend on the renderer in this asset.

`colliders`: `{ id, min:[x,y,z], max:[x,y,z], type:'solid' (default)|'door', owner?:string }`. Include floor slabs (ground not implicit), wall slabs, building masses, usable roofs/platforms/steps. Door colliders have `owner` matching their interactable id; the game integration disables them when opened. Small visual clutter/rail posts usually not solid. Leave real doorway gaps and traversable 1.6+ metre routes. No invisible walls inside the playable bounds. Roof floor colliders must not fill the whole interior.

`ramps`: `{id, x, z, width, depth, y0, y1, axis:'x'|'z'}`; increases from negative to positive along axis. Produce matching visible stairs/ramp mesh. Use for smooth stair traversal, floor slabs underneath must not block their upper part.

`interactables`: `{id, type:'npc'|'terminal'|'container'|'shop'|'door'|'elevator'|'ladder'|'vehicle'|'transit'|'switch'|'vending'|'discovery'|'repair', name, position:[x,y,z], radius?:number, target?:[x,y,z], destinations?:[{name,position:[x,y,z]}], description?, faction?, stock?, role? }`. IDs agreed for authored content below. Positions at accessible walking level, interaction distance computed from feet + 1 metre. Objective markers use these same IDs. Hidden items use discoverable target ids.

`locations`: `{id,name,position:[x,y,z],radius,level,description}`. `navNodes`: `{id,position:[x,y,z],kind:'foot'|'road'|'air', neighbours?:string[]}`; `navEdges`: `[nodeId,nodeId][]`. `roads`: `{points:[[x,z],...],width}`. `bounds`: `{minX,maxX,minZ,maxZ}`. `cells`: array of `{id, x,z, bounds:[minX,minZ,maxX,maxZ]}`. `spawn`: `{position:[x,y,z],yaw,pitch}`. `signs`: string array indexed by instance.tile (atlas 8 columns, 16 rows, max 128).

Required interactable IDs: `mara` (courier broker); `ivo` (repair vendor); `sana` (clinic vendor); `orin` (union representative); `relay` (rooftop relay terminal); `pump` (underground pump terminal); `cache` (underground recovery container); `archive` (restricted archive terminal); `clinic_drop` (clinic delivery); `market_drop` (market delivery); `rooftop_drop` (rooftop delivery); `rescue` (stranded maintenance worker); `home` (apartment rest/save); `workshop` (tool shop); `kiosk` (food vending); `scooter` (rideable vehicle); `transit_market`,`transit_works`,`transit_roof` (stops); `lift_ground`,`lift_roof` (same connected elevator route); `garden` and `memorial` (optional discoveries); `grid_switch` (environmental power switch); `service_door` (door); `rooftop_ladder` (ladder). Add other interactables freely with purposeful placement.

## Rendering (`src/engine/renderer.js`)

Export class `Renderer`: constructor(canvas); `async init()`; `setWorld(instances, signs)`; `setDynamic(instances)`; `render(camera, environment, options={})`; `resize(scale=1)`; `dispose()`; `getStats()`.

camera `{position:[x,y,z], yaw, pitch, fov:75, near:.08, far:1000}`. `environment`: `{time:seconds, hour:0..24, weather:'clear'|'overcast'|'rain', wetness:0..1, sunDirection?:[x,y,z]}`. `options`: `{quality:'low'|'medium'|'high', renderScale:0.5..1, wireframe?:boolean, fog?:boolean}`. render is synchronous after initialization; internal async GPU time resolution is allowed. `getStats` returns real measured/derived `{backend:'WebGPU',frameMs,cpuMs,gpuMs:null|number,drawCalls,instances,visibleObjects,triangles,memoryBytes,loadedCells,adapter?}`; never fabricate measurements. Native WebGPU instancing, compute frustum culling + indirect draw where practical, depth tested geometry, directional shadow map, restrained atmospheric sky, procedural material variation, tiled text sign atlas. Track shader compilation/validation messages for testability. `renderer.ready`, `renderer.errors` exposed. Device loss dispatch CustomEvent('astra-gpu-error', {detail:message}) on window.

## Gameplay (`src/game/state.js` and `src/game/content.js`)

Export `GameState` class (state.js), `QUESTS`, `ITEMS`, `FACTIONS` (content.js). `new GameState({storage:localStorage, seed:73191}={})`; `.data` plain JSON state; `.onChange(fn)` unsubscribe; `.newGame(seed)`; `.load()` boolean; `.save()` boolean; `.hasSave()` boolean; `.acceptQuest(id)` result; `.interact(targetId, payload={})` result; `.emit(type,payload)` result; `.buy(itemId)` result; `.use(itemId)` result; `.equip(itemId)` result; `.setPlayer(position,yaw,pitch)`; `.discover(id)`; `.tick(dt)`; `.getQuestView()`; `.getObjectiveTargets()`; `.getAvailableQuests(npcId)`.

All operations return `{ok:boolean,message:string,...optional}`. `.data` includes `version,seed,player:{position,yaw,pitch,health,energy,credits,inventory:{itemId:count},equipment:[]},quests:{questId:{status:'active'|'completed',stage,progress}},reputation:{factionId:number},discoveries:[],world:{opened:[],looted:[],repaired:[],power:boolean,hour,weather},settings:{quality,renderScale,sensitivity,volume,fov,invertY,showMinimap},playTime`. New game position from world spawn set by the main integration, starter credits >=60, scanner + hack tool owned. Save validated and versioned, preserve last valid save on failure, unknown future versions must not be silently overwritten. Mission completion rewards applied once. `getQuestView` array of quest objects with text and progress. `getObjectiveTargets` array `{id,target,label,questId,kind}`. `getAvailableQuests` array quest definitions.

Quest definitions `{id,title,giver,description,prerequisites:[],stages:[{text,target,type:'interact'|'hack'|'repair'|'discover'|'deliver'|'rescue',dialogue?,requiredItem?,consumeItem?,rewardItem?}],reward:{credits,reputation?:{factionId:number},items?:{itemId:count}},...}`. Hacking/repair gameplay completed via `.emit('hack',{target:id})`, `.emit('repair',{target:id})`; generic `.interact(id)` does not bypass these. Branching final mission can consume payload.choice. `ITEMS` plain object of definitions `{id,name,description,price,kind,health?,energy?,effect?}`. `FACTIONS` array `{id,name,color,description}`. Include 12+ purposeful missions and a coherent multi-stage introductory/story arc plus repeatable courier jobs, nonviolent choices, discoveries, reputation and economy. Tested with Node's built-in runner.

## Population asset (`src/world/population.js`)

Export class `Population(world, seed)`. `.update(dt,player,environment)`; `.instances()` returns dynamic instances; `.getStats()` returns `{npcCount,trafficCount}`; `.nearby(position,radius)`; `.dispose()`. Rich articulated humanoids from geometry, walking animation, roles, robots, drones, road vehicles and rail transit. Use actual connected navigation network routes and destination selection, avoidance/stop behavior. CPU near simulation + distant coarse updates. Do not cover authored NPC interaction targets with random pedestrians. Population owns the authored interaction NPC bodies; the district does not duplicate them.

## Audio asset (`src/engine/audio.js`)

Export class `CityAudio`: `.start()` user-gesture promise; `.update(dt,player,environment,{speed,grounded,interior,riding})`; `.setVolume(0..1)`; `.play(name,position?)` (`interact`,`complete`,`pickup`,`damage`,`jump`,`hack`,`buy`); `.dispose()`. Procedural WebAudio, limited voiced nodes, spatial machinery/traffic/drone beds, footsteps, rain, interaction sounds. No remote audio assets.


The world also exposes `tramRoute` (carriage-floor points and stopping positions) and `routeMetadata` (walking paths, mechanical travel segments, ramp endpoints, interior entries and rail alignment). Movable visual instances can carry `owner`, matching the persisted opened-door ID.
