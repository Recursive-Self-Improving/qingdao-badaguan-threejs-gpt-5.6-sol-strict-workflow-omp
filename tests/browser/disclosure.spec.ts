import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const SUPPORTED_URL = '/?capability=supported';

const SOURCED_CONTEXT_PHRASES = [
  'coastal garden-villa district in Qingdao',
  'tree-lined, pass-named roads',
  'German neoclassical, Gothic-castle, and Spanish villa families',
  'restrained palette of stone, brick/tile, stucco, timber, muted green, and red-brown roofs',
  'Princess Building’s source-bounded motif vocabulary includes Nordic/Danish, pine-green, and crafted wood-window cues',
  'Butterfly Building’s source-bounded motif vocabulary includes Mansard and brick-timber cues',
  'Huashi Building’s broad source cue is compact, sculptural, castle-like shore massing',
] as const;

const ARTISTIC_INTERPRETATION_PHRASES = [
  'Scale, geometry, road lengths, and walking distances are compressed',
  'Parcel placement and landmark adjacency are authored',
  'Exact façades and procedural silhouettes',
  'artistic inference, not measured replicas or exact reconstructions',
  'Traditional planting cues are representative garden motifs',
  'current planting or tree inventory',
  'source cues are confined to the Princess-inspired composition; its exact arrangement is authored',
  'source cues are confined to the Butterfly-inspired composition; its exact arrangement is authored',
  'Wider reuse of either landmark-specific motif family would be artistic inference, not sourced fact',
  'Any Huashi-inspired tower detail is authored rather than source-bound',
  'early-autumn morning light, haze, atmosphere, and weather are authored',
  'not a report of current conditions',
] as const;

interface DisclosureTestWindow extends Window {
  __disclosureLiveMutations?: number;
  __disclosureLiveObserver?: MutationObserver;
}

async function tabTo(page: Page, target: Locator, reverse = false): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}

async function pointerActivate(target: Locator, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === 'mobile-chromium') {
    await target.tap();
    return;
  }

  await target.click();
}

async function expectMinimumTargetSize(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectWithinViewport(target: Locator): Promise<void> {
  const metrics = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(metrics.left).toBeGreaterThanOrEqual(-0.5);
  expect(metrics.top).toBeGreaterThanOrEqual(-0.5);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 0.5);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 0.5);
}

async function expectScrollSafe(target: Locator): Promise<void> {
  const metrics = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(['hidden', 'clip']).toContain(metrics.overflowX);
  if (metrics.scrollHeight > metrics.clientHeight + 1) {
    expect(['auto', 'scroll']).toContain(metrics.overflowY);
  }
}

async function expectLastItemReachable(scroller: Locator, section: Locator): Promise<void> {
  const lastItem = section.locator('li').last();
  await lastItem.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  const [scrollerBox, itemBox] = await Promise.all([
    scroller.boundingBox(),
    lastItem.boundingBox(),
  ]);

  expect(scrollerBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  expect(itemBox?.y ?? 0).toBeGreaterThanOrEqual((scrollerBox?.y ?? 0) - 1);
  expect((itemBox?.y ?? 0) + (itemBox?.height ?? 0)).toBeLessThanOrEqual(
    (scrollerBox?.y ?? 0) + (scrollerBox?.height ?? 0) + 1,
  );
}

async function expectNoDocumentHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));

  expect(widths.documentScroll).toBeLessThanOrEqual(widths.documentClient + 1);
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient + 1);
}

async function startLiveRegionObservation(page: Page): Promise<string> {
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  return page.evaluate(() => {
    const liveRegion = document.querySelector('[aria-live]');
    if (!(liveRegion instanceof HTMLElement)) throw new Error('Missing live region');

    const state = window as DisclosureTestWindow;
    state.__disclosureLiveObserver?.disconnect();
    state.__disclosureLiveMutations = 0;
    state.__disclosureLiveObserver = new MutationObserver((records) => {
      state.__disclosureLiveMutations =
        (state.__disclosureLiveMutations ?? 0) + records.length;
    });
    state.__disclosureLiveObserver.observe(liveRegion, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return liveRegion.textContent ?? '';
  });
}

async function expectLiveRegionUnchanged(page: Page, initialText: string): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect.poll(() => page.evaluate(() =>
    (window as DisclosureTestWindow).__disclosureLiveMutations ?? -1,
  )).toBe(0);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('[aria-live]')).toHaveText(initialText);
}

async function expectDisclosure(
  surface: Locator,
  sourced: Locator,
  interpretation: Locator,
): Promise<void> {
  await expect(surface.getByRole('heading', { name: 'Sourced context' })).toBeVisible();
  await expect(surface.getByRole('heading', { name: 'Artistic interpretation' })).toBeVisible();
  await expect(sourced.locator('li')).toHaveCount(5);
  await expect(interpretation.locator('li')).toHaveCount(9);
  await expect(surface).toContainText(
    'Only the broad cues listed as sourced context are treated as source-bounded; exact composition choices are authored',
  );

  for (const phrase of SOURCED_CONTEXT_PHRASES) {
    await expect(sourced).toContainText(phrase);
  }
  for (const phrase of ARTISTIC_INTERPRETATION_PHRASES) {
    await expect(interpretation).toContainText(phrase);
  }

  await expect(surface.locator('a')).toHaveCount(0);
  await expect(surface.locator('[aria-live], [role="alert"], [role="status"]')).toHaveCount(0);
}

for (const key of ['Enter', 'Space'] as const) {
  test(`native About is keyboard reachable and toggles with ${key}`, async ({ page }) => {
    await page.goto(SUPPORTED_URL);
    await expect(page.getByTestId('start-button')).toBeFocused();

    const toggle = page.getByTestId('about-toggle');
    const disclosure = page.getByTestId('about-disclosure');
    const panel = page.getByTestId('about-panel');
    await tabTo(page, toggle, true);
    await expectMinimumTargetSize(toggle);

    await page.keyboard.press(key);
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(panel).toBeVisible();
    await expect(toggle).toBeFocused();

    await page.keyboard.press(key);
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
  });
}

test('desktop clicks and mobile taps reach About, Help, and Close', async ({ page }, testInfo) => {
  await page.goto(SUPPORTED_URL);
  await expect(page.getByTestId('start-button')).toBeFocused();

  const aboutToggle = page.getByTestId('about-toggle');
  const about = page.getByTestId('about-disclosure');
  await expectMinimumTargetSize(aboutToggle);
  await pointerActivate(aboutToggle, testInfo);
  await expect(about).toHaveAttribute('open', '');
  await pointerActivate(aboutToggle, testInfo);
  await expect(about).not.toHaveAttribute('open', '');

  const helpButton = page.getByTestId('help-button');
  await expectMinimumTargetSize(helpButton);
  await pointerActivate(helpButton, testInfo);
  const help = page.getByTestId('help-panel');
  const close = page.getByTestId('close-help-button');
  await expect(help).toBeVisible();
  await expect(helpButton).toHaveAttribute('aria-expanded', 'true');
  await expectMinimumTargetSize(close);
  await expect(page.locator('#app-overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).toHaveAttribute('inert', '');

  await pointerActivate(close, testInfo);
  await expect(help).toBeHidden();
  await expect(helpButton).toBeFocused();
  await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-overlay')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).not.toHaveAttribute('inert', '');
});

test('both disclosure surfaces are complete, scroll-safe, and lifecycle-neutral', async ({ page }) => {
  await page.goto(SUPPORTED_URL);
  await expect(page.getByTestId('start-button')).toBeFocused();
  const initialLiveText = await startLiveRegionObservation(page);

  const aboutToggle = page.getByTestId('about-toggle');
  await aboutToggle.click();
  const aboutPanel = page.getByTestId('about-panel');
  const aboutSourced = page.getByTestId('about-sourced-context');
  const aboutInterpretation = page.getByTestId('about-artistic-interpretation');
  await expectDisclosure(aboutPanel, aboutSourced, aboutInterpretation);
  await expectWithinViewport(aboutPanel);
  await expectScrollSafe(aboutPanel);
  await expectLastItemReachable(aboutPanel, aboutInterpretation);
  await expectNoDocumentHorizontalScroll(page);
  await aboutToggle.click();

  const helpButton = page.getByTestId('help-button');
  await helpButton.click();
  const help = page.getByTestId('help-panel');
  const helpContent = page.getByTestId('help-disclosure');
  const helpSourced = page.getByTestId('help-sourced-context');
  const helpInterpretation = page.getByTestId('help-artistic-interpretation');
  await expect(help).toBeVisible();
  await expect(page.locator('#app-help-title')).toBeFocused();
  await expect(page.locator('#app-overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).toHaveAttribute('inert', '');
  await expectDisclosure(helpContent, helpSourced, helpInterpretation);
  await expectWithinViewport(help);
  await expectScrollSafe(helpContent);
  await expectLastItemReachable(helpContent, helpInterpretation);
  await expect(page.getByTestId('close-help-button')).toBeVisible();
  await expectNoDocumentHorizontalScroll(page);

  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(helpButton).toBeFocused();
  await expect(page.locator('#app-overlay')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#app-controls')).not.toHaveAttribute('inert', '');
  await expectLiveRegionUnchanged(page, initialLiveText);
});
