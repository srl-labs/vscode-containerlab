import { test, expect } from '../fixtures/topoviewer';

/**
 * Node Editor Panel E2E Tests
 *
 * Tests the node editor panel functionality including:
 * - Opening via double-click
 * - Tab navigation
 * - Panel close behavior
 * - Apply/OK button interactions
 *
 * KNOWN BUGS:
 * - BUG-002: Node editor panel opens on double-click even when canvas is locked.
 *   The lock state should prevent editing operations including opening the editor.
 *   Expected: Panel should NOT open when canvas is locked
 *   Actual: Panel opens regardless of lock state
 */
test.describe('Node Editor Panel', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('opens node editor panel on double-click', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    expect(nodeBox).not.toBeNull();

    // Double-click on the node
    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Editor panel should appear with correct test id
    const editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).toBeVisible();
  });

  test('node editor panel has correct title', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    const title = page.locator('[data-testid="node-editor"] [data-testid="panel-title"]');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Node Editor');
  });

  test('node editor panel has Basic tab selected by default', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Basic tab should be active
    const basicTab = page.locator('[data-testid="panel-tab-basic"]');
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveClass(/tab-active/);
  });

  test('can navigate between tabs in node editor', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Click on Configuration tab
    const configTab = page.locator('[data-testid="panel-tab-config"]');
    await expect(configTab).toBeVisible();
    await configTab.click();
    await page.waitForTimeout(200);

    // Config tab should now be active
    await expect(configTab).toHaveClass(/tab-active/);

    // Basic tab should no longer be active
    const basicTab = page.locator('[data-testid="panel-tab-basic"]');
    await expect(basicTab).not.toHaveClass(/tab-active/);
  });

  test('node editor panel has all expected tabs', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Check all expected tabs exist
    const tabs = ['basic', 'config', 'runtime', 'network', 'advanced'];
    for (const tabId of tabs) {
      const tab = page.locator(`[data-testid="panel-tab-${tabId}"]`);
      await expect(tab).toBeVisible();
    }
  });

  test('closes node editor panel with close button', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    const editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).toBeVisible();

    // Click close button
    const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test('closes node editor panel with OK button', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    const editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).toBeVisible();

    // Click OK button
    const okBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-ok-btn"]');
    await okBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test('Apply button exists in node editor panel', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Apply button should exist
    const applyBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-apply-btn"]');
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText('Apply');
  });

  test('node editor panel does not open in view mode', async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Editor panel should NOT appear in view mode
    const editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).not.toBeVisible();
  });

  test('node editor panel does not open when canvas is locked', async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(
      nodeBox!.x + nodeBox!.width / 2,
      nodeBox!.y + nodeBox!.height / 2
    );
    await page.waitForTimeout(500);

    // Editor panel should NOT appear when locked - BUG: it opens anyway
    const editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).not.toBeVisible();
  });

  test('double-click on different node opens editor for that node', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Open editor for first node
    const nodeBox1 = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    await page.mouse.dblclick(
      nodeBox1!.x + nodeBox1!.width / 2,
      nodeBox1!.y + nodeBox1!.height / 2
    );
    await page.waitForTimeout(500);

    let editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).toBeVisible();

    // Close the panel
    const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Open editor for second node
    const nodeBox2 = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    await page.mouse.dblclick(
      nodeBox2!.x + nodeBox2!.width / 2,
      nodeBox2!.y + nodeBox2!.height / 2
    );
    await page.waitForTimeout(500);

    // Editor should open again
    editorPanel = page.locator('[data-testid="node-editor"]');
    await expect(editorPanel).toBeVisible();
  });
});
