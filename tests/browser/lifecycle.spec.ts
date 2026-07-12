import { expect, test, type Locator, type Page } from '@playwright/test';

const ONBOARDING_COPY =
  'Explore Badaguan in Qingdao. Move with WASD or the arrow keys, look with the mouse or drag/touch, and press Escape to pause or release the mouse.';
const LOCKED_COPY = 'Press Escape to release';
const DRAG_COPY =
  'Mouse lock is unavailable. Drag and use the keyboard, or use touch, to explore Badaguan.';
const PAUSED_COPY =
  'Exploration is paused. Resume for drag and keyboard, or touch, exploration.';
const LOCKED_PAUSED_COPY = 'Exploration paused. Resume when you are ready.';
const UNSUPPORTED_COPY =
  'This browser cannot run the Badaguan 3D experience. You can retry after changing browser or device settings. WebGL2 is unavailable in this browser.';
const SUPPORTED_URL = '/?capability=supported';

function supportedScenarioUrl(scenario: string): string {
  return `/?lifecycle=${scenario}&capability=supported`;
}

const FALLBACK_COPY_BY_SCENARIO = {
  denied: 'Mouse lock was denied. Drag and use the keyboard, or use touch, to explore Badaguan.',
  error: 'Mouse lock could not start. Drag and use the keyboard, or use touch, to explore Badaguan.',
  unlocked: 'The mouse is released. Drag and use the keyboard, or use touch, to explore Badaguan.',
} as const;

async function expectOnboarding(page: Page): Promise<void> {
  await expect(page.locator('#app-detail')).toHaveText(ONBOARDING_COPY);
  await expect(page.getByTestId('start-button')).toBeVisible();
  await expect(page.getByTestId('start-button')).toBeFocused();
}

async function tabTo(page: Page, target: Locator, reverse = false): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}

async function activate(page: Page, target: Locator, key: 'Enter' | 'Space'): Promise<void> {
  await tabTo(page, target);
  await expect(target).toBeFocused();
  await page.keyboard.press(key);
}

async function resetStatusMutations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const status = document.querySelector('#app-status');
    if (!(status instanceof HTMLElement)) throw new Error('Missing status');
    const windowWithCounter = window as typeof window & { __statusMutations?: number };
    windowWithCounter.__statusMutations = 0;
    new MutationObserver((records) => {
      windowWithCounter.__statusMutations =
        (windowWithCounter.__statusMutations ?? 0) + records.length;
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
}

async function expectStatusMutations(page: Page, count: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __statusMutations?: number }).__statusMutations ?? -1)).toBe(count);
}

test('boots into accessible onboarding with transient busy scoped away from the live region', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'onboarding');
  await expect(page.locator('#app-status')).toHaveCount(1);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('#app-status')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#experience')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#app-canvas')).not.toHaveAttribute('tabindex', /.+/);
});

for (const key of ['Enter', 'Space'] as const) {
  test(`completes the lifecycle using only Tab, Shift+Tab, ${key}, and Escape`, async ({ page }) => {
    await page.goto(SUPPORTED_URL);
    await expectOnboarding(page);
    await page.keyboard.press(key);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');

    const helpButton = page.getByTestId('help-button');
    await activate(page, helpButton, key);
    const help = page.getByTestId('help-panel');
    await expect(help).toBeVisible();
    await expect(help).toContainText('WASD');
    await expect(page.locator('#app-overlay')).toHaveAttribute('inert', '');
    await expect(page.locator('#app-controls')).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('close-help-button')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement;
      return active !== null &&
        !document.querySelector('#app-overlay')?.contains(active) &&
        !document.querySelector('#app-controls')?.contains(active);
    })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect(helpButton).toBeFocused();
    await expect(page.locator('#app-overlay')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#app-controls')).not.toHaveAttribute('inert', '');

    await page.keyboard.press('Escape');
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
    const resume = page.getByTestId('resume-button');
    await activate(page, resume, key);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');

    await page.goto('/?capability=unsupported-then-supported');
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'unsupported');
    const retry = page.getByTestId('retry-button');
    await activate(page, retry, key);
    await expectOnboarding(page);
  });
}

test('Help close returns focus to its trigger and covered controls stay out of tab order', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  const helpButton = page.getByTestId('help-button');
  await activate(page, helpButton, 'Enter');
  await expect(page.getByTestId('help-panel')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('close-help-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    return active !== null &&
      !document.querySelector('#app-overlay')?.contains(active) &&
      !document.querySelector('#app-controls')?.contains(active);
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(helpButton).toBeFocused();
});

test('panel-only rerenders do not announce, while one lifecycle transition announces once', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  await resetStatusMutations(page);
  await activate(page, page.getByTestId('help-button'), 'Enter');
  await page.keyboard.press('Escape');
  await expectStatusMutations(page, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'onboarding');
  await expectStatusMutations(page, 0);
  await page.getByTestId('start-button').press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  await expectStatusMutations(page, 1);
});

test('Settings drawer isolates the background and returns focus to its trigger', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  const settings = page.getByTestId('settings-button');
  await activate(page, settings, 'Space');
  const settingsPanel = page.getByTestId('settings-panel');
  await expect(settingsPanel).toBeVisible();
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#app-overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('close-settings-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    return active !== null &&
      !document.querySelector('#app-overlay')?.contains(active) &&
      !document.querySelector('#app-controls')?.contains(active);
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(settingsPanel).toBeHidden();
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-overlay')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).not.toHaveAttribute('inert', '');
});

test('Escape pauses drag exploration and keyboard Resume restores it', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#app-detail')).toHaveText(DRAG_COPY);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-detail')).toHaveText(PAUSED_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await activate(page, page.getByTestId('resume-button'), 'Enter');
  await expect(page.locator('#app-detail')).toHaveText(DRAG_COPY);
});

test('Escape pauses locked exploration instead of keeping exploration active', async ({ page }) => {
  await page.goto(supportedScenarioUrl('locked'));
  await expectOnboarding(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#app-detail')).toHaveText(LOCKED_COPY);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await expect(page.locator('#app-detail')).toHaveText(LOCKED_PAUSED_COPY);
  await expect(page.getByTestId('resume-button')).toBeVisible();
});

for (const scenario of ['denied', 'error', 'unlocked'] as const) {
  test(`forced ${scenario} pointer-lock outcome visibly offers fallback controls`, async ({ page }) => {
    await page.goto(supportedScenarioUrl(scenario));
    await expectOnboarding(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('#app-detail')).toHaveText(FALLBACK_COPY_BY_SCENARIO[scenario]);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  });
}

test('Retry re-evaluates capabilities from unsupported to supported', async ({ page }) => {
  await page.goto('/?capability=unsupported-then-supported');
  await expect(page.locator('#app-detail')).toHaveText(UNSUPPORTED_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'unsupported');
  await expect(page.locator('[data-three-runtime], canvas[data-renderer], [data-renderer-runtime], [data-runtime-created]')).toHaveCount(0);
  await activate(page, page.getByTestId('retry-button'), 'Enter');
  await expectOnboarding(page);
  await expect(page.locator('[data-three-runtime], canvas[data-renderer], [data-renderer-runtime], [data-runtime-created]')).toHaveCount(0);
});

for (const key of ['Enter', 'Space'] as const) {
  test(`forced degraded keeps Start focused and supports ${key}`, async ({ page }) => {
    await page.goto(supportedScenarioUrl('degraded'));
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'degraded');
    await expect(page.getByTestId('start-button')).toBeFocused();
    await expect(page.locator('#experience')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press(key);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'degraded');
    await expect(page.getByTestId('pause-button')).toBeVisible();
  });
}

for (const scenario of ['context-lost', 'fatal'] as const) {
  test(`forced ${scenario} is actionable, announced, and not left busy`, async ({ page }) => {
    await page.goto(supportedScenarioUrl(scenario));
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', scenario);
    await expect(page.getByTestId('retry-button')).toBeVisible();
    await expect(page.locator('#app-status')).toBeVisible();
    await expect(page.locator('#app-status')).not.toHaveText('');
    if (scenario === 'context-lost') {
      await expect(page.locator('#app-detail')).toContainText(/restart is required/i);
    }
    await expect(page.locator('#experience')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#app-overlay')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[aria-live]')).toHaveCount(1);
  });
}
