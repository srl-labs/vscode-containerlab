import { Page } from '@playwright/test';

import { test, expect } from '../fixtures/topoviewer';

// Test selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';

/**
 * Helper to get node's topoViewerRole (icon) from Cytoscape canvas
 */
async function getNodeIcon(page: Page, nodeId: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    const node = cy?.getElementById(id);
    return node?.data('topoViewerRole');
  }, nodeId);
}

/**
 * Helper to reliably open node editor via double-click on a specific node
 * Uses node ID to fetch fresh bounding box immediately before clicking
 * to avoid stale position issues from animations.
 * Includes retry logic to handle flaky double-click detection under load.
 */
async function openNodeEditorByNodeId(
  page: Page,
  nodeId: string,
  maxRetries = 3
): Promise<void> {
  const editorPanel = page.locator(SEL_NODE_EDITOR);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Get fresh bounding box right before clicking
    const nodeBox = await page.evaluate((id) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      const node = cy?.getElementById(id);
      if (!node || node.empty()) return null;

      const bb = node.renderedBoundingBox();
      const container = cy.container();
      const rect = container.getBoundingClientRect();

      return {
        x: rect.left + bb.x1,
        y: rect.top + bb.y1,
        width: bb.w,
        height: bb.h
      };
    }, nodeId);

    if (!nodeBox) {
      throw new Error(`Node ${nodeId} not found or has no bounding box`);
    }

    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    // Click to select first
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(150);

    // Double-click to open editor - use same coordinates
    await page.mouse.dblclick(centerX, centerY);

    // Wait for editor panel to appear
    try {
      await expect(editorPanel).toBeVisible({ timeout: 2000 });
      return; // Success - exit the retry loop
    } catch {
      if (attempt === maxRetries) {
        // Final attempt failed - throw with context
        throw new Error(`Failed to open node editor after ${maxRetries} attempts for node ${nodeId}`);
      }
      // Wait before retrying
      await page.waitForTimeout(300);
    }
  }
}

// Test topology file
const TEST_TOPOLOGY = 'simple.clab.yml';

/**
 * Node Icon Change E2E Tests
 *
 * Tests the persistence of node icon changes from the node editor panel.
 * Verifies that icon changes are saved both to the canvas and the annotations file.
 */
test.describe('Node Icon Changes', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify initial state - topology should have 2 nodes
    const nodeCount = await topoViewerPage.getNodeCount();
    if (nodeCount !== 2) {
      throw new Error(`Expected 2 nodes after loading ${TEST_TOPOLOGY}, but got ${nodeCount}`);
    }

    // Fit viewport to ensure nodes are visible and have stable positions
    await topoViewerPage.fit();
  });

  test('changing node icon persists to canvas and annotations file', async ({ page, topoViewerPage }) => {
    // Wait extra time for the page to fully stabilize after beforeEach
    await page.waitForTimeout(300);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    // 1. Get initial state from BOTH canvas and annotations
    const initialCanvasIcon = await getNodeIcon(page, nodeId);
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_TOPOLOGY);
    const initialNodeAnn = initialAnnotations.nodeAnnotations?.find((n: { id: string }) => n.id === nodeId);
    const initialAnnIcon = initialNodeAnn?.icon;

    console.log(`[DEBUG] Initial state - Canvas: ${initialCanvasIcon}, Annotations: ${initialAnnIcon}`);

    // 2. Open node editor by double-clicking
    await openNodeEditorByNodeId(page, nodeId);

    // 3. Change icon using the dropdown (select "Leaf" to avoid "Super Spine" conflict)
    const iconDropdown = page.locator('#node-icon');
    await iconDropdown.click();
    await page.waitForTimeout(200);

    // Type to filter and select the option
    await iconDropdown.fill('Leaf');
    await page.waitForTimeout(200);

    // Click the dropdown item - use exact text match
    const leafOption = page.locator('[data-dropdown-item]').filter({ hasText: /^Leaf$/ });
    await expect(leafOption).toBeVisible({ timeout: 3000 });
    await leafOption.click();
    await page.waitForTimeout(200);

    // 4. Apply changes
    const applyBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-apply-btn"]');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();
    await page.waitForTimeout(1000); // Wait for save

    // 5. Verify icon changed on CANVAS
    const updatedCanvasIcon = await getNodeIcon(page, nodeId);
    console.log(`[DEBUG] After apply - Canvas icon: ${updatedCanvasIcon}`);
    expect(updatedCanvasIcon, 'Canvas icon should update to leaf').toBe('leaf');

    // 6. Verify icon was saved to ANNOTATIONS file
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_TOPOLOGY);
    const updatedNodeAnn = updatedAnnotations.nodeAnnotations?.find((n: { id: string }) => n.id === nodeId);
    console.log(`[DEBUG] After apply - Annotations icon: ${updatedNodeAnn?.icon}`);
    expect(updatedNodeAnn?.icon, 'Annotations icon should be saved to file').toBe('leaf');
  });
});
