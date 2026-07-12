# Qingdao Badaguan Interactive Landscape — Authoritative Implementation Plan

## 1. Purpose and status

This document is the design authority for a production-quality, browser-based Three.js free-roam interpretation of Qingdao Badaguan. The repository has no application baseline: no source, manifest, assets, tests, conventions, or deployment configuration exist. Implementation therefore starts from a clean slate.

Implementation MUST proceed in stable chunk order (`C01` through `C12`). A future session selects the first chunk whose matching item in `PROGRESS.md` is unchecked, completes every task and acceptance criterion in that chunk, runs its focused verification, reviews only the declared review surface, fixes failures, and commits it before starting another chunk. No unchecked task is implicitly deferred. Optional polish is explicitly separated in §15 and is not part of the required sequence.

This plan contains no application implementation. File names and symbols below are the required future architecture.

## 2. Product definition

Create a responsive interactive virtual landscape that gives an authentic *sense* of Badaguan rather than claiming to be a survey-accurate digital twin. The required experience is an early-autumn morning walk through a compact, coherent district vignette with:

- free keyboard movement (WASD and arrows), free mouse view rotation, and Escape-to-release behavior;
- a touch and non-pointer-lock path that retains meaningful exploration;
- a gently south-descending, ten-road, leafy villa district with selective coastal views;
- varied low-rise garden architecture, including source-bounded interpretations of notable silhouettes;
- appropriate directional light, readable shade, soft shadows, marine atmosphere, fog, and consistent color management;
- immediate loading/status UI, recoverable failures, WebGL2 fallback, accessibility support, and responsive presentation;
- explicit quality tiers and measurable performance/resource budgets.

### Required outcome versus artistic inference

The following are evidence-backed requirements: ten pass-named roads arranged seven transverse by three longitudinal; mostly straight roads with slight terrain-led turns; south-low/north-high terrain; detached two- and three-story garden villas; local stone, brick/tile, and wood; mixed German neoclassical, Gothic, and Spanish district styles; landmark-specific Nordic/Danish cues at Princess Villa and Mansard/brick-timber cues at Butterfly Villa; road setbacks, walls, gates, canopy, coastline, parks/public open space, sight corridors, and road-specific traditional planting.

**[ARTISTIC INFERENCE]** The implementation is a compressed, non-geospatial district vignette rather than a cadastral reconstruction. District scale and geometry, distances, parcel order, landmark adjacency, road lengths, exact building façades, the compact public green/open-space geometry, and any broader reuse of landmark-specific motifs will be composed for walkability and performance. Traditional planting cues are not a current tree inventory. No invented geometry may be described in-product as an exact historical reconstruction.

**[ARTISTIC INFERENCE]** The default moment is an early-October morning after light marine haze has begun lifting. This combines source-supported clear/drier autumn conditions, autumn ginkgo/maple color, coastal humidity/fog, and southeast prevailing wind into one respectful artistic interpretation, not a claim about current conditions.

## 3. Fixed decisions and assumptions

There are no open product questions. These decisions govern implementation:

1. **Browser/toolchain:** Vite, TypeScript in strict mode, native ES modules, Three.js, Vitest for pure/unit tests, and Playwright for behavioral browser tests and controlled visual captures. Use npm with a committed `package-lock.json`; pin exact direct dependency versions. Node support is the current active LTS at scaffold time and is recorded in `package.json` `engines` and `.nvmrc`.
2. **Rendering baseline:** WebGL2 is required because current Three.js `WebGLRenderer` requires it. Unsupported devices receive meaningful DOM/static fallback content, not a blank or broken canvas.
3. **Asset strategy:** procedural-first geometry and generated/material primitives are required for the complete baseline. No network-loaded third-party model is a required dependency. Any external texture, HDRI, font, audio, or model added later must be locally hosted, license-compatible, documented in `ATTRIBUTION.md`, and have a procedural or neutral fallback. Do not hotlink production assets.
4. **Scene truth:** use a compact data-driven representation of roads, parcels, anchors, and planting. Landmark forms are interpretive silhouettes based only on cited characteristics, not photogrammetric replicas.
5. **Architecture:** imperative Three.js modules with explicit ownership and disposal; no UI framework. DOM UI is state-rendered from a typed application store. Avoid an ECS and avoid a general-purpose physics engine; bounded walking, terrain sampling, and simple collision volumes are sufficient.
6. **Control priority:** desktop pointer lock + keyboard is primary. Pointer lock is privilege-enhancing, never mandatory. Click-drag + keyboard is the first fallback; touch drag + on-screen movement is the coarse-pointer fallback.
7. **Camera:** first-person eye height defaults to 1.68 m, field of view 65°, near plane 0.08 m, and far plane set only far enough for the composed horizon (target 450–600 m after scene calibration). Pitch is clamped to approximately ±85°; roll remains zero.
8. **Movement:** walking defaults to 3.2 m/s; optional sprint is not required. Diagonal input is normalized. Movement uses a clamped frame delta and ground/bounds resolution. Buildings use simple 2D footprint/volume collision, not per-triangle collision.
9. **Season/weather:** one authored early-autumn morning is required. Dynamic weather, time-of-day, and seasons are optional polish.
10. **Audio:** not required. If later added, it is opt-in after activation, pausable, and fully optional.
11. **Deployment:** produce a static site under Vite’s configured base path, with no server runtime, account, analytics, cookies, or remote API.
12. **Privacy/security:** no user data collection. Treat all displayed source/attribution text as static application content; no runtime HTML injection. Apply a static-host-compatible Content Security Policy where deployment permits.

## 4. Source-backed authenticity brief

### Place structure

- Badaguan lies on the southern foot of Taiping Hill, between Taiping and Huiquan capes near Taiping Bay.
- The protected spatial character combines a checkerboard street pattern, natural slope, gardens, parks, coastline, greenery, public space, and protected sight corridors.
- Model all ten documented roads, not only eight. Use seven transverse and three longitudinal roads, mostly straight with slight turns.
- Preserve a visual grade from higher north to lower south and frame occasional sea views; the ocean must not be visible from every location.

### Built form

- Favor detached garden villas, normally two or three floors and modest in footprint, with visible setbacks, walls, gates, and planting.
- Vary architectural silhouettes. Do not reduce the area to one generic “German colonial” kit.
- Use restrained stone, brick/tile, stucco, timber, muted green, and red/brown roof materials. Avoid glossy curtain walls, giant buildings, continuous row façades, neon, banners, and dense commercial signage.
- Landmark cues:
  - Huashi Building: compact, sculptural, castle-like shore massing;
  - Princess Villa: Nordic/Danish-influenced form, pine-green exterior, crafted wood windows;
  - Butterfly Villa: Mansard roof and brick-timber character.
- **[ARTISTIC INFERENCE]** These landmarks may be placed at route anchors that support pacing and coastal sightlines; their relative positions are not represented as exact.

### Landscape and season

Traditional/representative planting cues, not claims about every current tree:

| Road | Primary cue |
|---|---|
| Shaoguan Road | peach |
| Ningwuguan Road | crabapple |
| Zijingguan Road | cedar |
| Zhengyangguan Road | crape myrtle |
| Jiayuguan Road | maple |
| Juyongguan Road | ginkgo |
| Linhuaiguan Road | Chinese juniper |
| Wushengguan Road | plane tree |
| Hangu Pass Road | plane tree |
| Shanhaiguan Road | plane tree |

**[ARTISTIC INFERENCE]** Autumn color is concentrated along Juyongguan/Jiayuguan and used sparingly elsewhere; evergreen structure remains around Zijingguan/Linhuaiguan. Ground accents imply fallen leaves without covering navigation edges.

### Atmosphere

Qingdao’s humid maritime temperate-monsoon climate supports humidity, sea haze, fog, southeast wind, and clear/drier autumn weather. Use low-angle morning light, long but soft-edged shadows, gentle southeast foliage motion, and restrained distance haze. Avoid permanent Mediterranean dryness, blanket fog, a dramatic storm default, or fast distracting fog animation.

### Authenticity review questions

Every visual review MUST answer yes to all of these:

- Does the first minute read as low-rise, leafy, coastal Badaguan rather than a generic European suburb?
- Is the slope perceptible and are long grid views preserved?
- Are ten roads represented in the scene data/debug view?
- Are buildings varied, modest, detached, and set behind gardens/walls?
- Are at least three distinct architectural families visible on the required review route?
- Is road-specific planting legible without becoming a botanical theme park?
- Are sea views selective and compositionally framed?
- Are “red tiles, green trees, green hills, blue sea” balanced rather than rendered as saturated literal branding?
- Is a compact public green/open-space cue integrated with the street, garden, and coastal system?
- Is Help/About keyboard- and touch-reachable, and does it clearly distinguish sourced facts from inferred scale/geometry, adjacency/façades, traditional-not-current planting, landmark-motif reuse, and early-autumn weather?

## 5. Chosen architecture

### Runtime layers

1. **Document shell:** semantic HTML, fallback description, loading/onboarding/menu/settings/error overlays, live region, and touch controls.
2. **Application controller:** owns typed lifecycle state and orchestrates capabilities, loading, scene creation, input, quality, context recovery, and UI projection.
3. **Platform services:** WebGL2 detection, viewport observation, persistence, visibility, pointer lock, reduced-motion/media queries, timing, and diagnostics.
4. **Three.js runtime:** renderer/camera/scene ownership, resource registry, resize, animation loop, context lifecycle, and deterministic disposal.
5. **World model:** immutable district data (roads, parcels, route/landmark anchors, planting zones, navigable polygon and collision footprints).
6. **World factories:** terrain/streets, villas/landmarks, vegetation/details, coast, lighting/atmosphere.
7. **Exploration:** input action map, pointer/touch adapters, movement state machine, terrain sampling, collision/bounds resolution, and camera pose.
8. **Quality/performance:** tier contract, capability selection, optional auto adaptation, metrics overlay, and feature switches.
9. **Tests:** pure state/math tests, Playwright input/lifecycle/responsive/error tests, and controlled visual review captures.

### State machine

Canonical states and permitted intent:

- `booting`: DOM exists; capability/preferences are being read.
- `unsupported`: WebGL2 unavailable; static description/help/retry only.
- `loading`: essential world is loading/building; progress and cancel/error routes visible.
- `onboarding`: essentials ready; Start is focused; scene may render but movement is inactive.
- `exploringLocked`: pointer lock confirmed; mouse-look and movement active.
- `exploringDrag`: drag/touch/keyboard fallback active; cursor remains available.
- `paused`: menu/help/settings open or document unfocused; input cleared.
- `degraded`: the underlying `onboarding`, exploration, or `paused` mode remains usable with procedural substitutions; a persistent concise notice identifies optional failures.
- `contextLost`: loop/input paused; recovery status visible.
- `fatal`: required construction or recovery failed; retry/reload/static description offered.

Events, not optimistic calls, drive transitions. `pointerlockchange` plus `document.pointerLockElement` is authoritative. `pointerlockerror` transitions to an announced fallback. Escape/default unlock returns to `paused`; reacquisition requires a new explicit gesture. Blur, visibility loss, lock exit, orientation change, and focus transfer clear held actions.

Cancel exits `loading` to a visible non-loading projection with Retry and Return actions, aborts owned work, and ignores late completion callbacks. Degradation is an orthogonal condition rather than a dead-end interaction mode: it preserves the current onboarding/exploration/paused intent, camera pose, and available Start/Resume/exploration actions while its notice persists across mode changes.

### Scene composition and scale

Use an approximately 420 m × 360 m navigable vignette with an additional non-walkable coastal/horizon backdrop. Exact dimensions may be calibrated in `C04`, but changes must keep the full grid legible and the five-minute route representative.

- North edge: higher terrain and denser green hill framing.
- Center: principal intersecting roads, villa gardens, a varied canopy, and long vistas.
- South edge: lower terrain, a shore approach, selective beach/sea exposure, and Huashi-inspired anchor.
- Spawn: shaded central-to-southern road intersection, looking obliquely along a tree-framed street rather than directly at a wall or open ocean.
- Required review route: spawn → mixed-villa intersection → ginkgo/maple corridor → uphill grid vista → Princess/Butterfly-inspired anchors → shore/Huashi-inspired vista → return/reset.

Scene data uses metres and world-up `+Y`. The sea plane/backdrop is never collidable. Ground sampling is deterministic from the authored terrain representation. Collision footprints are deliberately simpler than visible architecture and include a small camera radius.

### Asset and licensing policy

The required scene is achievable with:

- Three.js primitives and merged/instanced procedural geometry;
- authored numeric district data;
- small generated color/roughness/noise textures created in-repository or CSS/Canvas-generated at build/runtime;
- shader-free standard materials where possible, with custom shader work limited and documented.

If licensed assets are introduced:

- prefer CC0/public-domain or explicitly commercial-compatible assets;
- store the original source URL, author, exact license, retrieval date, modifications, and destination in `ATTRIBUTION.md`;
- retain license files when required;
- optimize and host locally;
- never make an optional external asset necessary for navigation, scene identity, or recovery;
- reject assets with unclear provenance.

## 6. Component and file design

These are expected final files; chunks identify when each is created or modified.

### Root/toolchain

- `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`: pinned toolchain, scripts, runtime declaration, generated-file exclusions.
- `index.html`: semantic shell, canvas alternative content, overlays, live region, metadata.
- `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`: strict build/test configuration.
- `ATTRIBUTION.md`: source and asset provenance; initially records that required visuals are procedural plus research citations.

### Application and UI

- `src/main.ts` — creates `AppController`, starts once, registers unload disposal.
- `src/app/AppController.ts` — orchestration; symbols `AppController`, `start`, `dispatch`, `dispose`, `rebuildRuntime`.
- `src/app/appState.ts` — `AppState`, `AppEvent`, `reduceAppState`, transition invariants.
- `src/app/config.ts` — immutable camera, movement, world, timing, and feature constants.
- `src/ui/AppUI.ts` — DOM projection, focus restoration, panels, status/live messages.
- `src/ui/styles.css` — full-viewport layout, safe areas, focus, reflow, reduced motion.
- `src/ui/touchControls.ts` — touch control DOM and normalized actions.

### Platform/rendering

- `src/platform/capabilities.ts` — `detectCapabilities`, WebGL2 and input/media feature facts.
- `src/platform/viewport.ts` — `ViewportObserver`, CSS/display/drawing-buffer measurements.
- `src/platform/preferences.ts` — persisted quality and accessibility preferences.
- `src/render/ThreeRuntime.ts` — renderer/camera/scene loop ownership and rebuild/dispose.
- `src/render/ResourceRegistry.ts` — resource ownership/disposal and rebuild recipes.
- `src/render/frameClock.ts` — resume-safe clamped timing.
- `src/render/contextRecovery.ts` — context lost/restored bridge and recovery outcomes.

### World

- `src/world/districtData.ts` — typed roads, parcels, anchors, zones, bounds, route.
- `src/world/types.ts` — `RoadSpec`, `ParcelSpec`, `LandmarkAnchor`, `PlantingZone`, `CollisionFootprint`, `WorldBuildResult`.
- `src/world/createWorld.ts` — composed world factory and required/optional build classification.
- `src/world/terrain/createTerrain.ts` — slope/terrain and height sampling.
- `src/world/streets/createStreetNetwork.ts` — roads, walks, edges, walls/gates, debug helpers.
- `src/world/architecture/villaKit.ts` — procedural architectural vocabulary.
- `src/world/architecture/createVillas.ts` — data-driven villa composition.
- `src/world/architecture/createLandmarks.ts` — three interpretive landmark anchors.
- `src/world/landscape/createVegetation.ts` — instanced species/silhouette groups and tiers.
- `src/world/landscape/createDetails.ts` — restrained garden/street/shore details.
- `src/world/coast/createCoast.ts` — sea, shore, horizon backdrop.
- `src/world/environment/createEnvironment.ts` — light, fog, sky, shadows, exposure.
- `src/world/debug/createWorldDebug.ts` — non-production-default overlays.

### Exploration

- `src/exploration/InputController.ts` — action aggregation and reset rules.
- `src/exploration/PointerLockLook.ts` — lock request/events/raw-input retry.
- `src/exploration/DragLook.ts` — pointer-capture fallback.
- `src/exploration/TouchLook.ts` — touch-look adapter.
- `src/exploration/MovementController.ts` — movement/camera state machine.
- `src/exploration/navigation.ts` — ground sample, bounds/collision resolution, spawn/reset.
- `src/exploration/types.ts` — action, pose, movement, and navigation contracts.

### Loading/quality/diagnostics

- `src/loading/AssetCoordinator.ts` — essential/optional item accounting, LoadingManager bridge, retry/cancel.
- `src/loading/fallbacks.ts` — deterministic procedural/neutral fallback selection.
- `src/quality/qualityTiers.ts` — `QualityTier`, `QualityProfile`, profiles and capability selection.
- `src/quality/QualityController.ts` — persistence and hysteresis-based auto adaptation.
- `src/diagnostics/Metrics.ts` — frame, draw-call, triangle, texture, program, and tier data.

### Tests and review assets

- `tests/unit/**/*.test.ts` — reducer, frame clock, input math, navigation, quality selection, loading classification.
- `tests/browser/**/*.spec.ts` — lifecycle/input/fallback/responsive/error/context scenarios.
- `tests/browser/fixtures.ts` — deterministic flags and browser hooks; no production mock behavior.
- `tests/visual/**/*.spec.ts` — stable route/camera capture scenarios.
- `tests/visual/baselines/` — reviewed reference images, stored only after visual acceptance.

## 7. Data flow

1. HTML provides immediate meaningful content and status before JavaScript completes.
2. `main.ts` constructs `AppController`; `booting` reads capability, reduced-motion, pointer type, viewport, and persisted quality.
3. Failure of WebGL2 detection transitions directly to `unsupported` and leaves the semantic fallback usable.
4. `ThreeRuntime` creates renderer/camera with the selected tier. `AssetCoordinator` builds essential procedural resources first and accounts for any optional local assets.
5. `createWorld` consumes immutable district data and quality profile, returning scene roots, navigation data, rebuild recipes, and optional degradation notices.
6. Successful essentials transition to `onboarding`; Start receives focus. User activation requests pointer lock when suitable or starts drag/touch fallback.
7. Platform input adapters emit normalized actions. `InputController` aggregates them. `MovementController` applies look, normalized movement, ground sampling, collision/bounds resolution, and camera pose.
8. Each animation frame uses a clamped delta, updates only enabled environmental motion, renders, and samples diagnostics. Hidden/context-lost states stop non-essential updates and clear input.
9. UI is projected from application state. Live announcements occur on meaningful state changes only, never per frame.
10. Quality change rebuilds only tier-dependent world/render resources through the registry while retaining app state, camera pose, and settings.
11. Context restoration reconstructs invalid GPU resources from recipes, reapplies tier/environment/camera state, then resumes only after a successful frame; otherwise it enters `fatal` with static fallback/reload.

## 8. Lighting, shadows, fog, and color contract

- Renderer output uses the current Three.js sRGB output color space and a documented linear workflow. Color textures are tagged sRGB; data textures remain non-color.
- Use ACES filmic tone mapping as the selected operator; calibrate exposure against sky, pale stucco, stone, roof tile, foliage, and shaded path references. Do not animate exposure.
- One warm directional morning sun provides cast shadows. A sky/hemisphere or environment fill prevents black shade. Avoid multiple competing shadow-casting lights.
- High/Medium tiers use cascaded-looking coverage through a tightly fitted directional shadow camera rather than actual CSM unless profiling proves it necessary. Low retains cheaper contact/grounding shadows. Shadow map size, distance, vegetation casting, and update frequency are tiered.
- Fog color is coupled to the horizon/sky. Use restrained exponential or scene-calibrated linear fog; near walking surfaces remain clear, horizon transitions remain soft, and no opaque wall forms.
- Sea may use a lightweight animated material. Reflection, SSR, bloom, SSAO, volumetric fog, and heavy post-processing are not required and default to absent.
- Vegetation wind is low-amplitude and reduced/disabled under reduced-motion and Low tier. Fog does not rapidly translate or pulse.

## 9. Responsive, loading, errors, and accessibility contract

### Responsive

- CSS controls canvas display size. Runtime measures `clientWidth/clientHeight`, sets explicit drawing-buffer dimensions, and updates camera aspect/projection.
- Never blindly multiply without a cap. Profiles define render scale and maximum total pixels. Initial target caps: High 8.3 MP, Medium 4.1 MP, Low 2.1 MP; calibration may lower them but must be recorded in the tier table and tested.
- Support 320 px portrait through large desktop, DPR 1–3, 200% browser zoom, orientation changes, and `VisualViewport` changes. No horizontal document scroll. Use safe-area insets for touch UI. Orientation and `VisualViewport` changes re-layout controls inside the actually visible viewport and safe areas, preserve camera position/rotation and the current interaction mode unless the browser reports pointer-lock loss, and clear held input without resetting the route.

### Loading/error

- The HTML loading shell appears immediately and says “Loading Badaguan…” with a meaningful scene description.
- `LoadingManager` progress is labeled as item progress, never byte progress. Unknown totals are indeterminate.
- Essential failure: actionable error, retry, and static description; never endless spinner.
- Optional failure: degraded but recognizable procedural scene plus concise notice.
- WebGL2 unavailable: capability explanation, static description, help/retry; do not construct renderer.
- Context lost: prevent default loss handling where required, pause input/render, announce recovery, rebuild all invalid GPU resources; failure offers reload/static fallback.
- Offline scope is optional runtime-asset or network failure after the application shell has loaded; offline/404/malformed optional assets exercise the same degradation path. Cold-start offline navigation is out of scope and MUST NOT be described or evidenced as supported; no service worker or application-shell cache is required.

### Accessibility

- Start, Retry, Resume, Help, Settings, Reset, quality, and motion controls are native semantic controls with logical Tab order and visible `:focus-visible` treatment.
- Enter/Space activate controls. Escape closes the top panel or releases exploration. Focus returns to the invoking control/menu; no traps.
- Canvas/exploration surface has an accessible name. Canvas fallback and adjacent DOM describe the scene and control alternatives. Do not mark it presentational.
- A polite live region announces loading completion, mode changes, lock denial, degradation, context loss/restoration, and fatal errors once per transition.
- Keyboard movement never steals Tab and does not consume keys from focused form controls. Arrow keys are prevented from scrolling only while exploration has intentional focus.
- Reduced motion disables head bob (not required at all), camera sway, non-essential transitions, rapid wind, and animated atmosphere. Direct user-controlled look/movement remains immediate.
- Touch targets are at least 44 × 44 CSS px, remain usable around safe areas, and have labels available to assistive technology.

## 10. Performance tiers and budgets

Tier identity must not remove the slope, grid, mixed villa silhouettes, road canopy, landmark anchors, or coastal view.

| Feature | Low | Medium | High |
|---|---|---|---|
| Render scale | 0.70–0.85 | 0.85–1.0 | 1.0 |
| Pixel cap | 2.1 MP | 4.1 MP | 8.3 MP |
| Shadow map | 1024 | 2048 | 2048–4096 if measured safe |
| Shadow reach | short route-local | principal streets | full required route |
| Vegetation | reduced instances, aggressive LOD | full identity set, moderate LOD | full set and distance layers |
| Texture ceiling | 1K | 1K/2K selective | 2K selective |
| Anisotropy | 2 | 4 | capability-capped 8 |
| Wind/water | minimal | restrained | restrained enhanced |
| Post-processing | none | none by default | none by default |

Auto tier selects conservatively from renderer capabilities, viewport pixels, memory hints when available, pointer class, and measured frame time. Downshift requires a sustained breach; upshift requires a substantially longer stable interval. Suggested initial hysteresis: downshift after 5 seconds over budget; upshift after 20 seconds comfortably below 70% of budget, with a 30-second cooldown. Tune through `C11` tests, not intuition. Never oscillate rapidly.

Performance acceptance uses a reproducible desktop baseline on the available workstation/browser class: Linux x64, AMD EPYC 9275F (or the recorded execution host if different), headed Chromium at the exact installed version, and the actual graphics renderer/backend reported by the browser. Record whether acceleration is hardware or software rather than assuming unavailable GPU characteristics. Use AC power/no battery throttling, no intentional CPU/network throttling, DPR 1, and the selected tier stated per run. After one complete route warm-up and shader compilation, run the deterministic representative route for five minutes at 1280×720 and 1920×1080. Collect `requestAnimationFrame` frame intervals with `performance.now()`, exclude only the declared warm-up, report sample count plus median/95th/99th-percentile frame time, and record renderer draw calls, triangles, textures, programs, approximate GPU memory method, browser version, viewport, DPR, tier, graphics renderer/backend, acceleration status, and relevant launch flags. Repeat a run when background load invalidates it.

- desktop baseline target: 60 fps, with representative-route 95th-percentile frame time ≤20 ms on the selected tier at both required viewports;
- Playwright viewport/device emulation at 375–390 px portrait/landscape proves responsive layout, safe-area behavior, input paths, DPR/pixel caps, and mode/pose preservation only; it is not evidence of physical-mobile GPU performance, power behavior, or thermals;
- physical-mobile thermal/performance profiling is optional and non-gating unless an actual device is available. If performed, record device/model and SoC, OS/browser versions, power/battery state, DPR, tier, warm-up, five-minute route duration, percentile method, and thermal/downshift observations; never claim mobile thermal acceptance from desktop emulation;
- no single resume delta causes teleportation; first post-resume update is reset/clamped;
- no unbounded DPR/drawing-buffer growth;
- no monotonic growth in renderer texture/program counts over ten rebuild/reset/context simulation cycles;
- establish measured draw-call, triangle, texture-count, and approximate GPU-memory baselines during `C11`; exact limits must be recorded from the desktop baseline and any actual optional device runs rather than fabricated in advance.

## 11. Stable implementation chunks

The checklist wording below is canonical and must be mirrored verbatim in `PROGRESS.md`.

### C01 — Establish the browser application foundation

**Expected files/symbols:** `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `src/main.ts`, `src/ui/styles.css`, initial `ATTRIBUTION.md`; script names `dev`, `build`, `typecheck`, `test:unit`, `test:browser`, `test:visual`.

**Tasks (canonical wording):**

- [ ] Scaffold the Vite + TypeScript + Three.js application, lock dependency versions, and add the repository/toolchain configuration.
- [ ] Create the semantic HTML shell, global responsive CSS, application entry point, and typed module boundaries defined by PLAN.md.
- [ ] Add focused unit, browser, and static-check commands plus the baseline unsupported-JavaScript/canvas description.

**Acceptance:** clean install is reproducible; strict type checking and production build work; page displays meaningful HTML before/without a WebGL scene; only declared dependencies exist; no framework or remote runtime asset is introduced.

**Focused verification:** `npm ci`; `npm run typecheck`; `npm run build`; `npm run dev -- --host 127.0.0.1` then inspect at 320×568 and 1280×720 with JavaScript disabled and enabled.

**Review surface:** dependency necessity/licenses, generated output exclusions, semantic shell, focus styling, initial text, module boundaries. Do not review scene quality yet.

**Suggested commit:** `chore: scaffold the Badaguan Three.js application`

### C02 — Implement lifecycle, capability, and UI state foundations

**Expected files/symbols:** `src/app/AppController.ts`, `src/app/appState.ts`, `src/app/config.ts`, `src/platform/capabilities.ts`, `src/platform/preferences.ts`, `src/ui/AppUI.ts`, `tests/unit/appState.test.ts`, `tests/browser/lifecycle.spec.ts`; `AppState`, `AppEvent`, `reduceAppState`, `AppController`, `detectCapabilities`.

**Tasks (canonical wording):**

- [ ] Implement the explicit application state machine and event-driven transitions for boot, loading, onboarding, exploring, paused, degraded, context-lost, unsupported, and fatal states.
- [ ] Implement the DOM overlay system, live status region, focus management, onboarding/help/settings panels, and deterministic Start/Retry/Resume actions; onboarding identifies Badaguan and visibly explains WASD/arrows, mouse or drag/touch look, and Escape, while locked, unlocked, and pointer-lock-fallback modes have concise visible status.
- [ ] Gate startup on WebGL2 capability and render a useful non-WebGL fallback without constructing the Three.js runtime.

**Acceptance:** every state has a visible, non-blank projection; onboarding identifies Badaguan and visibly explains mouse look, drag/touch fallback, WASD/arrows, and Escape; confirmed lock shows “Press Escape to release”; unlocked and denied/error states visibly name drag + keyboard or touch exploration; Start works by click, Enter, and Space and is focused only when ready; illegal transitions fail safely; retry is deterministic; a forced WebGL2-negative path never constructs the renderer; status announcements are transition-based.

**Focused verification:** `npm run test:unit -- appState`; `npm run test:browser -- lifecycle.spec.ts`; verify the exact visible onboarding/control/locked/unlocked/denied-fallback copy; keyboard-only scenario through Start by Enter and Space, Help, Escape, Retry; forced unsupported capability scenario.

**Review surface:** state/event completeness, focus ownership, DOM semantics, fallback wording, absence of hidden optimistic transitions.

**Suggested commit:** `feat: add application lifecycle and capability states`

### C03 — Build the renderer, camera, resize, and resource lifecycle

**Expected files/symbols:** `src/render/ThreeRuntime.ts`, `src/render/ResourceRegistry.ts`, `src/render/frameClock.ts`, `src/platform/viewport.ts`, `tests/unit/frameClock.test.ts`, `tests/browser/viewport.spec.ts`; `ThreeRuntime`, `ResourceRegistry`, `FrameClock`, `ViewportObserver`.

**Tasks (canonical wording):**

- [ ] Implement renderer creation, linear color workflow, camera defaults, the visibility-aware animation loop, fixed-step-safe frame timing, and lifecycle disposal.
- [ ] Implement CSS-size-driven drawing-buffer resizing, camera projection updates, VisualViewport handling, and explicit DPR/pixel-count caps.
- [ ] Implement shared resource ownership and deterministic scene teardown/rebuild hooks required for quality changes and context restoration.

**Acceptance:** neutral scene renders with correct aspect at every matrix viewport; actual drawing buffer obeys selected pixel cap; hidden/resumed tab has no large delta; repeated create/dispose returns resource counts to baseline; camera begins upright with fixed defaults.

**Focused verification:** `npm run test:unit -- frameClock`; `npm run test:browser -- viewport.spec.ts`; manually resize 320×568 → 1920×1080 at DPR 1 and emulated DPR 3; hide/resume tab; run ten runtime create/dispose cycles through a test hook.

**Review surface:** ownership/disposal, resize arithmetic, color-space settings, camera clipping, animation-loop and visibility behavior.

**Suggested commit:** `feat: establish the Three.js rendering lifecycle`

### C04 — Construct the navigable Badaguan district skeleton

**Expected files/symbols:** `src/world/types.ts`, `src/world/districtData.ts`, `src/world/createWorld.ts`, `src/world/terrain/createTerrain.ts`, `src/world/streets/createStreetNetwork.ts`, `src/world/debug/createWorldDebug.ts`, `src/exploration/navigation.ts`, `tests/unit/districtData.test.ts`, `tests/unit/navigation.test.ts`; ten named `RoadSpec` records, `sampleGroundHeight`, `resolveNavigation`.

**Tasks (canonical wording):**

- [ ] Build the south-low/north-high terrain, ten-road 7-by-3 pass-named street layout, sidewalks/paths, garden parcels, walls/gates, coastal edge, a compact public green/park/open-space zone integrated with the street, garden, and coastal system, and protected sight corridors.
- [ ] Define spawn, walkable surface sampling, navigable bounds, soft collision volumes, reset location, and landmark/route anchors in scene data.
- [ ] Add debug-only navigation and composition overlays that can verify road names, bounds, slopes, parcels, the public green/open-space cue, sightlines, and camera height.

**Acceptance:** data asserts exactly ten unique roads with 7/3 orientation split; north-to-south grade is visible and testable; required route is continuous and visibly integrates a compact public green/open-space cue; spawn and reset are safe; bounds prevent leaving the authored world; debug view exposes every structural claim without shipping enabled by default.

**Focused verification:** `npm run test:unit -- districtData navigation`; browser debug route from spawn through the public green/open-space cue to coast and uphill; boundary push at every edge; ground-height samples across intersections; screenshots of labeled 7×3 grid, public green/open-space integration, and sight corridors.

**Review surface:** scale, route continuity, road count/names, slope, parcels/setbacks, collision simplification, selective coastal exposure. No villa detail review.

**Suggested commit:** `feat: construct the navigable Badaguan district`

### C05 — Create the architectural kit and landmark compositions

**Expected files/symbols:** `src/world/architecture/villaKit.ts`, `src/world/architecture/createVillas.ts`, `src/world/architecture/createLandmarks.ts`, additions to `districtData.ts`, visual route fixtures; `VillaStyle`, `createVilla`, `createVillaDistrict`, `createLandmarks`.

**Tasks (canonical wording):**

- [ ] Build reusable procedural low-rise villa components for German neoclassical, Gothic/castle-like, and Spanish district silhouettes using stone, brick/tile, stucco, and wood materials; keep Nordic/Danish and Mansard/brick-timber components source-bounded to the Princess Villa and Butterfly Villa compositions unless additional provenance is recorded, and disclose any wider use as artistic inference.
- [ ] Compose varied two- and three-story garden villas with authentic setbacks and restrained signage, avoiding uniform style, oversized massing, and dense row façades.
- [ ] Create source-bounded interpretive compositions for Huashi Building, Princess Villa, and Butterfly Villa, and populate Help/About with a concise user-visible statement that district scale and geometry, parcel and landmark adjacency, exact façades, traditional planting cues, and early-autumn weather are artistic interpretations rather than a survey-accurate or current inventory; keep landmark labels out of the primary view unless requested.

**Acceptance:** required route shows at least three unmistakably different district families and all three landmark anchors; Nordic/Danish and Mansard/brick-timber motifs remain landmark-specific unless separately sourced and disclosed; no ordinary villa exceeds three stories; Help/About is keyboard- and touch-reachable and accurately separates sourced facts from artistic inference for compressed geometry/adjacency, façades, traditional-not-current planting, motif reuse, and weather; façades remain readable at Low; repeated meshes share geometry/materials where practical.

**Focused verification:** targeted architecture unit/data assertions; capture front/three-quarter silhouettes in neutral debug light and in route context; verify provenance bounds and the complete visible Help/About disclosure by keyboard and touch; walk every parcel edge for clipping/collision; inspect draw calls before/after instancing/merging.

**Review surface:** silhouette variety, modest scale, material restraint, setbacks, landmark-specific provenance bounds, inference-disclosure accuracy/reachability, collision/visible-geometry mismatch, reuse cost.

**Suggested commit:** `feat: add Badaguan villas and landmark silhouettes`

### C06 — Add road-specific landscape, season, and environmental detail

**Expected files/symbols:** `src/world/landscape/createVegetation.ts`, `src/world/landscape/createDetails.ts`, planting records in `districtData.ts`, landscape data tests; `PlantingZone`, `createVegetation`, `createDetails`, `VegetationLodPolicy`.

**Tasks (canonical wording):**

- [ ] Implement instanced vegetation and LOD-ready planting for the documented road-specific tree traditions, mixing temperate deciduous canopy with selected evergreens.
- [ ] Establish the early-autumn palette with ginkgo/maple color, leaf-litter accents, deep green canopy, garden understory, and restrained coastal wind motion.
- [ ] Add reusable street, garden, and shore details that preserve sightlines and conservation character without invented commercial clutter.

**Acceptance:** all ten roads map to documented primary cues; ginkgo/maple and evergreen corridors are visually distinguishable; canopy frames rather than blocks route/sightlines; Low tier can reduce density without removing road identity; no tropical planting or dominant modern advertising appears.

**Focused verification:** planting data assertions; labeled overhead/debug capture; route captures at each representative corridor; reduced-motion and Low-density comparison; transparent sorting and camera-intersection walk-through.

**Review surface:** botanical cue mapping, autumn restraint, instancing/LOD, sightline preservation, motion amplitude, clutter authenticity.

**Suggested commit:** `feat: landscape Badaguan with seasonal planting`

### C07 — Deliver the coastal lighting and atmosphere

**Expected files/symbols:** `src/world/environment/createEnvironment.ts`, `src/world/coast/createCoast.ts`, environment settings in `config.ts`, visual exposure fixtures; `EnvironmentConfig`, `createEnvironment`, `createCoast`, `applyQualityEnvironment`.

**Tasks (canonical wording):**

- [ ] Implement the early-autumn morning sun/sky/environment setup, soft readable shadows, ambient fill, and contact grounding across architecture, foliage, paths, and terrain.
- [ ] Implement restrained marine haze/fog, selective sea and beach glimpses, and a coastal horizon that preserves near-path legibility and protected views.
- [ ] Tune tone mapping, exposure, output color space, materials, shadow bias, and clipping ranges to avoid crushed shade, blown highlights, acne, flicker, z-fighting, and hard fog bands.

**Acceptance:** spawn, deepest shade, pale façade, foliage, shore, and horizon remain readable; light direction is coherent; sea is selective; no visible shadow acne/peter-panning/flicker on the review route; all tiers preserve grounding; reduced motion minimizes wind/water motion.

**Focused verification:** stable captures at spawn, shade, uphill vista, landmark, and shore in all tiers; luminance/histogram inspection; slow camera pan for shimmer/flicker; near/far and fog-edge walk; reduced-motion comparison.

**Review surface:** time-of-day coherence, exposure/color, fog depth, shadow fit/bias, coast restraint, quality degradation.

**Suggested commit:** `feat: add Badaguan coastal light and atmosphere`

### C08 — Implement desktop free-roam controls and movement safety

**Expected files/symbols:** `src/exploration/types.ts`, `src/exploration/InputController.ts`, `src/exploration/PointerLockLook.ts`, `src/exploration/MovementController.ts`, updates to `navigation.ts` and app state, unit/browser tests; `InputAction`, `InputController`, `PointerLockLook`, `MovementController`.

**Tasks (canonical wording):**

- [ ] Implement the input action map for WASD physical codes, semantic arrow keys, simultaneous key state, normalized diagonal motion, and delta-time-based walking.
- [ ] Implement pointer-lock mouse look driven by confirmed document events, continuous yaw, clamped pitch, ordinary-lock retry after unsupported raw input, and explicit release/reacquire behavior.
- [ ] Implement the movement/camera state machine, ground following, upright camera, bounds/collision resolution, reset action, held-input clearing, and resume-delta clamping.

**Acceptance:** movement distance is frame-rate independent; diagonal speed equals axial speed; pitch never flips and roll stays zero; lock state follows document events; unsupported raw input retries ordinary lock once; denied lock preserves fallback access; camera cannot leave bounds, enter villas, fall through terrain, or run away after lost keyup.

**Focused verification:** `npm run test:unit -- input movement navigation`; Playwright synthetic/document-event tests for lock success/error/unlock; manual real pointer-lock route; 30/60/120 Hz distance comparison; blur/hide/orientation/lock-exit held-key tests; boundary/collision circuit.

**Review surface:** browser privilege semantics, action normalization, time integration, camera math, state clearing, collision jitter and reset.

**Suggested commit:** `feat: add safe desktop free-roam controls`

### C09 — Add input fallbacks, responsive controls, and accessibility

**Expected files/symbols:** `src/exploration/DragLook.ts`, `src/exploration/TouchLook.ts`, `src/ui/touchControls.ts`, updates to `AppUI.ts`/styles/input/preferences, browser accessibility/fallback tests; `DragLook`, `TouchLook`, `TouchControls`.

**Tasks (canonical wording):**

- [ ] Implement click-drag pointer-capture look plus keyboard movement when pointer lock is unavailable or denied, without repeatedly requesting lock.
- [ ] Implement touch drag-look and an accessible on-screen movement control for coarse-pointer/no-keyboard devices, including cancellation, orientation, safe-area, and scroll suppression behavior; orientation and VisualViewport changes re-layout controls within the visible viewport and safe areas, preserve camera pose and the current mode unless the browser emits lock loss, and clear held input without resetting the route.
- [ ] Complete keyboard-only operation, focus return, visible focus, semantic labels, canvas alternative content, status announcements, zoom/reflow behavior, and reduced-motion handling.

**Acceptance:** exploration remains possible after denied/absent pointer lock and denial/error visibly offers drag + keyboard or touch exploration; drag release outside canvas cannot stick; touch supports look plus movement in portrait/landscape; orientation and VisualViewport changes keep controls visible, preserve camera position/rotation and mode except on confirmed lock loss, and clear held input without resetting the route; keyboard-only users can enter, move, open/close UI, reset, and leave; 200% zoom and 320 px width do not hide actions; reduced-motion removes non-essential motion.

**Focused verification:** Playwright fallback/accessibility specs; pointer denial with visible fallback copy then drag+keyboard route; keyboard-only full flow; touch emulation at 375×667 and 390×844 in both orientations; during exploration, rotate and resize/scroll VisualViewport and assert control containment, unchanged camera pose/route, preserved mode unless lock loss is emitted, and cleared held input; cancel/multitouch/safe-area scenarios; reduced-motion emulation; automated accessibility scan plus manual focus-order review.

**Review surface:** gesture conflicts, pointer capture, touch ergonomics, visible fallback and focus/state announcements, orientation/VisualViewport pose-mode preservation, reflow/zoom, alternative description, motion comfort.

**Suggested commit:** `feat: add accessible exploration fallbacks`

### C10 — Make loading, degradation, and GPU recovery resilient

**Expected files/symbols:** `src/loading/AssetCoordinator.ts`, `src/loading/fallbacks.ts`, `src/render/contextRecovery.ts`, app/runtime integration, loading/recovery tests; `AssetCoordinator`, `AssetKind`, `LoadOutcome`, `ContextRecovery`.

**Tasks (canonical wording):**

- [ ] Implement LoadingManager-backed essential/optional asset accounting with honest item progress, indeterminate states, cancellation that exits loading to visible Retry/Return actions and ignores late callbacks, timeout/error classification, and retry.
- [ ] Define and implement procedural-first fallbacks so optional failures preserve the underlying onboarding/exploration/paused mode with a persistent concise degraded notice and recognizable usable scene, while required failures produce an actionable fatal/static alternative.
- [ ] Implement hidden-tab pause/resume and WebGL context-loss/restoration handling that clears input, rebuilds invalid resources, restores scene/camera/settings state, and offers reload/static fallback on recovery failure.

**Acceptance:** no failure leaves an indefinite spinner; item progress is accurately labeled; cancellation during indeterminate or known progress reaches a visible non-loading Retry/Return projection and late callbacks cannot revive it; optional 404/malformed/runtime-network failure after shell load preserves the underlying onboarding/exploration/paused mode, camera pose, controls, and persistent degraded notice; cold-start offline navigation is not claimed as supported; required failure offers retry/static content; hidden tabs pause work; successful context restore keeps pose/settings and has valid resources; failed recovery is actionable.

**Focused verification:** unit loading classification tests; Playwright route interception after shell load for slow, runtime-network loss, optional 404, malformed, timeout, retry, and cancellation during indeterminate and known progress; assert Retry/Return, stale-callback suppression, and optional failure before and during exploration with mode/pose/control preservation; `WEBGL_lose_context` loss/restore scenario; forced rebuild failure; hidden-tab movement and timing scenario. Do not treat cold-start offline navigation as supported.

**Review surface:** required/optional boundary and shell-loaded offline scope, cancel/abort/retry races, stale callbacks, degraded-mode and notice persistence, state restoration completeness, disposal/rebuild leaks, user-facing errors.

**Suggested commit:** `feat: harden loading and WebGL recovery`

### C11 — Implement quality tiers and prove performance budgets

**Expected files/symbols:** `src/quality/qualityTiers.ts`, `src/quality/QualityController.ts`, `src/diagnostics/Metrics.ts`, quality integration throughout factories/runtime/UI, unit/browser profiling scenarios; `QualityTier`, `QualityProfile`, `QualityController`, `Metrics`.

**Tasks (canonical wording):**

- [ ] Implement persistent Low, Medium, High, and Auto quality selection using one centralized tier contract for render scale, pixel cap, shadows, vegetation, textures, anisotropy, animation, water, and post-processing.
- [ ] Implement capability-aware initial tier selection and conservative hysteresis-based Auto adaptation without changing scene identity or camera state.
- [ ] Add debug metrics and execute reproducible desktop route profiling, shader warm-up, hidden-tab, Auto downshift, resource-leak, and highest-density stress checks against PLAN.md budgets; treat viewport/device emulation as layout/input proof only and physical-mobile thermal profiling as optional, non-gating evidence when an actual device is available.

**Acceptance:** one profile controls all expensive features; tier changes preserve pose and identity; pixel caps are exact; Auto does not oscillate; sustained overload downshifts and stable headroom cautiously upshifts; desktop evidence records the §10 environment including actual graphics renderer/backend and acceleration status, warm-up, duration, sample count, percentile method/results, renderer/resource baselines, and invalid-run conditions; emulation is not labeled physical-mobile performance or thermal proof; optional actual-device evidence records every required device field; ten rebuild cycles do not monotonically leak resources.

**Focused verification:** quality selector/unit tests; browser pixel-cap and layout/input assertions across DPR/viewport matrix; run the §10 five-minute desktop protocol at 1280×720 and 1920×1080; use 390×844 emulation only for responsive/input and pixel-cap evidence; synthetic hysteresis clock test; ten tier rebuilds; hidden/resume and stress captures. Use `performance.now()` frame intervals, browser Performance tooling, and renderer metrics, not fps intuition. Run optional physical-mobile thermal profiling only when an actual recorded device is available.

**Review surface:** centralized tier differences, preservation of identity, adaptation stability, desktop measurement reproducibility/validity, bottlenecks, resource counts, accurate emulation limitations, and optional actual-device thermal evidence if supplied.

**Suggested commit:** `perf: add adaptive quality tiers and budgets`

### C12 — Complete behavioral, visual, and production acceptance

**Expected files/symbols:** final `tests/unit`, `tests/browser`, `tests/visual`, reviewed `tests/visual/baselines`, `ATTRIBUTION.md`, production config/content adjustments; named visual routes `spawn`, `grid-uphill`, `mixed-villas`, `autumn-canopy`, `landmarks`, `coast`, `quality-low`.

**Tasks (canonical wording):**

- [ ] Add deterministic unit and browser coverage for lifecycle transitions, input math/state clearing, pointer-lock denial, drag/touch fallback, resize, reduced motion, loading failures, WebGL2 absence, and context recovery.
- [ ] Add stable visual-review routes and reference captures for spawn, uphill grid, mixed villas, road-specific canopy, landmark silhouettes, coastal sightline, atmosphere, and every quality tier.
- [ ] Execute the full production acceptance matrix, audit provenance/licenses and shipped files, remove debug-only production exposure, and record C12 evidence without deferring any canonical task; land any discovered runtime, configuration, performance, content, or production fix separately with an appropriate Conventional Commit type and rerun affected C12 verification before C12's per-chunk clean review.

**Acceptance:** all required contracts in this plan have passing C12 evidence; visible onboarding/control/lock/fallback copy, cancellation/degraded-mode invariants, orientation/VisualViewport pose-mode preservation, inference disclosure, landmark provenance bounds, and public green/open-space integration are observed in browser/visual review; reference captures are human-reviewed for authenticity and artifacts; production bundle contains no debug UI by default, unknown-license assets, remote hotlinks, secrets, or unused heavy dependencies; clean install/build/serve succeeds. C12 canonical completion requires all 36 canonical `C01`–`C12` tasks checked, every C12 acceptance clause evidenced, every C12 focused-verification command/scenario recorded passing, the C12 per-chunk review's latest round clean, and all C12 implementation/fix commits recorded. The five whole-implementation final-review tasks are later gates and are not prerequisites for C12 completion.

**Focused verification:** `npm ci`; `npm run typecheck`; `npm run test:unit`; `npm run test:browser`; `npm run build`; serve `dist` under the configured base path; run visual tests for capture then human-review diffs; execute §12 matrix; inspect built network requests and shipped licenses; verify any C12 finding has its own appropriate commit and affected C12 checks were rerun before C12's per-chunk clean review.

**Review surface:** entire user journey and plan contract, visible onboarding/control/lock/fallback copy, cancellation/degraded-mode invariants, orientation/VisualViewport pose-mode preservation, inference disclosure and landmark provenance, public green/open-space integration, visual coherence, accessibility, reproducible desktop performance evidence and honest mobile-evidence scope, production artifact/provenance, commit boundaries, regression risk. This is C12's per-chunk review: resolve its findings before marking C12 complete; whole-implementation split reviews follow C12 completion.

**Suggested commit:** `test: complete C12 production verification` — C12 acceptance tests, reviewed baselines, provenance records, and C12 evidence only; use separate `fix:`, `feat:`, `perf:`, `build:`, `test:`, or `chore:` commits for discovered changes and rerun affected C12 verification before this commit and C12's clean per-chunk review.

## 12. Final behavioral and visual verification matrix

C12 must record a result for every row.

| Area | Required scenarios |
|---|---|
| Desktop | Chromium at 1280×720 and 1920×1080; Firefox/WebKit smoke where Pointer Lock automation permits; real manual lock in one supported desktop browser; visible locked/unlocked/denied fallback copy |
| Mobile layout/input emulation | 375×667 and 390×844 portrait/landscape, coarse pointer, DPR 2–3, safe areas, orientation during exploration; proves layout/input only, not physical-mobile performance or thermals |
| Responsive | 320 px width, ultrawide desktop, DPR changes, resize during loading, 200% zoom, VisualViewport resize/scroll; preserve camera pose/route and mode unless confirmed lock loss, clear held input, and keep controls within the visible viewport/safe areas |
| Input | WASD, arrows, simultaneous/diagonal, key repeat, lost keyup, blur, hidden tab, focus transfer, Escape, reset, sensitivity if exposed; onboarding visibly identifies Badaguan and explains controls |
| Pointer lock | success with “Press Escape to release,” visible unlocked state, denied/error with visible drag + keyboard or touch fallback, unsupported raw movement then ordinary retry, default Escape unlock, no automatic reacquire, iframe restriction documentation |
| Drag/touch | drag outside/release, pointer cancel, zero/large deltas, touch cancel, multitouch ignored safely, look + movement, no page scroll, orientation/VisualViewport pose-mode preservation |
| Lifecycle | boot/loading/onboarding/each explore mode/paused/degraded/context-lost/unsupported/fatal/retry transitions; cancellation exits loading to Retry/Return and ignores late callbacks; degradation preserves underlying mode/pose/actions and persistent notice |
| Network/assets | slow, optional runtime-network loss after shell load, optional 404, optional malformed, required failure, unknown progress, cancel during known/indeterminate progress, retry, no indefinite spinner; cold-start offline navigation explicitly out of scope |
| GPU | WebGL2 unavailable, context loss, successful restore, failed rebuild, repeated tier/runtime rebuild resource counts |
| Accessibility | keyboard-only, Start by click/Enter/Space, visible focus, logical order, semantic controls/names, live announcements, canvas alternative, Help/About inference disclosure reachable by keyboard/touch, reduced motion, automated scan and manual review |
| Navigation | full required route through the compact public green/open-space cue, every boundary, every landmark collision, slope transitions, spawn/reset, no clipping/fall-through/jitter |
| Visual/authenticity | spawn, uphill grid, mixed district styles, public green/open-space integration, tree corridors, each landmark silhouette with Nordic/Mansard provenance bounds, deepest shade, shore vista, fog horizon, Low/Medium/High; disclosure accurately separates sourced facts from artistic inference |
| Performance | §10 desktop baseline/protocol at both viewports, warm and cold startup observations, shader warm-up, highest-density stress, hidden tab, Auto down/up hysteresis, ten rebuild cycles; mobile emulation is layout/input only; optional non-gating physical-device profiling is labeled with complete device evidence |
| Production | clean install, typecheck, full tests, green production build, base-path serve and static-host behavior; shipped-file, dependency, provenance, and license audit; no secrets, remote hotlinks, unknown-license assets, unused heavy dependencies, unexpected network calls, or debug-only production exposure; shell-loaded optional runtime-network fallback behavior; cold-start offline navigation remains explicitly unsupported and unclaimed |

Visual captures are review aids, not sole truth. Tolerances must accommodate GPU raster differences while still detecting composition, exposure, missing objects, clipped UI, and severe shadow/fog regressions. Deterministic test mode may freeze vegetation/water time and set a fixed camera, but must not replace production scene logic.

## Post-C12 closure-only gate

This closure-only predicate is outside §12 and is not a matrix row or a prerequisite for completing C12 or either individual whole-implementation review stream. After C12 reaches its canonical completion predicate, closure MUST proceed linearly in this order; the complete §12 matrix remains repeatable during final review/re-verification:

1. Run both whole-implementation split reviews: behavioral/engineering and visual authenticity/experience. These five final-review tasks do not participate in C12 completion.
2. For every finding, create a separate appropriately typed Conventional Commit (`fix:`, `feat:`, `perf:`, `build:`, `test:`, or `chore:`), append its evidence to the applicable review history, and re-review. Repeat until both split reviews' latest rounds are clean.
3. After all review fixes, rerun and record the complete required acceptance and verification gates, including every §12 scenario. A fix invalidates earlier affected evidence; closure may use only post-fix evidence from the resulting reviewed state.
4. Only after both latest review rounds are clean and the full rerun passes, create `test: record final Badaguan acceptance evidence`. This commit contains acceptance/evidence changes only and identifies the exact reviewed post-fix state; it cannot precede or be retained across a later final-review fix.
5. Populate the tracker closure reviewer/date and closure decision/evidence with non-pending values that cite the final acceptance/evidence commit and the clean split-review and gate evidence. Then create `chore: close Badaguan implementation tracker` containing that populated closure record.

The closure record cites already-created commits. It MUST NOT require the tracker-closure commit to record its own hash inside itself. Overall completion becomes reachable only after step 5 and becomes non-complete again if a later finding, fix, failed gate, unchecked required item, pending attribution field, or stale pre-fix acceptance artifact appears.

## 13. Risk register and rollback strategy

| Risk | Prevention/detection | Rollback or fallback |
|---|---|---|
| Scene reads as generic Europe | source-linked data, authenticity review route, varied styles/planting | simplify questionable details; retain grid/slope/gardens/coast and source-backed silhouettes |
| Scope expands into exact digital twin | label interpretation, fixed vignette scale, no cadastral claim | remove unsupported precision/labels rather than fabricate |
| Asset licensing blocks release | procedural-first baseline, attribution audit before introduction | remove asset and activate procedural/neutral fallback |
| Too many draw calls/transparent leaves | instancing, shared materials, LOD, opaque/cutout preference, metrics | reduce density/distance by profile without deleting identity cues |
| Shadow cost/acne/flicker | one caster, fitted camera, tiered reach/maps, review pans | shorten shadow reach; disable foliage casting; preserve grounding with cheaper contact treatment |
| Pointer lock denied/inconsistent | event-authoritative state and drag fallback | remain in `exploringDrag`; never loop requests |
| Touch controls obstruct scene | safe-area/reflow tests, minimal labeled controls | switch to compact accessible pad and lower overlay opacity, not remove touch access |
| Context recovery leaks/fails | resource registry/rebuild recipes and repeated tests | enter actionable fatal/static mode; allow reload; never resume invalid scene |
| Auto quality oscillates | sustained windows, cooldown, tests | default to persistent manual tier; disable Auto adaptation while retaining selector |
| Fog hides route/sea becomes constant | fixed review cameras and sightline checks | reduce fog density/sea exposure, keeping coastal cue at authored anchors |
| Procedural kit looks repetitive | seeded variants within bounded style grammar | increase composition/material variants, not unique heavy meshes per villa |
| Visual tests flaky | freeze non-essential time, fixed camera/data seed, perceptual thresholds | use captures for human review and keep behavioral assertions separate |
| Browser/base-path deployment breaks assets | Vite base-path test and local URLs | procedural scene remains usable; correct URL generation before release |

Rollback is dependency-suffix aware. Before any dependent chunk exists, a failed chunk may be reverted to its prior known-good commit. After `Cn` has dependent chunks, restore the last known-good commit before `Cn` (thereby removing `Cn` and the dependent suffix) or revert dependent chunks in strict reverse order before reverting `Cn`; never remove an earlier dependency while retaining commits that depend on it. Redesign only within the failed chunk's declared contract, then rebuild and reverify the suffix in `C01`→`C12` order. Never preserve a failed compatibility shim, and never use later chunks to conceal an earlier chunk's unmet acceptance. During final split review, revert or supersede a failed finding fix before rerunning both reviews and the complete gates; any rollback or later fix invalidates the prior final acceptance/evidence and tracker-closure commits, which must be recreated from the newly reviewed post-fix state.

## 14. Definition of done

The project is complete only when the linear state machine above has reached tracker closure and:

- all 36 canonical tasks across the 12 sequential `C01`–`C12` chunks are checked, every chunk acceptance and focused-verification contract is fully evidenced, every per-chunk latest review round is clean, and every required implementation/fix commit is recorded;
- C12 met its canonical completion predicate before the five whole-implementation final-review tasks began;
- both whole-implementation split reviews are complete and their latest rounds are clean, every resulting finding has a separately typed fix commit, and the complete required gates were rerun successfully after the last such fix;
- mouse/keyboard free movement and view rotation work end to end, with the declared fallbacks;
- the route is bounded, stable, responsive, accessible, and recoverable;
- lighting, shadow, fog, atmosphere, and color satisfy the visual contract across tiers;
- the source-backed Badaguan cues are visible and artistic inference is disclosed;
- loading/network/WebGL2/context errors never produce an unexplained blank or permanent spinner;
- measured desktop performance and resource evidence satisfies the reproducible baseline protocol; viewport/device emulation is claimed only as layout/input proof, and physical-mobile thermal evidence remains optional and non-gating unless an actual device run is recorded;
- production files and licenses are audited and no required work is left unchecked;
- the post-review `test: record final Badaguan acceptance evidence` commit represents the current reviewed post-fix state; and
- closure reviewer/date and closure decision/evidence are populated before `chore: close Badaguan implementation tracker`, without requiring that commit to contain its own hash.

## 15. Optional polish — explicitly not required

The following may be planned only after the required definition of done, in new stable chunks and with explicit approval: ambient audio, day/night or seasonal switching, dynamic weather, gamepad, fullscreen, compass/minimap, accessible landmark hotspots, waypoint travel, save/restore position, cinematic introduction, bloom/SSAO/reflections/volumetric fog, advanced water, or denser landmark detail. None may become a hidden prerequisite, weaken reduced-motion behavior, or alter the required controls and fallbacks.

## 16. Sources

Primary/official and high-quality supporting evidence used by this plan:

1. Qingdao Municipal Government, “八大关风景区 / Badaguan Scenic Area” — location, scale, development, building variety: https://www.qingdao.gov.cn/yfqd/qdwl/cjfw/wyqtsjd/202009/t20200910_521991.shtml
2. Qingdao Municipal Government, “六、八大关建筑群 / Badaguan Architectural Complex” — 7×3 roads, villas, gardens, materials, styles: https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202112/t20211201_3895722.shtml
3. Qingdao Municipal Government, Badaguan–Taipingshan detailed control plan approval — natural character, historic pattern, sight corridors, grid, coastline, greenery/open space: https://www.qingdao.gov.cn/zwgk/zdgk/ghjh/gtkjgh022/202010/t20201016_350088.shtml
4. Qingdao Municipal Government, historic conservation management notice — walls, greenery, façades, restrained advertising; cited as conservation intent because the notice states an older validity period: https://www.qingdao.gov.cn/zwgk/zdgk/fgwj/zcwj/szfgw/2013/qzbf_131/202010/t20201019_497234.shtml
5. China Meteorological Administration, “青岛地理气候特点” — maritime climate, humidity, wind, rain, fog, autumn conditions: https://www.cma.gov.cn/2011xzt/2014zt/20140417/2014041705/201404/t20140417_243735.html
6. Travel China / PRC Ministry of Culture and Tourism, Badaguan article — seasonal planting and landmark cues: https://www.travelchina.org.cn/en/article/bB83l6CBMthE
7. Qingdao Daily, “红瓦绿树、青山碧海” urban fabric — slope, roads, planting traditions, setbacks, silhouettes, coast: https://epaper.qingdaonews.com/html/qdrb/20200901/qdrb1357485.html
8. Qingdao Municipal Cultural Relics Bureau heritage photo page — complex and landmark visual reference: https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202111/t20211129_3882608.shtml
9. Qingdao Seaside Scenic Area supporting description (direct retrieval may have certificate limitations): https://www.qdseaside.cn/mobile/about.asp?id=1
10. Three.js PointerLockControls: https://threejs.org/docs/pages/PointerLockControls.html
11. Three.js responsive rendering manual: https://threejs.org/manual/en/responsive.html
12. Three.js WebGLRenderer: https://threejs.org/docs/pages/WebGLRenderer.html
13. Three.js LoadingManager: https://threejs.org/docs/pages/LoadingManager.html
14. Three.js WebGL2 capability helper: https://threejs.org/docs/pages/WebGL.html
15. MDN Pointer Lock API and request semantics: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API and https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
16. W3C Pointer Lock 2.0: https://w3c.github.io/pointerlock/
17. MDN keyboard access and keyboard event semantics: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard, https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code, https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
18. MDN Canvas fallback, reduced motion, visibility, context loss/restoration, and VisualViewport: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage, https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion, https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API, https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event, https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event, https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
