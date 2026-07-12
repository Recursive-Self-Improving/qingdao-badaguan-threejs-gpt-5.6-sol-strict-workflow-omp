# Badaguan Three.js Implementation Progress

This file is the executable checklist and status authority for the implementation described by `PLAN.md`. It mirrors exactly 12 sequential chunks and 36 canonical implementation tasks. Canonical task wording is copied verbatim; do not reorder, rename, paraphrase, merge, split, or silently omit it.

## Status vocabulary

Every chunk and review record MUST use exactly one status: `not started`, `in progress`, `blocked`, or `complete`.

A chunk is `complete` only when all three canonical tasks are checked with implementation evidence; every clause of that chunk’s PLAN `Acceptance` is proven in the acceptance evidence; every PLAN `Focused verification` command and scenario has a concrete result in the focused-verification evidence; the declared review surface has received an implementation review; every required implementation and fix commit is recorded; and the latest append-only review round is a dated/reviewer-attributed `clean` result with no new findings. A finding-bearing review result can never close a chunk. Partial work remains unchecked.

## Mandatory resume and sequence protocol

1. Read `PLAN.md` and this file before implementation.
2. Work only on the earliest incomplete chunk. C02–C12 each depend on the immediately preceding chunk being `complete`; no other dependency-ready interpretation exists.
3. Set that chunk to `in progress`, implement and prove its canonical tasks, complete all acceptance and focused-verification evidence, run the declared implementation review, fix and commit every finding, and append re-review rounds until the latest result is `clean`.
4. Record exact commands/manual scenarios, environment/viewport/tier, observed result, artifact path or URL where relevant, and session/date. Compilation or inspection alone is not behavioral or visual proof.
5. Record the required implementation commit(s) and each review-fix commit independently. Set the chunk `complete` only after every completion predicate above is true; only then may the next chunk begin.
6. If the earliest incomplete chunk is blocked, set it to `blocked` and record the blocker, evidence, owner/missing prerequisite, and exact unblock condition. All later chunks remain blocked by sequence; there is no blocked-skip behavior.

## Evidence and review-round convention

- Each task evidence slot records implementation proof for that exact task. Use `pending` until proof exists.
- Acceptance evidence MUST address every semicolon-separated or otherwise distinct PLAN acceptance clause, with no clause inferred from another field.
- Focused-verification evidence MUST record every listed command and manual/browser/visual scenario, its environment, and concrete result.
- Review rounds are append-only. Never overwrite or delete an earlier round. Add rows as needed; each finding-bearing round is followed by a fix/re-review round that records finding IDs, fix evidence, the fix commit, reviewer/date, and either `clean` or the complete new finding IDs.
- `not applicable` is not a tracker-only decision. It requires a committed amendment to `PLAN.md` that removes or changes the obligation, and the amendment commit must be cited here.

---

## C01 — Establish the browser application foundation

- **Status:** `in progress`
- **Session/date:** 2026-07-12
- **Dependencies:** none
- [x] Scaffold the Vite + TypeScript + Three.js application, lock dependency versions, and add the repository/toolchain configuration.
  - **Implementation evidence:** `package.json:1-41` defines the private native-ES-module Vite application, exact `three@0.185.1` runtime dependency, exact TypeScript/Vite/Vitest/Playwright toolchain pins, supported Node `>=24 <25` range, exact `npm@11.16.0` package manager, and fail-closed `devEngines` enforcement for Node `24.18.0` and npm `11.16.0`; `.nvmrc:1` pins Node `24.18.0`; `package-lock.json:1-22` records the synchronized root metadata and the lockfile records resolved/integrity data; `.gitignore:1-39`, `tsconfig.json:1-29`, `vite.config.ts:1-10`, `vitest.config.ts:1-10`, `playwright.config.ts:1-54`, and `ATTRIBUTION.md:3-37` provide generated-file exclusions, strict/build/test configuration, fail-closed unit discovery, owned browser-server configuration, the procedural baseline, nine research citations, and dependency/license/asset provenance.
- [x] Create the semantic HTML shell, global responsive CSS, application entry point, and typed module boundaries defined by PLAN.md.
  - **Implementation evidence:** `index.html:1-80` supplies the semantic document shell, processed stylesheet link, local-only CSP meta policy, metadata, header/About disclosure, main experience, labeled canvas, one status region, controls region, footer, and authoritative noscript content; `src/ui/styles.css:1-309` supplies responsive sizing/layout, visible focus styling with an inset future-canvas ring, direct no-script fallback styling, and status suppression when the parsed noscript block is present; `src/main.ts:1-41` defines the typed shell boundary and bootstrap guards without a JavaScript-only stylesheet import; `src/ui/shellContract.ts:1-64` defines ready/disabled presentations, preserves `#app-status` as the sole polite atomic channel, removes controls live/busy attributes, and removes stale canvas tabindex.
- [x] Add focused unit, browser, and static-check commands plus the baseline unsupported-JavaScript/canvas description.
  - **Implementation evidence:** `package.json:22-28` exposes `test:unit`, `test:browser`, `test:visual`, `typecheck`, `build`, and `dev`; `vitest.config.ts:1-10` defines the Node unit-test environment and fail-closed `tests/unit/**/*.test.ts`/`tests/unit/**/*.spec.ts` globs; `playwright.config.ts:1-54` defines the local web server, strict port ownership, browser projects, and artifact behavior; `tests/unit/shellContract.test.ts:1-72` provides typed ready/disabled shell-contract coverage; and `index.html:36-44,66-76` provides the meaningful canvas alternative and visible JavaScript-disabled Badaguan description.
- **PLAN acceptance contract:** clean install is reproducible; strict type checking and production build work; page displays meaningful HTML before/without a WebGL scene; only declared dependencies exist; no framework or remote runtime asset is introduced.
  - **Acceptance evidence (every clause):** (1) Clean install is reproducible: parent-observed `npm ci` passed under exact Node `24.18.0` and npm `11.16.0`; `.nvmrc:1`, `package.json:6-20` fail-closed `devEngines`, and `package-lock.json:1-22` provide exact runtime/package-manager/root dependency metadata and the lockfile records resolved/integrity data, with the dependency/license/provenance inventory in `ATTRIBUTION.md:7-37`. (2) Strict type checking and production build work: parent-observed `npm run typecheck` passed (`artifact://108`), parent-observed `npm run build` passed (`artifact://109`), and strict/no-emit plus Vite output settings are in `tsconfig.json:2-21` and `vite.config.ts:3-9`. (3) The page displays meaningful HTML before/without a WebGL scene: `index.html:18-76` contains the Badaguan shell, explanatory copy, status, controls, footer, canvas alternative, and noscript description before module execution; parent browser inspection at both required viewports confirmed the enabled ready shell and the disabled styled fallback, including the meaningful canvas alternative remaining in the DOM. (4) Only declared direct dependencies exist: `package.json:30-39` declares only `three` at runtime and the complete exact-pinned dev-tool list, while `package-lock.json` records the reproducible transitive graph and the parent-observed install passed. (5) No framework or remote runtime asset is introduced: the implementation uses native TypeScript/DOM plus Three.js, `index.html:11-14,78` contains a local-only CSP and local module/style references, and `ATTRIBUTION.md:3-23` records no remote runtime assets while documenting nine research URLs as provenance-only citations; parent inspection confirmed the CSP meta is local-only with loopback Vite websocket allowances.
- **PLAN focused verification contract:** `npm ci`; `npm run typecheck`; `npm run build`; `npm run dev -- --host 127.0.0.1` then inspect at 320×568 and 1280×720 with JavaScript disabled and enabled.
  - **Focused-verification evidence (every command/scenario):** (1) `npm ci` — parent-observed pass under Node `24.18.0`/npm `11.16.0`. (2) `npm run typecheck` — parent-observed pass; output captured at `artifact://108`. (3) `npm run build` — parent-observed pass; output captured at `artifact://109`. (4) `npm run dev -- --host 127.0.0.1` — parent started the local loopback Vite server and completed the required browser inspection at `320×568` and `1280×720`. (5) JavaScript enabled at `320×568` — linked CSS applied with computed `html` background `rgb(16, 47, 50)`, one canvas, visible meaningful ready status, exactly one live region, controls without `aria-live` or `aria-busy`, canvas without `tabindex`, and no horizontal or vertical overflow. (6) JavaScript enabled at `1280×720` — the same linked-CSS, one-canvas, ready-status, sole-live-region, controls-cleanup, canvas-focusability, and no-overflow results; CSP meta inspection also confirmed the local-only policy with loopback development websocket allowances. (7) JavaScript disabled at `320×568` — linked CSS still applied with computed `html` background `rgb(16, 47, 50)`, `#app-status` display was `none`, `.no-script` was visible with the authoritative disabled explanation, the meaningful canvas alternative remained in the DOM, and there was no horizontal or vertical overflow. (8) JavaScript disabled at `1280×720` — the same styled fallback passed: status display `none`, visible authoritative `.no-script` explanation, meaningful canvas alternative in the DOM, and no horizontal or vertical overflow.
- **PLAN review surface:** dependency necessity/licenses, generated output exclusions, semantic shell, focus styling, initial text, module boundaries. Do not review scene quality yet.
  - **Implementation-review evidence:** Round 1 packets: `agent://C01DependencyReviewer`, `agent://C01ConfigReviewer`, `agent://C01ShellReviewer`, and `agent://C01AccountingReviewer`; findings DEP-001, CFG-001, CFG-002, UX-001–UX-004, and ACC-001–ACC-003 were reviewed, and the implemented fixes plus parent verification are mapped in the round-1 fix evidence below. The parent-observed toolchain/unit/browser checks passed; independent re-review remains pending.
- **Planned commit boundary:** `chore: scaffold the Badaguan Three.js application`
- **Implementation commit hash(es):** `c52fdbc` (draft; implementation commit), `72f1a12` (review-fix commit).
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | DEP-001, CFG-001, CFG-002, UX-001, UX-002, UX-003, UX-004, ACC-001, ACC-002, ACC-003 | Round 1 review packets: `agent://C01DependencyReviewer`, `agent://C01ConfigReviewer`, `agent://C01ShellReviewer`, and `agent://C01AccountingReviewer`; fix verification: DEP-001 — `.nvmrc:1` is pinned to Node `24.18.0`, `package.json:6-20` adds exact fail-closed Node/npm `devEngines`, and `package-lock.json:1-22` has synchronized root metadata; parent `npm ci` passed under Node `24.18.0`/npm `11.16.0`. CFG-001 — `test:unit` is `vitest run`, `vitest.config.ts:4-9` no longer enables `passWithNoTests`, and the real `tests/unit/shellContract.test.ts` is covered; parent unit verification passed one file/two tests. CFG-002 — `playwright.config.ts:28-32` sets `reuseExistingServer: false` while retaining strict-port local ownership; parent local-dev browser smoke completed at both required viewports. UX-001 — `index.html:14` loads CSS independently of JavaScript, `src/main.ts:1` has no stylesheet side-effect import, the loading copy is `Loading Badaguan…`, and `src/ui/styles.css:215-230` suppresses the boot status when the parsed noscript explanation is present; parent disabled-JavaScript reruns passed at `320×568` and `1280×720` with linked CSS, status hidden, visible authoritative `.no-script`, no overflow, and the canvas alternative in the DOM. UX-002 — `index.html`/`src/ui/shellContract.ts:53-55` leave the canvas without tabindex and remove stale tabindex, while `src/ui/styles.css:158-161` provides an inset future-canvas focus ring; parent enabled-JavaScript inspection confirmed no canvas tabindex at both viewports. UX-003 — `index.html:53-58` and `src/ui/shellContract.ts:56-63` reserve the sole polite atomic channel for `#app-status` and remove controls `aria-live`/`aria-busy`; parent enabled-JavaScript inspection found exactly one live region and clean controls at both viewports. UX-004 — `index.html:11-14` adds a local-only CSP with same-origin resource limits, loopback Vite websocket allowances, `object-src 'none'`, and `base-uri 'none'`; parent inspection confirmed the CSP meta and its local-only/loopback policy. ACC-001 — the current closure roll-up is synchronized to `Overall status: in progress` and `Canonical implementation tasks checked: 3/36`, while `Chunks complete` remains `0/12`. ACC-002 — `ATTRIBUTION.md:7-23` now contains the procedural visual/asset baseline and PLAN §16 research citations 1–9, explicitly stating the URLs are provenance-only and not runtime fetches; read-back confirmed the citations and dependency ledger. ACC-003 — the previously invalidated JavaScript-disabled `320×568` and `1280×720` focused-verification entries were rerun after the CSS/noscript fix and both passed with the styled fallback results recorded above. | `72f1a12` | C01DependencyReviewer; C01ConfigReviewer; C01ShellReviewer; C01AccountingReviewer / 2026-07-12 | DEP-001, CFG-001, CFG-002, UX-001, UX-002, UX-003, UX-004, ACC-001, ACC-002, ACC-003 |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C02 — Implement lifecycle, capability, and UI state foundations

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C01 complete
- [ ] Implement the explicit application state machine and event-driven transitions for boot, loading, onboarding, exploring, paused, degraded, context-lost, unsupported, and fatal states.
  - **Implementation evidence:** pending
- [ ] Implement the DOM overlay system, live status region, focus management, onboarding/help/settings panels, and deterministic Start/Retry/Resume actions; onboarding identifies Badaguan and visibly explains WASD/arrows, mouse or drag/touch look, and Escape, while locked, unlocked, and pointer-lock-fallback modes have concise visible status.
  - **Implementation evidence:** pending
- [ ] Gate startup on WebGL2 capability and render a useful non-WebGL fallback without constructing the Three.js runtime.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** every state has a visible, non-blank projection; onboarding identifies Badaguan and visibly explains mouse look, drag/touch fallback, WASD/arrows, and Escape; confirmed lock shows “Press Escape to release”; unlocked and denied/error states visibly name drag + keyboard or touch exploration; Start works by click, Enter, and Space and is focused only when ready; illegal transitions fail safely; retry is deterministic; a forced WebGL2-negative path never constructs the renderer; status announcements are transition-based.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** `npm run test:unit -- appState`; `npm run test:browser -- lifecycle.spec.ts`; verify the exact visible onboarding/control/locked/unlocked/denied-fallback copy; keyboard-only scenario through Start by Enter and Space, Help, Escape, Retry; forced unsupported capability scenario.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** state/event completeness, focus ownership, DOM semantics, fallback wording, absence of hidden optimistic transitions.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: add application lifecycle and capability states`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C03 — Build the renderer, camera, resize, and resource lifecycle

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C02 complete
- [ ] Implement renderer creation, linear color workflow, camera defaults, the visibility-aware animation loop, fixed-step-safe frame timing, and lifecycle disposal.
  - **Implementation evidence:** pending
- [ ] Implement CSS-size-driven drawing-buffer resizing, camera projection updates, VisualViewport handling, and explicit DPR/pixel-count caps.
  - **Implementation evidence:** pending
- [ ] Implement shared resource ownership and deterministic scene teardown/rebuild hooks required for quality changes and context restoration.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** neutral scene renders with correct aspect at every matrix viewport; actual drawing buffer obeys selected pixel cap; hidden/resumed tab has no large delta; repeated create/dispose returns resource counts to baseline; camera begins upright with fixed defaults.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** `npm run test:unit -- frameClock`; `npm run test:browser -- viewport.spec.ts`; manually resize 320×568 → 1920×1080 at DPR 1 and emulated DPR 3; hide/resume tab; run ten runtime create/dispose cycles through a test hook.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** ownership/disposal, resize arithmetic, color-space settings, camera clipping, animation-loop and visibility behavior.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: establish the Three.js rendering lifecycle`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C04 — Construct the navigable Badaguan district skeleton

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C03 complete
- [ ] Build the south-low/north-high terrain, ten-road 7-by-3 pass-named street layout, sidewalks/paths, garden parcels, walls/gates, coastal edge, a compact public green/park/open-space zone integrated with the street, garden, and coastal system, and protected sight corridors.
  - **Implementation evidence:** pending
- [ ] Define spawn, walkable surface sampling, navigable bounds, soft collision volumes, reset location, and landmark/route anchors in scene data.
  - **Implementation evidence:** pending
- [ ] Add debug-only navigation and composition overlays that can verify road names, bounds, slopes, parcels, the public green/open-space cue, sightlines, and camera height.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** data asserts exactly ten unique roads with 7/3 orientation split; north-to-south grade is visible and testable; required route is continuous and visibly integrates a compact public green/open-space cue; spawn and reset are safe; bounds prevent leaving the authored world; debug view exposes every structural claim without shipping enabled by default.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** `npm run test:unit -- districtData navigation`; browser debug route from spawn through the public green/open-space cue to coast and uphill; boundary push at every edge; ground-height samples across intersections; screenshots of labeled 7×3 grid, public green/open-space integration, and sight corridors.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** scale, route continuity, road count/names, slope, parcels/setbacks, collision simplification, selective coastal exposure. No villa detail review.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: construct the navigable Badaguan district`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C05 — Create the architectural kit and landmark compositions

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C04 complete
- [ ] Build reusable procedural low-rise villa components for German neoclassical, Gothic/castle-like, and Spanish district silhouettes using stone, brick/tile, stucco, and wood materials; keep Nordic/Danish and Mansard/brick-timber components source-bounded to the Princess Villa and Butterfly Villa compositions unless additional provenance is recorded, and disclose any wider use as artistic inference.
  - **Implementation evidence:** pending
- [ ] Compose varied two- and three-story garden villas with authentic setbacks and restrained signage, avoiding uniform style, oversized massing, and dense row façades.
  - **Implementation evidence:** pending
- [ ] Create source-bounded interpretive compositions for Huashi Building, Princess Villa, and Butterfly Villa, and populate Help/About with a concise user-visible statement that district scale and geometry, parcel and landmark adjacency, exact façades, traditional planting cues, and early-autumn weather are artistic interpretations rather than a survey-accurate or current inventory; keep landmark labels out of the primary view unless requested.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** required route shows at least three unmistakably different district families and all three landmark anchors; Nordic/Danish and Mansard/brick-timber motifs remain landmark-specific unless separately sourced and disclosed; no ordinary villa exceeds three stories; Help/About is keyboard- and touch-reachable and accurately separates sourced facts from artistic inference for compressed geometry/adjacency, façades, traditional-not-current planting, motif reuse, and weather; façades remain readable at Low; repeated meshes share geometry/materials where practical.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** targeted architecture unit/data assertions; capture front/three-quarter silhouettes in neutral debug light and in route context; verify provenance bounds and the complete visible Help/About disclosure by keyboard and touch; walk every parcel edge for clipping/collision; inspect draw calls before/after instancing/merging.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** silhouette variety, modest scale, material restraint, setbacks, landmark-specific provenance bounds, inference-disclosure accuracy/reachability, collision/visible-geometry mismatch, reuse cost.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: add Badaguan villas and landmark silhouettes`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C06 — Add road-specific landscape, season, and environmental detail

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C05 complete
- [ ] Implement instanced vegetation and LOD-ready planting for the documented road-specific tree traditions, mixing temperate deciduous canopy with selected evergreens.
  - **Implementation evidence:** pending
- [ ] Establish the early-autumn palette with ginkgo/maple color, leaf-litter accents, deep green canopy, garden understory, and restrained coastal wind motion.
  - **Implementation evidence:** pending
- [ ] Add reusable street, garden, and shore details that preserve sightlines and conservation character without invented commercial clutter.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** all ten roads map to documented primary cues; ginkgo/maple and evergreen corridors are visually distinguishable; canopy frames rather than blocks route/sightlines; Low tier can reduce density without removing road identity; no tropical planting or dominant modern advertising appears.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** planting data assertions; labeled overhead/debug capture; route captures at each representative corridor; reduced-motion and Low-density comparison; transparent sorting and camera-intersection walk-through.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** botanical cue mapping, autumn restraint, instancing/LOD, sightline preservation, motion amplitude, clutter authenticity.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: landscape Badaguan with seasonal planting`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C07 — Deliver the coastal lighting and atmosphere

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C06 complete
- [ ] Implement the early-autumn morning sun/sky/environment setup, soft readable shadows, ambient fill, and contact grounding across architecture, foliage, paths, and terrain.
  - **Implementation evidence:** pending
- [ ] Implement restrained marine haze/fog, selective sea and beach glimpses, and a coastal horizon that preserves near-path legibility and protected views.
  - **Implementation evidence:** pending
- [ ] Tune tone mapping, exposure, output color space, materials, shadow bias, and clipping ranges to avoid crushed shade, blown highlights, acne, flicker, z-fighting, and hard fog bands.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** spawn, deepest shade, pale façade, foliage, shore, and horizon remain readable; light direction is coherent; sea is selective; no visible shadow acne/peter-panning/flicker on the review route; all tiers preserve grounding; reduced motion minimizes wind/water motion.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** stable captures at spawn, shade, uphill vista, landmark, and shore in all tiers; luminance/histogram inspection; slow camera pan for shimmer/flicker; near/far and fog-edge walk; reduced-motion comparison.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** time-of-day coherence, exposure/color, fog depth, shadow fit/bias, coast restraint, quality degradation.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: add Badaguan coastal light and atmosphere`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C08 — Implement desktop free-roam controls and movement safety

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C07 complete
- [ ] Implement the input action map for WASD physical codes, semantic arrow keys, simultaneous key state, normalized diagonal motion, and delta-time-based walking.
  - **Implementation evidence:** pending
- [ ] Implement pointer-lock mouse look driven by confirmed document events, continuous yaw, clamped pitch, ordinary-lock retry after unsupported raw input, and explicit release/reacquire behavior.
  - **Implementation evidence:** pending
- [ ] Implement the movement/camera state machine, ground following, upright camera, bounds/collision resolution, reset action, held-input clearing, and resume-delta clamping.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** movement distance is frame-rate independent; diagonal speed equals axial speed; pitch never flips and roll stays zero; lock state follows document events; unsupported raw input retries ordinary lock once; denied lock preserves fallback access; camera cannot leave bounds, enter villas, fall through terrain, or run away after lost keyup.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** `npm run test:unit -- input movement navigation`; Playwright synthetic/document-event tests for lock success/error/unlock; manual real pointer-lock route; 30/60/120 Hz distance comparison; blur/hide/orientation/lock-exit held-key tests; boundary/collision circuit.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** browser privilege semantics, action normalization, time integration, camera math, state clearing, collision jitter and reset.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: add safe desktop free-roam controls`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C09 — Add input fallbacks, responsive controls, and accessibility

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C08 complete
- [ ] Implement click-drag pointer-capture look plus keyboard movement when pointer lock is unavailable or denied, without repeatedly requesting lock.
  - **Implementation evidence:** pending
- [ ] Implement touch drag-look and an accessible on-screen movement control for coarse-pointer/no-keyboard devices, including cancellation, orientation, safe-area, and scroll suppression behavior; orientation and VisualViewport changes re-layout controls within the visible viewport and safe areas, preserve camera pose and the current mode unless the browser emits lock loss, and clear held input without resetting the route.
  - **Implementation evidence:** pending
- [ ] Complete keyboard-only operation, focus return, visible focus, semantic labels, canvas alternative content, status announcements, zoom/reflow behavior, and reduced-motion handling.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** exploration remains possible after denied/absent pointer lock and denial/error visibly offers drag + keyboard or touch exploration; drag release outside canvas cannot stick; touch supports look plus movement in portrait/landscape; orientation and VisualViewport changes keep controls visible, preserve camera position/rotation and mode except on confirmed lock loss, and clear held input without resetting the route; keyboard-only users can enter, move, open/close UI, reset, and leave; 200% zoom and 320 px width do not hide actions; reduced-motion removes non-essential motion.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** Playwright fallback/accessibility specs; pointer denial with visible fallback copy then drag+keyboard route; keyboard-only full flow; touch emulation at 375×667 and 390×844 in both orientations; during exploration, rotate and resize/scroll VisualViewport and assert control containment, unchanged camera pose/route, preserved mode unless lock loss is emitted, and cleared held input; cancel/multitouch/safe-area scenarios; reduced-motion emulation; automated accessibility scan plus manual focus-order review.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** gesture conflicts, pointer capture, touch ergonomics, visible fallback and focus/state announcements, orientation/VisualViewport pose-mode preservation, reflow/zoom, alternative description, motion comfort.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: add accessible exploration fallbacks`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C10 — Make loading, degradation, and GPU recovery resilient

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C09 complete
- [ ] Implement LoadingManager-backed essential/optional asset accounting with honest item progress, indeterminate states, cancellation that exits loading to visible Retry/Return actions and ignores late callbacks, timeout/error classification, and retry.
  - **Implementation evidence:** pending
- [ ] Define and implement procedural-first fallbacks so optional failures preserve the underlying onboarding/exploration/paused mode with a persistent concise degraded notice and recognizable usable scene, while required failures produce an actionable fatal/static alternative.
  - **Implementation evidence:** pending
- [ ] Implement hidden-tab pause/resume and WebGL context-loss/restoration handling that clears input, rebuilds invalid resources, restores scene/camera/settings state, and offers reload/static fallback on recovery failure.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** no failure leaves an indefinite spinner; item progress is accurately labeled; cancellation during indeterminate or known progress reaches a visible non-loading Retry/Return projection and late callbacks cannot revive it; optional 404/malformed/runtime-network failure after shell load preserves the underlying onboarding/exploration/paused mode, camera pose, controls, and persistent degraded notice; cold-start offline navigation is not claimed as supported; required failure offers retry/static content; hidden tabs pause work; successful context restore keeps pose/settings and has valid resources; failed recovery is actionable.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** unit loading classification tests; Playwright route interception after shell load for slow, runtime-network loss, optional 404, malformed, timeout, retry, and cancellation during indeterminate and known progress; assert Retry/Return, stale-callback suppression, and optional failure before and during exploration with mode/pose/control preservation; `WEBGL_lose_context` loss/restore scenario; forced rebuild failure; hidden-tab movement and timing scenario. Do not treat cold-start offline navigation as supported.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** required/optional boundary and shell-loaded offline scope, cancel/abort/retry races, stale callbacks, degraded-mode and notice persistence, state restoration completeness, disposal/rebuild leaks, user-facing errors.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `feat: harden loading and WebGL recovery`
- **Implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C11 — Implement quality tiers and prove performance budgets

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C10 complete
- [ ] Implement persistent Low, Medium, High, and Auto quality selection using one centralized tier contract for render scale, pixel cap, shadows, vegetation, textures, anisotropy, animation, water, and post-processing.
  - **Implementation evidence:** pending
- [ ] Implement capability-aware initial tier selection and conservative hysteresis-based Auto adaptation without changing scene identity or camera state.
  - **Implementation evidence:** pending
- [ ] Add debug metrics and execute reproducible desktop route profiling, shader warm-up, hidden-tab, Auto downshift, resource-leak, and highest-density stress checks against PLAN.md budgets; treat viewport/device emulation as layout/input proof only and physical-mobile thermal profiling as optional, non-gating evidence when an actual device is available.
  - **Implementation evidence:** pending
- **PLAN acceptance contract:** one profile controls all expensive features; tier changes preserve pose and identity; pixel caps are exact; Auto does not oscillate; sustained overload downshifts and stable headroom cautiously upshifts; desktop evidence records the §10 environment including actual graphics renderer/backend and acceleration status, warm-up, duration, sample count, percentile method/results, renderer/resource baselines, and invalid-run conditions; emulation is not labeled physical-mobile performance or thermal proof; optional actual-device evidence records every required device field; ten rebuild cycles do not monotonically leak resources.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** quality selector/unit tests; browser pixel-cap and layout/input assertions across DPR/viewport matrix; run the §10 five-minute desktop protocol at 1280×720 and 1920×1080; use 390×844 emulation only for responsive/input and pixel-cap evidence; synthetic hysteresis clock test; ten tier rebuilds; hidden/resume and stress captures. Use `performance.now()` frame intervals, browser Performance tooling, and renderer metrics, not fps intuition. Run optional physical-mobile thermal profiling only when an actual recorded device is available.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** centralized tier differences, preservation of identity, adaptation stability, desktop measurement reproducibility/validity, bottlenecks, resource counts, accurate emulation limitations, and optional actual-device thermal evidence if supplied.
  - **Implementation-review evidence:** pending
- **Planned commit boundary:** `perf: add adaptive quality tiers and budgets`
- **Implementation commit hash(es):** pending
- **Required desktop performance environment/protocol evidence:** available workstation/browser class: Linux x64, AMD EPYC 9275F (or recorded execution host if different): pending; headed Chromium exact installed version: pending; actual browser-reported graphics renderer/backend: pending; recorded hardware/software acceleration status (do not assume hardware acceleration): pending; AC/no battery throttling: pending; no intentional CPU/network throttling: pending; DPR 1 and selected tier: pending; one complete route warm-up/shader compilation: pending; deterministic five-minute route at 1280×720 and 1920×1080: pending; `requestAnimationFrame` intervals via `performance.now()`: pending; sample count and median/p95/p99: pending; renderer calls/triangles/textures/programs: pending; approximate GPU-memory method/result: pending; browser, viewport, DPR, tier, graphics backend, acceleration, and launch flags: pending; background-load invalidation check and repeat only when invalidated: pending
- **Optional physical-mobile evidence (non-gating; use `not performed` if unavailable):** device model/SoC: pending; OS/browser versions: pending; power/battery state: pending; DPR/tier: pending; warm-up and five-minute route: pending; percentile method/results: pending; thermal/downshift observations: pending; scope label confirms no emulation-based physical-mobile performance or thermal claim: pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **Blocker:** none
- **Unblock condition:** none
---

## C12 — Complete behavioral, visual, and production acceptance

- **Status:** `not started`
- **Session/date:** pending
- **Dependencies:** C11 complete
- [ ] Add deterministic unit and browser coverage for lifecycle transitions, input math/state clearing, pointer-lock denial, drag/touch fallback, resize, reduced motion, loading failures, WebGL2 absence, and context recovery.
  - **Implementation evidence:** pending
- [ ] Add stable visual-review routes and reference captures for spawn, uphill grid, mixed villas, road-specific canopy, landmark silhouettes, coastal sightline, atmosphere, and every quality tier.
  - **Implementation evidence:** pending
- [ ] Execute the full production acceptance matrix, audit provenance/licenses and shipped files, remove debug-only production exposure, and record C12 evidence without deferring any canonical task; land any discovered runtime, configuration, performance, content, or production fix separately with an appropriate Conventional Commit type and rerun affected C12 verification before C12's per-chunk clean review.
  - **Implementation evidence:** pending
- **Executable §12 Production row (C12 and repeatable review evidence):** clean install, typecheck, full tests, green production build, base-path serve and static-host behavior; shipped-file, dependency, provenance, and license audit; no secrets, remote hotlinks, unknown-license assets, unused heavy dependencies, unexpected network calls, or debug-only production exposure; shell-loaded optional runtime-network fallback behavior; cold-start offline navigation remains explicitly unsupported and unclaimed.
- **PLAN acceptance contract:** all required contracts in this plan have passing C12 evidence; visible onboarding/control/lock/fallback copy, cancellation/degraded-mode invariants, orientation/VisualViewport pose-mode preservation, inference disclosure, landmark provenance bounds, and public green/open-space integration are observed in browser/visual review; reference captures are human-reviewed for authenticity and artifacts; production bundle contains no debug UI by default, unknown-license assets, remote hotlinks, secrets, or unused heavy dependencies; clean install/build/serve succeeds. C12 canonical completion requires all 36 canonical `C01`–`C12` tasks checked, every C12 acceptance clause evidenced, every C12 focused-verification command/scenario recorded passing, the C12 per-chunk review's latest round clean, and all C12 implementation/fix commits recorded. The five whole-implementation final-review tasks are later gates and are not prerequisites for C12 completion.
  - **Acceptance evidence (every clause):** pending
- **PLAN focused verification contract:** `npm ci`; `npm run typecheck`; `npm run test:unit`; `npm run test:browser`; `npm run build`; serve `dist` under the configured base path; run visual tests for capture then human-review diffs; execute every runnable §12 matrix scenario, including the executable Production row above; inspect built network requests, shipped files, dependencies, provenance, and licenses; verify any C12 finding has its own appropriate commit and affected C12 checks were rerun before C12's per-chunk clean review. No C12 matrix evidence depends on either later whole-implementation review stream, the post-review rerun, or closure work.
  - **Focused-verification evidence (every command/scenario):** pending
- **PLAN review surface:** entire user journey and plan contract, visible onboarding/control/lock/fallback copy, cancellation/degraded-mode invariants, orientation/VisualViewport pose-mode preservation, inference disclosure and landmark provenance, public green/open-space integration, visual coherence, accessibility, reproducible desktop performance evidence and honest mobile-evidence scope, production artifact/provenance, commit boundaries, regression risk. This is C12's per-chunk review: resolve its findings before marking C12 complete; whole-implementation split reviews follow C12 completion.
  - **Implementation-review evidence:** pending
- **Planned C12 commit boundary:** `test: complete C12 production verification` — C12 acceptance tests, reviewed baselines, provenance records, and C12 evidence only; use separate `fix:`, `feat:`, `perf:`, `build:`, `test:`, or `chore:` commits for discovered changes and rerun affected C12 verification before this commit and C12's clean per-chunk review.
- **C12 implementation commit hash(es):** pending
- **Append-only implementation review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest review round is clean:** no
- **C12 completion gate:** C12 may become `complete` when C11 is complete; all 36 canonical C01–C12 tasks are checked with implementation evidence; C12 acceptance and focused verification are fully evidenced; C12's implementation review is complete with its latest append-only round clean; and every C12 implementation and per-finding fix commit is recorded. The five final-review tasks below are later obligations and MUST NOT be used as C12 completion predicates.
- **Blocker:** none
- **Unblock condition:** none

---

## Final split review and closure

### Post-C12 closure-only gate

This closure-only predicate is outside §12 and is not a matrix row or a prerequisite for completing C12 or either individual whole-implementation review stream. After C12 reaches its canonical completion predicate, closure MUST proceed linearly in this order; the complete §12 matrix remains repeatable during final review/re-verification: run both whole-implementation split reviews; separately commit every finding with an appropriate Conventional Commit type and rerun affected verification; repeat the applicable reviews until both latest append-only rounds are terminal `clean` after all final-review fix commits; rerun the complete required acceptance and verification gates, including every §12 scenario, against that reviewed post-fix state; create the distinct post-review acceptance/evidence-only commit; populate attributable closure; then commit the populated tracker closure. Overall completion is impossible unless all 36 canonical tasks, all five final-review tasks, every chunk acceptance/focused-verification/review gate, both terminal-clean final split reviews, every required implementation and per-finding fix commit, the post-review re-verification and acceptance/evidence commit, and closure attribution are recorded. An unchecked or pending required item always means the overall status is non-complete. Any later finding, fix, or failed gate invalidates affected evidence and requires affected checks plus the complete post-fix rerun before closure.

### Behavioral and engineering review

- **Status:** `not started`
- [ ] Re-run and record the complete automated and manual behavioral acceptance matrix from `PLAN.md` across required browsers, viewports, input modes, failure paths, and quality tiers.
  - **Evidence:** pending
- [ ] Confirm lifecycle, loading, input, movement safety, accessibility, responsive behavior, recovery, quality adaptation, performance, cleanup/disposal, and production packaging have no unresolved findings.
  - **Evidence:** pending
- **Matrix evidence (every §12 row and scenario):** pending
- **Behavioral review completion gate:** this stream may become `complete` when its two tasks and all applicable runnable §12 behavioral/engineering scenarios are evidenced, every finding has a separately recorded typed fix commit, and its latest append-only round is terminal `clean`. It does not require the visual stream to be complete or the later post-review rerun, acceptance/evidence commit, closure attribution, or tracker-closure commit.
- **Append-only final behavioral review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest re-review is terminal clean after all finding-fix commits:** no
- **Per-finding typed fix commit hash(es):** pending
- **Blocker/unblock condition:** none

### Visual authenticity and experience review

- **Status:** `not started`
- [ ] Review stable captures and live routes for the south-low/north-high ten-road district, low-density mixed villas, garden setbacks, the compact public green/open-space integration, road-specific temperate planting, early-autumn morning light, marine haze, selective coastal views, landmark silhouettes and provenance bounds, conservation character, and quality-tier identity.
  - **Evidence:** pending
- [ ] Confirm free movement and view rotation, readable lighting/shadows, atmosphere, landmark and streetscape authenticity, visual stability, reduced-motion behavior, and absence of the authenticity pitfalls enumerated in `PLAN.md`.
  - **Evidence:** pending
- [ ] Confirm Help/About is keyboard- and touch-reachable and clearly distinguishes sourced facts from inferred scale/geometry, adjacency/façades, traditional-not-current planting, landmark-motif reuse, and early-autumn weather; also review compact public green/open-space integration and landmark-specific Nordic/Mansard provenance.
  - **Evidence:** pending
- **Visual/authenticity matrix evidence (every §12 observation):** pending
- **Visual review completion gate:** this stream may become `complete` when its three tasks and all applicable runnable §12 visual/authenticity observations are evidenced, every finding has a separately recorded typed fix commit, and its latest append-only round is terminal `clean`. It does not require the behavioral stream to be complete or the later post-review rerun, acceptance/evidence commit, closure attribution, or tracker-closure commit.
- **Append-only final visual review and fix/re-review rounds:**

| Round | Finding IDs | Review/fix evidence | Commit | Reviewer/date | Result (`clean` or new finding IDs) |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |

- **Latest re-review is terminal clean after all finding-fix commits:** no
- **Per-finding typed fix commit hash(es):** pending
- **Blocker/unblock condition:** none

### Post-review re-verification and acceptance/evidence commit

This stage begins only when both final split reviews are complete and their latest append-only rounds are terminal `clean` after every finding has a separately recorded `fix:`, `feat:`, `perf:`, `build:`, `test:`, or `chore:` commit. Rerun the complete §12 matrix and every required production acceptance/verification gate against that exact post-fix state. Any new failure returns the affected review stream to `in progress`, requires a separate typed fix commit, and invalidates the evidence and commit fields below until both streams are terminal clean again and full re-verification passes.

- **Full post-review §12 matrix and production re-verification evidence:** pending
- **All required gates pass on the terminal-clean post-fix state:** no
- **Post-review acceptance/evidence commit boundary:** `test: record final Badaguan acceptance evidence` — acceptance/evidence changes only; no product, configuration, performance, content, or production fixes.
- **Post-review acceptance/evidence commit hash:** pending
- **Commit is distinct from C12's commit and newer than every final-review finding-fix commit:** no

### Unchecked-item register (non-complete states only)

This register may document only a non-complete `blocked` or `deferred by explicit user approval` state. It never waives, checks, closes, or makes a required task/review/gate complete. `not applicable` is permitted only after a committed `PLAN.md` amendment changes or removes the obligation; cite that commit and the replacement contract. Overall status MUST remain non-complete while this register contains any still-required unchecked item.

| Item ID | Exact unchecked wording | Classification | Evidence / approval or PLAN amendment commit | Owner | Unblock condition or destination | Acceptance impact |
|---|---|---|---|---|---|---|
| none | none | none | none | none | none | none |

### Closure record

- **Overall status:** `in progress`
- **Canonical implementation tasks checked:** 3/36
- **Final-review tasks checked:** 0/5
- **Chunks complete in strict sequence:** 0/12
- **All 12 acceptance contracts fully evidenced:** no
- **All 12 focused-verification contracts fully evidenced:** no
- **All 12 implementation reviews latest-round clean:** no
- **All required implementation and per-finding fix commits recorded:** no
- **Behavioral final review complete and latest re-review terminal clean after all fix commits:** no
- **Visual final review complete and latest re-review terminal clean after all fix commits:** no
- **Full post-review §12 matrix and production re-verification pass:** no
- **Unchecked-item register:** none
- **Post-review acceptance/evidence-only commit hash, distinct from C12 and newer than every final-review fix commit:** pending
- **Closure reviewer/date (non-pending required):** pending
- **Closure decision and evidence (non-pending required; cite clean review rounds, re-verification, and post-review acceptance/evidence commit):** pending
- **Final tracker-closure commit instruction:** after every preceding closure predicate is non-pending/complete, set `Overall status` to `complete`, populate this closure record, and create `chore: close Badaguan implementation tracker`. Record all prior commit hashes in the closure evidence; do not require this commit to contain its own hash, because repository history is the authority for the tracker-closure commit itself.
