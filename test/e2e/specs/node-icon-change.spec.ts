import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';

/**
 * Helper to get node's topoViewerRole (icon) from React Flow canvas
 */
async function getNodeIcon(page: Page, nodeId: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return undefined;
    const nodes = rf.getNodes?.() ?? [];
    const node = nodes.find((n: any) => n.id === id);
    const data = node?.data ?? {};
    return data.role ?? data.extraData?.topoViewerRole;
  }, nodeId);
}

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

// Test topology file
const TEST_TOPOLOGY = "simple.clab.yml";

/**
 * Node Icon Change E2E Tests
 *
 * Tests the persistence of node icon changes from the node editor panel.
 * Verifies that icon changes are saved both to the canvas and the annotations file.
 */
test.describe("Node Icon Changes", () => {
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

  test("changing node icon persists to canvas and annotations file", async ({
    page,
    topoViewerPage
  }) => {
    // Wait extra time for the page to fully stabilize after beforeEach
    await page.waitForTimeout(300);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    // 1. Get initial state from BOTH canvas and annotations
    const initialCanvasIcon = await getNodeIcon(page, nodeId);
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_TOPOLOGY);
    const initialNodeAnn = initialAnnotations.nodeAnnotations?.find(
      (n: { id: string }) => n.id === nodeId
    );
    const initialAnnIcon = initialNodeAnn?.icon;

    console.log(
      `[DEBUG] Initial state - Canvas: ${initialCanvasIcon}, Annotations: ${initialAnnIcon}`
    );

    // 2. Open node editor by double-clicking
    await openNodeEditorByNodeId(page, nodeId);

    // 3. Change icon using the dropdown (select "Leaf" to avoid "Super Spine" conflict)
    const iconDropdown = page.locator("#node-icon");
    await iconDropdown.click();
    await page.waitForTimeout(200);

    // Type to filter and select the option
    await iconDropdown.fill("Leaf");
    await page.waitForTimeout(200);

    // Click the dropdown item - use exact text match
    const leafOption = page.locator("[data-dropdown-item]").filter({ hasText: /^Leaf$/ });
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
    expect(updatedCanvasIcon, "Canvas icon should update to leaf").toBe("leaf");

    // 6. Verify icon was saved to ANNOTATIONS file
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_TOPOLOGY);
    const updatedNodeAnn = updatedAnnotations.nodeAnnotations?.find(
      (n: { id: string }) => n.id === nodeId
    );
    console.log(`[DEBUG] After apply - Annotations icon: ${updatedNodeAnn?.icon}`);
    expect(updatedNodeAnn?.icon, "Annotations icon should be saved to file").toBe("leaf");
  });
});
