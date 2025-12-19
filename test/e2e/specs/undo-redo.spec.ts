import { test, expect } from '../fixtures/topoviewer';
import { shiftClick, drag } from '../helpers/cytoscape-helpers';

// Test file names for file-based tests
const SPINE_LEAF_FILE = 'spine-leaf.clab.yml';

test.describe('Undo and Redo', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile('simple.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('undoes node creation', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node at offset position (avoid hitting existing nodes)
    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y + 150);
    await page.waitForTimeout(500);

    const afterCreateCount = await topoViewerPage.getNodeCount();
    expect(afterCreateCount).toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);
  });

  test('redoes undone node creation', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    // Use offset position to avoid hitting existing nodes
    const clickX = canvasCenter.x + 200;
    const clickY = canvasCenter.y + 150;

    // Create a node at offset position
    await shiftClick(page, clickX, clickY);
    await page.waitForTimeout(500);

    const afterCreateCount = await topoViewerPage.getNodeCount();
    expect(afterCreateCount).toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    const afterRedoCount = await topoViewerPage.getNodeCount();
    expect(afterRedoCount).toBe(initialNodeCount + 1);
  });

  test('undoes node position change', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];
    const initialPosition = await topoViewerPage.getNodePosition(nodeId);

    // Drag the node
    const box = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + 100, y: startY + 100 },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    const movedPosition = await topoViewerPage.getNodePosition(nodeId);
    expect(movedPosition.x).not.toBeCloseTo(initialPosition.x, 0);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoPosition = await topoViewerPage.getNodePosition(nodeId);
    // Position should be back to initial (with some tolerance)
    expect(afterUndoPosition.x).toBeCloseTo(initialPosition.x, 0);
    expect(afterUndoPosition.y).toBeCloseTo(initialPosition.y, 0);
  });

  test('multiple undos work in sequence', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create first node
    await shiftClick(page, canvasCenter.x - 50, canvasCenter.y);
    await page.waitForTimeout(500);

    // Create second node
    await shiftClick(page, canvasCenter.x + 50, canvasCenter.y);
    await page.waitForTimeout(500);

    const afterTwoNodes = await topoViewerPage.getNodeCount();
    expect(afterTwoNodes).toBe(initialNodeCount + 2);

    // Undo first
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Undo second
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);
  });

  test('multiple redos work in sequence', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create two nodes
    await shiftClick(page, canvasCenter.x - 50, canvasCenter.y);
    await page.waitForTimeout(500);

    await shiftClick(page, canvasCenter.x + 50, canvasCenter.y);
    await page.waitForTimeout(500);

    // Undo both
    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);

    // Redo first
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Redo second
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 2);
  });

  test('new action clears redo stack', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);

    // Create a different node (new action)
    await shiftClick(page, canvasCenter.x + 100, canvasCenter.y);
    await page.waitForTimeout(500);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Redo should have no effect (redo stack cleared by new action)
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    // Should still be initialNodeCount + 1 (redo did nothing)
    expect(currentCount).toBe(initialNodeCount + 1);
  });
});

/**
 * File Persistence Tests for Undo/Redo
 *
 * These tests verify that undo/redo operations properly update:
 * - .clab.yml file (nodes/links)
 * - .clab.yml.annotations.json file (positions)
 */
test.describe('Undo and Redo - File Persistence', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('undo node deletion restores node to YAML file', async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(initialYaml).toContain('client1:');

    // Delete client1
    await topoViewerPage.selectNode('client1');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Verify node is removed from UI
    let nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).not.toContain('client1');

    // Verify node is removed from YAML
    let yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).not.toContain('client1:');

    // Undo the deletion
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify node is restored in UI
    nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain('client1');

    // Verify node is restored in YAML file
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).toContain('client1:');
  });

  test('redo node deletion removes node from YAML file again', async ({ page, topoViewerPage }) => {
    // Delete client2
    await topoViewerPage.selectNode('client2');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Verify deleted from YAML
    let yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).not.toContain('client2:');

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify restored in YAML
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).toContain('client2:');

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify deleted again from YAML
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).not.toContain('client2:');
  });

  test('undo node position change reverts position in annotations', async ({ page, topoViewerPage }) => {
    // Get initial position from annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Initial = initialAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
    expect(spine1Initial?.position).toBeDefined();
    const initialX = spine1Initial!.position!.x;
    const initialY = spine1Initial!.position!.y;

    // Drag the node
    const box = await topoViewerPage.getNodeBoundingBox('spine1');
    expect(box).not.toBeNull();
    await drag(
      page,
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      { x: box!.x + box!.width / 2 + 100, y: box!.y + box!.height / 2 + 100 },
      { steps: 15 }
    );
    await page.waitForTimeout(500);

    // Verify position changed in annotations
    let annotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    let spine1After = annotations.nodeAnnotations?.find(n => n.id === 'spine1');
    const afterX = spine1After!.position!.x;
    const afterY = spine1After!.position!.y;
    expect(Math.abs(afterX - initialX) + Math.abs(afterY - initialY)).toBeGreaterThan(30);

    // Undo the drag
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify position is reverted in annotations
    annotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    spine1After = annotations.nodeAnnotations?.find(n => n.id === 'spine1');
    const revertedX = spine1After!.position!.x;
    const revertedY = spine1After!.position!.y;

    // Position should be close to initial (within 20px tolerance)
    expect(Math.abs(revertedX - initialX)).toBeLessThan(20);
    expect(Math.abs(revertedY - initialY)).toBeLessThan(20);
  });

  test('undo edge deletion restores link to YAML file', async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const initialLinkCount = (initialYaml.match(/endpoints:/g) || []).length;
    expect(initialLinkCount).toBeGreaterThan(0);

    // Get first edge and delete it
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Verify link count decreased in YAML
    let yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    let linkCount = (yaml.match(/endpoints:/g) || []).length;
    expect(linkCount).toBe(initialLinkCount - 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify link is restored in YAML
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    linkCount = (yaml.match(/endpoints:/g) || []).length;
    expect(linkCount).toBe(initialLinkCount);
  });
});
