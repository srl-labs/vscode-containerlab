import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';

/**
 * Helper to reliably open node editor via double-click on a specific node
 * Uses node ID to fetch fresh bounding box immediately before clicking
 * to avoid stale position issues from animations.
 * Includes retry logic to handle flaky double-click detection under load.
 */
async function openNodeEditorByNodeId(page: Page, nodeId: string, maxRetries = 3): Promise<void> {
  const editorPanel = page.locator(SEL_NODE_EDITOR);
  const panelTab = page.locator('[data-testid="panel-tab-basic"]');
  const floatingContent = page.locator(".floating-panel-content");
  const collapsePanelButton = page.locator('[data-testid="floating-panel-collapse-btn"]');
  const closeEditorPanel = async () => {
    if (await editorPanel.isVisible()) {
      await page.locator(`${SEL_NODE_EDITOR} [data-testid="panel-close-btn"]`).click();
      await expect(editorPanel).toBeHidden({ timeout: 2000 });
    }
  };
  const collapseFloatingPanel = async () => {
    if (await floatingContent.isVisible()) {
      await collapsePanelButton.click();
      await expect(floatingContent).toBeHidden({ timeout: 2000 });
    }
  };
  const waitForStableNodeBox = async (nodeHandle: ReturnType<Page["locator"]>) => {
    let prev = await nodeHandle.boundingBox();
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(120);
      const next = await nodeHandle.boundingBox();
      if (!prev || !next) {
        prev = next;
        continue;
      }
      const stable =
        Math.abs(next.x - prev.x) < 1 &&
        Math.abs(next.y - prev.y) < 1 &&
        Math.abs(next.width - prev.width) < 1 &&
        Math.abs(next.height - prev.height) < 1;
      if (stable) return next;
      prev = next;
    }
    return prev;
  };

  const separateOverlappingNode = async () => {
    let moved = false;
    for (let i = 0; i < 2; i++) {
      const blockingId = await page.evaluate((targetId) => {
        const target = document.querySelector(`[data-id="${targetId}"]`) as HTMLElement | null;
        if (!target) return null;
        const targetRect = target.getBoundingClientRect();
        const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
        for (const node of nodes) {
          const id = node.getAttribute("data-id");
          if (!id || id === targetId) continue;
          const rect = (node as HTMLElement).getBoundingClientRect();
          const overlaps =
            targetRect.left < rect.right &&
            targetRect.right > rect.left &&
            targetRect.top < rect.bottom &&
            targetRect.bottom > rect.top;
          if (overlaps) return id;
        }
        return null;
      }, nodeId);

      if (!blockingId) break;

      const blockingHandle = page.locator(`[data-id="${blockingId}"]`);
      const blockingBox = await blockingHandle.boundingBox();
      if (!blockingBox) break;

      const startX = blockingBox.x + blockingBox.width / 2;
      const startY = blockingBox.y + blockingBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 120, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      moved = true;
    }
    return moved;
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await closeEditorPanel();
    await collapseFloatingPanel();
    await page.keyboard.press("Escape");
    await page.waitForSelector(`[data-id="${nodeId}"]`, { timeout: 5000 });
    await page.waitForTimeout(150);

    const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
    await nodeHandle.scrollIntoViewIfNeeded();
    await expect(nodeHandle).toBeVisible({ timeout: 2000 });
    await separateOverlappingNode();

    const nodeBox = await waitForStableNodeBox(nodeHandle);
    if (!nodeBox) {
      throw new Error(`Node ${nodeId} not found or has no bounding box`);
    }
    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    try {
      const hitsTarget = await page.evaluate(
        ({ x, y, id }) => {
          const el = document.elementFromPoint(x, y);
          return !!el?.closest(`[data-id="${id}"]`);
        },
        { x: centerX, y: centerY, id: nodeId }
      );
      if (!hitsTarget) {
        await separateOverlappingNode();
        continue;
      }
      await page.mouse.move(centerX, centerY);
      await page.mouse.click(centerX, centerY, { delay: 60 });
      await page.waitForTimeout(150);
      await page.mouse.dblclick(centerX, centerY, { delay: 80 });
    } catch {
      await separateOverlappingNode();
      continue;
    }

    try {
      await expect(editorPanel).toBeVisible({ timeout: 2000 });
      await expect(panelTab).toBeVisible({ timeout: 2000 });
      const nameInput = page.locator("#node-name");
      if ((await nameInput.count()) > 0) {
        await expect(nameInput).toHaveValue(nodeId, { timeout: 1000 });
      }
      return; // Success - exit the retry loop
    } catch {
      await closeEditorPanel();
      if (attempt === maxRetries) {
        // Final attempt failed - throw with context
        throw new Error(
          `Failed to open node editor after ${maxRetries} attempts for node ${nodeId}`
        );
      }
      // Wait before retrying
      await page.waitForTimeout(300);
    }
  }
}

/**
 * Node Editor Panel E2E Tests
 *
 * Tests the node editor panel functionality including:
 * - Opening via double-click
 * - Tab navigation
 * - Panel close behavior
 * - Apply/OK button interactions
 */
test.describe("Node Editor Panel", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify initial state - simple.clab.yml should have 2 nodes
    const nodeCount = await topoViewerPage.getNodeCount();
    if (nodeCount !== 2) {
      throw new Error(`Expected 2 nodes after loading simple.clab.yml, but got ${nodeCount}`);
    }

    // Fit viewport to ensure nodes are visible and have stable positions
    await topoViewerPage.fit();
  });

  test("opens node editor panel on double-click", async ({ page, topoViewerPage }) => {
    // Wait extra time for the page to fully stabilize after beforeEach
    await page.waitForTimeout(300);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Open editor using more reliable helper that re-fetches position
    await openNodeEditorByNodeId(page, nodeIds[0]);

    // Editor panel should be visible
    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).toBeVisible();
  });

  test("node editor panel has correct title", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    const title = page.locator('[data-testid="node-editor"] [data-testid="panel-title"]');
    await expect(title).toBeVisible();
    await expect(title).toHaveText("Node Editor");
  });

  test("node editor panel has Basic tab selected by default", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    // Basic tab should be active
    const basicTab = page.locator('[data-testid="panel-tab-basic"]');
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveClass(/tab-active/);
  });

  test("can navigate between tabs in node editor", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

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

  test("node editor panel has all expected tabs", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    // Check all expected tabs exist
    const tabs = ["basic", "config", "runtime", "network", "advanced"];
    for (const tabId of tabs) {
      const tab = page.locator(`[data-testid="panel-tab-${tabId}"]`);
      await expect(tab).toBeVisible();
    }
  });

  test("closes node editor panel with close button", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    const editorPanel = page.locator(SEL_NODE_EDITOR);
    // Click close button
    const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test("closes node editor panel with OK button", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    const editorPanel = page.locator(SEL_NODE_EDITOR);
    // Click OK button
    const okBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-ok-btn"]');
    await okBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(editorPanel).not.toBeVisible();
  });

  test("Apply button exists in node editor panel", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await openNodeEditorByNodeId(page, nodeIds[0]);

    // Apply button should exist
    const applyBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-apply-btn"]');
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText("Apply");
  });

  test("node editor panel does not open in view mode", async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
    await page.waitForTimeout(500);

    // Editor panel should NOT appear in view mode
    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).not.toBeVisible();
  });

  test("node editor panel does not open when canvas is locked", async ({
    page,
    topoViewerPage
  }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

    await page.mouse.dblclick(nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
    await page.waitForTimeout(500);

    // Editor panel should NOT appear when locked - BUG: it opens anyway
    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).not.toBeVisible();
  });

  test("double-click on different node opens editor for that node", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Open editor for first node
    await openNodeEditorByNodeId(page, nodeIds[0]);

    let editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).toBeVisible();

    // Close the panel and wait for it to be actually hidden
    const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await expect(editorPanel).not.toBeVisible({ timeout: 2000 });

    // Clear selection to ensure clean state for next double-click
    await topoViewerPage.clearSelection();
    await page.waitForTimeout(200);

    // Open editor for second node
    await openNodeEditorByNodeId(page, nodeIds[1]);

    // Editor should open again
    editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).toBeVisible();
  });
});
