import { expect, test, type Page } from '@playwright/test';
import { driveInterpolatedRoute, type RoutePose } from '../performance/routeDriver';

const URL = '/?capability=supported';
const KEY = 'badaguan.preferences.v1';

async function ready(page: Page): Promise<void> {
  await page.goto(URL);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', /onboarding|degraded/);
  await expect(page.locator('#app-canvas')).toHaveAttribute('data-three-runtime-metrics', /"viewport"/);
}
async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-button').click();
  await expect(page.locator('#app-settings-title')).toBeFocused();
}
async function metrics(page: Page): Promise<any> {
  return page.locator('#app-canvas').evaluate((canvas) => JSON.parse(canvas.getAttribute('data-three-runtime-metrics') ?? '{}'));
}
async function command(page: Page, detail: Record<string, unknown>): Promise<void> {
  await page.evaluate((value) => document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: value })), detail);
}

test.describe('C11 quality settings', () => {
  test('uses native groups, one live region, immediate persistence, and stable focus', async ({ page }) => {
    await ready(page); await openSettings(page);
    expect(await page.locator('[aria-live]').count()).toBe(1);
    await expect(page.getByRole('group', { name: 'Visual quality' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Motion' })).toBeVisible();
    await expect(page.getByTestId('quality-auto')).toBeChecked();
    await expect(page.getByTestId('motion-system')).toBeChecked();
    const medium = page.getByTestId('quality-medium'); await medium.focus(); await medium.check();
    await expect(medium).toBeFocused(); await expect(medium).toBeChecked();
    await expect(page.locator('#quality-status')).toContainText('Medium is active');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(JSON.stringify({ version: 1, quality: 'medium', motion: 'system' }));
    await page.getByTestId('motion-reduced').check();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('#app-status')).toContainText('Reduced motion is on');
  });

  test('fails closed for corrupt storage and restores valid choices after reload', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(URL); await page.evaluate((key) => localStorage.setItem(key, '{bad'), KEY); await page.reload();
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', /onboarding|degraded/); await openSettings(page); await expect(page.getByTestId('quality-auto')).toBeChecked();
    await page.getByTestId('quality-low').check(); await page.getByTestId('motion-reduced').check();
    await page.reload(); await expect(page.locator('#app')).toHaveAttribute('data-app-state', /onboarding|degraded/); await openSettings(page);
    await expect(page.getByTestId('quality-low')).toBeChecked(); await expect(page.getByTestId('motion-reduced')).toBeChecked();
  });

  test('applies exact tier viewport caps while preserving camera and identity anchors', async ({ page }) => {
    test.setTimeout(60_000);
    await ready(page); const before = await metrics(page);
    for (const [tier, cap, maxDpr] of [['low', 2_100_000, 1.5], ['medium', 4_100_000, 2], ['high', 8_300_000, 3]] as const) {
      await command(page, { action: 'quality/set-preference', preference: tier });
      await expect.poll(async () => (await metrics(page)).world.landscape?.settings.density).toBe(tier);
      const value = await metrics(page); const canvas = await page.locator('#app-canvas').evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }));
      expect(value.viewport.bufferWidth).toBe(canvas.width); expect(value.viewport.bufferHeight).toBe(canvas.height);
      expect(value.viewport.bufferPixels).toBeLessThanOrEqual(cap); expect(value.viewport.requestedPixelRatio).toBeLessThanOrEqual(maxDpr);
      expect(value.camera.position).toEqual(before.camera.position);
      expect(value.world.roads.count).toBe(10); expect(value.world.landscape.identities).toHaveLength(10);
    }
  });
  test('reports unavailable storage without false saved copy while applying the visit choice', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('blocked'); };
      Storage.prototype.setItem = () => { throw new DOMException('blocked'); };
    });
    await ready(page); await openSettings(page);
    await expect(page.locator('#app-settings .disclosure-intro')).not.toContainText('saved');
    await expect(page.locator('#settings-persistence-note')).toHaveText('Changes last only for this visit because browser storage is unavailable.');
    await page.getByTestId('quality-low').check();
    await expect(page.getByTestId('quality-low')).toBeChecked();
    await expect(page.locator('#app-status')).toContainText('for this visit, but this browser could not save the choice');
  });

  test('opening Settings preserves the committed quality result instead of announcing panel pause', async ({ page }) => {
    test.setTimeout(60_000);
    await ready(page); await page.getByTestId('start-button').click();
    await command(page, { action: 'quality/set-preference', preference: 'medium' });
    await page.evaluate(() => {
      const status = document.querySelector('#app-status');
      if (status === null) throw new Error('Missing app status.');
      (window as typeof window & { __qualityStatusMutations?: number }).__qualityStatusMutations = 0;
      new MutationObserver(() => { (window as typeof window & { __qualityStatusMutations?: number }).__qualityStatusMutations! += 1; })
        .observe(status, { childList: true, characterData: true, subtree: true });
    });
    await expect(page.locator('#app-status')).toContainText('Medium is active');
    const committed = await page.locator('#app-status').textContent();
    const settingsButton = page.getByTestId('settings-button'); await settingsButton.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#app-settings-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-settings')).toBeHidden();
    await expect(page.locator('#app-status')).toHaveText(committed ?? '');
    await settingsButton.focus(); await page.keyboard.press('Enter');
    await page.getByTestId('close-settings-button').click();
    await expect(page.locator('#app-settings')).toBeHidden();
    await expect(page.locator('#app-status')).toHaveText(committed ?? '');
    expect(await page.evaluate(() => (window as typeof window & { __qualityStatusMutations?: number }).__qualityStatusMutations)).toBe(0);
    await expect(page.locator('#app-status')).toHaveText(committed ?? '');
  });


  test('observes lightweight quality state without publishing runtime or GPU metrics', async ({ page }) => {
    await ready(page);
    await command(page, { action: 'quality/metrics-stream', enabled: false });
    const observed = await page.locator('#app-canvas').evaluate((canvas) => {
      const runtimeBefore = canvas.getAttribute('data-three-runtime-metrics');
      const snapshotBefore = canvas.getAttribute('data-quality-metrics-snapshot');
      let state: { activeTier?: string; preference?: string } | null = null;
      document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: {
        action: 'quality/state', respond: (value: { activeTier?: string; preference?: string }) => { state = value; },
      } }));
      document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: { action: 'quality/state', respond: true } }));
      return {
        state: state as { activeTier?: string; preference?: string } | null, runtimeUnchanged: canvas.getAttribute('data-three-runtime-metrics') === runtimeBefore,
        snapshotUnchanged: canvas.getAttribute('data-quality-metrics-snapshot') === snapshotBefore,
      };
    });
    expect(observed.state).toMatchObject({ preference: 'auto' });
    expect(['low', 'medium', 'high']).toContain(observed.state?.activeTier);
    expect(observed).toMatchObject({ runtimeUnchanged: true, snapshotUnchanged: true });
    await command(page, { action: 'quality/metrics-stream', enabled: true });
  });

  test('drives multiple camera frames for at least the requested rAF duration', async ({ page }) => {
    await ready(page);
    const before = await metrics(page);
    const views = before.world.environment.cameraViews as RoutePose[];
    const wallStartedAt = Date.now();
    const driven = await driveInterpolatedRoute(page, 500, views);
    const wallElapsedMs = Date.now() - wallStartedAt;
    expect(driven.elapsedMs).toBeGreaterThanOrEqual(500);
    expect(driven.frameCount).toBeGreaterThan(1);
    expect(wallElapsedMs).toBeGreaterThanOrEqual(500);
    await command(page, { action: 'quality/metrics-snapshot' });
    const after = await metrics(page);
    expect(after.camera.position).not.toEqual(before.camera.position);
  });

  test('synthetic Auto headroom steps once and cooldown prevents oscillation', async ({ page }) => {
    test.setTimeout(60_000);
    await ready(page); await command(page, { action: 'quality/set-preference', preference: 'auto' });
    await page.getByTestId('start-button').click();
    const start = performance.timeOrigin;
    await page.evaluate(({ start }) => {
      for (let now = start; now <= start + 21_000; now += 13) document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: { action: 'quality/sample', nowMs: now } }));
    }, { start });
    const afterHeadroom = await metrics(page); const tier = afterHeadroom.world.landscape.settings.density;
    expect(['medium', 'high']).toContain(tier);
    await page.evaluate(({ start }) => {
      for (let now = start + 21_013; now <= start + 27_000; now += 21) document.dispatchEvent(new CustomEvent('three-runtime:command', { detail: { action: 'quality/sample', nowMs: now } }));
    }, { start });
    expect((await metrics(page)).world.landscape.settings.density).toBe(tier);
  });
});
