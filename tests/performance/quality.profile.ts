import { expect, test, type Browser, type Page } from '@playwright/test';
import os from 'node:os';
import { driveInterpolatedRoute, type RouteDriveResult, type RoutePose } from './routeDriver';

const ROUTE_VIEW_IDS = ['spawn', 'deep-shade', 'uphill-vista', 'landmark', 'shore'] as const;
const AUTO_WARM_MIN_MS = 60_000;
const AUTO_STABLE_MS = 50_000;
const FROZEN_WARM_MS = 60_000;
const SAMPLE_MS = 300_000;

type QualityTier = 'low' | 'medium' | 'high';
interface ProfileSnapshot {
  readonly quality: QualityTier;
  readonly frames: { readonly acceptedSampleCount: number; readonly retainedSampleCount: number; readonly overwrittenSamples: number; readonly measurementDurationMs: number; readonly p95Ms: number; readonly method: string };
  readonly validity: { readonly valid: boolean; readonly reasons: readonly string[] };
  readonly viewport: { readonly bufferPixels: number };
  readonly renderer: { readonly geometries: number; readonly textures: number; readonly programs: number; readonly approximateGpuBytes: number; readonly backend: string; readonly graphicsRenderer: string | null; readonly acceleration: string };
  readonly resources: { readonly resources: number; readonly references: number; readonly groups: number; readonly disposed: number };
  readonly runtime: { readonly cleanupFailures: number; readonly rebuilds: number };
}
interface TierTransition {
  readonly tier: QualityTier;
  readonly elapsedMs: number;
  readonly timestamp: string;
  readonly transitionRevision: number;
  readonly reason: string;
}
interface QualityObservation {
  readonly preference: 'auto' | QualityTier;
  readonly activeTier: QualityTier;
  readonly transitionRevision: number;
  readonly transitionReason: string;
}
type AutoWarmResult = Readonly<{ readonly initialTier: QualityTier; readonly effectiveTier: QualityTier; readonly transitions: readonly TierTransition[]; readonly durationMs: number; readonly stableForMs: number }>;

async function command(page: Page, detail: Readonly<Record<string, unknown>>): Promise<void> {
  await page.evaluate((payload) => document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload })), detail);
}
async function snapshot(page: Page): Promise<ProfileSnapshot> {
  await command(page, { action: 'quality/metrics-snapshot' });
  return page.locator('#app-canvas').evaluate((canvas) => JSON.parse(canvas.getAttribute('data-quality-metrics-snapshot') ?? 'null') as ProfileSnapshot);
}
async function qualityState(page: Page): Promise<QualityObservation> {
  return page.evaluate(() => {
    let observed: QualityObservation | null = null;
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: {
      action: 'quality/state', respond: (state: QualityObservation) => { observed = state; },
    } }));
    if (observed === null) throw new Error('Lightweight quality state observation was unavailable.');
    return observed;
  });
}
async function canonicalViews(page: Page): Promise<readonly RoutePose[]> {
  const views = await page.locator('#app-canvas').evaluate((canvas) => {
    const encoded = canvas.getAttribute('data-three-runtime-metrics');
    if (encoded === null) throw new Error('Missing runtime metrics.');
    const value = JSON.parse(encoded) as { world?: { environment?: { cameraViews?: RoutePose[] } } };
    return value.world?.environment?.cameraViews ?? [];
  });
  if (views.length !== ROUTE_VIEW_IDS.length || views.some((view, index) => view.id !== ROUTE_VIEW_IDS[index])) {
    throw new Error(`Expected canonical route views ${ROUTE_VIEW_IDS.join(', ')}.`);
  }
  return Object.freeze(views.map((view) => Object.freeze(view)));
}
async function postcommitFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function settleTier(page: Page, tier: QualityTier): Promise<ProfileSnapshot> {
  const before = await snapshot(page);
  await command(page, { action: 'quality/set-preference', preference: tier });
  await expect.poll(async () => (await snapshot(page)).runtime.rebuilds).toBeGreaterThan(before.runtime.rebuilds);
  await postcommitFrames(page);
  const settled = await snapshot(page);
  expect(settled.quality).toBe(tier);
  return settled;
}
async function freezeTier(page: Page, tier: QualityTier): Promise<void> {
  await command(page, { action: 'quality/set-preference', preference: tier });
  await expect.poll(async () => (await qualityState(page)).activeTier).toBe(tier);
  await postcommitFrames(page);
}
async function warmAutoUntilStable(
  page: Page,
  views: readonly RoutePose[],
  started: number,
  initial: QualityObservation,
): Promise<AutoWarmResult> {
  const initialTier = initial.activeTier;
  let effectiveTier = initialTier;
  let lastTransitionAt = started;
  let lastRevision = initial.transitionRevision;
  let routeOffsetMs = 0;
  const transitions: TierTransition[] = [{ tier: initialTier, elapsedMs: 0, timestamp: new Date(started).toISOString(), transitionRevision: lastRevision, reason: initial.transitionReason }];
  while (Date.now() - started < AUTO_WARM_MIN_MS || Date.now() - lastTransitionAt < AUTO_STABLE_MS) {
    const route = await driveInterpolatedRoute(page, 1_000, views, routeOffsetMs);
    routeOffsetMs += route.elapsedMs;
    const state = await qualityState(page);
    if (state.transitionRevision !== lastRevision) {
      const observedAt = Date.now();
      if (state.activeTier !== effectiveTier) lastTransitionAt = observedAt;
      effectiveTier = state.activeTier; lastRevision = state.transitionRevision;
      transitions.push({ tier: effectiveTier, elapsedMs: observedAt - started, timestamp: new Date(observedAt).toISOString(), transitionRevision: lastRevision, reason: state.transitionReason });
    }
  }
  return Object.freeze({ initialTier, effectiveTier, transitions: Object.freeze(transitions), durationMs: Date.now() - started, stableForMs: Date.now() - lastTransitionAt });
}
async function environmentEvidence(browser: Browser, page: Page): Promise<Readonly<Record<string, unknown>>> {
  const browserCdp = await browser.newBrowserCDPSession();
  const pageCdp = await page.context().newCDPSession(page);
  await pageCdp.send('Performance.enable');
  const [gpu, performance] = await Promise.all([browserCdp.send('SystemInfo.getInfo'), pageCdp.send('Performance.getMetrics')]);
  await browserCdp.detach(); await pageCdp.detach();
  return Object.freeze({ gpu, performance });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }] as const) {
  test(`headed representative-route profile ${viewport.width}x${viewport.height}`, async ({ page, browser }, testInfo) => {
    test.setTimeout(600_000);
    await page.addInitScript(() => localStorage.removeItem('badaguan.preferences.v1'));
    await page.setViewportSize(viewport);
    await page.goto('/?capability=supported');
    await expect(page.locator('#app-canvas')).toHaveAttribute('data-three-runtime-metrics', /"viewport"/);
    const views = await canonicalViews(page);
    let before: Readonly<Record<string, unknown>> | null = null;
    let after: Readonly<Record<string, unknown>> | null = null;
    let autoWarm: AutoWarmResult | null = null;
    let autoSelectedTier: QualityTier | null = null;
    let measured: ProfileSnapshot | null = null;
    let measurementStartedAt = '';
    let measurementEndedAt = '';
    let frozenWarmRoute: RouteDriveResult | null = null;
    let measuredRoute: RouteDriveResult | null = null;
    let frozenWarmWallMs = 0;
    let measurementWallMs = 0;
    await command(page, { action: 'quality/metrics-stream', enabled: false });
    try {
      const traceStartedAt = Date.now();
      const initialAutoState = await qualityState(page);
      await page.getByTestId('start-button').click();
      before = await environmentEvidence(browser, page);
      autoWarm = await warmAutoUntilStable(page, views, traceStartedAt, initialAutoState);
      expect(autoWarm.stableForMs).toBeGreaterThanOrEqual(AUTO_STABLE_MS);
      autoSelectedTier = autoWarm.effectiveTier;
      await freezeTier(page, autoSelectedTier);
      const frozenWarmStartedAt = Date.now();
      frozenWarmRoute = await driveInterpolatedRoute(page, FROZEN_WARM_MS, views);
      frozenWarmWallMs = Date.now() - frozenWarmStartedAt;
      expect(frozenWarmRoute.elapsedMs).toBeGreaterThanOrEqual(FROZEN_WARM_MS);
      expect(frozenWarmRoute.frameCount).toBeGreaterThan(1);
      expect(frozenWarmWallMs).toBeGreaterThanOrEqual(FROZEN_WARM_MS);
      await postcommitFrames(page);
      await command(page, { action: 'quality/metrics-reset' });
      measurementStartedAt = new Date().toISOString();
      const measurementWallStartedAt = Date.now();
      measuredRoute = await driveInterpolatedRoute(page, SAMPLE_MS, views);
      measurementWallMs = Date.now() - measurementWallStartedAt;
      expect(measuredRoute.elapsedMs).toBeGreaterThanOrEqual(SAMPLE_MS);
      expect(measuredRoute.frameCount).toBeGreaterThan(1);
      expect(measurementWallMs).toBeGreaterThanOrEqual(SAMPLE_MS);
      measurementEndedAt = new Date().toISOString();
      measured = await snapshot(page);
      after = await environmentEvidence(browser, page);
    } finally {
      await command(page, { action: 'quality/metrics-stream', enabled: true });
    }
    if (before === null || after === null || autoWarm === null || autoSelectedTier === null || measured === null || frozenWarmRoute === null || measuredRoute === null) throw new Error('Representative measurement did not complete.');
    const result = {
      environment: {
        recordedAt: new Date().toISOString(), browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent),
        host: { platform: os.platform(), release: os.release(), architecture: os.arch(), cpus: os.cpus().map(({ model, speed }) => ({ model, speed })) },
        before, after, launchFlags: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
        powerState: 'not-observed', throttling: 'No intentional CPU or network throttling', viewport,
        devicePixelRatio: await page.evaluate(() => devicePixelRatio), requestedPreference: 'auto', initialAutoTier: autoWarm.initialTier,
        autoSelectedTier, autoTierTrace: autoWarm.transitions, autoWarmDurationMs: autoWarm.durationMs,
        autoStabilityHorizonMs: AUTO_STABLE_MS, autoStableForMs: autoWarm.stableForMs,
        measuredTier: measured.quality, frozenForMeasurement: true, frozenWarmMs: FROZEN_WARM_MS, frozenWarmWallMs, frozenWarmRoute,
        measurementStartedAt, measurementEndedAt, sampleMs: SAMPLE_MS, measurementWallMs, measuredRoute, routeViewIds: ROUTE_VIEW_IDS,
        routeMotion: 'continuous-rAF-linear-interpolation-first-rAF-origin', metricsStreamingDuringMeasurement: false,
        percentileMethod: 'nearest-rank', physicalMobile: 'not performed', mobileEmulationScope: '390x844 is layout/input/DPR-cap evidence only',
      },
      snapshot: measured,
    };
    const encoded = JSON.stringify(result, null, 2);
    console.log(encoded);
    await testInfo.attach(`quality-profile-${viewport.width}x${viewport.height}.json`, { body: encoded, contentType: 'application/json' });
    expect(measured.validity).toEqual({ valid: true, reasons: [] });
    expect(measured.frames.measurementDurationMs).toBeGreaterThanOrEqual(SAMPLE_MS);
    expect(measured.frames.retainedSampleCount).toBe(measured.frames.acceptedSampleCount);
    expect(measured.frames.overwrittenSamples).toBe(0);
    expect(measured.frames.p95Ms).toBeLessThanOrEqual(20);
    expect(measured.frames.method).toBe('nearest-rank');
    expect(measured.quality).toBe(autoSelectedTier);
    expect(measured.viewport.bufferPixels).toBeLessThanOrEqual(autoSelectedTier === 'low' ? 2_100_000 : autoSelectedTier === 'medium' ? 4_100_000 : 8_300_000);
    expect(measured.renderer).toMatchObject({ backend: 'webgl2' });
    expect(['hardware', 'software', 'unknown']).toContain(measured.renderer.acceleration);
  });
}

test('headed High stress and ten warmed rebuild cycles remain resource-stable', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/?capability=supported');
  await expect(page.locator('#app-canvas')).toHaveAttribute('data-three-runtime-metrics', /"viewport"/);
  const tiers = ['low', 'medium', 'high'] as const;
  const baseline = new Map<QualityTier, ProfileSnapshot>();
  const series: ProfileSnapshot[] = [];
  await command(page, { action: 'quality/metrics-stream', enabled: false });
  try {
    for (const tier of tiers) await settleTier(page, tier);
    for (const tier of tiers) baseline.set(tier, await settleTier(page, tier));
    let previousDisposed = Math.max(...tiers.map((tier) => baseline.get(tier)?.resources.disposed ?? 0));
    for (let cycle = 0; cycle < 10; cycle += 1) {
      for (const tier of tiers) {
        const current = await settleTier(page, tier); const expected = baseline.get(tier);
        if (expected === undefined) throw new Error(`Missing warmed ${tier} baseline.`);
        expect(current.validity).toEqual({ valid: true, reasons: [] });
        expect(current.runtime.cleanupFailures).toBe(0);
        expect({ resources: current.resources.resources, references: current.resources.references, groups: current.resources.groups })
          .toEqual({ resources: expected.resources.resources, references: expected.resources.references, groups: expected.resources.groups });
        expect(current.resources.disposed).toBeGreaterThanOrEqual(previousDisposed);
        previousDisposed = current.resources.disposed;
        expect(current.renderer.textures).toBe(expected.renderer.textures);
        expect(current.renderer.programs).toBe(expected.renderer.programs);
        expect(current.renderer.geometries).toBe(expected.renderer.geometries);
        expect(current.renderer.approximateGpuBytes).toBe(expected.renderer.approximateGpuBytes);
        series.push(current);
      }
    }
  } finally {
    await command(page, { action: 'quality/metrics-stream', enabled: true });
  }
  const textureCounts = series.map(({ renderer }) => renderer.textures);
  const programCounts = series.map(({ renderer }) => renderer.programs);
  expect(textureCounts.some((value, index) => index > 0 && value <= textureCounts[index - 1]!)).toBe(true);
  expect(programCounts.some((value, index) => index > 0 && value <= programCounts[index - 1]!)).toBe(true);
  const encoded = JSON.stringify({ stress: { viewport: '1920x1080', tier: 'high', representativeAcceptanceSubstitute: false, warmPasses: 2, measuredSweeps: 10, metricsStreaming: false }, baselines: Object.fromEntries(baseline), resourceSeries: series }, null, 2);
  console.log(encoded);
  await testInfo.attach('quality-stress-resource-series.json', { body: encoded, contentType: 'application/json' });
});
