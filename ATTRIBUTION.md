# Attribution and provenance

## C01 asset status

C01 ships no remote runtime assets. It introduces no images, textures, models, fonts, audio, video, map data, analytics, APIs, CDNs, or hotlinked resources. The browser application foundation uses locally installed npm packages and locally authored source only. Later visual content must remain procedural or repository-hosted and must be recorded below before it is shipped.

## Software dependencies

| Package | Version | Role | License | Publisher / author | Canonical source | Runtime delivery |
|---|---:|---|---|---|---|---|
| `three` | 0.185.1 | Browser 3D runtime | MIT | three.js authors | https://github.com/mrdoob/three.js | Bundled locally by Vite |
| `@playwright/test` | 1.61.1 | Browser and visual test runner | Apache-2.0 | Microsoft Corporation | https://github.com/microsoft/playwright | Development only |
| `@types/node` | 24.13.3 | Node.js type declarations | MIT | DefinitelyTyped contributors | https://github.com/DefinitelyTyped/DefinitelyTyped | Development only |
| `@types/three` | 0.185.1 | Three.js type declarations | MIT | DefinitelyTyped contributors | https://github.com/DefinitelyTyped/DefinitelyTyped | Development only |
| `typescript` | 7.0.2 | Static type checker and compiler | Apache-2.0 | Microsoft Corporation | https://github.com/microsoft/TypeScript | Development only |
| `vite` | 8.1.4 | Development server and production bundler | MIT | Vite contributors | https://github.com/vitejs/vite | Development only |
| `vitest` | 4.1.10 | Unit test runner | MIT | Vitest contributors | https://github.com/vitest-dev/vitest | Development only |

Transitive npm packages and integrity hashes are recorded reproducibly in `package-lock.json`. Package licenses remain governed by their upstream distributions.

## Ledger fields for later assets

Every externally sourced asset added in a later chunk must record all of the following before use:

- asset name and repository destination;
- asset type and in-product purpose;
- original author or publisher;
- canonical source URL;
- exact license name, version, and license URL;
- retrieval date;
- original filename and checksum;
- modifications, conversions, or optimization performed;
- attribution text required in-product or in distribution;
- whether the asset is required or optional and its procedural or neutral fallback;
- reviewer confirmation that commercial redistribution and local hosting are permitted.

Assets with unclear provenance or incompatible terms must not be added. Production assets must be stored locally rather than hotlinked.
