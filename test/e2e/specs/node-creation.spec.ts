import { test, expect } from '../fixtures/topoviewer';
import { shiftClick } from '../helpers/cytoscape-helpers';

test.describe('Node Creation', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('creates node via Shift+Click on canvas', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Get canvas center position
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Shift+Click to create node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);

    // Wait for node to be created
    await page.waitForTimeout(500);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount + 1);
  });

  test('creates node at clicked position', async ({ page, topoViewerPage }) => {
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Click offset from center
    const clickX = canvasCenter.x + 50;
    const clickY = canvasCenter.y + 50;

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

    // Create 3 nodes at different positions
    await shiftClick(page, canvasCenter.x - 100, canvasCenter.y);
    await page.waitForTimeout(300);

    await shiftClick(page, canvasCenter.x + 100, canvasCenter.y);
    await page.waitForTimeout(300);

    await shiftClick(page, canvasCenter.x, canvasCenter.y + 100);
    await page.waitForTimeout(300);

    const finalNodeCount = await topoViewerPage.getNodeCount();
    expect(finalNodeCount).toBe(initialNodeCount + 3);
  });
});
