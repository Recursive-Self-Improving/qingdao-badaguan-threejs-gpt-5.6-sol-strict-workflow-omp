# Lessons

- Treat world coordinates as metres: `+X` east, `-Z` north, and `+Y` up. This is an authored world convention, not a geospatial claim or an inference about a real-world location.
- Keep world representation in canonical immutable types and data, with `WorldBuildResult` as the construction boundary/result consumed by the rest of the system.
- Let `ResourceRegistry` generation groups own world-generation GPU resources (geometries, materials, textures, instanced meshes, and similar); dispose runtime-owned `WebGLRenderer` and lifecycle infrastructure directly in `ThreeRuntime`.
- Keep DEV debug surfaces default-hidden; allocate them only after the DEV guard; expose synchronous commands and metrics only in DEV; and use view-specific filtered diagrams when making verifiable structural claims.
- In production, retain only an inert scene stub and no reachable debug surface.
- Keep architecture sites, views, and results canonical and immutable; finalize one generation-scoped shared `VillaKit` once.
- Use custom connected, bounds-computed geometry for route/Low-critical silhouettes and crafted landmark cues; avoid relying on generic primitives for authored architectural identity.
- Derive camera Y from the site ground and keep `viewpointId` provenance separate from the authored capture pose.
- Set `probe.from` explicitly in local collision tests so probes remain deterministic and do not depend on implicit origins.
- Playwright output cleaning can hide canvas captures; promote UI-hidden captures to durable artifacts before running other evidence checks.
- Production screenshots may retain normal shell UI, but must not expose debug or architecture labels.
- Keep CSP source tokens browser-valid; do not use an IPv6 wildcard port token.
- Use opaque, depth-writing instanced foliage when sorting matters; it gives deterministic depth ordering without transparent blending artifacts.
- Derive exact identity maps from source data and preserve side semantics explicitly; never infer identity or side from draw order or geometry.
- Keep vegetation checksums lazy, publish DEV metrics at 10 Hz, and make a forced metrics command synchronously publish the current snapshot before returning.
- Define camera fixtures in authored world space and pair visual captures with stable evidence hashes so camera regressions remain reproducible.
- When reducing Low density, preserve category and identity anchor instances so authored composition and semantic verification remain stable.
- Keep identity-bearing palettes separate from nonidentity scale variation: palette can encode species or category identity, while size changes remain visual-only.
