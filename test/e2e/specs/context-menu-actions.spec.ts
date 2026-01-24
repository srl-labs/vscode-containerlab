import { test, expect } from "../fixtures/topoviewer";
import { rightClick, getEdgeMidpoint } from "../helpers/cytoscape-helpers";

// Test file name
const SIMPLE_FILE = "simple.clab.yml";

// Test selectors
const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_EDIT_NODE_ITEM = '[data-testid="context-menu-item-edit-node"]';
const SEL_EDIT_EDGE_ITEM = '[data-testid="context-menu-item-edit-edge"]';

/**
 * Context Menu Actions E2E Tests
 *
 * Tests the context menu functionality including:
 * - Node context menu in edit mode (Edit, Delete, Create Link)
 * - Node context menu in view mode (SSH, Shell, Logs, Info)
 * - Edge context menu in edit mode (Edit, Delete)
 * - Edge context menu in view mode (Capture, Info)
 * - Menu visibility and dismissal
 */
test.describe("Context Menu Actions", () => {
  test.describe("Node Context Menu - Edit Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test("right-click on node shows context menu with Edit, Delete, and Create Link options", async ({
      page,
      topoViewerPage
    }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      // Verify context menu is visible (Playwright auto-waits)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      // Verify all edit mode options are present
      await expect(page.locator(SEL_EDIT_NODE_ITEM)).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-delete-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-link-node"]')).toBeVisible();
    });

    test("clicking Edit opens node editor panel", async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      // Wait for menu item to be visible, then click
      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      await expect(editItem).toBeVisible();
      await editItem.click();

      // Context menu should close
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).not.toBeVisible();

      // Node editor should open
      const nodeEditor = page.locator('[data-testid="node-editor"]');
      await expect(nodeEditor).toBeVisible();
    });

    test("clicking Delete removes the node", async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      // Wait for menu item to be visible, then click
      const deleteItem = page.locator('[data-testid="context-menu-item-delete-node"]');
      await expect(deleteItem).toBeVisible();
      await deleteItem.click();

      // Wait for menu to close (indicates action completed)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).not.toBeVisible();

      const finalNodeCount = await topoViewerPage.getNodeCount();
      expect(finalNodeCount).toBe(initialNodeCount - 1);
    });

    test("context menu closes when clicking elsewhere or pressing Escape", async ({
      page,
      topoViewerPage
    }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      const contextMenu = page.locator(SEL_CONTEXT_MENU);

      // Open context menu
      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
      await expect(contextMenu).toBeVisible();

      // Click elsewhere to close - use a position far from the node
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x + 200, canvasCenter.y + 200);
      await expect(contextMenu).not.toBeVisible();

      // Open again and close with Escape
      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
      await expect(contextMenu).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(contextMenu).not.toBeVisible();
    });

    test("no context menu when canvas is locked", async ({ page, topoViewerPage }) => {
      await topoViewerPage.lock();

      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      // When locked, the menu items are empty so the menu itself won't render
      // Use a short timeout since we expect it NOT to appear
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      const editItem = page.locator(SEL_EDIT_NODE_ITEM);

      // Wait a moment for any potential menu to appear
      await page.waitForTimeout(300);

      const isMenuVisible = await contextMenu.count();
      const isEditItemVisible = await editItem.count();

      // Either menu is not visible or edit item is not visible
      expect(isMenuVisible === 0 || isEditItemVisible === 0).toBe(true);
    });
  });

  test.describe("Node Context Menu - View Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
    });

    test("right-click on node shows context menu with SSH, Shell, Logs, Info options but NOT Edit", async ({
      page,
      topoViewerPage
    }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      // Verify context menu is visible (Playwright auto-waits)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      // Verify all view mode options are present
      await expect(page.locator('[data-testid="context-menu-item-ssh-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-shell-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-logs-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-info-node"]')).toBeVisible();

      // Edit option should NOT be visible in view mode
      await expect(page.locator(SEL_EDIT_NODE_ITEM)).not.toBeVisible();
    });
  });

  test.describe("Edge Context Menu - Edit Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test("right-click on edge shows context menu with Edit and Delete options", async ({
      page,
      topoViewerPage
    }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      expect(midpoint).not.toBeNull();

      await rightClick(page, midpoint!.x, midpoint!.y);

      // Verify context menu and options (Playwright auto-waits)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
      await expect(page.locator(SEL_EDIT_EDGE_ITEM)).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-delete-edge"]')).toBeVisible();
    });

    test("clicking Edit opens link editor panel", async ({ page, topoViewerPage }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      await rightClick(page, midpoint!.x, midpoint!.y);

      // Wait for menu item to be visible, then click
      const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
      await expect(editItem).toBeVisible();
      await editItem.click();

      // Link editor should open
      const linkEditor = page.locator('[data-testid="link-editor"]');
      await expect(linkEditor).toBeVisible();
    });

    test("clicking Delete removes the edge", async ({ page, topoViewerPage }) => {
      const initialEdgeCount = await topoViewerPage.getEdgeCount();
      const edgeIds = await topoViewerPage.getEdgeIds();

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      await rightClick(page, midpoint!.x, midpoint!.y);

      // Wait for menu item to be visible, then click
      const deleteItem = page.locator('[data-testid="context-menu-item-delete-edge"]');
      await expect(deleteItem).toBeVisible();
      await deleteItem.click();

      // Wait for menu to close (indicates action completed)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).not.toBeVisible();

      const finalEdgeCount = await topoViewerPage.getEdgeCount();
      expect(finalEdgeCount).toBe(initialEdgeCount - 1);
    });
  });

  test.describe("Edge Context Menu - View Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
    });

    test("right-click on edge shows context menu with Info option but NOT Edit", async ({
      page,
      topoViewerPage
    }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      expect(midpoint).not.toBeNull();

      await rightClick(page, midpoint!.x, midpoint!.y);

      // Verify context menu and options (Playwright auto-waits)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-info-edge"]')).toBeVisible();

      // Edit should NOT be visible in view mode
      await expect(page.locator(SEL_EDIT_EDGE_ITEM)).not.toBeVisible();
    });
  });
});
