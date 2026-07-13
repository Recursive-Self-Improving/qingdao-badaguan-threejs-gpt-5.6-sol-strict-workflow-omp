import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import type { LandscapeBuildMetrics, LandscapeCameraView, LandscapeSettings } from '../../src/world/types';
import {
  LANDSCAPE_CORRIDOR_POSES,
  LANDSCAPE_OVERHEAD_POSE,
  LANDSCAPE_ROAD_SPECIES,
} from '../browser/fixtures';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';
const OUTPUT_DIRECTORY = 'test-results/c06';

type VisualLandscapeMetrics = LandscapeBuildMetrics & {
  readonly cameraViews: readonly LandscapeCameraView[];
  readonly activeFrame: null | {
    readonly viewId: string;
    readonly roadIds: readonly string[];
    readonly clearanceIntersections: number;
    readonly rendererCalls: number;
    readonly rendererTriangles: number;
  };
};

type CaptureRecord = Readonly<{
  file: string;
  mode: 'overhead' | 'standard' | 'low' | 'reduced';
  view: string;
  roadIds: readonly string[];
  settings: LandscapeSettings;
  captureTime: 7.25;
  motion: LandscapeBuildMetrics['motion'];
  drawCalls: number;
  triangles: number;
  clearanceIntersections: number;
}>;

async function metrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function boot(page: Page): Promise<void> {
  await page.goto(SUPPORTED_URL);
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"landscape"/);
  await expect.poll(async () => (await metrics(page)).runtime.renders).toBeGreaterThan(0);
  await page.evaluate(() => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
      if (element !== canvas && !element.contains(canvas)) element.style.visibility = 'hidden';
    }
  });
}

async function command(page: Page, detail: Readonly<Record<string, unknown>>): Promise<ThreeRuntimeMetrics> {
  return page.evaluate(({ attribute, payload }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: payload }));
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, { attribute: METRICS_ATTRIBUTE, payload: detail });
}

function landscape(value: ThreeRuntimeMetrics): VisualLandscapeMetrics {
  expect(value.world.landscape).toBeDefined();
  return value.world.landscape as VisualLandscapeMetrics;
}

async function capture(
  page: Page,
  mode: CaptureRecord['mode'],
  view: string,
  roadIds: readonly string[],
  records: CaptureRecord[],
): Promise<void> {
  const before = await metrics(page);
  const framed = await command(page, { action: 'landscape/frame', view });
  const value = landscape(framed);
  expect(value.settings.density).toBe(mode === 'low' ? 'low' : 'high');
  expect(value.settings.motion).toBe(mode === 'reduced' ? 'reduced' : 'standard');
  expect(value.activeFrame).toMatchObject({ viewId: view, roadIds, clearanceIntersections: 0 });
  expect(value.activeFrame?.rendererCalls).toBeGreaterThan(0);
  expect(value.activeFrame?.rendererTriangles).toBeGreaterThan(0);
  expect(value.active.drawCalls).toBeGreaterThan(0);
  expect(value.active.triangles).toBeGreaterThan(0);
  expect(value.clearanceIntersections).toBe(0);
  expect(value.transparentObjects).toBe(0);
  expect(value.depthWriteDisabled).toBe(0);
  expect(framed.runtime.renders).toBeGreaterThan(before.runtime.renders);
  if (mode === 'reduced') expect(value.motion.amplitude).toBe(0);

  const file = `${OUTPUT_DIRECTORY}/desktop-chromium-${mode}-${view}.png`;
  const image = await page.locator('#app-canvas').screenshot({ path: file, animations: 'disabled' });
  expect(image.byteLength).toBeGreaterThan(1_000);
  records.push(Object.freeze({
    file,
    mode,
    view,
    roadIds: Object.freeze([...roadIds]),
    settings: Object.freeze({ ...value.settings }),
    captureTime: 7.25,
    motion: Object.freeze({ ...value.motion }),
    drawCalls: value.active.drawCalls,
    triangles: value.active.triangles,
    clearanceIntersections: value.clearanceIntersections,
  }));
}

test('captures the complete C06 overhead and corridor evidence matrix', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await boot(page);
  await command(page, { action: 'landscape/freeze-time', time: 7.25 });

  const records: CaptureRecord[] = [];
  const overheadBefore = await metrics(page);
  const overhead = await command(page, { action: 'world-debug/set-visible', visible: true });
  await command(page, { action: 'world-debug/frame-view', name: 'planting' });
  expect(overhead.world.debug.visible).toBe(true);
  const overheadMetrics = landscape(await metrics(page));
  expect(overheadMetrics.identities).toEqual(LANDSCAPE_ROAD_SPECIES.map(({ roadId, speciesId }) => ({ roadId, speciesId })));
  expect(overheadMetrics.cameraViews).toHaveLength(7);
  expect((await metrics(page)).camera.position).toEqual(LANDSCAPE_OVERHEAD_POSE.position);
  expect((await metrics(page)).runtime.renders).toBeGreaterThan(overheadBefore.runtime.renders);
  const overheadFile = `${OUTPUT_DIRECTORY}/desktop-chromium-overhead-planting.png`;
  const overheadImage = await page.locator('#app-canvas').screenshot({ path: overheadFile, animations: 'disabled' });
  expect(overheadImage.byteLength).toBeGreaterThan(1_000);
  records.push(Object.freeze({
    file: overheadFile,
    mode: 'overhead',
    view: 'planting',
    roadIds: Object.freeze(LANDSCAPE_ROAD_SPECIES.map(({ roadId }) => roadId)),
    settings: Object.freeze({ ...overheadMetrics.settings }),
    captureTime: 7.25,
    motion: Object.freeze({ ...overheadMetrics.motion }),
    drawCalls: overheadMetrics.active.drawCalls,
    triangles: overheadMetrics.active.triangles,
    clearanceIntersections: overheadMetrics.clearanceIntersections,
  }));
  await command(page, { action: 'world-debug/set-visible', visible: false });

  for (const fixture of LANDSCAPE_CORRIDOR_POSES) {
    await capture(page, 'standard', fixture.id, fixture.roadIds, records);
  }

  const high = landscape(await metrics(page));
  await command(page, { action: 'landscape/set-settings', settings: { density: 'low', motion: 'standard' } });
  await command(page, { action: 'landscape/freeze-time', time: 7.25 });
  const low = landscape(await metrics(page));
  expect(low.active.vegetationInstances).toBeLessThan(high.active.vegetationInstances);
  expect(low.active.drawCalls).toBeLessThan(high.active.drawCalls);
  expect(low.active.triangles).toBeLessThan(high.active.triangles);
  for (const fixture of LANDSCAPE_CORRIDOR_POSES) {
    await capture(page, 'low', fixture.id, fixture.roadIds, records);
  }

  await command(page, { action: 'landscape/set-settings', settings: { density: 'high', motion: 'reduced' } });
  await command(page, { action: 'landscape/freeze-time', time: 7.25 });
  const reduced = landscape(await metrics(page));
  expect(reduced.active).toEqual(high.active);
  expect(reduced.identities).toEqual(high.identities);
  expect(reduced.motion.amplitude).toBe(0);
  for (const fixture of LANDSCAPE_CORRIDOR_POSES) {
    await capture(page, 'reduced', fixture.id, fixture.roadIds, records);
  }

  expect(records).toHaveLength(22);
  expect(records.filter(({ mode }) => mode === 'standard')).toHaveLength(7);
  expect(records.filter(({ mode }) => mode === 'low')).toHaveLength(7);
  expect(records.filter(({ mode }) => mode === 'reduced')).toHaveLength(7);
  expect(records.every(({ drawCalls, triangles }) => drawCalls > 0 && triangles > 0)).toBe(true);
  expect(records.every(({ clearanceIntersections }) => clearanceIntersections === 0)).toBe(true);
  expect(records.every(({ captureTime, motion }) => captureTime === 7.25 && motion.time === 7.25)).toBe(true);
  const reducedRecords = records.filter(({ mode }) => mode === 'reduced');
  expect(reducedRecords.every(({ motion }) => motion.amplitude === 0)).toBe(true);
  expect(new Set(reducedRecords.map(({ motion }) => motion.transformChecksum)).size).toBe(1);
  await writeFile(
    `${OUTPUT_DIRECTORY}/manifest.json`,
    `${JSON.stringify({ captureTime: 7.25, captures: records }, null, 2)}\n`,
    'utf8',
  );
});
