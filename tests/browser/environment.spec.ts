import { expect, test, type Page } from '@playwright/test';

import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import { C07_ENVIRONMENT_VIEWS } from './fixtures';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';

type PixelMetrics = Readonly<{
  mean: number;
  p05: number;
  p95: number;
  darkFraction: number;
  brightFraction: number;
  checksum: number;
}>;

async function metrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function boot(page: Page): Promise<ThreeRuntimeMetrics> {
  await page.goto(SUPPORTED_URL);
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"environment"/);
  await expect.poll(async () => (await metrics(page)).runtime.renders).toBeGreaterThan(0);
  return metrics(page);
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

async function pixels(page: Page): Promise<PixelMetrics> {
  const image = await page.locator('#app-canvas').screenshot({ animations: 'disabled' });
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext('2d');
    if (context === null) throw new Error('Missing 2D capture context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = context.getImageData(0, 0, surface.width, surface.height).data;
    const luminance: number[] = [];
    let checksum = 0x811c9dc5;
    for (let y = 0; y < surface.height; y += 8) {
      for (let x = 0; x < surface.width; x += 8) {
        const offset = (y * surface.width + x) * 4;
        const value = 0.2126 * (rgba[offset] ?? 0) + 0.7152 * (rgba[offset + 1] ?? 0) + 0.0722 * (rgba[offset + 2] ?? 0);
        luminance.push(value);
        checksum ^= Math.round(value * 16);
        checksum = Math.imul(checksum, 0x01000193) >>> 0;
      }
    }
    luminance.sort((a, b) => a - b);
    const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    return {
      mean,
      p05: luminance[Math.floor(luminance.length * 0.05)] ?? 0,
      p95: luminance[Math.floor(luminance.length * 0.95)] ?? 0,
      darkFraction: luminance.filter((value) => value < 12).length / luminance.length,
      brightFraction: luminance.filter((value) => value > 248).length / luminance.length,
      checksum,
    };
  }, image.toString('base64'));
}

test('C07 exposes calibrated fog, soft shadows, coast depth, and deterministic five-view readability', async ({ page }) => {
  test.setTimeout(120_000);
  const initial = await boot(page);
  expect(initial.world.environment).toMatchObject({
    quality: 'high',
    motion: 'standard',
    fogNear: 80,
    fogFar: 380,
    exposure: 1.04,
    shadowMapSize: 2048,
    shadowBias: 0,
    shadowNormalBias: 0.004,
    contactGrounding: true,
    skyGradientRows: 256,
  });
  expect(initial.world.environment?.ambientIntensity).toBeCloseTo(1.1644);
  expect(initial.world.coastEnvironment).toMatchObject({
    quality: 'high',
    motion: 'standard',
    openingCount: 3,
    beachLayers: 1,
    horizonLayers: 1,
    clearanceIntersections: 0,
    horizonFadeStart: 4.5,
    horizonFadeEnd: 220,
    shoreBlendDistance: 12,
    shoreFoamStart: 0.72,
    shoreFoamEnd: 1.12,
    collidable: false,
  });
  expect(initial.world.environment?.cameraViews).toEqual(C07_ENVIRONMENT_VIEWS);
  expect(initial.camera.near).toBeGreaterThan(0);
  expect(initial.camera.far).toBeGreaterThan(initial.world.environment?.fogFar ?? 0);

  await command(page, { action: 'landscape/freeze-time', time: 7.25 });
  const captured = new Map<string, PixelMetrics>();
  for (const view of C07_ENVIRONMENT_VIEWS) {
    const framed = await command(page, { action: 'environment/frame', view: view.id });
    expect(framed.world.environment?.activeFrame).toMatchObject({ viewId: view.id });
    expect(framed.camera.position).toEqual(view.position);
    const value = await pixels(page);
    expect(value.mean, `${view.id} mean luminance`).toBeGreaterThan(28);
    expect(value.mean, `${view.id} mean luminance`).toBeLessThan(235);
    expect(value.p05, `${view.id} deepest readable tone`).toBeGreaterThan(2);
    expect(value.p95, `${view.id} highlight retention`).toBeLessThanOrEqual(255);
    expect(value.darkFraction, `${view.id} crushed shade`).toBeLessThan(0.22);
    expect(value.brightFraction, `${view.id} blown highlight`).toBeLessThan(0.18);
    captured.set(view.id, value);
  }
  expect(captured.get('shore')?.checksum).not.toBe(captured.get('deep-shade')?.checksum);

  await command(page, { action: 'environment/frame', view: 'shore' });
  const stableFirst = await pixels(page);
  await command(page, { action: 'environment/frame', view: 'shore' });
  const stableSecond = await pixels(page);
  expect(stableSecond.checksum).toBe(stableFirst.checksum);

  const panChecksums: number[] = [];
  const panForwardX: number[] = [];
  let previousRenderCount = (await metrics(page)).runtime.renders;
  for (const targetX of [-49, -47, -45, -43, -41]) {
    const probed = await command(page, {
      action: 'environment/probe',
      id: `shore-pan-${targetX}`,
      position: [-120, 6.5, 37],
      target: [targetX, 0.8, 55],
    });
    const frame = probed.world.environment?.activeFrame;
    expect(frame?.viewId).toBe(`shore-pan-${targetX}`);
    expect(probed.runtime.renders).toBeGreaterThan(previousRenderCount);
    previousRenderCount = probed.runtime.renders;
    expect(frame?.forward.every(Number.isFinite)).toBe(true);
    panForwardX.push(frame?.forward[0] ?? Number.NaN);
    const value = await pixels(page);
    expect(value.darkFraction).toBeLessThan(0.22);
    expect(value.brightFraction).toBeLessThan(0.18);
    panChecksums.push(value.checksum);
  }
  for (let index = 1; index < panForwardX.length; index += 1) {
    expect(panForwardX[index]).toBeGreaterThan(panForwardX[index - 1] ?? Number.NEGATIVE_INFINITY);
  }
  expect(panChecksums.at(-1)).not.toBe(panChecksums[0]);

  const depthWalk = [
    { id: 'near-route', position: [0, 4.35, 5], target: [0, 4.1, -42] },
    { id: 'fog-edge-route', position: [0, 3.2, -80], target: [0, 6.5, -210] },
    { id: 'far-route', position: [0, 7.5, -245], target: [0, 4.8, -290] },
  ] as const;
  for (const step of depthWalk) {
    const probed = await command(page, { action: 'environment/probe', ...step });
    expect(probed.world.environment?.activeFrame?.viewId).toBe(step.id);
    const value = await pixels(page);
    expect(value.mean, `${step.id} exposure`).toBeGreaterThan(28);
    expect(value.mean, `${step.id} exposure`).toBeLessThan(235);
    expect(value.darkFraction, `${step.id} hard dark boundary`).toBeLessThan(0.22);
    expect(value.brightFraction, `${step.id} hard bright boundary`).toBeLessThan(0.18);
  }

  const qualityCases = [
    { density: 'medium', motion: 'standard', shadowMapSize: 1024, waterSegments: 4, amplitude: 0.018, fogNear: 90, fogFar: 399, ambientIntensity: 1.2212, exposure: 1.05 },
    { density: 'low', motion: 'standard', shadowMapSize: 512, waterSegments: 1, amplitude: 0, fogNear: 108, fogFar: 437, ambientIntensity: 1.278, exposure: 1.08 },
    { density: 'high', motion: 'reduced', shadowMapSize: 2048, waterSegments: 8, amplitude: 0, fogNear: 80, fogFar: 380, ambientIntensity: 1.1644, exposure: 1.04 },
  ] as const;
  for (const quality of qualityCases) {
    const rebuilt = await command(page, { action: 'landscape/set-settings', settings: { density: quality.density, motion: quality.motion } });
    expect(rebuilt.world.environment).toMatchObject({ quality: quality.density, motion: quality.motion, shadowMapSize: quality.shadowMapSize, fogNear: quality.fogNear, exposure: quality.exposure });
    expect(rebuilt.world.environment?.fogFar).toBeCloseTo(quality.fogFar);
    expect(rebuilt.world.environment?.ambientIntensity).toBeCloseTo(quality.ambientIntensity);
    expect(rebuilt.world.coastEnvironment).toMatchObject({ quality: quality.density, motion: quality.motion, waterSegments: quality.waterSegments, waterMotionAmplitude: quality.amplitude, waterStaticDetailStrength: 0.16, horizonFadeStart: 4.5, horizonFadeEnd: 220, shoreBlendDistance: 12, shoreFoamStart: 0.72, shoreFoamEnd: 1.12 });
    expect(rebuilt.world.coastEnvironment?.clearanceIntersections).toBe(0);
    expect(rebuilt.resources.groups).toBe(1);
    const repeated = await command(page, { action: 'landscape/set-settings', settings: { density: quality.density, motion: quality.motion } });
    expect(repeated.resources).toMatchObject({ resources: rebuilt.resources.resources, references: rebuilt.resources.references, groups: rebuilt.resources.groups });
  }

  await command(page, { action: 'landscape/freeze-time', time: 7.25 });
  const reducedBefore = (await metrics(page)).world.coastEnvironment?.waterTransformChecksum;
  await page.waitForTimeout(100);
  const reducedAfter = (await metrics(page)).world.coastEnvironment?.waterTransformChecksum;
  expect(reducedAfter).toBe(reducedBefore);

  for (const probe of [{ x: 0, z: 35 }, { x: -120, z: 35 }, { x: 120, z: 35 }]) {
    const result = await command(page, { action: 'world-debug/probe', x: probe.x, z: probe.z, from: { x: probe.x, z: 30 } });
    expect(result.world.debug.lastProbe).toMatchObject({ position: probe, collided: false, clamped: false });
  }
});
