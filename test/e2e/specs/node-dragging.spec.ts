import { test, expect } from '../fixtures/topoviewer';
import { drag } from '../helpers/cytoscape-helpers';

test.describe('Node Dragging', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('drags node to new position', async ({ page, topoViewerPage }) => {
    // Get all node IDs
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];

    // Get initial position
    const initialBox = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // Drag the node by 100px in both directions
    const dragDistance = 100;
    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + dragDistance, y: startY + dragDistance },
      { steps: 10 }
    );

    // Wait for drag to complete
    await page.waitForTimeout(300);

    // Get new position
    const newBox = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(newBox).not.toBeNull();

    // Verify node moved approximately the drag distance
    const movedX = newBox!.x - initialBox!.x;
    const movedY = newBox!.y - initialBox!.y;

    // Allow some tolerance for coordinate transforms (80% of expected)
    expect(movedX).toBeGreaterThan(dragDistance * 0.8);
    expect(movedY).toBeGreaterThan(dragDistance * 0.8);
  });

  test('does not drag node when canvas is locked', async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    // Get all node IDs
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];

    // Get initial position
    const initialBox = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // Try to drag the node
    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + 100, y: startY + 100 },
      { steps: 10 }
    );

    await page.waitForTimeout(300);

    // Get position after attempted drag
    const afterBox = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(afterBox).not.toBeNull();

    // Position should be the same (or very close)
    const movedX = Math.abs(afterBox!.x - initialBox!.x);
    const movedY = Math.abs(afterBox!.y - initialBox!.y);

    expect(movedX).toBeLessThan(5);
    expect(movedY).toBeLessThan(5);
  });

  test('selects node on click before dragging', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];

    // Click on the node to select it
    await topoViewerPage.selectNode(nodeId);
    await page.waitForTimeout(200);

    // Check that node is selected (via Cytoscape API)
    const isSelected = await page.evaluate((id) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      const node = cy?.getElementById(id);
      return node?.selected() ?? false;
    }, nodeId);

    expect(isSelected).toBe(true);
  });

  test('drag maintains relative position', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];

    // Get model position before drag
    const modelPosBefore = await topoViewerPage.getNodePosition(nodeId);

    // Get bounding box for drag operation
    const box = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    const dragDist = 80;

    // Perform drag
    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + dragDist, y: startY },
      { steps: 5 }
    );

    await page.waitForTimeout(300);

    // Get model position after drag
    const modelPosAfter = await topoViewerPage.getNodePosition(nodeId);

    // Model position should have changed
    expect(modelPosAfter.x).not.toBe(modelPosBefore.x);
  });
});
