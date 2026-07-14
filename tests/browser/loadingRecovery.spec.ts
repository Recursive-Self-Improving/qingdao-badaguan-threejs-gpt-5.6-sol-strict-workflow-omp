import { expect, test, type Page, type Route } from '@playwright/test';

const guideUrl = '**/assets/route-guide.v1.json';
const validGuide = JSON.stringify({ version: 1, recipeId: 'badaguan-district-procedural', stops: [{ anchorId: 'spawn', title: 'Garden threshold', summary: 'Begin the suggested walk.' }] });

async function waitForState(page: Page, state: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', state, { timeout: 30_000 });
}

async function loseContext(page: Page): Promise<void> {
  const available = await page.locator('#app-canvas').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (extension === null || extension === undefined) return false;
    (window as typeof window & { __c10LoseContext?: WEBGL_lose_context }).__c10LoseContext = extension;
    extension.loseContext();
    return true;
  });
  expect(available, 'WEBGL_lose_context must be available in the C10 browser environment').toBe(true);
}

async function restoreContext(page: Page): Promise<void> {
  const restored = await page.evaluate(() => {
    const extension = (window as typeof window & { __c10LoseContext?: WEBGL_lose_context }).__c10LoseContext;
    if (extension === undefined) return false;
    extension.restoreContext();
    return true;
  });
  expect(restored, 'WEBGL_lose_context must restore in the C10 browser environment').toBe(true);
}

test.describe('C10 loading, degradation, and graphics recovery', () => {
  test.setTimeout(90_000);

  test('cancels during indeterminate loading and ignores the later optional response', async ({ page }) => {
    const delayed: { route: Route | null } = { route: null };
    await page.route(guideUrl, async (route) => { delayed.route = route; });
    await page.goto('/?capability=supported&loadingHoldMs=1200', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Preparing required resources. Item total not yet known.')).toBeVisible();
    await page.getByTestId('cancel-loading-button').click();
    await waitForState(page, 'load-cancelled');
    await delayed.route?.fulfill({ status: 200, contentType: 'application/json', body: validGuide });
    await page.waitForTimeout(150);
    await waitForState(page, 'load-cancelled');
  });

  test('paints indeterminate and registered item progress, cancels, suppresses late work, retries, and opens the static guide in-page', async ({ page }) => {
    const delayed: { route: Route | null } = { route: null };
    await page.route(guideUrl, async (route) => { delayed.route = route; });
    await page.goto('/?capability=supported&loadingHoldMs=1200', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Preparing required resources. Item total not yet known.')).toBeVisible();
    await expect(page.getByTestId('cancel-loading-button')).toHaveAttribute('aria-label', 'Cancel loading');
    await expect(page.getByText('Loaded 0 of 1 items.')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#app-progress')).toHaveAttribute('aria-valuetext', '0 of 1 items loaded');
    await page.getByTestId('cancel-loading-button').click();
    await waitForState(page, 'load-cancelled');
    await expect(page.getByRole('heading', { name: 'The 3D view did not finish loading' })).toBeVisible();
    await expect(page.getByTestId('retry-button')).toBeFocused();
    await delayed.route?.fulfill({ status: 200, contentType: 'application/json', body: validGuide });
    await page.waitForTimeout(200);
    await waitForState(page, 'load-cancelled');
    await page.getByTestId('static-guide-button').click();
    await waitForState(page, 'static');
    await expect(page.getByRole('heading', { name: 'Badaguan without the 3D view' })).toBeFocused();
    await expect(page.locator('#app-canvas')).toBeHidden();
    await expect(page.getByTestId('about-toggle')).toBeVisible();
  });

  test('keeps exploration usable for a delayed optional failure and retries only the guide in place', async ({ page }) => {
    await page.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList => {
        const result = native(query);
        if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(result, 'matches', { configurable: true, value: false });
        return result;
      };
    });
    const initialRequest: { route: Route | null } = { route: null };
    const retryRequest: { route: Route | null } = { route: null };
    let requestCount = 0;
    await page.route(guideUrl, async (route) => {
      requestCount += 1;
      if (requestCount === 1) initialRequest.route = route;
      else retryRequest.route = route;
    });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await expect(page.locator('#app-canvas')).not.toHaveAttribute('aria-describedby', /app-degraded-text/);
    await page.getByTestId('start-button').click();
    await waitForState(page, 'exploring');
    const before = await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics');
    await initialRequest.route?.fulfill({ status: 404, body: 'missing' });
    await waitForState(page, 'degraded');
    await expect(page.locator('#app-canvas')).toHaveAttribute('aria-describedby', /app-degraded-text/);
    await expect(page.getByTestId('degraded-notice')).toContainText('Route guide unavailable. The 3D scene and controls still work.');
    await expect(page.getByTestId('pause-button')).toBeVisible();
    const retry = page.getByTestId('retry-optional-button');
    const retryCenter = await retry.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (document.elementFromPoint(x, y) !== button) throw new Error('Retry guide is not the center hit target.');
      return { x, y };
    });
    await page.mouse.move(retryCenter.x, retryCenter.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('html')).toHaveAttribute('data-optional-retry-activated', 'true');
    await expect(retry).toHaveText('Retrying…');
    await expect(retry).toBeDisabled();
    await expect.poll(() => retryRequest.route !== null).toBe(true);
    await retryRequest.route?.fulfill({ status: 200, contentType: 'application/json', body: validGuide });
    await waitForState(page, 'exploring');
    await expect(page.getByTestId('degraded-notice')).toBeHidden();
    await expect(page.locator('#app-canvas')).not.toHaveAttribute('aria-describedby', /app-degraded-text/);
    const after = await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics');
    expect(JSON.parse(after ?? '{}').runtime.created).toBe(JSON.parse(before ?? '{}').runtime.created);
    const help = page.getByTestId('help-button');
    const helpCenter = await help.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (document.elementFromPoint(x, y) !== button) throw new Error('Help is not the center hit target.');
      return { x, y };
    });
    await page.mouse.move(helpCenter.x, helpCenter.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('help-suggested-walk')).toContainText('Garden threshold');
  });

  for (const failure of ['404', 'malformed', 'network', 'timeout'] as const) {
    test(`preserves onboarding with persistent optional fallback after ${failure}`, async ({ page }) => {
      await page.route(guideUrl, async (route) => {
        if (failure === '404') await route.fulfill({ status: 404, body: '' });
        else if (failure === 'malformed') await route.fulfill({ status: 200, contentType: 'application/json', body: '{bad' });
        else if (failure === 'network') await route.abort('failed');
      });
      const timeout = failure === 'timeout' ? '&routeTimeoutMs=40' : '';
      await page.goto(`/?capability=supported${timeout}`, { waitUntil: 'domcontentloaded' });
      await waitForState(page, 'degraded');
      await expect(page.getByTestId('start-button')).toBeVisible();
      await expect(page.getByTestId('degraded-notice')).toBeVisible();
      await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
    });
  }

  test('optional failure while paused preserves pose, control intent, and Resume', async ({ page }) => {
    await page.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList => {
        const result = native(query);
        if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(result, 'matches', { configurable: true, value: false });
        return result;
      };
    });
    const delayed: { route: Route | null } = { route: null };
    await page.route(guideUrl, async (route) => { delayed.route = route; });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await page.getByTestId('start-button').click();
    await page.keyboard.down('KeyW'); await page.waitForTimeout(150); await page.keyboard.up('KeyW');
    await page.getByTestId('pause-button').click();
    const before = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    await delayed.route?.fulfill({ status: 404, body: '' });
    await waitForState(page, 'degraded');
    const after = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    expect(after.camera.position).toEqual(before.camera.position);
    await expect(page.getByTestId('resume-button')).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
  });

  test('queues an optional failure during context loss and reapplies it after restoration', async ({ page }) => {
    const delayed: { route: Route | null } = { route: null };
    await page.route(guideUrl, async (route) => { delayed.route = route; });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await loseContext(page);
    await waitForState(page, 'context-lost');
    await delayed.route?.fulfill({ status: 404, body: '' });
    await page.waitForTimeout(50);
    await restoreContext(page);
    await waitForState(page, 'degraded');
    await expect(page.getByTestId('degraded-notice')).toBeVisible();
    await expect(page.getByTestId('start-button')).toBeVisible();
  });
  test('clears retrying degradation when guide succeeds during context loss', async ({ page }) => {
    let requestCount = 0;
    const retryRequest: { route: Route | null } = { route: null };
    await page.route(guideUrl, async (route) => {
      requestCount += 1;
      if (requestCount === 1) await route.fulfill({ status: 404, body: '' });
      else retryRequest.route = route;
    });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'degraded');
    await page.getByTestId('retry-optional-button').click();
    await expect(page.getByTestId('retry-optional-button')).toHaveText('Retrying…');
    await loseContext(page);
    await waitForState(page, 'context-lost');
    await retryRequest.route?.fulfill({ status: 200, contentType: 'application/json', body: validGuide });
    await page.waitForTimeout(50);
    await restoreContext(page);
    await waitForState(page, 'onboarding');
    await expect(page.getByTestId('degraded-notice')).toBeHidden();
    await expect(page.getByTestId('retry-optional-button')).toHaveCount(0);
    await expect(page.getByTestId('start-button')).toBeFocused();
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-suggested-walk')).toContainText('Garden threshold');
  });

  test('keeps the degraded notice in a separate 320px HUD slot', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.route(guideUrl, async (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'degraded');
    const boxes = await page.evaluate(() => {
      const controls = document.querySelector('#app-controls')?.getBoundingClientRect();
      const status = document.querySelector('#app-status')?.getBoundingClientRect();
      const banner = document.querySelector('#app-degraded-notice')?.getBoundingClientRect();
      const panel = document.querySelector('#app-overlay')?.getBoundingClientRect();
      if (controls === undefined || status === undefined || banner === undefined || panel === undefined) return null;
      return { controlsBottom: controls.bottom, statusBottom: status.bottom, bannerTop: banner.top, bannerBottom: banner.bottom, panelTop: panel.top, bannerRight: banner.right };
    });
    expect(boxes).not.toBeNull();
    expect(boxes!.bannerTop).toBeGreaterThanOrEqual(boxes!.controlsBottom);
    expect(boxes!.bannerTop).toBeGreaterThanOrEqual(boxes!.statusBottom);
    expect(boxes!.panelTop).toBeGreaterThanOrEqual(boxes!.bannerBottom);
    expect(boxes!.bannerRight).toBeLessThanOrEqual(320);
    await expect(page.getByTestId('retry-optional-button')).toHaveCSS('min-height', '44px');
  });
  test('a second loss supersedes rebuilding and only the newest token restores', async ({ page }) => {
    await page.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList => {
        const result = native(query);
        if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(result, 'matches', { configurable: true, value: false });
        return result;
      };
    });
    await page.goto('/?capability=supported&recoveryHoldMs=500', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await page.getByTestId('start-button').click();
    const before = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    await loseContext(page); await restoreContext(page);
    await expect(page.locator('#app-detail')).toContainText('Rebuilding graphics');
    await loseContext(page);
    await expect(page.locator('#app-detail')).toContainText('Movement is paused');
    await restoreContext(page);
    await waitForState(page, 'exploring');
    const after = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    expect(after.runtime.created).toBe(before.runtime.created + 1);
    await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
  });

  test('static then Retry cannot be invalidated by the old recovery timeout', async ({ page }) => {
    await page.goto('/?capability=supported&recoveryTimeoutMs=200', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await loseContext(page);
    await waitForState(page, 'context-lost');
    await page.getByTestId('static-guide-button').click();
    await waitForState(page, 'static');
    await page.getByTestId('retry-button').click();
    await waitForState(page, 'onboarding');
    const fresh = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    await page.waitForTimeout(300);
    await waitForState(page, 'onboarding');
    const afterTimeout = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    expect(afterTimeout.runtime.created).toBe(fresh.runtime.created);
    expect(afterTimeout.runtime.disposed).toBe(fresh.runtime.disposed);
  });

  test('hidden startup keeps rendering paused and resumes from a fresh baseline', async ({ page }) => {
    await page.addInitScript(() => {
      let hidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
      (document as Document & { __setC10Hidden?: (value: boolean) => void }).__setC10Hidden = (value) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    const hiddenMetrics = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    expect(hiddenMetrics.frame.running).toBe(false);
    const hiddenFrameCount = hiddenMetrics.frame.frameCount as number;
    await page.evaluate(() => {
      const canvas = document.querySelector('#app-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing runtime canvas');
      const frames: Array<{ visible: boolean; running: boolean; frameCount: number; deltaSeconds: number }> = [];
      (window as typeof window & { __c10ResumeFrames?: typeof frames }).__c10ResumeFrames = frames;
      new MutationObserver(() => {
        const encoded = canvas.dataset.threeRuntimeMetrics;
        if (encoded !== undefined) frames.push(JSON.parse(encoded).frame);
      }).observe(canvas, { attributes: true, attributeFilter: ['data-three-runtime-metrics'] });
    });
    await page.evaluate(() => (document as Document & { __setC10Hidden?: (value: boolean) => void }).__setC10Hidden?.(false));
    await expect.poll(async () => page.evaluate((minimum) => {
      const frames = (window as typeof window & { __c10ResumeFrames?: Array<{ visible: boolean; running: boolean; frameCount: number; deltaSeconds: number }> }).__c10ResumeFrames ?? [];
      return frames.filter((frame) => frame.visible && frame.running && frame.frameCount > minimum).length;
    }, hiddenFrameCount)).toBeGreaterThanOrEqual(1);
    const firstResumed = await page.evaluate((minimum) => {
      const frames = (window as typeof window & { __c10ResumeFrames?: Array<{ visible: boolean; running: boolean; frameCount: number; deltaSeconds: number }> }).__c10ResumeFrames ?? [];
      return frames.find((frame) => frame.visible && frame.running && frame.frameCount > minimum);
    }, hiddenFrameCount);
    expect(firstResumed?.deltaSeconds).toBeLessThanOrEqual(0.001);
  });



  test('required runtime failure is terminal and offers Retry plus the static guide', async ({ page }) => {
    await page.goto('/?capability=supported&failRuntime=1', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'fatal');
    await expect(page.getByRole('heading', { name: 'The Badaguan walk could not start' })).toBeVisible();
    await expect(page.getByTestId('retry-button')).toBeVisible();
    await expect(page.getByTestId('static-guide-button')).toBeVisible();
    await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
  });

  test('actual WEBGL context loss restores pose, nondefault settings, resources, and honest drag control', async ({ page }) => {
    await page.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList => {
        const result = native(query);
        if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(result, 'matches', { configurable: true, value: false });
        return result;
      };
    });
    await page.goto('/?capability=supported', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await page.getByTestId('start-button').click();
    await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: { action: 'landscape/set-settings', settings: { density: 'medium', motion: 'reduced' } } })));
    const before = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    await loseContext(page);
    await waitForState(page, 'context-lost');
    await expect(page.getByRole('heading', { name: 'Restoring the 3D view' })).toBeFocused();
    await restoreContext(page);
    await waitForState(page, 'exploring');
    const after = JSON.parse(await page.locator('#app-canvas').getAttribute('data-three-runtime-metrics') ?? '{}');
    expect(after.runtime.created).toBeGreaterThan(before.runtime.created);
    expect({ resources: after.resources.resources, references: after.resources.references, groups: after.resources.groups }).toEqual({ resources: before.resources.resources, references: before.resources.references, groups: before.resources.groups });
    expect(after.resources.disposed).toBe(0);
    expect(after.runtime.disposed).toBeGreaterThan(before.runtime.disposed);
    expect(after.world.landscape.settings).toEqual({ density: 'medium', motion: 'reduced' });
    expect(after.camera.position[0]).toBeCloseTo(before.camera.position[0], 3);
    expect(after.camera.position[2]).toBeCloseTo(before.camera.position[2], 3);
    expect(after.camera.yaw).toBeCloseTo(before.camera.yaw, 3);
    await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
    await expect(page.locator('#app-status')).toHaveText('Graphics restored. Your position and settings were kept.');
  });

  test('locked recovery normalizes to drag and paused recovery returns focus to Resume', async ({ page }) => {
    await page.goto('/?capability=supported&lifecycle=locked', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await page.getByTestId('start-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'locked');
    await loseContext(page); await restoreContext(page);
    await waitForState(page, 'exploring');
    await expect(page.locator('#app')).toHaveAttribute('data-control-mode', 'drag');
    await page.getByTestId('pause-button').click();
    await loseContext(page); await restoreContext(page);
    await waitForState(page, 'paused');
    await expect(page.getByTestId('resume-button')).toBeFocused();
  });

  test('forced recovery failure disposes the invalid runtime and offers Reload plus static guide', async ({ page }) => {
    await page.goto('/?capability=supported&failRecovery=1', { waitUntil: 'domcontentloaded' });
    await waitForState(page, 'onboarding');
    await loseContext(page); await restoreContext(page);
    await waitForState(page, 'recovery-failed');
    await expect(page.getByTestId('reload-button')).toBeVisible();
    await expect(page.getByTestId('static-guide-button')).toBeVisible();
    await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
  });
});
