import { test, expect } from '../fixtures/topoviewer';

// Test file names for file-based tests
const SPINE_LEAF_FILE = 'spine-leaf.clab.yml';

test.describe('Node Deletion', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile('simple.clab.yml');
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

/**
 * File Persistence Tests for Node Deletion
 *
 * These tests verify that node deletion properly updates:
 * - .clab.yml file (removes node and connected links)
 * - .clab.yml.annotations.json file (removes node annotation)
 */
test.describe('Node Deletion - File Persistence', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('deleting node removes it from YAML file', async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(initialYaml).toContain('client1:');
    expect(initialYaml).toContain('client2:');

    // Delete client2
    await topoViewerPage.selectNode('client2');
    await page.keyboard.press('Delete');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated YAML
    const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

    // client2 should be removed, client1 should remain
    expect(updatedYaml).toContain('client1:');
    expect(updatedYaml).not.toContain('client2:');
  });

  test('deleting node removes connected links from YAML', async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

    // Count links referencing leaf1
    const leaf1LinksInitial = (initialYaml.match(/"leaf1:/g) || []).length;
    expect(leaf1LinksInitial).toBeGreaterThan(0);

    // Delete leaf1
    await topoViewerPage.selectNode('leaf1');
    await page.keyboard.press('Delete');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated YAML
    const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

    // leaf1 node should be gone
    expect(updatedYaml).not.toContain('leaf1:');

    // Links referencing leaf1 should also be gone
    const leaf1LinksUpdated = (updatedYaml.match(/"leaf1:/g) || []).length;
    expect(leaf1LinksUpdated).toBe(0);
  });

  test('deleting node removes its annotation from JSON file', async ({ page, topoViewerPage }) => {
    // Get initial annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Exists = initialAnnotations.nodeAnnotations?.some(n => n.id === 'spine1');
    expect(spine1Exists).toBe(true);

    // Delete spine1
    await topoViewerPage.selectNode('spine1');
    await page.keyboard.press('Delete');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated annotations
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1StillExists = updatedAnnotations.nodeAnnotations?.some(n => n.id === 'spine1');

    // spine1 should be removed from annotations
    expect(spine1StillExists).toBe(false);
  });

  test('deleting multiple nodes removes all from YAML and annotations', async ({ page, topoViewerPage }) => {
    // Get initial state
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);

    expect(initialYaml).toContain('client1:');
    expect(initialYaml).toContain('client2:');
    expect(initialAnnotations.nodeAnnotations?.some(n => n.id === 'client1')).toBe(true);
    expect(initialAnnotations.nodeAnnotations?.some(n => n.id === 'client2')).toBe(true);

    // Delete client1
    await topoViewerPage.selectNode('client1');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Delete client2
    await topoViewerPage.selectNode('client2');
    await page.keyboard.press('Delete');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated state
    const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);

    // Both should be removed from YAML
    expect(updatedYaml).not.toContain('client1:');
    expect(updatedYaml).not.toContain('client2:');

    // Both should be removed from annotations
    expect(updatedAnnotations.nodeAnnotations?.some(n => n.id === 'client1')).toBe(false);
    expect(updatedAnnotations.nodeAnnotations?.some(n => n.id === 'client2')).toBe(false);
  });
});
