# Switchback Ward: design and routes

`district.js` is a dependency-free ECMAScript module exporting `generateDistrict(seed = 73191)`. It uses no DOM, renderer, network, or application globals. It returns the agreed world contract, plus `tramRoute` and `routeMetadata` for integration and verification. No authored humanoids are present; Population owns them.

## Current default generation

| Item | Count |
| --- | ---: |
| Architectural and prop instances | 75,764 |
| AABB colliders | 1,236 |
| Analytic ramps with matching stair geometry | 9 |
| Interactables | 31 |
| Named locations | 12 |
| Sign atlas strings | 70 of 128 |
| 48 m spatial cells | 16 |
| Navigation nodes | 2,339 |
| Navigation edges | 6,987 |

Counts vary with the seed. Default bounds are X −84…84 m, Z −72…72 m. Geometry extends slightly beyond them into visible boundary infrastructure. Axes are metres, Y up, with yaw zero facing −Z.

The opening is a narrow loading passage between Coilworks and Mara’s original stall: `position: [-21.8, 0, -22.35]`, `yaw: Math.PI - 0.06`, `pitch: -0.025`. All 31 interaction standing positions were preserved during the composition revision.

## Art and spatial composition

The district uses old brick and concrete bases, muted jade additions, faded awnings, rusted utility equipment, and a restrained amount of future infrastructure. Parcel dimensions, setbacks, frontage rhythms, materials, commercial activity, and maintenance details use deterministic random streams. The ground plan protects streets, passages, authored buildings, stairs, and the viaduct before generating infill.

The opening includes a worn loading apron, guardrail, handcart, leaning bicycle, refuse, crates, weeds, and repaired asphalt. The close workshop facade has upper windows, projecting frames, belts, balconies, AC units, pipework, signage, and weathering patches. An occupied upper room and gallery were added above the broker. A real kitchen and tailor shop, plus an old weighhouse, break the market into smaller spaces.

Detail placement follows use: crates near receiving areas; waste near service edges; drainage along roads; AC next to windows; condensate pipes leading downward; roof machinery connected by pipework; cables linked between poles and destinations. Most small props are grouped around these purposes rather than distributed uniformly.

The 2026-10-02 density pass adds 12,182 deterministic visual instances without changing collision or map bounds. On the default seed its semantic counters report 400 ground-surface history elements, 44 drains, 112 service covers, 365 street-edge elements, 981 façade repair layers, 4,684 façade/utility elements, 95 commercial-life elements, 370 vertical layers, 38 visible construction-history additions, 16 painted-mark groups, and fourteen ambient-use anchors. Window dimensions, depths, frames, blinds/curtains, partial openings and notices now vary per building stream rather than following one repeated treatment.

Nearby taller buildings and Needle House establish vertical scale. The rail corridor is excluded from ordinary infill. Needle House contains an actual structural passage for the track and overhead wiring, rather than allowing the tram to cross a solid building.

## Meaningful interiors and routes

The workshop, apartment, clinic, union archive, salvage garage, foundry, kitchen, tailor shop, and broker’s upper room have hollow shells, thin floor and roof slabs, real doorway gaps, and interior furniture. The workshop also has a usable mezzanine. Other residential masses remain closed architectural volumes.

The principal routes are exposed as `routeMetadata.paths`, with exact ramp endpoints, flat landings, and per-segment walking/ladder/elevator modes:

- **Apartment:** an exterior stair at X −24.6 rises from Y 0 to 4.2; a separate balcony returns to the apartment doorway at `[-28.5, 4.2, -47]`. The balcony does not overlap the ascending flight.
- **Main roof circuit:** the clinic stair at X −56 reaches Y 8.4 through two flights and a landing. Galleries connect the clinic, workshop roof, and market lift. Junctions have deliberate railing openings.
- **Garden and relay:** a stair at X −34.5 rises from Y 8.4 to 12.6. Loom Garden has the roof delivery locker, relay, discovery, and a clear route to the stranded maintenance worker.
- **Underground:** the Turnwater entrance at `[-65, 0, -34.25]` leads through two flights to Y −7.2. The tunnel reaches the grid switch, pump controller, and recovery cache. A second ladder exits through a separate hatch near `[-20, 0, -54.5]`.
- **Northline station:** a 24 m stair at X 8 rises from Z 26 to 50, reaching Y 8.4 before the station platform begins. A landing then connects to the platform.
- **Broker’s upper room:** a side stair and gallery reach Y 3.3 while leaving the ground broker and passage accessible.

The ground slab is explicitly subtracted around both underground openings. Underground floors and ceilings are separate slabs; no solid mass fills the service rooms. Stair collision comes from the analytic ramp; individual visible treads do not introduce conflicting AABB step walls.

## Interaction integration

Every required interaction ID exists. Their positions are standing locations beside the related equipment, doors, and NPCs. Default checks confirm support and clearance for a player radius of 0.32 m, height 1.76 m, and step height 0.42 m.

Mara, Sana, and Orin use faction `commons`; Ivo uses `cooperative`. Shop stock uses the agreed gameplay item IDs. The main game integration handles interaction logic and persistent quest state.

Only the movable service-door panel instance has `owner: 'service_door'`. Its collider has `type: 'door'` and the same owner. Opening the door should disable that collider and filter that panel instance; frames, sign, walls, and staircase stay visible.

Lift destinations remain clear at their landing coordinates. Tower, lift, and ladder destinations are linked in the navigation graph. Their motion and persistence are owned by the game integration. Population should use the route metadata to distinguish mechanical travel from ordinary walking if it sends NPCs between levels.

## Tram route

```js
tramRoute: {
  points: [[-82, 8.4, 61], [82, 8.4, 61]],
  stops: [[13, 8.4, 61], [-72, 8.4, 61], [72, 8.4, 61]]
}
```

The Y values are the carriage boarding floor. Track top is Y 8.0, and the viaduct deck is Y 7.65. The actual public station interaction remains `[13, 8.4, 57]`; the other tram stopping points are turnback/service pauses. `routeMetadata.rail` also exposes the alignment and Needle House underpass bounds.

## Portable validation

Run with Node and no packages:

```sh
node tools/validate-district.mjs
node tools/validate-district.mjs --seed=90210
node --input-type=module --check < src/world/district.js
```

The validator prints JSON and exits nonzero on a failure. It checks finite positive instance transforms, required IDs, standing capsule clearance, floor/ramp support, target connectivity from the starting region, every authored ramp centreline, walking-path clearance and support, tram alignment, service-door ownership, and deterministic generation through a SHA-256 comparison of two generated worlds.

The final default run passes every check. Additional generation checks with seeds 1, 90210, and 4294967295 also found finite geometry, supported clear interaction points, and full target graph connectivity.

## Scope of this asset

Structural routes, meaningful interiors, primary counters, building masses, railings, and floors have collision. Many small decorative objects and non-route facade attachments use visual geometry only. Generic upper residential floors are closed; the authored interiors and designated vertical routes provide the explorable spaces. The first render was reviewed and prompted the opening-composition revision; the revised runtime view and lighting passed native WebGPU capture with no shader or validation errors.
