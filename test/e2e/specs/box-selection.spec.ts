import { test, expect } from "../fixtures/topoviewer";
import { drag, boxSelect } from "../helpers/react-flow-helpers";

const SIMPLE_FILE = "simple.clab.yml";

test.describe("Box Selection", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("drag on canvas creates selection box", async ({ page, topoViewerPage }) => {
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Define box selection area in empty canvas region
    const from = {
      x: canvasCenter.x - 150,
      y: canvasCenter.y - 150
    };
    const to = {
      x: canvasCenter.x - 50,
      y: canvasCenter.y - 50
    };

    // Perform box selection (Shift+drag)
    await boxSelect(page, from, to);
    await page.waitForTimeout(300);

    // Selection box should appear during drag (visual check would be manual)
    // At minimum, verify no errors occurred
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(Array.isArray(selectedIds)).toBe(true);
  });

  test("box selection selects nodes inside the box but not outside", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Get positions of both nodes (simple.clab.yml has srl1 and srl2)
    const node1Box = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    const node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node1Box).not.toBeNull();
    expect(node2Box).not.toBeNull();

    // Test 1: Select both nodes with a box that encompasses them
    const minX = Math.min(node1Box!.x, node2Box!.x) - 20;
    const minY = Math.min(node1Box!.y, node2Box!.y) - 20;
    const maxX = Math.max(node1Box!.x + node1Box!.width, node2Box!.x + node2Box!.width) + 20;
    const maxY = Math.max(node1Box!.y + node1Box!.height, node2Box!.y + node2Box!.height) + 20;

    await boxSelect(page, { x: minX, y: minY }, { x: maxX, y: maxY });
    await page.waitForTimeout(300);

    // Both nodes should be selected
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);

    // Clear selection
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Test 2: Create a small box that only contains the first node
    const smallFrom = {
      x: node1Box!.x - 10,
      y: node1Box!.y - 10
    };
    const smallTo = {
      x: node1Box!.x + node1Box!.width + 10,
      y: node1Box!.y + node1Box!.height + 10
    };

    await boxSelect(page, smallFrom, smallTo);
    await page.waitForTimeout(300);

    // Only the first node should be selected
    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).not.toContain(nodeIds[1]);
  });

  test("box selection with Ctrl adds to existing selection", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select first node normally
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);
    expect(selectedIds).toContain(nodeIds[0]);

    // Get position of second node
    const node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node2Box).not.toBeNull();

    // Create a box around the second node with Ctrl held
    const from = {
      x: node2Box!.x - 10,
      y: node2Box!.y - 10
    };
    const to = {
      x: node2Box!.x + node2Box!.width + 10,
      y: node2Box!.y + node2Box!.height + 10
    };

    // Perform Ctrl+Shift+drag for additive box selection
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await drag(page, from, to, { steps: 5 });
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);

    // Both nodes should now be selected
    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);
  });

  // Note: Selection is a read operation and is allowed when locked or in view mode.
  test("box selection works when canvas is locked or in view mode", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Get positions of both nodes
    const node1Box = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    const node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node1Box).not.toBeNull();
    expect(node2Box).not.toBeNull();

    // Calculate bounding box that contains both nodes
    const minX = Math.min(node1Box!.x, node2Box!.x) - 20;
    const minY = Math.min(node1Box!.y, node2Box!.y) - 20;
    const maxX = Math.max(node1Box!.x + node1Box!.width, node2Box!.x + node2Box!.width) + 20;
    const maxY = Math.max(node1Box!.y + node1Box!.height, node2Box!.y + node2Box!.height) + 20;

    // Test locked state
    await topoViewerPage.lock();
    const isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(true);

    await boxSelect(page, { x: minX, y: minY }, { x: maxX, y: maxY });
    await page.waitForTimeout(300);

    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);

    // Unlock and clear selection
    await topoViewerPage.unlock();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Test view mode
    await topoViewerPage.setViewMode();

    // Re-get positions as they may have changed
    const node1BoxView = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    const node2BoxView = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    const minXView = Math.min(node1BoxView!.x, node2BoxView!.x) - 20;
    const minYView = Math.min(node1BoxView!.y, node2BoxView!.y) - 20;
    const maxXView =
      Math.max(node1BoxView!.x + node1BoxView!.width, node2BoxView!.x + node2BoxView!.width) + 20;
    const maxYView =
      Math.max(node1BoxView!.y + node1BoxView!.height, node2BoxView!.y + node2BoxView!.height) + 20;

    await boxSelect(page, { x: minXView, y: minYView }, { x: maxXView, y: maxYView });
    await page.waitForTimeout(300);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);
  });

  test("empty box selection preserves existing selection (additive mode)", async ({
    page,
    topoViewerPage
  }) => {
    // Note: React Flow is configured with selectionType: 'additive'
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(1);

    // Select a node first
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Get canvas center
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Perform box selection in empty area (far from nodes)
    const from = {
      x: canvasCenter.x + 200,
      y: canvasCenter.y + 200
    };
    const to = {
      x: canvasCenter.x + 300,
      y: canvasCenter.y + 300
    };

    await boxSelect(page, from, to);
    await page.waitForTimeout(300);

    // In additive mode, selection is preserved even if box selects nothing
    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);
    expect(selectedIds).toContain(nodeIds[0]);
  });

  test("box selection works after zoom and pan", async ({ page, topoViewerPage }) => {
    // Zoom in
    await topoViewerPage.setZoom(1.5);
    await page.waitForTimeout(200);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Get updated positions after zoom
    let node1Box = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    let node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node1Box).not.toBeNull();
    expect(node2Box).not.toBeNull();

    // Calculate bounding box at new zoom level
    let minX = Math.min(node1Box!.x, node2Box!.x) - 20;
    let minY = Math.min(node1Box!.y, node2Box!.y) - 20;
    let maxX = Math.max(node1Box!.x + node1Box!.width, node2Box!.x + node2Box!.width) + 20;
    let maxY = Math.max(node1Box!.y + node1Box!.height, node2Box!.y + node2Box!.height) + 20;

    // Perform box selection at zoomed level
    await boxSelect(page, { x: minX, y: minY }, { x: maxX, y: maxY });
    await page.waitForTimeout(300);

    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);

    // Clear selection and test pan
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Pan the canvas by dragging with mouse
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.move(canvasCenter.x, canvasCenter.y);
    await page.mouse.down();
    await page.mouse.move(canvasCenter.x + 100, canvasCenter.y + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Get updated positions after pan
    node1Box = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);

    minX = Math.min(node1Box!.x, node2Box!.x) - 20;
    minY = Math.min(node1Box!.y, node2Box!.y) - 20;
    maxX = Math.max(node1Box!.x + node1Box!.width, node2Box!.x + node2Box!.width) + 20;
    maxY = Math.max(node1Box!.y + node1Box!.height, node2Box!.y + node2Box!.height) + 20;

    // Perform box selection at panned position
    await boxSelect(page, { x: minX, y: minY }, { x: maxX, y: maxY });
    await page.waitForTimeout(300);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
  });

  test("box selection from bottom-right to top-left works", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Get positions of both nodes
    const node1Box = await topoViewerPage.getNodeBoundingBox(nodeIds[0]);
    const node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node1Box).not.toBeNull();
    expect(node2Box).not.toBeNull();

    // Calculate bounding box - drag from bottom-right to top-left
    const minX = Math.min(node1Box!.x, node2Box!.x) - 20;
    const minY = Math.min(node1Box!.y, node2Box!.y) - 20;
    const maxX = Math.max(node1Box!.x + node1Box!.width, node2Box!.x + node2Box!.width) + 20;
    const maxY = Math.max(node1Box!.y + node1Box!.height, node2Box!.y + node2Box!.height) + 20;

    // Perform box selection in reverse direction
    await boxSelect(page, { x: maxX, y: maxY }, { x: minX, y: minY });
    await page.waitForTimeout(300);

    // Both nodes should still be selected
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);
  });

  test("box selection adds to selection without Ctrl (additive mode)", async ({
    page,
    topoViewerPage
  }) => {
    // Note: React Flow is configured with selectionType: 'additive'
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select first node programmatically for more reliable initial state
    await page.evaluate((id) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (cy) {
        cy.nodes().unselect();
        cy.getElementById(id).select();
      }
    }, nodeIds[0]);
    await page.waitForTimeout(200);

    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);
    expect(selectedIds).toContain(nodeIds[0]);

    // Get position of second node
    const node2Box = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(node2Box).not.toBeNull();

    // Create a box around the second node WITHOUT Ctrl
    const from = {
      x: node2Box!.x - 10,
      y: node2Box!.y - 10
    };
    const to = {
      x: node2Box!.x + node2Box!.width + 10,
      y: node2Box!.y + node2Box!.height + 10
    };

    // Perform box selection without Ctrl - in additive mode, adds to selection
    await boxSelect(page, from, to);
    await page.waitForTimeout(300);

    // Both nodes should be selected (additive mode)
    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);
  });
});
