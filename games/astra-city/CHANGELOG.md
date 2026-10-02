# Changelog

## 2026-10-02 — Street-level density and realism pass

- Preserved the existing 16-cell district bounds, colliders, mission targets, traversal graph, transport, quests, saves and working gameplay systems.
- Added 12,182 deterministic street-density instances, bringing the default static world to 75,764 instances without increasing the 1,236 collision volumes.
- Added semantic ground history: repaired pavement/asphalt, cracks, stains, drains, utility/service covers, wet patches, road markings, edge grime, litter and weeds.
- Added façade and utility history: more varied window dimensions/treatments, repair plates, AC/service units, junction boxes, vertical pipework, condensate runs and hanging cables.
- Added functional street-edge/commercial detail: delivery crates, carts, cabinets, bicycles, bollards, planters, clustered waste and receiving/service-area clutter.
- Added rooftop service equipment and later roof additions to strengthen vertical layering and visible construction history.
- Added fourteen inexpensive ambient activity actors for browsing, talking, sitting, waiting, delivery/carrying, maintenance, looking at displays and resting.
- Preserved bounded 3×3 static GPU cell residency; the density pass continues to use shared primitive geometry, instancing, compute visibility culling and indirect drawing.
- Added deterministic density acceptance tests and headed Linux WebGPU evidence under Xvfb/SwiftShader Vulkan.
- Fresh release validation: 55/55 unit tests passed, district validation passed with zero invalid transforms or route/target failures, production build passed, and the full browser/WebGPU interaction flow completed without renderer/browser errors.


## 2026-10-02 — Recovery hardening

- Added bounded 3×3 GPU cell residency so static rendering no longer keeps all 16 district cells uploaded at once.
- Added a tested cell-selection module with edge and out-of-bounds behavior.
- Fixed the east/west compass orientation to match the first-person camera convention.
- Replaced the dead startup path with a real graphics retry and made WebGPU adapter acquisition try high-performance, default, then low-power preferences.
- Reduced ambient pedestrian sidestep range to avoid wall clipping on narrow generated routes.
- Updated project-state and next-work documentation to separate verified source state from native-hardware validation.

## 2026-10-02 — Recovery baseline

- Restored the earlier complete modular Switchback Ward implementation from its private source repository.
- Located the existing ASTRA GitHub repository and preserved its separate WebGPU player/editor experiment.
- Established required project-state, implemented-systems, next-work, build and milestone documentation.
- Began fresh verification; historical validation remains explicitly distinguished from this session's results.
- Fresh baseline passed all 49 unit tests, district validation, and web/portable production builds.
