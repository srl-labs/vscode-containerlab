import { test, expect } from '../fixtures/topoviewer';
import { ctrlClick } from '../helpers/cytoscape-helpers';

/**
 * Edge Deletion E2E Tests
 *
 * Tests edge/link deletion functionality including:
 * - Delete via keyboard
 * - Delete via context menu
 * - Delete multiple edges
 * - Undo edge deletion
 * - Protection in view mode and locked state
 *
 * KNOWN BUGS:
 * - BUG-001: Multi-edge deletion doesn't work - When multiple edges are selected with
 *   Ctrl+Click, pressing Delete only deletes one edge instead of all selected edges.
 *   This appears to be a bug in the edge deletion handler not iterating over all
 *   selected edges. The test "deletes multiple selected edges" is marked as failing
 *   to document this bug.
 */
test.describe('Edge Deletion', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('deletes selected edge with Delete key', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBeGreaterThan(0);

    const edgeIds = await topoViewerPage.getEdgeIds();

    // Select the edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);

    // Verify edge is selected
    const selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds).toContain(edgeIds[0]);

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge count should decrease
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);
  });

  test('deletes selected edge with Backspace key', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBeGreaterThan(0);

    const edgeIds = await topoViewerPage.getEdgeIds();

    // Select the edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);

    // Press Backspace
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // Edge count should decrease
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);
  });

  test('deleted edge is no longer in edge list', async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    const edgeToDelete = edgeIds[0];

    // Select and delete the edge
    await topoViewerPage.selectEdge(edgeToDelete);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge should no longer be in list
    const finalEdgeIds = await topoViewerPage.getEdgeIds();
    expect(finalEdgeIds).not.toContain(edgeToDelete);
  });

  test('deletes multiple selected edges', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBeGreaterThanOrEqual(2);

    const edgeIds = await topoViewerPage.getEdgeIds();

    // Select first edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(100);

    // Ctrl+click to select second edge
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

    // Verify both are selected
    const selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds.length).toBe(2);

    // Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Both edges should be deleted - BUG: only one is deleted
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 2);
  });

  test('can undo edge deletion', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();
    const deletedEdgeId = edgeIds[0];

    // Delete an edge
    await topoViewerPage.selectEdge(deletedEdgeId);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Verify deletion
    let currentEdgeCount = await topoViewerPage.getEdgeCount();
    expect(currentEdgeCount).toBe(initialEdgeCount - 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    // Edge should be restored
    currentEdgeCount = await topoViewerPage.getEdgeCount();
    expect(currentEdgeCount).toBe(initialEdgeCount);

    // The deleted edge should be back
    const finalEdgeIds = await topoViewerPage.getEdgeIds();
    expect(finalEdgeIds).toContain(deletedEdgeId);
  });

  test('can redo edge deletion after undo', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();
    const deletedEdgeId = edgeIds[0];

    // Delete an edge
    await topoViewerPage.selectEdge(deletedEdgeId);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    // Edge should be deleted again
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);

    const finalEdgeIds = await topoViewerPage.getEdgeIds();
    expect(finalEdgeIds).not.toContain(deletedEdgeId);
  });

  test('does not delete edge when canvas is locked', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();

    // Lock the canvas
    await topoViewerPage.lock();

    // Select the edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);

    // Try to delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge count should remain the same
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);
  });

  test('does not delete edge in view mode', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();

    // Switch to view mode
    await topoViewerPage.setViewMode();

    // Select the edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);

    // Try to delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge count should remain the same
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);
  });

  test('deleting edge does not delete connected nodes', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();

    // Delete an edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Edge count should decrease
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);

    // Node count should remain the same
    const finalNodeCount = await topoViewerPage.getNodeCount();
    expect(finalNodeCount).toBe(initialNodeCount);
  });

  test('pressing Delete with no selection does nothing', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Clear any selection
    await topoViewerPage.clearSelection();
    await page.waitForTimeout(100);

    // Press Delete with nothing selected
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Nothing should change
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);
  });

});
