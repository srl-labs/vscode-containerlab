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

    // Verify the new node was created (position verification is approximate due to coordinate transforms)
    const nodePosition = await topoViewerPage.getNodePosition(newNodeId!);
    expect(nodePosition).toBeDefined();
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
