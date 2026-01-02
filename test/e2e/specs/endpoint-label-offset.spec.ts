import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/topoviewer';

const SIMPLE_FILE = 'simple.clab.yml';

const ENDPOINT_LABEL_MENU_TEXT = 'Adjust Endpoint Offset';
const ARIA_CHECKED_ATTR = 'aria-checked';

const SEL_LINK_LABELS_BTN = '[data-testid="navbar-link-labels"]';
const SEL_LINK_LABELS_MENU = `.navbar-menu:has-text("${ENDPOINT_LABEL_MENU_TEXT}")`;
const SEL_ENDPOINT_TOGGLE = `${SEL_LINK_LABELS_MENU} .navbar-menu-option:has-text("${ENDPOINT_LABEL_MENU_TEXT}")`;
const SEL_ENDPOINT_SLIDER = `${SEL_LINK_LABELS_MENU} input[aria-label="Endpoint label offset"]`;

async function openLinkLabelsMenu(page: Page): Promise<Locator> {
  await page.locator(SEL_LINK_LABELS_BTN).click();
  const menu = page.locator(SEL_LINK_LABELS_MENU);
  await expect(menu).toBeVisible();
  return menu;
}

test.describe('Endpoint Label Offset', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
  });

  test('persists global endpoint label offset settings and restores on reload', async ({ page, topoViewerPage }) => {
    await expect.poll(
      async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
        return annotations.viewerSettings?.endpointLabelOffsetEnabled;
      },
      { timeout: 5000, message: 'default endpoint label offset should be persisted' }
    ).toBe(true);

    await openLinkLabelsMenu(page);
    const toggle = page.locator(SEL_ENDPOINT_TOGGLE);
    const slider = page.locator(SEL_ENDPOINT_SLIDER);

    await expect(toggle).toHaveAttribute(ARIA_CHECKED_ATTR, 'true');
    await expect(slider).toBeEnabled();

    await toggle.click();
    await expect(toggle).toHaveAttribute(ARIA_CHECKED_ATTR, 'false');
    await expect(slider).toBeDisabled();
    await expect.poll(
      async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
        return annotations.viewerSettings?.endpointLabelOffsetEnabled;
      },
      { timeout: 5000, message: 'endpoint label offset toggle should persist off' }
    ).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute(ARIA_CHECKED_ATTR, 'true');
    await expect(slider).toBeEnabled();
    await expect.poll(
      async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
        return annotations.viewerSettings?.endpointLabelOffsetEnabled;
      },
      { timeout: 5000, message: 'endpoint label offset toggle should persist on' }
    ).toBe(true);

    const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    const offsetValue = 28;
    const nextAnnotations = {
      ...annotations,
      viewerSettings: {
        ...(annotations.viewerSettings ?? {}),
        endpointLabelOffsetEnabled: true,
        endpointLabelOffset: offsetValue
      }
    };
    await topoViewerPage.writeAnnotationsFile(SIMPLE_FILE, nextAnnotations);

    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await openLinkLabelsMenu(page);
    await expect(page.locator(SEL_ENDPOINT_TOGGLE)).toHaveAttribute(ARIA_CHECKED_ATTR, 'true');
    await expect(page.locator(SEL_ENDPOINT_SLIDER)).toBeEnabled();
    await expect(page.locator(SEL_ENDPOINT_SLIDER)).toHaveValue(String(offsetValue));
  });
});
