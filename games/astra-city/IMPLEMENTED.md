# Implemented systems

Recovered 2026-10-02 from the existing Switchback Ward source. These features exist in source; current-session verification is recorded in PROJECT_STATE.md.

- Native WebGPU instancing, compute visibility culling, indirect drawing, shadows, material atlas, sky and rain.
- Deterministic 16-cell district with layered buildings, streets, market, interiors, courtyards, rooftops, undercroft, stairs and service routes.
- Walking, sprinting, crouching, jumping/mantling, collision, scooter, four visible collision-checked ladder climbs, enclosed lift transitions and ward transit.
- Named characters, contextual dialogue, pedestrians, traffic, service robots and security simulation.
- Data-driven 15-mission set, multi-stage story, three endings, independent and repeatable jobs.
- Credits, equipment effects, shops, supplies, discoveries and faction reputation.
- Versioned local saves with previous-save recovery, migration and corrupt-save protection.
- New/continue, pause/settings, inventory, map, journal, conversations and interactions.
- Day/night, clear/overcast/rain, wetness and synthesized sound.
- Developer tools and telemetry, automated unit/district/browser checks.
- Modular source, web build and portable HTML build.
- Worker-driven detail residency with nine resident cells, bounded requests, stale-response rejection and eviction while preserving structure.
- Native adapter preference retry and optional timing-feature fallback, working graphics retry, bounded queued frames and completion-based telemetry.
- Obstacle-aware pedestrian placement, physical road lane widths, overhead drone clearance, and shared open-door state.
- Population bounds/headings and lighting/normal/material/mesh developer inspection.

Required additions and verification gaps belong in TODO_NEXT.md; a feature is not marked tested here solely because historical reports say it passed.

- Correctly transformed, connected cable and pipe segments, checked against authored endpoints.
- Permanent coarse facade glazing and sparse floor/roof bands; distant buildings remain articulated after detail eviction.
- Real upper window openings and exterior articulation on Scales Exchange.
