# Astra

Astra is a CYBERNOID project repository.

This repository is intentionally starting from a minimal, technology-neutral baseline. Project-specific architecture, runtime requirements, build tooling, and deployment instructions should be documented here as the implementation is introduced.

## Status

Initial repository scaffold.

## Repository guidelines

- Keep secrets, credentials, local configuration, generated output, and machine-specific files out of version control.
- Document significant architectural decisions alongside the code they affect.
- Prefer small, reviewable commits with clear messages.
- Add project-specific setup, test, build, and deployment instructions as soon as those workflows exist.

## Structure

The project structure will be defined by the implementation rather than pre-populated with speculative folders.

## Documentation

Project documentation belongs in the repository and should evolve with the implementation.

## License

No license has been selected yet.

## ASTRA CITY — Switchback Ward

The recovered playable city lives in [games/astra-city](games/astra-city/README.md). It includes the native WebGPU renderer, procedural district, missions, local saves, controls, tests, and recovery checkpoints.

```bash
cd games/astra-city
npm ci
npm start
```

Open http://localhost:4173 in a browser with a usable WebGPU adapter. See [build and validation instructions](games/astra-city/BUILD.md) and [current project state](games/astra-city/PROJECT_STATE.md).
