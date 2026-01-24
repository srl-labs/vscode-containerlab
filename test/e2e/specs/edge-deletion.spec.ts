import { test, expect } from "../fixtures/topoviewer";
import { ctrlClick } from "../helpers/cytoscape-helpers";

// Test file names for file-based tests
const SPINE_LEAF_FILE = "spine-leaf.clab.yml";

/**
 * Edge Deletion E2E Tests
 *
 * Tests edge/link deletion functionality including:
 * - Delete via keyboard (Delete and Backspace)
 * - Delete multiple edges
 * - Undo/redo edge deletion
 * - Protection in view mode and locked state
 */
test.describe("Edge Deletion", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("deletes selected edge with Delete or Backspace key", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBeGreaterThan(0);

    const edgeIds = await topoViewerPage.getEdgeIds();
    const edgeToDelete = edgeIds[0];

    // Test Delete key
    await topoViewerPage.selectEdge(edgeToDelete);
    await page.waitForTimeout(200);

    // Verify edge is selected
    let selectedIds = await topoViewerPage.getSelectedEdgeIds();
    expect(selectedIds).toContain(edgeToDelete);

    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Edge count should decrease
    let finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);

    // Verify deleted edge is gone
    let finalEdgeIds = await topoViewerPage.getEdgeIds();
    expect(finalEdgeIds).not.toContain(edgeToDelete);

    // Undo to restore for Backspace test
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    // Test Backspace key
    await topoViewerPage.selectEdge(edgeToDelete);
    await page.waitForTimeout(200);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);
  });

  test("deletes multiple selected edges", async ({ page, topoViewerPage }) => {
    // This test needs a topology with multiple edges - spine-leaf has 6 edges
    await topoViewerPage.gotoFile("spine-leaf.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

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
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Both edges should be deleted
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 2);
  });

  test("can undo and redo edge deletion", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();
    const deletedEdgeId = edgeIds[0];

    // Delete an edge
    await topoViewerPage.selectEdge(deletedEdgeId);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
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
    let currentEdgeIds = await topoViewerPage.getEdgeIds();
    expect(currentEdgeIds).toContain(deletedEdgeId);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    // Edge should be deleted again
    currentEdgeCount = await topoViewerPage.getEdgeCount();
    expect(currentEdgeCount).toBe(initialEdgeCount - 1);

    currentEdgeIds = await topoViewerPage.getEdgeIds();
    expect(currentEdgeIds).not.toContain(deletedEdgeId);
  });

  test("does not delete edge when canvas is locked or in view mode", async ({
    page,
    topoViewerPage
  }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();

    // Test locked state
    await topoViewerPage.lock();
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    let finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);

    // Unlock for view mode test
    await topoViewerPage.unlock();

    // Test view mode
    await topoViewerPage.setViewMode();
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);
  });

  test("deleting edge does not delete connected nodes", async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const edgeIds = await topoViewerPage.getEdgeIds();

    // Delete an edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Edge count should decrease
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount - 1);

    // Node count should remain the same
    const finalNodeCount = await topoViewerPage.getNodeCount();
    expect(finalNodeCount).toBe(initialNodeCount);
  });

  test("pressing Delete with no selection does nothing", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Clear any selection
    await topoViewerPage.clearSelection();
    await page.waitForTimeout(100);

    // Press Delete with nothing selected
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Nothing should change
    const finalEdgeCount = await topoViewerPage.getEdgeCount();
    expect(finalEdgeCount).toBe(initialEdgeCount);
  });
});

/**
 * File Persistence Tests for Edge Deletion
 *
 * These tests verify that edge deletion properly updates the .clab.yml file
 */
test.describe("Edge Deletion - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("deleted edges are removed from YAML file (single and multiple)", async ({
    page,
    topoViewerPage
  }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const initialEndpointsCount = (initialYaml.match(/endpoints:/g) || []).length;
    expect(initialEndpointsCount).toBeGreaterThanOrEqual(2);

    // Get edge IDs
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThanOrEqual(2);

    // Delete first edge
    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(1000);

    // Verify single deletion
    let updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    let updatedEndpointsCount = (updatedYaml.match(/endpoints:/g) || []).length;
    expect(updatedEndpointsCount).toBe(initialEndpointsCount - 1);

    // Select and delete second edge using multi-select
    const remainingEdgeIds = await topoViewerPage.getEdgeIds();
    await topoViewerPage.selectEdge(remainingEdgeIds[0]);
    await page.waitForTimeout(100);

    // Ctrl+click to select another edge if available
    if (remainingEdgeIds.length >= 2) {
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
      }, remainingEdgeIds[1]);

      if (midpoint) {
        await ctrlClick(page, midpoint.x, midpoint.y);
        await page.waitForTimeout(200);
      }
    }

    // Delete selected edges
    await page.keyboard.press("Delete");
    await page.waitForTimeout(1000);

    // Verify multiple deletion
    updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    updatedEndpointsCount = (updatedYaml.match(/endpoints:/g) || []).length;
    expect(updatedEndpointsCount).toBeLessThan(initialEndpointsCount - 1);
  });
});
