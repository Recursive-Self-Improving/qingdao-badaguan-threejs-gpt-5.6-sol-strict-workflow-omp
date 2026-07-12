import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { ThreeRuntimeMetrics } from '../../src/render/ThreeRuntime';
import {
  FAMILY_CAPTURE_SUBJECT_IDS,
  LANDMARK_CAPTURE_SUBJECT_IDS,
  LOW_PROXY_SUBJECT_IDS,
  ROUTE_CAPTURE_SUBJECT_IDS,
  type ArchitectureView,
} from '../browser/fixtures';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';

async function readMetrics(page: Page): Promise<ThreeRuntimeMetrics> {
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
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"architecture"/);
  await expect.poll(async () => (await readMetrics(page)).runtime.renders).toBeGreaterThan(0);
  await page.evaluate(() => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
      if (element !== canvas && !element.contains(canvas)) element.style.visibility = 'hidden';
    }
  });
}

async function frameAndCapture(
  page: Page,
  testInfo: TestInfo,
  subjectId: string,
  view: ArchitectureView,
  captureName: string,
): Promise<void> {
  const before = await readMetrics(page);
  const after = await page.evaluate(({ attribute, subject, frameView }) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #app-canvas');
    document.dispatchEvent(new CustomEvent('three-runtime:command', {
      detail: { action: 'architecture/frame', subjectId: subject, view: frameView },
    }));
    const serialized = canvas.getAttribute(attribute);
    if (serialized === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(serialized) as ThreeRuntimeMetrics;
  }, { attribute: METRICS_ATTRIBUTE, subject: subjectId, frameView: view });

  expect(after.world.architecture?.activeFrame).toMatchObject({ subjectId, view });
  expect(after.world.architecture?.activeFrame?.rendererCalls).toBeGreaterThan(0);
  expect(after.world.architecture?.activeFrame?.rendererTriangles).toBeGreaterThan(0);
  expect(after.world.architecture?.renderInfo.calls).toBeGreaterThan(0);
  expect(after.world.architecture?.renderInfo.triangles).toBeGreaterThan(0);
  expect(after.runtime.renders).toBeGreaterThan(before.runtime.renders);
  expect(after.camera.position).not.toEqual(before.camera.position);
  expect(after.world.debug.visible).toBe(false);

  const canvas = page.locator('#app-canvas');
  const bounds = await canvas.boundingBox();
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('Missing Playwright viewport');
  expect(viewport).toEqual(view === 'low'
    ? { width: 640, height: 360 }
    : { width: 1280, height: 720 });
  if (bounds === null) throw new Error('Architecture canvas is not visible');
  expect(bounds.width).toBeGreaterThanOrEqual(viewport.width - 40);
  expect(bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.height).toBeGreaterThanOrEqual(viewport.height * 0.5);
  expect(bounds.height).toBeLessThanOrEqual(viewport.height + 40);
  const screenshot = await canvas.screenshot({
    path: `test-results/c05/${testInfo.project.name}-${captureName}-${subjectId}-${view}.png`,
    animations: 'disabled',
  });
  expect(screenshot.byteLength).toBeGreaterThan(1_000);
}

for (const subjectId of FAMILY_CAPTURE_SUBJECT_IDS) {
  for (const view of ['front', 'three-quarter'] as const) {
    test(`family ${subjectId} ${view}`, async ({ page }, testInfo) => {
      await boot(page);
      await frameAndCapture(page, testInfo, subjectId, view, 'family');
    });
  }
}

for (const subjectId of LANDMARK_CAPTURE_SUBJECT_IDS) {
  for (const view of ['front', 'three-quarter'] as const) {
    test(`landmark ${subjectId} ${view}`, async ({ page }, testInfo) => {
      await boot(page);
      await frameAndCapture(page, testInfo, subjectId, view, 'landmark');
    });
  }
}

for (const subjectId of ROUTE_CAPTURE_SUBJECT_IDS) {
  test(`route context ${subjectId}`, async ({ page }, testInfo) => {
    await boot(page);
    await frameAndCapture(page, testInfo, subjectId, 'route', 'route');
  });
}

for (const subjectId of LOW_PROXY_SUBJECT_IDS) {
  test(`low resolution proxy ${subjectId}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page);
    const viewport = page.viewportSize();
    expect(viewport).toEqual({ width: 640, height: 360 });
    await frameAndCapture(page, testInfo, subjectId, 'low', 'low-640x360');
  });
}
