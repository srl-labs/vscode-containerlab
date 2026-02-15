import { test, expect } from "../fixtures/topoviewer";
import { rightClick, getEdgeMidpoint } from "../helpers/react-flow-helpers";

const SIMPLE_FILE = "simple.clab.yml";
const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_EDIT_NODE_ITEM = '[data-testid="context-menu-item-edit-node"]';
const SEL_DELETE_NODE_ITEM = '[data-testid="context-menu-item-delete-node"]';
const SEL_EDIT_EDGE_ITEM = '[data-testid="context-menu-item-edit-edge"]';
const SEL_CONTEXT_PANEL = '[data-testid="context-panel"]';

/**
 * Context Menu Actions E2E Tests (MUI version)
 *
 * Tests context menu functionality for nodes and edges in both edit and view modes.
 * In the new MUI design, the context menu uses MUI Menu component,
 * and editors open in the ContextPanel sidebar.
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

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      await expect(page.locator(SEL_EDIT_NODE_ITEM)).toBeVisible();
      await expect(page.locator(SEL_DELETE_NODE_ITEM)).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toBeVisible();
    });

    test("clicking Edit opens node editor in context panel", async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      await expect(editItem).toBeVisible();
      await editItem.click();

      // Context menu should close
      await expect(page.locator(SEL_CONTEXT_MENU)).not.toBeVisible();

      // Node editor should open in context panel
      const panel = page.locator(SEL_CONTEXT_PANEL);
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Node Editor", { exact: true })).toBeVisible();
    });

    test("clicking Delete removes the node", async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
      await expect(page.locator(SEL_CONTEXT_MENU)).toBeVisible();

      await page.locator(SEL_DELETE_NODE_ITEM).click();
      await expect(page.locator(SEL_CONTEXT_MENU)).not.toBeVisible();

      await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 5000 }).toBe(
        initialNodeCount - 1
      );
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

      // Press Escape to close
      await page.keyboard.press("Escape");
      await expect(contextMenu).not.toBeVisible();

      // Open again
      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);
      await expect(contextMenu).toBeVisible();

      // Click elsewhere to close
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x + 200, canvasCenter.y + 200);
      await expect(contextMenu).not.toBeVisible();
    });

    test("locked mode shows context menu with edit actions disabled", async ({
      page,
      topoViewerPage
    }) => {
      await topoViewerPage.lock();

      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(page, nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      // Locked mode allows opening the menu, but edit/delete/link actions are disabled.
      await expect(page.locator(SEL_EDIT_NODE_ITEM)).toBeDisabled();
      await expect(page.locator(SEL_DELETE_NODE_ITEM)).toBeDisabled();
      await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toBeDisabled();
    });
  });

  test.describe("Node Context Menu - View Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
      await topoViewerPage.unlock();
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

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

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

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
      await expect(page.locator(SEL_EDIT_EDGE_ITEM)).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-delete-edge"]')).toBeVisible();
    });

    test("clicking Edit opens link editor in context panel", async ({ page, topoViewerPage }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      await rightClick(page, midpoint!.x, midpoint!.y);

      const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
      await expect(editItem).toBeVisible();
      await editItem.click();

      // Link editor should open in context panel
      const panel = page.locator(SEL_CONTEXT_PANEL);
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Link Editor", { exact: true })).toBeVisible();
    });

    test("clicking Delete removes the edge", async ({ page, topoViewerPage }) => {
      const initialEdgeCount = await topoViewerPage.getEdgeCount();
      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

      const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
      expect(midpoint).not.toBeNull();

      await rightClick(page, midpoint!.x, midpoint!.y);
      await expect(page.locator(SEL_CONTEXT_MENU)).toBeVisible();

      await page.locator('[data-testid="context-menu-item-delete-edge"]').click();
      await expect(page.locator(SEL_CONTEXT_MENU)).not.toBeVisible();

      await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 5000 }).toBe(
        initialEdgeCount - 1
      );
    });
  });

  test.describe("Edge Context Menu - View Mode", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
      await topoViewerPage.unlock();
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

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-item-info-edge"]')).toBeVisible();

      // Edit should NOT be visible in view mode
      await expect(page.locator(SEL_EDIT_EDGE_ITEM)).not.toBeVisible();
    });
  });
});
