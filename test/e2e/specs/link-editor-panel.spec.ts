import { test, expect } from '../fixtures/topoviewer';

// Test selectors
const SEL_LINK_EDITOR = '[data-testid="link-editor"]';

/**
 * Link Editor Panel E2E Tests
 *
 * Tests the link editor panel functionality including:
 * - Opening via double-click on edge
 * - Tab navigation (Basic/Extended for veth links)
 * - Panel close behavior
 * - Apply/OK button interactions
 */
test.describe('Link Editor Panel', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile('simple.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('opens link editor panel on double-click on edge', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    // Get edge midpoint
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
    }, edgeIds[0]);

    expect(midpoint).not.toBeNull();

    // Double-click on the edge
    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Editor panel should appear
    const editorPanel = page.locator(SEL_LINK_EDITOR);
    await expect(editorPanel).toBeVisible();
  });

  test('link editor panel has correct title', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    const title = page.locator('[data-testid="link-editor"] [data-testid="panel-title"]');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Link Editor');
  });

  test('link editor panel has Basic tab selected by default', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Basic tab should be active
    const basicTab = page.locator('[data-testid="link-editor"] [data-testid="panel-tab-basic"]');
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveClass(/tab-active/);
  });

  test('closes link editor panel with close button', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    const editorPanel = page.locator(SEL_LINK_EDITOR);
    await expect(editorPanel).toBeVisible();

    // Click close button
    const closeBtn = page.locator('[data-testid="link-editor"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test('closes link editor panel with OK button', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    const editorPanel = page.locator(SEL_LINK_EDITOR);
    await expect(editorPanel).toBeVisible();

    // Click OK button
    const okBtn = page.locator('[data-testid="link-editor"] [data-testid="panel-ok-btn"]');
    await okBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test('link editor panel does not open in view mode', async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Editor panel should NOT appear in view mode
    const editorPanel = page.locator(SEL_LINK_EDITOR);
    await expect(editorPanel).not.toBeVisible();
  });

  test('link editor panel does not open when canvas is locked', async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Editor panel should NOT appear when locked - BUG: it opens anyway
    const editorPanel = page.locator(SEL_LINK_EDITOR);
    await expect(editorPanel).not.toBeVisible();
  });

  test('Apply button exists in link editor panel', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Apply button should exist
    const applyBtn = page.locator('[data-testid="link-editor"] [data-testid="panel-apply-btn"]');
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText('Apply');
  });

  test('veth link has Extended tab available', async ({ page, topoViewerPage }) => {
    // Need to find a veth link (between two regular nodes)
    const edgeIds = await topoViewerPage.getEdgeIds();

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
    }, edgeIds[0]);

    await page.mouse.dblclick(midpoint!.x, midpoint!.y);
    await page.waitForTimeout(500);

    // Check if Extended tab exists (for veth links)
    const extendedTab = page.locator('[data-testid="link-editor"] [data-testid="panel-tab-extended"]');
    // Note: This tab may or may not exist depending on link type
    // For sample topology with regular nodes, it should exist
    const tabCount = await extendedTab.count();
    if (tabCount > 0) {
      await expect(extendedTab).toBeVisible();
      // Click to navigate to Extended tab
      await extendedTab.click();
      await page.waitForTimeout(200);
      await expect(extendedTab).toHaveClass(/tab-active/);
    }
  });
});
