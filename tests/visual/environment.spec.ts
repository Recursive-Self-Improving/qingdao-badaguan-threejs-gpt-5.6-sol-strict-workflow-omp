import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import { C07_ENVIRONMENT_VIEWS } from '../browser/fixtures';

const OUTPUT_DIRECTORY = 'test-results/c07';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';
const MODES = Object.freeze([
  Object.freeze({ id: 'high', density: 'high' as const, motion: 'standard' as const }),
  Object.freeze({ id: 'medium', density: 'medium' as const, motion: 'standard' as const }),
  Object.freeze({ id: 'low', density: 'low' as const, motion: 'standard' as const }),
  Object.freeze({ id: 'reduced', density: 'high' as const, motion: 'reduced' as const }),
]);
const CAPTURE_FILTER = new Set((process.env.C07_VISUAL_FILTER ?? '').split(',').filter(Boolean));

async function metrics(page: Page): Promise<ThreeRuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, METRICS_ATTRIBUTE);
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

async function readability(page: Page, image: Buffer): Promise<Readonly<{ mean: number; darkFraction: number; brightFraction: number }>> {
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
    let total = 0;
    let dark = 0;
    let bright = 0;
    let count = 0;
    for (let y = 0; y < surface.height; y += 8) {
      for (let x = 0; x < surface.width; x += 8) {
        const offset = (y * surface.width + x) * 4;
        const value = 0.2126 * (rgba[offset] ?? 0) + 0.7152 * (rgba[offset + 1] ?? 0) + 0.0722 * (rgba[offset + 2] ?? 0);
        total += value;
        if (value < 12) dark += 1;
        if (value > 248) bright += 1;
        count += 1;
      }
    }
    return { mean: total / count, darkFraction: dark / count, brightFraction: bright / count };
  }, image.toString('base64'));
}

test('captures deterministic C07 five-view quality and reduced-motion matrix', async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  await expect.poll(async () => (await metrics(page)).runtime.renders).toBeGreaterThan(0);
  await page.evaluate(() => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
      if (element !== canvas && !element.contains(canvas)) element.style.visibility = 'hidden';
    }
  });

  const records: unknown[] = [];
  for (const mode of MODES) {
    await command(page, { action: 'landscape/set-settings', settings: { density: mode.density, motion: mode.motion } });
    await command(page, { action: 'landscape/freeze-time', time: 7.25 });
    for (const view of C07_ENVIRONMENT_VIEWS) {
      const captureId = `${mode.id}/${view.id}`;
      if (CAPTURE_FILTER.size !== 0 && !CAPTURE_FILTER.has(captureId)) continue;
      const framed = await command(page, { action: 'environment/frame', view: view.id });
      expect(framed.world.environment?.activeFrame).toMatchObject({ viewId: view.id });
      expect(framed.world.coastEnvironment?.clearanceIntersections).toBe(0);
      if (mode.id === 'reduced') expect(framed.world.coastEnvironment?.waterMotionAmplitude).toBe(0);
      const file = `${OUTPUT_DIRECTORY}/desktop-chromium-${mode.id}-${view.id}.png`;
      const image = await page.locator('#app-canvas').screenshot({ path: file, animations: 'disabled' });
      expect(image.byteLength).toBeGreaterThan(1_000);
      const luminance = await readability(page, image);
      expect(luminance.mean, `${mode.id}/${view.id} mean luminance`).toBeGreaterThan(28);
      expect(luminance.mean, `${mode.id}/${view.id} mean luminance`).toBeLessThan(235);
      expect(luminance.darkFraction, `${mode.id}/${view.id} crushed shade`).toBeLessThan(0.22);
      expect(luminance.brightFraction, `${mode.id}/${view.id} blown highlight`).toBeLessThan(0.18);
      records.push(Object.freeze({
        file,
        mode: mode.id,
        view: view.id,
        camera: framed.camera.position,
        environment: framed.world.environment,
        coast: framed.world.coastEnvironment,
        luminance,
      }));
    }
  }
  expect(records).toHaveLength(CAPTURE_FILTER.size === 0 ? 20 : CAPTURE_FILTER.size);
  await writeFile(
    `${OUTPUT_DIRECTORY}/manifest.json`,
    `${JSON.stringify({ captureTime: 7.25, captures: records }, null, 2)}\n`,
  );
});
