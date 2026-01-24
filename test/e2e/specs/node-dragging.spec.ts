import { test, expect } from "../fixtures/topoviewer";
import { drag } from "../helpers/cytoscape-helpers";

// Test file names for file-based tests
const SPINE_LEAF_FILE = "spine-leaf.clab.yml";

test.describe("Node Dragging", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("drags node to new position", async ({ page, topoViewerPage }) => {
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

    // Allow some tolerance for coordinate transforms (70% of expected)
    expect(movedX).toBeGreaterThan(dragDistance * 0.7);
    expect(movedY).toBeGreaterThan(dragDistance * 0.7);
  });

  test("does not drag node when canvas is locked", async ({ page, topoViewerPage }) => {
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
    await drag(page, { x: startX, y: startY }, { x: startX + 100, y: startY + 100 }, { steps: 10 });

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

  test("drag maintains relative position", async ({ page, topoViewerPage }) => {
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
    await drag(page, { x: startX, y: startY }, { x: startX + dragDist, y: startY }, { steps: 5 });

    await page.waitForTimeout(300);

    // Get model position after drag
    const modelPosAfter = await topoViewerPage.getNodePosition(nodeId);

    // Model position should have changed
    expect(modelPosAfter.x).not.toBe(modelPosBefore.x);
  });
});

/**
 * File Persistence Tests for Node Dragging
 *
 * These tests verify that node dragging properly updates:
 * - .clab.yml.annotations.json file (saves new position)
 */
test.describe("Node Dragging - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("dragging node persists position to annotations file", async ({ page, topoViewerPage }) => {
    // Get initial annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Initial = initialAnnotations.nodeAnnotations?.find((n) => n.id === "spine1");
    expect(spine1Initial).toBeDefined();
    expect(spine1Initial?.position).toBeDefined();

    const initialX = spine1Initial!.position!.x;
    const initialY = spine1Initial!.position!.y;

    // Get node bounding box for dragging
    const nodeBox = await topoViewerPage.getNodeBoundingBox("spine1");
    expect(nodeBox).not.toBeNull();

    const startX = nodeBox!.x + nodeBox!.width / 2;
    const startY = nodeBox!.y + nodeBox!.height / 2;

    // Drag the node by 80px
    const dragDistance = 80;
    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + dragDistance, y: startY + dragDistance },
      { steps: 15 }
    );

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read annotations from file again
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Updated = updatedAnnotations.nodeAnnotations?.find((n) => n.id === "spine1");
    expect(spine1Updated).toBeDefined();
    expect(spine1Updated?.position).toBeDefined();

    // Position should have changed significantly
    const deltaX = Math.abs(spine1Updated!.position!.x - initialX);
    const deltaY = Math.abs(spine1Updated!.position!.y - initialY);

    // At least one axis should have moved significantly (at least 20px)
    expect(deltaX + deltaY).toBeGreaterThan(20);
  });

  test("dragging multiple nodes persists all positions to annotations file", async ({
    page,
    topoViewerPage
  }) => {
    // Drag spine1
    const box1 = await topoViewerPage.getNodeBoundingBox("spine1");
    expect(box1).not.toBeNull();
    await drag(
      page,
      { x: box1!.x + box1!.width / 2, y: box1!.y + box1!.height / 2 },
      { x: box1!.x + box1!.width / 2 + 50, y: box1!.y + box1!.height / 2 },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    // Drag spine2
    const box2 = await topoViewerPage.getNodeBoundingBox("spine2");
    expect(box2).not.toBeNull();
    await drag(
      page,
      { x: box2!.x + box2!.width / 2, y: box2!.y + box2!.height / 2 },
      { x: box2!.x + box2!.width / 2 - 50, y: box2!.y + box2!.height / 2 },
      { steps: 10 }
    );

    // Wait for saves to complete
    await page.waitForTimeout(1000);

    // Get updated Cytoscape positions
    const spine1AfterCy = await topoViewerPage.getNodePosition("spine1");
    const spine2AfterCy = await topoViewerPage.getNodePosition("spine2");

    // Read updated annotations from file
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1File = updatedAnnotations.nodeAnnotations?.find((n) => n.id === "spine1");
    const spine2File = updatedAnnotations.nodeAnnotations?.find((n) => n.id === "spine2");

    // Both positions in file should match Cytoscape positions (with some tolerance)
    expect(Math.abs(spine1File!.position!.x - spine1AfterCy.x)).toBeLessThan(10);
    expect(Math.abs(spine2File!.position!.x - spine2AfterCy.x)).toBeLessThan(10);
  });
});
