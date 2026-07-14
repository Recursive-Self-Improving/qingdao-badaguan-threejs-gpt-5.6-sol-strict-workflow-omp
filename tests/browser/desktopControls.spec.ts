import { expect, test, type Page } from '@playwright/test';

interface RuntimeMetrics {
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
  };
  readonly world: {
    readonly reset: { readonly x: number; readonly z: number; readonly groundHeight: number; readonly yaw: number };
    readonly bounds: { readonly navigable: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } };
  };
}

interface PointerLockHarness {
  mode: 'success' | 'raw-unsupported' | 'denied' | 'error';
  readonly requests: (PointerLockOptions | null)[];
  exits: number;
  confirm(): void;
  unlock(): void;
  pointerError(): void;
  hide(): void;
  show(): void;
}

async function installPointerLockHarness(page: Page, mode: PointerLockHarness['mode']): Promise<void> {
  await page.addInitScript((initialMode) => {
    const harness: PointerLockHarness = {
      mode: initialMode,
      requests: [],
      exits: 0,
      confirm() {
        owner = document.querySelector('#app-canvas');
        document.dispatchEvent(new Event('pointerlockchange'));
      },
      unlock() {
        owner = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
      pointerError() {
        document.dispatchEvent(new Event('pointerlockerror'));
      },
      hide() {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      show() {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      },
    };
    let owner: Element | null = null;
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => owner });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value(options?: PointerLockOptions) {
        harness.requests.push(options ?? null);
        if (harness.mode === 'raw-unsupported' && options?.unadjustedMovement === true) {
          return Promise.reject(new DOMException('Raw movement unsupported', 'NotSupportedError'));
        }
        if (harness.mode === 'denied') {
          return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
        }
        if (harness.mode === 'error') {
          return Promise.reject(new DOMException('Request failed', 'AbortError'));
        }
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value() {
        harness.exits += 1;
        if (owner !== null) harness.unlock();
      },
    });
    const testWindow = window as Window & { __pointerLockHarness?: PointerLockHarness };
    testWindow.__pointerLockHarness = harness;
  }, mode);
}

async function harnessSnapshot(page: Page): Promise<{ requests: (PointerLockOptions | null)[]; exits: number }> {
  return page.evaluate(() => {
    const testWindow = window as Window & { __pointerLockHarness?: PointerLockHarness };
    const harness = testWindow.__pointerLockHarness;
    if (harness === undefined) throw new Error('Pointer-lock harness missing');
    return { requests: harness.requests, exits: harness.exits };
  });
}

async function invokeHarness(page: Page, action: 'confirm' | 'unlock' | 'pointerError' | 'hide' | 'show'): Promise<void> {
  await page.evaluate((requestedAction) => {
    const testWindow = window as Window & { __pointerLockHarness?: PointerLockHarness };
    const harness = testWindow.__pointerLockHarness;
    if (harness === undefined) throw new Error('Pointer-lock harness missing');
    harness[requestedAction]();
  }, action);
}

async function metrics(page: Page): Promise<RuntimeMetrics> {
  return page.locator('#app-canvas').evaluate((canvas) => {
    const encoded = canvas.dataset.threeRuntimeMetrics;
    if (encoded === undefined) throw new Error('Runtime metrics missing');
    return JSON.parse(encoded) as RuntimeMetrics;
  });
}

async function waitForCameraChange(page: Page, before: readonly [number, number, number]): Promise<RuntimeMetrics> {
  let latest = await metrics(page);
  await expect.poll(async () => {
    latest = await metrics(page);
    return Math.hypot(
      latest.camera.position[0] - before[0],
      latest.camera.position[2] - before[2],
    );
  }).toBeGreaterThan(0.08);
  return latest;
}

async function dispatchMouseDelta(page: Page, movementX: number, movementY: number): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const event = new Event('mousemove');
    Object.defineProperties(event, {
      movementX: { value: x },
      movementY: { value: y },
    });
    document.dispatchEvent(event);
  }, { x: movementX, y: movementY });
}

test('document confirmation owns lock state, look clamps upright, unlock clears and Resume reacquires', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installPointerLockHarness(page, 'success');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(1);
  expect((await harnessSnapshot(page)).requests).toEqual([{ unadjustedMovement: true }]);
  await expect(page.locator('#app-detail')).toContainText('Mouse lock is unavailable');

  await invokeHarness(page, 'confirm');
  await expect(page.locator('#app-detail')).toHaveText('Press Escape to release');
  const beforeLook = await metrics(page);
  await dispatchMouseDelta(page, -500, -100_000);
  await expect.poll(async () => (await metrics(page)).camera.yaw).not.toBe(beforeLook.camera.yaw);
  const looked = await metrics(page);
  expect(looked.camera.pitch).toBeCloseTo(85 * Math.PI / 180, 5);
  expect(looked.camera.roll).toBe(0);

  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, looked.camera.position);
  await invokeHarness(page, 'unlock');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await expect(page.getByTestId('resume-button')).toBeVisible();
  const stopped = await metrics(page);
  await page.waitForTimeout(250);
  const stillStopped = await metrics(page);
  expect(stillStopped.camera.position).toEqual(stopped.camera.position);
  expect((await harnessSnapshot(page)).requests).toHaveLength(1);
  await page.keyboard.up('KeyW');

  await page.getByTestId('resume-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(2);
  await invokeHarness(page, 'confirm');
  await expect(page.locator('#app-detail')).toHaveText('Press Escape to release');
});

test('pause before confirmation rejects a late lock without entering locked state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installPointerLockHarness(page, 'success');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await invokeHarness(page, 'confirm');
  await expect.poll(async () => (await harnessSnapshot(page)).exits).toBe(1);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await expect(page.getByTestId('resume-button')).toBeVisible();
});

test('raw unsupported retries ordinary exactly once and caches ordinary reacquisition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installPointerLockHarness(page, 'raw-unsupported');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(2);
  expect((await harnessSnapshot(page)).requests).toEqual([{ unadjustedMovement: true }, null]);
  await invokeHarness(page, 'confirm');
  await page.keyboard.press('Escape');
  await page.getByTestId('resume-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(3);
  expect((await harnessSnapshot(page)).requests[2]).toBeNull();
});

test('document pointer-lock error enters keyboard fallback without retrying', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installPointerLockHarness(page, 'success');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect.poll(async () => (await harnessSnapshot(page)).requests.length).toBe(1);
  await invokeHarness(page, 'pointerError');
  await expect(page.locator('#app-detail')).toContainText('Mouse lock could not start');
  expect((await harnessSnapshot(page)).requests).toHaveLength(1);
  await page.keyboard.press('Escape');
  await page.getByTestId('resume-button').click();
  await page.waitForTimeout(100);
  await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
  expect((await harnessSnapshot(page)).requests).toHaveLength(1);
});

test('denial keeps keyboard fallback live without a request loop and reset returns authored pose', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installPointerLockHarness(page, 'denied');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app-detail')).toContainText('Mouse lock was denied');
  const before = await metrics(page);
  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, before.camera.position);
  await page.keyboard.up('KeyW');
  expect((await harnessSnapshot(page)).requests).toHaveLength(1);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('resume-button')).toBeFocused();
  await page.getByTestId('resume-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
  await page.waitForTimeout(100);
  expect((await harnessSnapshot(page)).requests).toHaveLength(1);

  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await metrics(page)).camera.position[2]).toBeCloseTo(before.world.reset.z, 5);
  const reset = await metrics(page);
  expect(reset.camera.position[0]).toBeCloseTo(reset.world.reset.x, 5);
  expect(reset.camera.position[1]).toBeCloseTo(reset.world.reset.groundHeight + 1.68, 5);
  expect(reset.camera.yaw).toBeCloseTo(reset.world.reset.yaw, 5);
  expect(reset.camera.pitch).toBe(0);
  expect(reset.camera.roll).toBe(0);
});

test('blur, focus, orientation, and hidden lifecycle breaks clear held movement and guard resumption', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(60_000);
  await installPointerLockHarness(page, 'denied');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();

  await page.keyboard.down('KeyW');
  const initial = await metrics(page);
  await waitForCameraChange(page, initial.camera.position);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const focusStop = await metrics(page);
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(focusStop.camera.position);
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, focusStop.camera.position);
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  const orientationStop = await metrics(page);
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(orientationStop.camera.position);
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, orientationStop.camera.position);
  await page.getByTestId('help-button').focus();
  const controlStop = await metrics(page);
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(controlStop.camera.position);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(controlStop.camera.position);
  await page.keyboard.up('KeyW');
  await page.getByTestId('help-button').blur();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);

  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, controlStop.camera.position);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await page.keyboard.up('KeyW');
  await page.getByTestId('resume-button').click();
  const resumed = await metrics(page);
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(resumed.camera.position);

  await page.keyboard.down('KeyW');
  await waitForCameraChange(page, resumed.camera.position);
  await invokeHarness(page, 'hide');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await page.keyboard.up('KeyW');
  await invokeHarness(page, 'show');
  await page.getByTestId('resume-button').click();
  const visibleResume = await metrics(page);
  await page.waitForTimeout(250);
  expect((await metrics(page)).camera.position).toEqual(visibleResume.camera.position);
});

test('coarse pointer starts in drag mode without requesting pointer lock', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await installPointerLockHarness(page, 'success');
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app-detail')).toContainText('Mouse lock is unavailable');
  expect((await harnessSnapshot(page)).requests).toHaveLength(0);
});
