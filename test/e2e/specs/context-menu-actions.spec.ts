import { test, expect } from '../fixtures/topoviewer';
import { rightClick } from '../helpers/cytoscape-helpers';

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
 *
 * KNOWN BUGS:
 * - None discovered yet
 */
test.describe('Context Menu Actions', () => {
  test.describe('Node Context Menu - Edit Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile('simple.clab.yml');
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test('right-click on node shows context menu', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
    });

    test('node context menu has Edit option in edit mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      await expect(editItem).toBeVisible();
    });

    test('node context menu has Delete option in edit mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const deleteItem = page.locator('[data-testid="context-menu-item-delete-node"]');
      await expect(deleteItem).toBeVisible();
    });

    test('node context menu has Create Link option in edit mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const linkItem = page.locator('[data-testid="context-menu-item-link-node"]');
      await expect(linkItem).toBeVisible();
    });

    test('clicking Edit opens node editor panel', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      await editItem.click();
      await page.waitForTimeout(500);

      // Context menu should close
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).not.toBeVisible();

      // Node editor should open
      const nodeEditor = page.locator('[data-testid="node-editor"]');
      await expect(nodeEditor).toBeVisible();
    });

    test('clicking Delete removes the node', async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const deleteItem = page.locator('[data-testid="context-menu-item-delete-node"]');
      await deleteItem.click();
      await page.waitForTimeout(500);

      const finalNodeCount = await topoViewerPage.getNodeCount();
      expect(finalNodeCount).toBe(initialNodeCount - 1);
    });

    test('context menu closes when clicking elsewhere', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      // Click elsewhere to close
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x + 200, canvasCenter.y + 200);
      await page.waitForTimeout(300);

      await expect(contextMenu).not.toBeVisible();
    });

    test('context menu closes on Escape key', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await expect(contextMenu).not.toBeVisible();
    });

    test('no context menu when canvas is locked', async ({ page, topoViewerPage }) => {
      await topoViewerPage.lock();

      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      // Context menu should appear but with no items (empty)
      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      // When locked, the menu items are empty so the menu itself won't render
      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      const isMenuVisible = await contextMenu.count();
      const isEditItemVisible = await editItem.count();

      // Either menu is not visible or edit item is not visible
      expect(isMenuVisible === 0 || isEditItemVisible === 0).toBe(true);
    });
  });

  test.describe('Node Context Menu - View Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile('simple.clab.yml');
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
    });

    test('right-click on node shows context menu in view mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
      expect(nodeBox).not.toBeNull();

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
    });

    test('node context menu has SSH option in view mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const sshItem = page.locator('[data-testid="context-menu-item-ssh-node"]');
      await expect(sshItem).toBeVisible();
    });

    test('node context menu has Shell option in view mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const shellItem = page.locator('[data-testid="context-menu-item-shell-node"]');
      await expect(shellItem).toBeVisible();
    });

    test('node context menu has Logs option in view mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const logsItem = page.locator('[data-testid="context-menu-item-logs-node"]');
      await expect(logsItem).toBeVisible();
    });

    test('node context menu has Info option in view mode', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const infoItem = page.locator('[data-testid="context-menu-item-info-node"]');
      await expect(infoItem).toBeVisible();
    });

    test('view mode context menu does NOT have Edit option', async ({ page, topoViewerPage }) => {
      const nodeIds = await topoViewerPage.getNodeIds();
      const nodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);

      await rightClick(
        page,
        nodeBox!.x + nodeBox!.width / 2,
        nodeBox!.y + nodeBox!.height / 2
      );
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_NODE_ITEM);
      await expect(editItem).not.toBeVisible();
    });
  });

  test.describe('Edge Context Menu - Edit Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile('simple.clab.yml');
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test('right-click on edge shows context menu', async ({ page, topoViewerPage }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
    });

    test('edge context menu has Edit option in edit mode', async ({ page, topoViewerPage }) => {
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
      await expect(editItem).toBeVisible();
    });

    test('edge context menu has Delete option in edit mode', async ({ page, topoViewerPage }) => {
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const deleteItem = page.locator('[data-testid="context-menu-item-delete-edge"]');
      await expect(deleteItem).toBeVisible();
    });

    test('clicking Edit opens link editor panel', async ({ page, topoViewerPage }) => {
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
      await editItem.click();
      await page.waitForTimeout(500);

      // Link editor should open
      const linkEditor = page.locator('[data-testid="link-editor"]');
      await expect(linkEditor).toBeVisible();
    });

    test('clicking Delete removes the edge', async ({ page, topoViewerPage }) => {
      const initialEdgeCount = await topoViewerPage.getEdgeCount();
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const deleteItem = page.locator('[data-testid="context-menu-item-delete-edge"]');
      await deleteItem.click();
      await page.waitForTimeout(500);

      const finalEdgeCount = await topoViewerPage.getEdgeCount();
      expect(finalEdgeCount).toBe(initialEdgeCount - 1);
    });
  });

  test.describe('Edge Context Menu - View Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile('simple.clab.yml');
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setViewMode();
    });

    test('right-click on edge shows context menu in view mode', async ({ page, topoViewerPage }) => {
      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const contextMenu = page.locator(SEL_CONTEXT_MENU);
      await expect(contextMenu).toBeVisible();
    });

    test('edge context menu has Info option in view mode', async ({ page, topoViewerPage }) => {
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const infoItem = page.locator('[data-testid="context-menu-item-info-edge"]');
      await expect(infoItem).toBeVisible();
    });

    test('view mode edge context menu does NOT have Edit option', async ({ page, topoViewerPage }) => {
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

      await rightClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(300);

      const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
      await expect(editItem).not.toBeVisible();
    });
  });
});
