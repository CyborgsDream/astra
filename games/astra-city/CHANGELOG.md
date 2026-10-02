# Changelog

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
