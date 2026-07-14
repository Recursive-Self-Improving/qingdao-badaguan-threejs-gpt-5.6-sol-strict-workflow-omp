import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface ExplorationMetrics {
  readonly camera: { readonly position: readonly [number, number, number]; readonly yaw: number; readonly pitch: number };
  readonly world: {
    readonly reset: { readonly x: number; readonly z: number; readonly groundHeight?: number; readonly yaw?: number };
    readonly landscape: { readonly settings: { readonly density: 'low' | 'medium' | 'high' } };
  };
}

async function explorationMetrics(page: Page): Promise<ExplorationMetrics> {
  return page.locator('#app-canvas').evaluate((canvas) => {
    const value = canvas.dataset.threeRuntimeMetrics;
    if (value === undefined) throw new Error('Runtime metrics missing');
    return JSON.parse(value) as ExplorationMetrics;
  });
}

async function qualityTier(page: Page): Promise<'low' | 'medium' | 'high'> {
  return page.evaluate(() => {
    let tier: 'low' | 'medium' | 'high' | null = null;
    document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: {
      action: 'quality/state', respond: (state: { activeTier: 'low' | 'medium' | 'high' }) => { tier = state.activeTier; },
    } }));
    if (tier === null) throw new Error('Quality state unavailable.');
    return tier;
  });
}

async function feedAuto(page: Page, fromMs: number, toMs: number, intervalMs: number): Promise<void> {
  await page.evaluate(({ from, to, interval }) => {
    for (let now = from; now <= to; now += interval) {
      document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: { action: 'quality/sample', nowMs: now } }));
    }
  }, { from: fromMs, to: toMs, interval: intervalMs });
}

async function resetLeaseRecords(page: Page): Promise<void> {
  await page.evaluate(() => {
    const node = document.querySelector('#app-status');
    if (!(node instanceof HTMLElement)) throw new Error('Status missing');
    const target = window as typeof window & {
      __leaseObserver?: MutationObserver;
      __leaseRecords?: Array<{ text: string; at: number }>;
    };
    target.__leaseObserver?.disconnect();
    target.__leaseRecords = [];
    target.__leaseObserver = new MutationObserver(() => {
      target.__leaseRecords?.push({ text: node.textContent ?? '', at: performance.now() });
    });
    target.__leaseObserver.observe(node, { childList: true, characterData: true, subtree: true });
  });
}

async function denyPointerLock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const result = nativeMatchMedia(query);
      if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(result, 'matches', { configurable: true, value: false });
      return result;
    };
  });
}

async function useManualLow(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('badaguan.preferences.v1', JSON.stringify({ version: 1, quality: 'low', motion: 'system' })));
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
}

test('keyboard fallback, operational reset, focus, semantics, and axe states', async ({ page }) => {
  test.setTimeout(60_000);
  await denyPointerLock(page);
  await useManualLow(page);
  await page.goto('/?capability=supported');
  const canvas = page.locator('#app-canvas');
  await expect(canvas).toHaveAttribute('aria-label', 'Interactive view of Badaguan');
  await expect(canvas).not.toHaveAttribute('role', /application|presentation/);
  await expect(canvas).not.toHaveAttribute('tabindex', /.+/);
  await axe(page);

  await page.getByTestId('start-button').press('Enter');
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await expect(page.getByTestId('reset-button')).toBeVisible();
  await expect(page.getByTestId('reset-button')).not.toHaveAttribute('aria-keyshortcuts', /.+/);
  const startPose = await explorationMetrics(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await explorationMetrics(page)).camera.position[2]).not.toBe(startPose.camera.position[2]);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    const status = document.querySelector('#app-status');
    if (!(status instanceof HTMLElement)) throw new Error('Status missing');
    (window as typeof window & { __resetMutations?: number }).__resetMutations = 0;
    new MutationObserver((records) => {
      const target = window as typeof window & { __resetMutations?: number };
      target.__resetMutations = (target.__resetMutations ?? 0) + records.length;
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await page.getByTestId('reset-button').click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __resetMutations?: number }).__resetMutations ?? 0)).toBe(1);
  await expect(page.locator('#app-status')).toHaveText('Position reset to the safe point.');
  const nativeReset = await explorationMetrics(page);
  expect(nativeReset.camera.position[0]).toBeCloseTo(nativeReset.world.reset.x, 5);
  expect(nativeReset.camera.position[2]).toBeCloseTo(nativeReset.world.reset.z, 5);
  expect(nativeReset.camera.yaw).toBeCloseTo(nativeReset.world.reset.yaw ?? nativeReset.camera.yaw, 5);
  expect(nativeReset.camera.pitch).toBe(0);
  await canvas.focus();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await explorationMetrics(page)).camera.position[2]).not.toBe(nativeReset.camera.position[2]);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => { (window as typeof window & { __resetMutations?: number }).__resetMutations = 0; });
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __resetMutations?: number }).__resetMutations ?? 0)).toBe(1);
  await expect(page.locator('#app-status')).toHaveText('Position reset to the safe point.');
  const keyboardReset = await explorationMetrics(page);
  expect(keyboardReset.camera.position[0]).toBeCloseTo(keyboardReset.world.reset.x, 5);
  expect(keyboardReset.camera.position[2]).toBeCloseTo(keyboardReset.world.reset.z, 5);
  await axe(page);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('resume-button')).toBeFocused();
  await expect(canvas).not.toHaveAttribute('tabindex', /.+/);
  await axe(page);

  await page.getByTestId('help-button').click();
  await expect(page.locator('#app-help-title')).toBeFocused();
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help-button')).toBeFocused();
  await page.getByTestId('settings-button').click();
  await expect(page.locator('#app-settings-title')).toBeFocused();
  await axe(page);
});

test('reset feedback leases the live region while default Auto commits button and keyboard tier shifts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(60_000);
  await denyPointerLock(page);
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').press('Enter');
  const status = page.locator('#app-status');
  const records = (): Promise<Array<{ text: string; at: number }>> => page.evaluate(() => (window as typeof window & { __leaseRecords?: Array<{ text: string; at: number }> }).__leaseRecords ?? []);
  const initialTier = await qualityTier(page);
  const first = initialTier === 'low'
    ? { interval: 13, nearMs: 19_999, fullMs: 21_000, suffix: 'after sustained smooth performance.' }
    : { interval: 21, nearMs: 4_999, fullMs: 6_000, suffix: 'to keep movement smooth.' };
  let cursor = performance.timeOrigin;
  await feedAuto(page, cursor, cursor + first.nearMs, first.interval); cursor += first.nearMs;
  expect(await qualityTier(page)).toBe(initialTier);
  await resetLeaseRecords(page);
  await page.getByTestId('reset-button').click();
  await expect(status).toHaveText('Position reset to the safe point.');
  await expect.poll(async () => (await records()).length).toBe(1);
  await feedAuto(page, cursor + first.interval, cursor + 1_100, first.interval); cursor += 1_100;
  expect(await qualityTier(page)).toBe(initialTier);
  await expect(status).toHaveText('Position reset to the safe point.');
  expect(await records()).toHaveLength(1);
  await feedAuto(page, cursor + first.interval, cursor + first.fullMs, first.interval); cursor += first.fullMs;
  const firstChangedTier = await qualityTier(page);
  expect(firstChangedTier).not.toBe(initialTier);
  await expect.poll(async () => (await records()).length, { timeout: 5_000 }).toBe(2);
  const buttonRecords = await records();
  const firstLabel = firstChangedTier[0]!.toUpperCase() + firstChangedTier.slice(1);
  expect(buttonRecords.map(({ text }) => text)).toEqual(['Position reset to the safe point.', `Auto changed quality to ${firstLabel} ${first.suffix}`]);
  expect(buttonRecords[1]!.at - buttonRecords[0]!.at).toBeGreaterThanOrEqual(2_000);

  const second = first.interval === 13
    ? { interval: 21, nearMs: 4_999, fullMs: 6_000, suffix: 'to keep movement smooth.' }
    : { interval: 13, nearMs: 19_999, fullMs: 21_000, suffix: 'after sustained smooth performance.' };
  cursor += 40_000;
  await feedAuto(page, cursor, cursor + second.nearMs, second.interval); cursor += second.nearMs;
  expect(await qualityTier(page)).toBe(firstChangedTier);
  await resetLeaseRecords(page);
  await page.locator('#app-canvas').focus();
  await page.keyboard.press('KeyR');
  await expect(status).toHaveText('Position reset to the safe point.');
  await expect.poll(async () => (await records()).length).toBe(1);
  await feedAuto(page, cursor + second.interval, cursor + 1_100, second.interval); cursor += 1_100;
  expect(await qualityTier(page)).toBe(firstChangedTier);
  await expect(status).toHaveText('Position reset to the safe point.');
  expect(await records()).toHaveLength(1);
  await feedAuto(page, cursor + second.interval, cursor + second.fullMs, second.interval);
  const secondChangedTier = await qualityTier(page);
  expect(secondChangedTier).not.toBe(firstChangedTier);
  await expect.poll(async () => (await records()).length, { timeout: 5_000 }).toBe(2);
  const keyboardRecords = await records();
  const secondLabel = secondChangedTier[0]!.toUpperCase() + secondChangedTier.slice(1);
  expect(keyboardRecords.map(({ text }) => text)).toEqual(['Position reset to the safe point.', `Auto changed quality to ${secondLabel} ${second.suffix}`]);
  expect(keyboardRecords[1]!.at - keyboardRecords[0]!.at).toBeGreaterThanOrEqual(2_000);
});

test('drag fallback never requests lock and outside release stops look', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await denyPointerLock(page);
  await useManualLow(page);
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').click();
  const canvas = page.locator('#app-canvas');
  const before = await explorationMetrics(page);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 40, box!.y + 10, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await explorationMetrics(page)).camera.yaw).not.toBe(before.camera.yaw);
  const released = (await explorationMetrics(page)).camera;
  await page.mouse.move(box!.x + 10, box!.y + 10);
  await page.waitForTimeout(150);
  const afterRelease = (await explorationMetrics(page)).camera;
  expect(afterRelease.yaw).toBe(released.yaw);
  expect(afterRelease.pitch).toBe(released.pitch);
});

test('touch controls are native, simultaneous, contained, zoom-safe, and axe clean', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  test.setTimeout(60_000);
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').tap();
  const group = page.getByTestId('touch-controls');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('role', 'group');
  const buttons = group.locator('button');
  await expect(buttons).toHaveCount(4);
  for (const button of await buttons.all()) await expect(button).not.toHaveAttribute('aria-keyshortcuts', /.+/);
  for (const name of ['Move forward', 'Move left', 'Move right', 'Move backward']) {
    const button = page.getByRole('button', { name });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await expect(page.locator('#app-canvas')).toHaveCSS('touch-action', 'pinch-zoom');
  await expect(group).toHaveCSS('touch-action', 'none');
  const session = await context.newCDPSession(page);
  const center = async (selector: string): Promise<{ x: number; y: number }> => {
    const box = await page.locator(selector).boundingBox();
    if (box === null) throw new Error(`Missing touch target ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const forwardPoint = { ...(await center('[data-input-action="move-forward"]')), id: 1 };
  const rightPoint = { ...(await center('[data-input-action="move-right"]')), id: 2 };
  const canvasPoint = { ...(await center('#app-canvas')), id: 3 };
  const scrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const localProjections = (before: ExplorationMetrics, after: ExplorationMetrics): { forward: number; right: number } => {
    const dx = after.camera.position[0] - before.camera.position[0];
    const dz = after.camera.position[2] - before.camera.position[2];
    const sinYaw = Math.sin(before.camera.yaw);
    const cosYaw = Math.cos(before.camera.yaw);
    return { forward: dx * -sinYaw + dz * -cosYaw, right: dx * cosYaw + dz * -sinYaw };
  };

  const forwardBefore = await explorationMetrics(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forwardPoint] });
  await expect.poll(async () => {
    const current = await explorationMetrics(page);
    return Math.hypot(current.camera.position[0] - forwardBefore.camera.position[0], current.camera.position[2] - forwardBefore.camera.position[2]);
  }).toBeGreaterThan(0.04);
  const forwardAfter = await explorationMetrics(page);
  const forwardProjection = localProjections(forwardBefore, forwardAfter);
  expect(forwardProjection.forward).toBeGreaterThan(0.02);
  expect(Math.abs(forwardProjection.right)).toBeLessThan(forwardProjection.forward);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...forwardPoint, x: forwardPoint.x + 220, y: forwardPoint.y - 180 }] });
  await expect(page.getByTestId('touch-move-forward')).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => {
    const current = await explorationMetrics(page);
    return Math.hypot(current.camera.position[0] - forwardAfter.camera.position[0], current.camera.position[2] - forwardAfter.camera.position[2]);
  }).toBeGreaterThan(0.03);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('touch-move-forward')).not.toHaveAttribute('data-active', /.+/);
  const forwardReleased = await explorationMetrics(page);
  await page.waitForTimeout(150);
  expect((await explorationMetrics(page)).camera.position).toEqual(forwardReleased.camera.position);

  const rightBefore = await explorationMetrics(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [rightPoint] });
  await expect.poll(async () => {
    const current = await explorationMetrics(page);
    return Math.hypot(current.camera.position[0] - rightBefore.camera.position[0], current.camera.position[2] - rightBefore.camera.position[2]);
  }).toBeGreaterThan(0.04);
  const rightAfter = await explorationMetrics(page);
  const rightProjection = localProjections(rightBefore, rightAfter);
  expect(rightProjection.right).toBeGreaterThan(0.02);
  expect(Math.abs(rightProjection.forward)).toBeLessThan(rightProjection.right);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

  const simultaneousBefore = await explorationMetrics(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forwardPoint, rightPoint, canvasPoint] });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [forwardPoint, rightPoint, { ...canvasPoint, x: canvasPoint.x - 36, y: canvasPoint.y - 18 }],
  });
  await expect.poll(async () => {
    const current = await explorationMetrics(page);
    return Math.hypot(current.camera.position[0] - simultaneousBefore.camera.position[0], current.camera.position[2] - simultaneousBefore.camera.position[2]);
  }).toBeGreaterThan(0.04);
  await expect.poll(async () => (await explorationMetrics(page)).camera.yaw).not.toBe(simultaneousBefore.camera.yaw);
  const simultaneousAfter = await explorationMetrics(page);
  const simultaneousProjection = localProjections(simultaneousBefore, simultaneousAfter);
  expect(simultaneousProjection.forward).toBeGreaterThan(0);
  expect(simultaneousProjection.right).toBeGreaterThan(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = await explorationMetrics(page);
  await page.waitForTimeout(180);
  expect((await explorationMetrics(page)).camera).toEqual(cancelled.camera);

  const owner = { ...canvasPoint, id: 4 };
  const ignored = { ...canvasPoint, x: canvasPoint.x + 50, id: 5 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [owner] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [owner, ignored] });
  const beforeIgnoredMove = await explorationMetrics(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [owner, { ...ignored, x: ignored.x + 40 }] });
  expect((await explorationMetrics(page)).camera.yaw).toBe(beforeIgnoredMove.camera.yaw);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [ignored] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...ignored, x: ignored.x + 60 }] });
  expect((await explorationMetrics(page)).camera.yaw).toBe(beforeIgnoredMove.camera.yaw);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scrollBefore);
  for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const experience = await page.locator('#experience').boundingBox();
    expect(experience).not.toBeNull();
    for (const button of await group.locator('button').all()) {
      const rect = await button.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(experience!.x);
      expect(rect!.y).toBeGreaterThanOrEqual(experience!.y);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(experience!.x + experience!.width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(experience!.y + experience!.height);
    }
  }
  await axe(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(group).toHaveAttribute('data-layout', 'landscape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('VisualViewport relayout clears holds and preserves pose mode and route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & { offsetLeft: number; offsetTop: number; width: number; height: number; pageLeft: number; pageTop: number; scale: number };
    Object.assign(viewport, { offsetLeft: 0, offsetTop: 0, width: 390, height: 844, pageLeft: 0, pageTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    (window as typeof window & { __interactionViewport?: typeof viewport }).__interactionViewport = viewport;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?capability=supported');
  await page.getByTestId('start-button').tap();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-top', '20px');
    document.documentElement.style.setProperty('--safe-area-right', '22px');
    document.documentElement.style.setProperty('--safe-area-bottom', '28px');
    document.documentElement.style.setProperty('--safe-area-left', '34px');
    const forward = document.querySelector('[data-input-action="move-forward"]');
    if (!(forward instanceof Element)) throw new Error('Forward control missing');
    forward.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'touch', button: 0 }));
  });
  const beforeMove = await explorationMetrics(page);
  await expect.poll(async () => {
    const current = await explorationMetrics(page);
    return Math.hypot(current.camera.position[0] - beforeMove.camera.position[0], current.camera.position[2] - beforeMove.camera.position[2]);
  }).toBeGreaterThan(0.05);
  const modeBefore = await page.locator('#app').getAttribute('data-control-mode');
  const eventMetrics = await page.evaluate(() => {
    const viewport = (window as typeof window & { __interactionViewport?: EventTarget & { offsetLeft: number; offsetTop: number; width: number; height: number } }).__interactionViewport;
    const canvas = document.querySelector('#app-canvas');
    if (viewport === undefined || !(canvas instanceof HTMLCanvasElement)) throw new Error('Viewport test surface missing');
    const before = canvas.dataset.threeRuntimeMetrics;
    viewport.offsetLeft = 12;
    viewport.offsetTop = 72;
    viewport.width = 350;
    viewport.height = 650;
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    const after = canvas.dataset.threeRuntimeMetrics;
    if (before === undefined || after === undefined) throw new Error('Runtime metrics missing');
    return { before: JSON.parse(before) as ExplorationMetrics, after: JSON.parse(after) as ExplorationMetrics };
  });
  expect(eventMetrics.after.camera).toEqual(eventMetrics.before.camera);
  expect(eventMetrics.after.world.reset).toEqual(eventMetrics.before.world.reset);
  const interrupted = await explorationMetrics(page);
  await page.waitForTimeout(200);
  const stable = await explorationMetrics(page);
  expect(stable.camera).toEqual(interrupted.camera);
  expect(await page.locator('#app').getAttribute('data-control-mode')).toBe(modeBefore);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  const visible = { left: 12, top: 72, right: 362, bottom: 722 };
  const experience = await page.locator('#experience').boundingBox();
  expect(experience).not.toBeNull();
  for (const button of await page.getByTestId('touch-controls').locator('button').all()) {
    const rect = await button.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(Math.max(visible.left, experience!.x) + 34);
    expect(rect!.y).toBeGreaterThanOrEqual(Math.max(visible.top, experience!.y) + 20);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(Math.min(visible.right, experience!.x + experience!.width) - 22);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(Math.min(visible.bottom, experience!.y + experience!.height) - 28 + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('320px reflow and reduced motion preserve reachable controls', async ({ page }) => {
  await denyPointerLock(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?capability=supported');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.getByTestId('start-button').click();
  for (const id of ['pause-button', 'reset-button', 'help-button', 'settings-button']) await expect(page.getByTestId(id)).toBeVisible();
  const durationSeconds = await page.getByTestId('help-button').evaluate((element) => {
    const value = getComputedStyle(element).transitionDuration;
    return value.endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value);
  });
  expect(durationSeconds).toBeLessThanOrEqual(0.00001);
});


test('short landscape keeps Start and Pause visible and hit-testable', async ({ page }) => {
  await denyPointerLock(page);
  for (const size of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/?capability=supported');
    const start = page.getByTestId('start-button');
    await expect(start).toBeVisible();
    expect(await start.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight
        && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button;
    })).toBe(true);
    await start.click();
    const pause = page.getByTestId('pause-button');
    await expect(pause).toBeVisible();
    expect(await pause.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight
        && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button;
    })).toBe(true);
  }
});
test('actual 200 percent zoom keeps primary and utility actions hit-testable', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await denyPointerLock(page);
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 640,
    height: 360,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await page.goto('/?capability=supported');
  expect(await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio }))).toEqual({ width: 640, height: 360, dpr: 2 });
  const start = page.getByTestId('start-button');
  await expect(start).toBeVisible();
  expect(await start.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button;
  })).toBe(true);
  await start.click();
  for (const id of ['pause-button', 'reset-button', 'help-button', 'settings-button']) {
    const action = page.getByTestId(id);
    await expect(action).toBeVisible();
    expect(await action.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button;
    })).toBe(true);
  }
  const experience = await page.locator('#experience').boundingBox();
  const overlay = await page.locator('#app-overlay').boundingBox();
  expect(experience).not.toBeNull();
  expect(overlay).not.toBeNull();
  expect((overlay!.width * overlay!.height) / (experience!.width * experience!.height)).toBeLessThan(0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
