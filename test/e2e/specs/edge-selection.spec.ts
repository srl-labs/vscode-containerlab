import { test, expect } from '../fixtures/topoviewer';
import { ctrlClick } from '../helpers/cytoscape-helpers';

test.describe('Edge Selection', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile('simple.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('selects single edge on click and multiple with Ctrl+Click', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    // Test single selection
    const edgeId = edgeIds[0];
    await topoViewerPage.selectEdge(edgeId);

    let selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds).toContain(edgeId);

    // Test multi-selection with Ctrl+Click (if multiple edges exist)
    if (edgeIds.length >= 2) {
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

      expect(midpoint).not.toBeNull();

      await ctrlClick(page, midpoint!.x, midpoint!.y);
      await page.waitForTimeout(200);

      selectedIds = await topoViewerPage.getSelectedEdgeIds();
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

  test('selecting node does not select edges and vice versa', async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    expect(edgeIds.length).toBeGreaterThan(0);

    // Test: selecting node does not select edges
    await topoViewerPage.selectNode(nodeIds[0]);

    let selectedNodeIds = await topoViewerPage.getSelectedNodeIds();
    let selectedEdgeIds = await topoViewerPage.getSelectedEdgeIds();

    expect(selectedNodeIds.length).toBe(1);
    expect(selectedEdgeIds.length).toBe(0);

    // Clear selection
    await topoViewerPage.clearSelection();

    // Test: selecting edge does not select nodes
    await topoViewerPage.selectEdge(edgeIds[0]);

    selectedNodeIds = await topoViewerPage.getSelectedNodeIds();
    selectedEdgeIds = await topoViewerPage.getSelectedEdgeIds();

    expect(selectedEdgeIds.length).toBeGreaterThan(0);
    expect(selectedNodeIds.length).toBe(0);
  });
});
