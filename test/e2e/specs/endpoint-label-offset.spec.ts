import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../fixtures/topoviewer';

const SIMPLE_FILE = 'simple.clab.yml';

const ENDPOINT_LABEL_MENU_TEXT = 'Adjust Endpoint Offset';
const ARIA_CHECKED_ATTR = 'aria-checked';

const SEL_LINK_LABELS_BTN = '[data-testid="navbar-link-labels"]';
const SEL_LINK_LABELS_MENU = `.navbar-menu:has-text("${ENDPOINT_LABEL_MENU_TEXT}")`;
const SEL_ENDPOINT_TOGGLE = `${SEL_LINK_LABELS_MENU} .navbar-menu-option:has-text("${ENDPOINT_LABEL_MENU_TEXT}")`;
const SEL_ENDPOINT_SLIDER = `${SEL_LINK_LABELS_MENU} input[aria-label="Endpoint label offset"]`;
const SEL_LINK_EDITOR = '[data-testid="link-editor"]';
const SEL_PANEL_APPLY = '[data-testid="panel-apply-btn"]';
const SEL_LINK_OFFSET_OVERRIDE = '#link-endpoint-offset-override';

async function openLinkLabelsMenu(page: Page): Promise<Locator> {
  await page.locator(SEL_LINK_LABELS_BTN).click();
  const menu = page.locator(SEL_LINK_LABELS_MENU);
  await expect(menu).toBeVisible();
  return menu;
}

async function openLinkEditorForEdge(page: Page, edgeId: string): Promise<Locator> {
  const midpoint = await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    const edge = cy?.getElementById(id);
    if (!edge || edge.empty()) return null;

    const bb = edge.renderedBoundingBox();
    const container = cy.container();
    const rect = container.getBoundingClientRect();

    return {
      x: rect.left + bb.x1 + bb.w / 2,
      y: rect.top + bb.y1 + bb.h / 2
    };
  }, edgeId);

  if (!midpoint) throw new Error(`Edge ${edgeId} not found`);
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  const panel = page.locator(SEL_LINK_EDITOR);
  await expect(panel).toBeVisible();
  return panel;
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

  test('undo/redo syncs per-link endpoint offset override', async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);
    const edgeId = edgeIds[0];

    const panel = await openLinkEditorForEdge(page, edgeId);
    await panel.locator(SEL_LINK_OFFSET_OVERRIDE).check();
    await panel.locator(SEL_PANEL_APPLY).click();

    const getOffsetEnabled = async () => {
      const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
      const entry = annotations.edgeAnnotations?.find((edge) => edge.id === edgeId);
      return entry?.endpointLabelOffsetEnabled ?? false;
    };

    await expect.poll(getOffsetEnabled, {
      timeout: 5000,
      message: 'per-link endpoint offset should persist on apply'
    }).toBe(true);

    await topoViewerPage.undo();
    await expect.poll(getOffsetEnabled, {
      timeout: 5000,
      message: 'undo should revert per-link endpoint offset override'
    }).toBe(false);

    await topoViewerPage.redo();
    await expect.poll(getOffsetEnabled, {
      timeout: 5000,
      message: 'redo should restore per-link endpoint offset override'
    }).toBe(true);
  });
});
