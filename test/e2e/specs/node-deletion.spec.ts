import { test, expect } from '../fixtures/topoviewer';

test.describe('Node Deletion', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('deletes single selected node with Delete key', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select and delete a node
    const nodeToDelete = nodeIds[0];
    await topoViewerPage.selectNode(nodeToDelete);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount - 1);

    // Verify the specific node is gone
    const remainingNodeIds = await topoViewerPage.getNodeIds();
    expect(remainingNodeIds).not.toContain(nodeToDelete);
  });

  test('deletes single selected node with Backspace key', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select and delete a node
    await topoViewerPage.selectNode(nodeIds[0]);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount - 1);
  });

  test('Ctrl+A selects all nodes for deletion', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();

    if (initialNodeCount < 2) {
      test.skip();
      return;
    }

    // Select all nodes with Ctrl+A
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    // Ctrl+A should select all nodes
    expect(selectedIds.length).toBe(initialNodeCount);

    // Delete one selected node at a time (delete behavior may vary)
    await topoViewerPage.selectNode(selectedIds[0]);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const newNodeCount = await topoViewerPage.getNodeCount();
    // At least one node should be deleted
    expect(newNodeCount).toBeLessThan(initialNodeCount);
  });

  test('does not delete node when canvas is locked', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Lock the canvas
    await topoViewerPage.lock();
    const isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(true);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);

    // Try to delete - should be blocked when locked
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Node count should NOT change when locked
    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test('does not delete node in view mode', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Switch to view mode
    await topoViewerPage.setViewMode();

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);

    // Try to delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Node count should not change
    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test('deleting node also removes connected edges', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Get edges connected to first node
    const connectedEdgeCount = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      const node = cy?.getElementById(nodeId);
      return node?.connectedEdges().length ?? 0;
    }, nodeIds[0]);

    // Delete the node
    await topoViewerPage.selectNode(nodeIds[0]);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge count should decrease by connected edges
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount - connectedEdgeCount);
  });

  test('delete fixture method works', async ({ topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select and delete using fixture method
    await topoViewerPage.selectNode(nodeIds[0]);
    await topoViewerPage.deleteSelected();

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount - 1);
  });
});
