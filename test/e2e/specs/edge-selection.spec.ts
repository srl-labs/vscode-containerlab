import { test, expect } from '../fixtures/topoviewer';
import { ctrlClick } from '../helpers/cytoscape-helpers';

test.describe('Edge Selection', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('has edges in the topology', async ({ topoViewerPage }) => {
    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test('gets edge IDs', async ({ topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);
  });

  test('selects single edge on click', async ({ topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    const edgeId = edgeIds[0];
    await topoViewerPage.selectEdge(edgeId);

    const selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds).toContain(edgeId);
  });

  test('deselects edge when clicking empty canvas', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    // Select an edge first
    await topoViewerPage.selectEdge(edgeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds.length).toBeGreaterThan(0);

    // Click on empty area
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 300, canvasCenter.y + 300);
    await page.waitForTimeout(200);

    selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds.length).toBe(0);
  });

  test('can select multiple edges with Ctrl+Click', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    if (edgeIds.length < 2) {
      test.skip();
      return;
    }

    // Select first edge normally
    await topoViewerPage.selectEdge(edgeIds[0]);

    // Get second edge midpoint for Ctrl+Click
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
    }, edgeIds[1]);

    if (midpoint) {
      await ctrlClick(page, midpoint.x, midpoint.y);
      await page.waitForTimeout(200);

      const selectedIds = await topoViewerPage.getSelectedEdgeIds();
      expect(selectedIds.length).toBe(2);
      expect(selectedIds).toContain(edgeIds[0]);
      expect(selectedIds).toContain(edgeIds[1]);
    }
  });

  test('clears edge selection with Escape key', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    // Select an edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds.length).toBeGreaterThan(0);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds.length).toBe(0);
  });

  test('selecting node does not select edges', async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await topoViewerPage.selectNode(nodeIds[0]);

    const selectedNodeIds = await topoViewerPage.getSelectedNodeIds();
    const selectedEdgeIds = await topoViewerPage.getSelectedEdgeIds();

    expect(selectedNodeIds.length).toBe(1);
    expect(selectedEdgeIds.length).toBe(0);
  });

  test('selecting edge does not select nodes', async ({ topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await topoViewerPage.selectEdge(edgeIds[0]);

    const selectedNodeIds = await topoViewerPage.getSelectedNodeIds();
    const selectedEdgeIds = await topoViewerPage.getSelectedEdgeIds();

    expect(selectedEdgeIds.length).toBeGreaterThan(0);
    expect(selectedNodeIds.length).toBe(0);
  });
});
