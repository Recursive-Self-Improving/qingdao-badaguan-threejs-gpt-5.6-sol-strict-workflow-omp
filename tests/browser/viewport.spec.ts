import { expect, test, type CDPSession, type Page } from '@playwright/test';

const SUPPORTED_URL = '/?capability=supported';
const METRICS_ATTRIBUTE = 'data-three-runtime-metrics';
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_DRAWING_BUFFER_PIXELS = 4_100_000;

interface RuntimeMetrics {
  viewport: {
    cssWidth: number;
    cssHeight: number;
    pixelRatio: number;
    bufferWidth: number;
    bufferHeight: number;
  };
  camera: {
    aspect: number;
    fov: number;
    near: number;
    far: number;
    position: [number, number, number];
    up: [number, number, number];
  };
  frame: {
    deltaSeconds: number;
    elapsedSeconds: number;
    frameCount: number;
    running: boolean;
    visible: boolean;
  };
  resources: {
    resources: number;
    references: number;
    groups: number;
    disposed: number;
  };
  runtime: {
    created: number;
    disposed: number;
    rebuilds: number;
    renders: number;
  };
}

async function metrics(page: Page): Promise<RuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas, attribute) => {
    const value = canvas.getAttribute(attribute);
    if (value === null) throw new Error(`Missing ${attribute}`);
    return JSON.parse(value) as RuntimeMetrics;
  }, METRICS_ATTRIBUTE);
}

async function waitForMetrics(page: Page): Promise<RuntimeMetrics> {
  await expect(page.locator('#app-canvas')).toHaveAttribute(METRICS_ATTRIBUTE, /"viewport"/);
  await expect.poll(async () => (await metrics(page)).runtime.renders).toBeGreaterThan(0);
  return metrics(page);
}

async function setDeviceMetrics(
  session: CDPSession,
  width: number,
  height: number,
  deviceScaleFactor: number,
): Promise<void> {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
}

function expectCappedBuffer(value: RuntimeMetrics): void {
  expect(value.viewport.pixelRatio).toBeLessThanOrEqual(MAX_DEVICE_PIXEL_RATIO);
  expect(value.viewport.bufferWidth * value.viewport.bufferHeight).toBeLessThanOrEqual(
    MAX_DRAWING_BUFFER_PIXELS,
  );
}

for (const size of [
  { width: 320, height: 568 },
  { width: 1920, height: 1080 },
] as const) {
  test(`renders a correctly sized neutral frame at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(SUPPORTED_URL);

    const value = await waitForMetrics(page);
    const display = await page.locator('#app-canvas').evaluate((canvas) => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    }));
    expect(value.viewport.cssWidth).toBe(display.width);
    expect(value.viewport.cssHeight).toBe(display.height);
    expect(value.camera.aspect).toBeCloseTo(display.width / display.height, 5);
    expect(value.runtime.renders).toBeGreaterThan(0);
    expectCappedBuffer(value);
  });
}

test('resizes from portrait to desktop and updates the projection without recreating runtime', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(SUPPORTED_URL);
  const before = await waitForMetrics(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await metrics(page)).viewport.cssWidth).toBeGreaterThan(
    before.viewport.cssWidth,
  );
  const after = await metrics(page);
  const display = await page.locator('#app-canvas').evaluate((canvas) => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  }));

  expect(after.viewport.cssWidth).toBe(display.width);
  expect(after.viewport.cssHeight).toBe(display.height);
  expect(after.camera.aspect).toBeCloseTo(display.width / display.height, 5);
  expect(after.runtime.created).toBe(before.runtime.created);
  expectCappedBuffer(after);
});

test('uses DPR 1 exactly and caps emulated DPR 3 by ratio and total pixels', async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await setDeviceMetrics(session, 1280, 720, 1);
  await page.goto(SUPPORTED_URL);
  let value = await waitForMetrics(page);
  expect(value.viewport.pixelRatio).toBe(1);
  expect(value.viewport.bufferWidth).toBe(value.viewport.cssWidth);
  expect(value.viewport.bufferHeight).toBe(value.viewport.cssHeight);

  const previousCssWidth = value.viewport.cssWidth;
  await setDeviceMetrics(session, 1920, 1080, 3);
  await expect.poll(async () => (await metrics(page)).viewport.cssWidth).toBeGreaterThan(previousCssWidth);
  value = await metrics(page);
  expect(value.viewport.pixelRatio).toBeLessThan(3);
  expectCappedBuffer(value);
  const drawingBuffer = await page.locator('#app-canvas').evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected #app-canvas to be an HTMLCanvasElement');
    }
    return { width: element.width, height: element.height };
  });
  expect(value.viewport.bufferWidth).toBe(drawingBuffer.width);
  expect(value.viewport.bufferHeight).toBe(drawingBuffer.height);
  await session.send('Emulation.clearDeviceMetricsOverride');
});

test('starts with fixed upright camera defaults', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  const value = await waitForMetrics(page);

  expect(value.camera.fov).toBe(50);
  expect(value.camera.near).toBe(0.1);
  expect(value.camera.far).toBe(100);
  expect(value.camera.position).toEqual([0, 1.5, 5]);
  expect(value.camera.up).toEqual([0, 1, 0]);
});

test('stops while hidden and resumes without a large first-frame delta', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await waitForMetrics(page);

  await page.evaluate((attribute) => {
    const canvas = document.querySelector('#app-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing runtime canvas');
    const samples: RuntimeMetrics['frame'][] = [];
    (window as typeof window & { __viewportFrameSamples?: RuntimeMetrics['frame'][] }).__viewportFrameSamples = samples;
    new MutationObserver(() => {
      const encoded = canvas.getAttribute(attribute);
      if (encoded !== null) samples.push((JSON.parse(encoded) as RuntimeMetrics).frame);
    }).observe(canvas, { attributes: true, attributeFilter: [attribute] });
  }, METRICS_ATTRIBUTE);

  await page.evaluate(() => {
    const target = document as Document & {
      __restoreViewportVisibility?: () => void;
      __setViewportVisibility?: (hidden: boolean) => void;
    };
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let hidden = false;

    target.__setViewportVisibility = (nextHidden) => {
      hidden = nextHidden;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    target.__restoreViewportVisibility = () => {
      if (hiddenDescriptor === undefined) delete (document as unknown as Record<string, unknown>).hidden;
      else Object.defineProperty(document, 'hidden', hiddenDescriptor);
      if (visibilityStateDescriptor === undefined) delete (document as unknown as Record<string, unknown>).visibilityState;
      else Object.defineProperty(document, 'visibilityState', visibilityStateDescriptor);
      delete target.__setViewportVisibility;
      delete target.__restoreViewportVisibility;
      document.dispatchEvent(new Event('visibilitychange'));
    };

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
    target.__setViewportVisibility(true);
  });

  try {
    await expect.poll(async () => (await metrics(page)).frame.visible).toBe(false);
    expect((await metrics(page)).frame.running).toBe(false);
    const hiddenFrameCount = (await metrics(page)).frame.frameCount;
    await page.waitForTimeout(250);
    await expect.poll(async () => (await metrics(page)).frame.frameCount).toBe(hiddenFrameCount);

    await page.evaluate(() => {
      const setVisibility = (document as Document & { __setViewportVisibility?: (hidden: boolean) => void })
        .__setViewportVisibility;
      if (setVisibility === undefined) throw new Error('Missing visibility simulation');
      setVisibility(false);
    });
    await expect.poll(async () => (await metrics(page)).frame.visible).toBe(true);
    await expect.poll(async () => (await metrics(page)).frame.running).toBe(true);
    await expect.poll(async () => (await metrics(page)).frame.frameCount).toBeGreaterThan(hiddenFrameCount);
    const firstResumed = await page.evaluate((minimumFrameCount) => {
      const samples = (window as typeof window & { __viewportFrameSamples?: RuntimeMetrics['frame'][] }).__viewportFrameSamples ?? [];
      return samples.find((sample) => sample.visible && sample.frameCount > minimumFrameCount);
    }, hiddenFrameCount);
    expect(firstResumed).toBeDefined();
    expect(firstResumed?.deltaSeconds).toBeLessThanOrEqual(0.1);
  } finally {
    await page.evaluate(() => {
      const restore = (document as Document & { __restoreViewportVisibility?: () => void }).__restoreViewportVisibility;
      restore?.();
    });
  }
});

test('ten dispose/create cycles return to one live runtime and stable resource counts', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  const baseline = await waitForMetrics(page);

  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('three-runtime:command', { detail: { action: 'cycle', count: 10 } }),
    );
  });
  await expect.poll(async () => (await metrics(page)).runtime.created).toBe(
    baseline.runtime.created + 10,
  );
  const after = await metrics(page);

  expect(after.runtime.created - baseline.runtime.created).toBe(10);
  expect(after.runtime.disposed - baseline.runtime.disposed).toBe(10);
  expect(after.runtime.created - after.runtime.disposed).toBe(1);
  expect(after.resources.resources).toBe(baseline.resources.resources);
  expect(after.resources.references).toBe(baseline.resources.references);
  expect(after.resources.groups).toBe(baseline.resources.groups);
  expect(after.viewport.bufferWidth * after.viewport.bufferHeight).toBeLessThanOrEqual(
    MAX_DRAWING_BUFFER_PIXELS,
  );
});
