import { expect, test, type Page } from '@playwright/test';

const ONBOARDING_COPY =
  'Explore Badaguan in Qingdao. Move with WASD or the arrow keys, look with the mouse or drag/touch, and press Escape to pause or release the mouse.';
const LOCKED_COPY = 'Press Escape to release';
const DRAG_COPY =
  'Mouse lock is unavailable. Drag and use the keyboard, or use touch, to explore Badaguan.';
const PAUSED_COPY =
  'Exploration is paused. Resume for drag and keyboard, or touch, exploration.';
const UNSUPPORTED_COPY =
  'This browser cannot run the Badaguan 3D experience. You can retry after changing browser or device settings. WebGL2 is unavailable in this browser.';
const SUPPORTED_URL = '/?capability=supported';

function supportedScenarioUrl(scenario: string): string {
  return `/?lifecycle=${scenario}&capability=supported`;
}

const FALLBACK_COPY_BY_SCENARIO = {
  denied:
    'Mouse lock was denied. Drag and use the keyboard, or use touch, to explore Badaguan.',
  error:
    'Mouse lock could not start. Drag and use the keyboard, or use touch, to explore Badaguan.',
  unlocked:
    'The mouse is released. Drag and use the keyboard, or use touch, to explore Badaguan.',
} as const;

async function expectOnboarding(page: Page): Promise<void> {
  await expect(page.locator('#app-detail')).toHaveText(ONBOARDING_COPY);
  await expect(page.getByTestId('start-button')).toBeVisible();
  await expect(page.getByTestId('start-button')).toBeFocused();
}

test('boots through capability evaluation into accessible Badaguan onboarding', async ({ page }) => {
  await page.goto(SUPPORTED_URL);

  await expectOnboarding(page);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'onboarding');
  await expect(page.locator('#app-status')).toHaveCount(1);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('#app-canvas')).not.toHaveAttribute('tabindex', /.+/);
});

for (const key of ['Enter', 'Space'] as const) {
  test(`starts with the keyboard ${key} activation`, async ({ page }) => {
    await page.goto(SUPPORTED_URL);
    await expectOnboarding(page);

    await page.keyboard.press(key);

    await expect(page.locator('#app-detail')).toHaveText(DRAG_COPY);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
    await expect(page.getByTestId('pause-button')).toBeVisible();
  });
}

test('opens Help without optimistic lifecycle changes and closes it accessibly', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);

  await page.getByTestId('help-button').click();

  const help = page.getByTestId('help-panel');
  await expect(help).toBeVisible();
  await expect(help).toContainText('WASD');
  await expect(help).toContainText('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'onboarding');

  await page.getByTestId('close-help-button').click();
  await expect(help).toBeHidden();
  await expect(page.getByTestId('start-button')).toBeVisible();
});

test('opens Settings and returns focus to its trigger when closed', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);

  await page.getByTestId('settings-button').click();

  const settings = page.getByTestId('settings-panel');
  await expect(settings).toBeVisible();
  await expect(settings).toContainText('WASD and arrow keys');
  await page.getByTestId('close-settings-button').click();
  await expect(settings).toBeHidden();
  await expect(page.getByTestId('settings-button')).toBeFocused();
});

test('Escape pauses drag exploration and Resume restores it', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);
  await page.getByTestId('start-button').click();
  await expect(page.locator('#app-detail')).toHaveText(DRAG_COPY);

  await page.keyboard.press('Escape');

  await expect(page.locator('#app-detail')).toHaveText(PAUSED_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'paused');
  await page.getByTestId('resume-button').click();
  await expect(page.locator('#app-detail')).toHaveText(DRAG_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
});

test('illegal lifecycle input is safe and does not optimistically mutate onboarding', async ({
  page,
}) => {
  await page.goto(SUPPORTED_URL);
  await expectOnboarding(page);

  await page.keyboard.press('Escape');

  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'onboarding');
  await expect(page.locator('#app-detail')).toHaveText(ONBOARDING_COPY);
  await expect(page.getByTestId('resume-button')).toHaveCount(0);
  await expect(page.getByTestId('retry-button')).toHaveCount(0);
});

test('forced locked projection uses the exact release instruction', async ({ page }) => {
  await page.goto(supportedScenarioUrl('locked'));
  await expectOnboarding(page);
  await page.getByTestId('start-button').click();

  await expect(page.locator('#app-detail')).toHaveText(LOCKED_COPY);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-detail')).toHaveText(
    FALLBACK_COPY_BY_SCENARIO.unlocked,
  );
});

for (const scenario of ['denied', 'error', 'unlocked'] as const) {
  test(`forced ${scenario} pointer-lock outcome visibly offers fallback controls`, async ({ page }) => {
    await page.goto(supportedScenarioUrl(scenario));
    await expectOnboarding(page);
    await page.getByTestId('start-button').click();

    await expect(page.locator('#app-detail')).toHaveText(FALLBACK_COPY_BY_SCENARIO[scenario]);
    await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'exploring');
  });
}

test('forced unsupported remains unsupported on Retry and creates no runtime marker', async ({
  page,
}) => {
  await page.goto('/?lifecycle=unsupported');

  await expect(page.locator('#app-detail')).toHaveText(UNSUPPORTED_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'unsupported');
  await expect(page.getByTestId('start-button')).toHaveCount(0);
  await expect(page.locator('[data-three-runtime], [data-renderer-runtime], [data-runtime-created]')).toHaveCount(0);

  await page.getByTestId('retry-button').click();

  await expect(page.locator('#app-detail')).toHaveText(UNSUPPORTED_COPY);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'unsupported');
  await expect(page.locator('[data-three-runtime], [data-renderer-runtime], [data-runtime-created]')).toHaveCount(0);
});
