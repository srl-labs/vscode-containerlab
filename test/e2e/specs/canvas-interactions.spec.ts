import { test, expect } from "../fixtures/topoviewer";

test.describe("Canvas Interactions", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test("canvas is visible and has correct selector", async ({ page }) => {
    const canvas = page.locator(".react-flow");
    await expect(canvas).toBeVisible();
  });

  test("app container is visible", async ({ page }) => {
    const app = page.locator('[data-testid="topoviewer-app"]');
    await expect(app).toBeVisible();
  });

  test("click on empty canvas deselects all", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Click on empty canvas area (far from center where nodes are)
    await topoViewerPage.clearSelection();
    await page.waitForTimeout(200);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(0);
  });

  test("lock state persists across interactions", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();

    // Unlock the canvas
    await topoViewerPage.unlock();
    let isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(false);

    // Lock the canvas
    await topoViewerPage.lock();
    isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(true);

    // Verify lock persists after some interactions
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(100);

    isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(true);
  });

  test("mode switching works correctly", async ({ topoViewerPage }) => {
    // Start in edit mode
    await topoViewerPage.setEditMode();

    // Switch to view mode
    await topoViewerPage.setViewMode();

    // Node count should remain the same
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBeGreaterThan(0);

    // Switch back to edit mode
    await topoViewerPage.setEditMode();

    // Node count should still be the same
    const nodeCountAfter = await topoViewerPage.getNodeCount();
    expect(nodeCountAfter).toBe(nodeCount);
  });
});
