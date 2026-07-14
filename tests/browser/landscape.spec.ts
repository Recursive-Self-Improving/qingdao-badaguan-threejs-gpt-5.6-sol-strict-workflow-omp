import { expect, test, type Page } from '@playwright/test';
import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import type { LandscapeBuildMetrics, LandscapeCameraView, LandscapeSettings } from '../../src/world/types';
import {
  LANDSCAPE_CLEARANCE_FIXTURES,
  LANDSCAPE_CORRIDOR_POSES,
  LANDSCAPE_ROAD_SPECIES,
} from './fixtures';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';

type LandscapeRuntimeMetrics = LandscapeBuildMetrics & {
  readonly renderInfo: { readonly calls: number; readonly triangles: number };
  readonly currentCameraClearanceIntersections: number;
  readonly cameraViews: readonly LandscapeCameraView[];
  readonly activeFrame: null | {
    readonly viewId: string;
    readonly roadIds: readonly string[];
    readonly clearanceIntersections: number;
    readonly rendererCalls: number;
    readonly rendererTriangles: number;
  };
};

type LandscapeCommand =
  | { readonly action: 'landscape/set-settings'; readonly settings: LandscapeSettings }
  | { readonly action: 'landscape/freeze-time'; readonly time: number }
  | { readonly action: 'landscape/unfreeze' }
  | { readonly action: 'landscape/reset' }
  | { readonly action: 'landscape/frame'; readonly view: string }
  | { readonly action: 'world-debug/set-visible'; readonly visible: boolean }
  | { readonly action: 'world-debug/frame-view'; readonly name: 'planting' }
  | { readonly action: 'world-debug/probe'; readonly x: number; readonly z: number; readonly from?: Readonly<{ x: number; z: number }> };

async function readMetrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function boot(page: Page): Promise<ThreeRuntimeMetrics> {
  await page.addInitScript(() => localStorage.setItem('badaguan.preferences.v1', JSON.stringify({ version: 1, quality: 'high', motion: 'system' })));
  await page.goto(SUPPORTED_URL);
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"landscape"/);
  await expect.poll(async () => (await readMetrics(page)).runtime.renders).toBeGreaterThan(0);
  return readMetrics(page);
}

async function command(page: Page, detail: LandscapeCommand | Readonly<Record<string, unknown>>): Promise<ThreeRuntimeMetrics> {
  return page.evaluate(({ attribute, payload }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload }));
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, { attribute: METRICS_ATTRIBUTE, payload: detail });
}

async function commandSnapshot(
  page: Page,
  detail: LandscapeCommand | Readonly<Record<string, unknown>>,
): Promise<Readonly<{ before: ThreeRuntimeMetrics; after: ThreeRuntimeMetrics }>> {
  return page.evaluate(({ attribute, payload }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    const initial = canvas.getAttribute(attribute);
    if (initial === null) throw new Error(`Missing ${attribute}`);
    const current = JSON.parse(initial) as ThreeRuntimeMetrics;
    document.dispatchEvent(new CustomEvent('three-runtime:command', {
      detail: { action: 'world-debug/set-visible', visible: current.world.debug.visible },
    }));
    const before = canvas.getAttribute(attribute);
    if (before === null) throw new Error(`Missing ${attribute}`);
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload }));
    const after = canvas.getAttribute(attribute);
    if (after === null) throw new Error(`Missing ${attribute}`);
    return {
      before: JSON.parse(before) as ThreeRuntimeMetrics,
      after: JSON.parse(after) as ThreeRuntimeMetrics,
    };
  }, { attribute: METRICS_ATTRIBUTE, payload: detail });
}

function landscape(value: ThreeRuntimeMetrics): LandscapeRuntimeMetrics {
  expect(value.world.landscape).toBeDefined();
  return value.world.landscape as LandscapeRuntimeMetrics;
}

function expectPose(actual: readonly number[], expected: readonly [number, number, number]): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
  expect(actual[2]).toBeCloseTo(expected[2], 6);
}

const expectedIdentities = LANDSCAPE_ROAD_SPECIES.map(({ roadId, speciesId }) => ({ roadId, speciesId }));

test('publishes exact road planting identities, density metrics, opaque sorting, and hidden debug', async ({ page }) => {
  const initial = await boot(page);
  const value = landscape(initial);
  expect(value.settings.density).toBe('high');
  expect(value.identities).toEqual(expectedIdentities);
  expect(value.identities).toHaveLength(10);
  expect(value.cameraViews).toHaveLength(10);
  expect(value.cameraViews.flatMap(({ roadIds }) => roadIds).sort()).toEqual(LANDSCAPE_ROAD_SPECIES.map(({ roadId }) => roadId).sort());
  expect(value.identities.map(({ roadId }) => roadId).sort()).toEqual(LANDSCAPE_ROAD_SPECIES.map(({ roadId }) => roadId).sort());
  expect(value.cameraViews.every(({ clearanceIntersections }) => clearanceIntersections === 0)).toBe(true);
  for (const fixture of LANDSCAPE_CORRIDOR_POSES) {
    expect(value.cameraViews.find(({ id }) => id === fixture.id), fixture.id).toMatchObject({
      id: fixture.id,
      roadIds: fixture.roadIds,
      position: fixture.position,
      target: fixture.target,
      clearanceIntersections: 0,
      ySemantics: 'world',
    });
  }
  expect(value.transparentObjects).toBe(0);
  expect(value.depthWriteDisabled).toBe(0);
  expect(value.active).toEqual(value.densityCounts.high);
  expect(value.active.vegetationInstances).toBeGreaterThan(0);
  expect(value.active.identityInstances).toBeGreaterThanOrEqual(10);
  expect(value.active.detailInstances).toBeGreaterThan(0);
  expect(value.active.drawCalls).toBeGreaterThan(0);
  expect(value.active.triangles).toBeGreaterThan(0);
  expect(value.reuse.estimatedInstancedDrawCalls).toBeLessThan(value.reuse.naiveRepeatedDrawCalls);
  expect(initial.world.debug.visible).toBe(false);
  expect(initial.world.debug.activeView).toBeNull();

  const visible = await command(page, { action: 'world-debug/set-visible', visible: true });
  const planting = await command(page, { action: 'world-debug/frame-view', name: 'planting' });
  expect(visible.world.debug.visible).toBe(true);
  expect(planting.world.debug).toMatchObject({ visible: true, activeView: 'planting', plantingLabelCount: 10 });
});

test('frames all ten literal corridors with exact one-road coverage and zero clearance intersections', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  for (const fixture of LANDSCAPE_CORRIDOR_POSES) {
    const before = await readMetrics(page);
    const after = await command(page, { action: 'landscape/frame', view: fixture.id });
    const value = landscape(after);
    expect(value.activeFrame).toMatchObject({ viewId: fixture.id, roadIds: fixture.roadIds, clearanceIntersections: 0 });
    expect(value.activeFrame?.rendererCalls).toBeGreaterThan(0);
    expect(value.activeFrame?.rendererTriangles).toBeGreaterThan(0);
    expect(after.runtime.renders).toBeGreaterThan(before.runtime.renders);
    expectPose(after.camera.position, fixture.position);
    expect(value.clearanceIntersections).toBe(0);
  }
  expect(LANDSCAPE_CLEARANCE_FIXTURES).toHaveLength(5);
  const publishedViews = landscape(await readMetrics(page)).cameraViews;
  for (const fixture of LANDSCAPE_CLEARANCE_FIXTURES) {
    for (const view of publishedViews) {
      const insideCameraClearance = fixture.position.x >= view.clearanceBounds.minX
        && fixture.position.x <= view.clearanceBounds.maxX
        && fixture.position.z >= view.clearanceBounds.minZ
        && fixture.position.z <= view.clearanceBounds.maxZ;
      expect(insideCameraClearance, `${fixture.id} overlaps ${view.id} camera clearance`).toBe(false);
    }
    let previous = fixture.from;
    const sweepSteps = 5;
    for (let step = 1; step <= sweepSteps; step += 1) {
      const requested = {
        x: fixture.from.x + ((fixture.position.x - fixture.from.x) * step) / sweepSteps,
        z: fixture.from.z + ((fixture.position.z - fixture.from.z) * step) / sweepSteps,
      };
      const probed = await command(page, {
        action: 'world-debug/probe',
        ...requested,
        from: previous,
      });
      expect(probed.world.debug.lastProbe, `${fixture.id} sweep ${step}`).toMatchObject({
        start: previous,
        requested,
        position: requested,
        collided: false,
        clamped: false,
      });
      expect(
        { x: probed.camera.position[0], z: probed.camera.position[2] },
        `${fixture.id} sweep ${step}`,
      ).toEqual(requested);
      expect(landscape(probed).clearanceIntersections, `${fixture.id} sweep ${step}`).toBe(0);
      expect(landscape(probed).currentCameraClearanceIntersections, `${fixture.id} sweep ${step}`).toBe(0);
      previous = requested;
    }
    expect(previous, `${fixture.id} final sweep position`).toEqual(fixture.position);
  }
});

test('explicit Low rebuild preserves camera and identities while lowering positive render work', async ({ page }) => {
  const baseline = await boot(page);
  const high = landscape(baseline);
  const framedFixture = LANDSCAPE_CORRIDOR_POSES[2];
  if (framedFixture === undefined) throw new Error('Missing corridor fixture at index 2');
  const framed = await command(page, { action: 'landscape/frame', view: framedFixture.id });
  const camera = framed.camera;
  const { before: lowBefore, after: lowMetrics } = await commandSnapshot(page, {
    action: 'landscape/set-settings',
    settings: { density: 'low', motion: 'standard' },
  });
  const beforeLow = landscape(lowBefore);
  const low = landscape(lowMetrics);
  expect(low.settings).toEqual({ density: 'low', motion: 'standard' });
  expect(low.motion.amplitude).toBe(0);
  expect(lowMetrics.runtime.rebuilds).toBe(lowBefore.runtime.rebuilds + 1);
  expect(lowMetrics.runtime.renders).toBe(lowBefore.runtime.renders + 1);
  expect(lowMetrics.camera).toEqual(camera);
  expect(low.renderInfo.calls).toBeGreaterThan(0);
  expect(low.renderInfo.triangles).toBeGreaterThan(0);
  const steadyLowFirst = landscape(await command(page, { action: 'landscape/frame', view: framedFixture.id }));
  expect(steadyLowFirst.renderInfo.calls).toBeLessThanOrEqual(beforeLow.renderInfo.calls);
  expect(steadyLowFirst.renderInfo.triangles).toBeLessThan(beforeLow.renderInfo.triangles);
  expect(low.renderInfo.calls).toBeGreaterThanOrEqual(steadyLowFirst.renderInfo.calls);
  expect(low.renderInfo.triangles).toBeGreaterThanOrEqual(steadyLowFirst.renderInfo.triangles);
  const steadyLowSecond = landscape(await command(page, { action: 'landscape/frame', view: framedFixture.id }));
  expect(steadyLowSecond.renderInfo).toEqual(steadyLowFirst.renderInfo);
  expect(low.identities).toEqual(high.identities);
  expect(low.active).toEqual(low.densityCounts.low);
  expect(low.active.identityInstances).toBeGreaterThanOrEqual(10);
  expect(low.active.vegetationInstances).toBeGreaterThan(0);
  expect(low.active.drawCalls).toBeGreaterThan(0);
  expect(low.active.triangles).toBeGreaterThan(0);
  expect(low.active.vegetationInstances).toBeLessThan(high.active.vegetationInstances);
  expect(low.active.detailInstances).toBeLessThan(high.active.detailInstances);
  expect(low.active.drawCalls).toBeLessThan(high.active.drawCalls);
  expect(low.active.triangles).toBeLessThan(high.active.triangles);
});

test('reduced media produces zero motion without changing palette or counts', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const reduced = landscape(await boot(page));
  expect(reduced.settings.motion).toBe('reduced');
  expect(reduced.motion.amplitude).toBe(0);
  expect(reduced.active).toEqual(reduced.densityCounts.high);
  expect(reduced.identities).toEqual(expectedIdentities);
  await context.close();
});

test('freeze is deterministic and malformed landscape commands are inert', async ({ page }) => {
  await boot(page);
  const frozen = landscape(await command(page, { action: 'landscape/freeze-time', time: 7.25 }));
  expect(frozen.motion.time).toBe(7.25);
  const checksum = frozen.motion.transformChecksum;
  await page.waitForTimeout(80);
  expect(landscape(await readMetrics(page)).motion).toMatchObject({ time: 7.25, transformChecksum: checksum });

  for (const malformed of [
    { action: 'landscape/set-settings', settings: { density: 'auto', motion: 'standard' } },
    { action: 'landscape/set-settings', settings: { density: 'low', motion: 'windy' } },
    { action: 'landscape/freeze-time', time: -1 },
    { action: 'landscape/freeze-time', time: 'now' },
    { action: 'landscape/frame', view: 'not-a-corridor' },
  ] as const) {
    const { before, after } = await commandSnapshot(page, malformed);
    expect(after.runtime.rebuilds).toBe(before.runtime.rebuilds);
    expect(after.runtime.renders).toBe(before.runtime.renders);
    expect(after.resources.resources).toBe(before.resources.resources);
    expect(after.resources.references).toBe(before.resources.references);
    expect(after.resources.groups).toBe(before.resources.groups);
    expect(after.resources.disposed).toBe(before.resources.disposed);
    expect(after.camera).toEqual(before.camera);
    expect(landscape(after)).toEqual(landscape(before));
  }
});

test('ten settings rebuilds preserve resources and a single runtime', async ({ page }) => {
  test.setTimeout(90_000);
  const baseline = await boot(page);
  const baseLandscape = landscape(baseline);
  let expectedDisposedDelta = 0;
  for (let cycle = 0; cycle < 10; cycle += 1) {
    expectedDisposedDelta += (await readMetrics(page)).resources.resources;
    await command(page, {
      action: 'landscape/set-settings',
      settings: { density: cycle % 2 === 0 ? 'medium' : 'high', motion: 'standard' },
    });
  }
  const after = await readMetrics(page);
  const value = landscape(after);
  expect(after.runtime.rebuilds - baseline.runtime.rebuilds).toBe(10);
  expect(after.runtime.created - after.runtime.disposed).toBe(1);
  expect(after.resources.resources).toBe(baseline.resources.resources);
  expect(after.resources.references).toBe(baseline.resources.references);
  expect(after.resources.groups).toBe(baseline.resources.groups);
  expect(after.resources.disposed - baseline.resources.disposed).toBe(expectedDisposedDelta);
  expect(value.identities).toEqual(baseLandscape.identities);
  expect(value.densityCounts).toEqual(baseLandscape.densityCounts);
  expect(value.reuse).toEqual(baseLandscape.reuse);
  expect(value.active.vegetationInstances).toBeGreaterThan(0);
  expect(value.active.identityInstances).toBeGreaterThanOrEqual(10);
  expect(value.active.detailInstances).toBeGreaterThan(0);
  expect(value.active.drawCalls).toBeGreaterThan(0);
  expect(value.active.triangles).toBeGreaterThan(0);
  expect(value.transparentObjects).toBe(0);
  expect(value.depthWriteDisabled).toBe(0);
});
