# Lessons

- Treat world coordinates as metres: `+X` east, `-Z` north, and `+Y` up. This is an authored world convention, not a geospatial claim or an inference about a real-world location.
- Keep world representation in canonical immutable types and data, with `WorldBuildResult` as the construction boundary/result consumed by the rest of the system.
- Let `ResourceRegistry` generation groups own world-generation GPU resources (geometries, materials, textures, instanced meshes, and similar); dispose runtime-owned `WebGLRenderer` and lifecycle infrastructure directly in `ThreeRuntime`.
- Keep DEV debug surfaces default-hidden; allocate them only after the DEV guard; expose synchronous commands and metrics only in DEV; and use view-specific filtered diagrams when making verifiable structural claims.
- In production, retain only an inert scene stub and no reachable debug surface.
