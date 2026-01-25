import { test, expect } from "../fixtures/topoviewer";
import { shiftClick, drag } from "../helpers/react-flow-helpers";

// Test file names for file-based tests
const SPINE_LEAF_FILE = "spine-leaf.clab.yml";

test.describe("Undo and Redo", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
  });

  test("undoes and redoes node creation", async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node at offset position (avoid hitting existing nodes)
    const clickX = canvasCenter.x + 200;
    const clickY = canvasCenter.y + 150;
    await shiftClick(page, clickX, clickY);

    // Wait for node to be created using polling assertion
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Node should be created after shift-click"
      })
      .toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    const afterRedoCount = await topoViewerPage.getNodeCount();
    expect(afterRedoCount).toBe(initialNodeCount + 1);
  });

  test("undoes node position change", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];
    const initialPosition = await topoViewerPage.getNodePosition(nodeId);

    // Drag the node
    const box = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await drag(page, { x: startX, y: startY }, { x: startX + 100, y: startY + 100 }, { steps: 10 });
    await page.waitForTimeout(500);

    const movedPosition = await topoViewerPage.getNodePosition(nodeId);
    expect(movedPosition.x).not.toBeCloseTo(initialPosition.x, 0);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoPosition = await topoViewerPage.getNodePosition(nodeId);
    // Position should be back to initial (with grid snap tolerance of 20 pixels)
    const GRID_SNAP_TOLERANCE = 20;
    expect(Math.abs(afterUndoPosition.x - initialPosition.x)).toBeLessThanOrEqual(
      GRID_SNAP_TOLERANCE
    );
    expect(Math.abs(afterUndoPosition.y - initialPosition.y)).toBeLessThanOrEqual(
      GRID_SNAP_TOLERANCE
    );
  });

  test("multiple undos and redos work in sequence", async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create first node - use offset to avoid existing nodes at center
    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y + 100);
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "First node should be created after shift-click"
      })
      .toBe(initialNodeCount + 1);

    // Clear selection by pressing Escape before creating second node
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Create second node - use different position to avoid overlap
    await shiftClick(page, canvasCenter.x - 200, canvasCenter.y + 100);
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Second node should be created after shift-click"
      })
      .toBe(initialNodeCount + 2);

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

  test("new action clears redo stack", async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node (use offset to avoid existing nodes)
    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y + 100);
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "First node should be created"
      })
      .toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);

    // Wait before creating another node
    await page.waitForTimeout(200);

    // Create a different node (new action) - use different position
    await shiftClick(page, canvasCenter.x + 200, canvasCenter.y + 200);
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "New node should be created after undo"
      })
      .toBe(initialNodeCount + 1);

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
test.describe("Undo and Redo - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("undo and redo node deletion updates YAML file", async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(initialYaml).toContain("client1:");

    // Delete client1
    await topoViewerPage.selectNode("client1");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);

    // Verify node is removed from UI and YAML
    let nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).not.toContain("client1");

    let yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).not.toContain("client1:");

    // Undo the deletion
    await topoViewerPage.undo();
    await page.waitForTimeout(1000);

    // Verify node is restored in UI
    nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain("client1");

    // Wait for file persistence to complete and verify YAML
    await expect
      .poll(
        async () => {
          const y = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
          return y.includes("client1:");
        },
        { timeout: 5000, message: "Node client1 should be restored to YAML after undo" }
      )
      .toBe(true);
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

    // Redo the deletion
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify deleted again
    yaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    expect(yaml).not.toContain("client1:");
  });

  test("undo node position change reverts position in annotations", async ({
    page,
    topoViewerPage
  }) => {
    // Get initial position from both canvas and annotations
    const initialCanvasPosition = await topoViewerPage.getNodePosition("spine1");
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Initial = initialAnnotations.nodeAnnotations?.find((n) => n.id === "spine1");
    expect(spine1Initial?.position).toBeDefined();
    const initialX = spine1Initial!.position!.x;
    const initialY = spine1Initial!.position!.y;

    // Drag the node
    const box = await topoViewerPage.getNodeBoundingBox("spine1");
    expect(box).not.toBeNull();
    await drag(
      page,
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      { x: box!.x + box!.width / 2 + 100, y: box!.y + box!.height / 2 + 100 },
      { steps: 15 }
    );
    await page.waitForTimeout(500);

    // Verify position changed in both canvas and annotations
    const movedCanvasPosition = await topoViewerPage.getNodePosition("spine1");
    expect(
      Math.abs(movedCanvasPosition.x - initialCanvasPosition.x) +
        Math.abs(movedCanvasPosition.y - initialCanvasPosition.y)
    ).toBeGreaterThan(30);

    let annotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    let spine1After = annotations.nodeAnnotations?.find((n) => n.id === "spine1");
    const afterX = spine1After!.position!.x;
    const afterY = spine1After!.position!.y;
    expect(Math.abs(afterX - initialX) + Math.abs(afterY - initialY)).toBeGreaterThan(30);

    // Undo the drag
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify position is reverted in CANVAS (React Flow state)
    const revertedCanvasPosition = await topoViewerPage.getNodePosition("spine1");
    expect(Math.abs(revertedCanvasPosition.x - initialCanvasPosition.x)).toBeLessThan(20);
    expect(Math.abs(revertedCanvasPosition.y - initialCanvasPosition.y)).toBeLessThan(20);

    // Verify position is reverted in ANNOTATIONS FILE
    annotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    spine1After = annotations.nodeAnnotations?.find((n) => n.id === "spine1");
    const revertedX = spine1After!.position!.x;
    const revertedY = spine1After!.position!.y;

    // Position should be close to initial (within 20px tolerance)
    expect(Math.abs(revertedX - initialX)).toBeLessThan(20);
    expect(Math.abs(revertedY - initialY)).toBeLessThan(20);
  });

  test("undo edge deletion restores link to YAML file", async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const initialLinkCount = (initialYaml.match(/endpoints:/g) || []).length;
    expect(initialLinkCount).toBeGreaterThan(0);

    // Get first edge and delete it
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await topoViewerPage.selectEdge(edgeIds[0]);
    await page.keyboard.press("Delete");
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
