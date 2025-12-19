import { test, expect } from '../fixtures/topoviewer';
import { shiftClick } from '../helpers/cytoscape-helpers';

// Test file names for file-based tests
const SIMPLE_FILE = 'simple.clab.yml';
const EMPTY_FILE = 'empty.clab.yml';
const KIND_NOKIA_SRLINUX = 'nokia_srlinux';
const PERSISTENT_NODE_ID = 'persistent-test-node';

test.describe('Node Creation', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('creates node via Shift+Click on canvas', async ({ page, topoViewerPage }) => {
    // Verify initial state - simple.clab.yml should have 2 nodes
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Fit viewport to ensure consistent positioning
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    // Get canvas center position
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Shift+Click AWAY from center to avoid hitting existing nodes
    // simple.clab.yml topology has nodes near the center after fit
    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y + 150);

    // Wait for node to be created
    await page.waitForTimeout(500);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount + 1);
  });

  test('creates node at clicked position', async ({ page, topoViewerPage }) => {
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Click far from center to avoid hitting existing nodes
    // The simple.clab.yml topology has nodes near the center after fit
    const clickX = canvasCenter.x + 200;
    const clickY = canvasCenter.y + 150;

    // Get node IDs before creation
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    // Shift+Click to create node
    await shiftClick(page, clickX, clickY);
    await page.waitForTimeout(500);

    // Get node IDs after creation
    const nodeIdsAfter = await topoViewerPage.getNodeIds();

    // Find the new node
    const newNodeId = nodeIdsAfter.find(id => !nodeIdsBefore.includes(id));
    expect(newNodeId).toBeDefined();

    // Verify the new node has a valid position (not default 0,0)
    const nodePosition = await topoViewerPage.getNodePosition(newNodeId!);
    expect(nodePosition).toHaveProperty('x');
    expect(nodePosition).toHaveProperty('y');
    expect(typeof nodePosition.x).toBe('number');
    expect(typeof nodePosition.y).toBe('number');

    // Verify the node's rendered bounding box is near the click location
    const boundingBox = await topoViewerPage.getNodeBoundingBox(newNodeId!);
    expect(boundingBox).not.toBeNull();
    const nodeScreenX = boundingBox!.x + boundingBox!.width / 2;
    const nodeScreenY = boundingBox!.y + boundingBox!.height / 2;

    // Node should be within 100px of click position (accounting for centering)
    expect(Math.abs(nodeScreenX - clickX)).toBeLessThan(100);
    expect(Math.abs(nodeScreenY - clickY)).toBeLessThan(100);
  });

  test('does not create node when canvas is locked', async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Get canvas center position
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Try Shift+Click to create node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    // Node count should not change
    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test('does not create node in view mode', async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Get canvas center position
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Try Shift+Click to create node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    // Node count should not change
    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test('creates multiple nodes with sequential Shift+Clicks', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create 3 nodes at positions far from center to avoid hitting existing nodes
    await shiftClick(page, canvasCenter.x - 200, canvasCenter.y - 150);
    await page.waitForTimeout(300);

    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y - 150);
    await page.waitForTimeout(300);

    await shiftClick(page, canvasCenter.x, canvasCenter.y + 200);
    await page.waitForTimeout(300);

    const finalNodeCount = await topoViewerPage.getNodeCount();
    expect(finalNodeCount).toBe(initialNodeCount + 3);
  });
});

/**
 * File Persistence Tests for Node Creation
 *
 * These tests verify that node creation properly updates:
 * - .clab.yml file (adds node with kind and image)
 * - .clab.yml.annotations.json file (saves node position)
 */
test.describe('Node Creation - File Persistence', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('created node appears in YAML file', async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(initialYaml).not.toContain('test-node1:');

    // Create a node via API
    await topoViewerPage.createNode('test-node1', { x: 200, y: 200 }, KIND_NOKIA_SRLINUX);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated YAML
    const updatedYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);

    // Node should be in the YAML with proper structure
    expect(updatedYaml).toContain('test-node1:');
    expect(updatedYaml).toContain(`kind: ${KIND_NOKIA_SRLINUX}`);
    expect(updatedYaml).toContain('image:');
  });

  test('created node has position in annotations file', async ({ page, topoViewerPage }) => {
    // Create a node at a specific position
    const targetPosition = { x: 300, y: 250 };
    await topoViewerPage.createNode('test-node2', targetPosition, KIND_NOKIA_SRLINUX);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);

    // Find the node annotation
    const nodeAnnotation = annotations.nodeAnnotations?.find(n => n.id === 'test-node2');
    expect(nodeAnnotation).toBeDefined();
    expect(nodeAnnotation?.position).toBeDefined();

    // Position should be close to target (within 20px tolerance)
    expect(Math.abs(nodeAnnotation!.position!.x - targetPosition.x)).toBeLessThan(20);
    expect(Math.abs(nodeAnnotation!.position!.y - targetPosition.y)).toBeLessThan(20);
  });

  test('multiple created nodes appear in YAML and annotations', async ({ page, topoViewerPage }) => {
    // Create 3 nodes
    await topoViewerPage.createNode('router1', { x: 200, y: 100 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('router2', { x: 100, y: 300 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('router3', { x: 300, y: 300 }, KIND_NOKIA_SRLINUX);

    // Wait for saves to complete
    await page.waitForTimeout(1000);

    // Verify YAML
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain('router1:');
    expect(yaml).toContain('router2:');
    expect(yaml).toContain('router3:');

    // Verify annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(3);

    const nodeIds = annotations.nodeAnnotations?.map(n => n.id).sort();
    expect(nodeIds).toEqual(['router1', 'router2', 'router3']);
  });

  test('created node persists after reload', async ({ page, topoViewerPage }) => {
    // Create a node
    const targetPosition = { x: 400, y: 200 };
    await topoViewerPage.createNode(PERSISTENT_NODE_ID, targetPosition, KIND_NOKIA_SRLINUX);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Reload the file
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify node is still there
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(PERSISTENT_NODE_ID);

    // Verify position is close to where we created it
    const nodePos = await topoViewerPage.getNodePosition(PERSISTENT_NODE_ID);
    expect(Math.abs(nodePos.x - targetPosition.x)).toBeLessThan(20);
    expect(Math.abs(nodePos.y - targetPosition.y)).toBeLessThan(20);
  });
});
