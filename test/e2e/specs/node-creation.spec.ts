import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { shiftClick } from "../helpers/react-flow-helpers";

// Test file names for file-based tests
const SIMPLE_FILE = "simple.clab.yml";
const EMPTY_FILE = "empty.clab.yml";
const KIND_NOKIA_SRLINUX = "nokia_srlinux";
const PERSISTENT_NODE_ID = "persistent-test-node";

async function getEmptyPanePoints(
  page: Page,
  topoViewerPage: any,
  count: number
): Promise<Array<{ x: number; y: number }>> {
  const canvas = topoViewerPage.getCanvas();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Canvas bounding box unavailable");

  const points = await page.evaluate(
    ({ canvasBox, maxPoints }) => {
      const results: Array<{ x: number; y: number }> = [];
      const minX = canvasBox.x + 80;
      const maxX = canvasBox.x + Math.max(120, canvasBox.width * 0.65);
      const minY = canvasBox.y + 80;
      const maxY = canvasBox.y + canvasBox.height - 80;
      const cols = 7;
      const rows = 5;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = minX + ((maxX - minX) * col) / (cols - 1);
          const y = minY + ((maxY - minY) * row) / (rows - 1);
          const el = document.elementFromPoint(x, y) as HTMLElement | null;
          if (!el) continue;
          if (!el.closest(".react-flow__pane")) continue;
          if (el.closest(".react-flow__node")) continue;
          results.push({ x, y });
          if (results.length >= maxPoints) return results;
        }
      }
      return results;
    },
    { canvasBox: box, maxPoints: count }
  );

  if (points.length < count) {
    throw new Error(`Unable to find ${count} empty pane point(s), found ${points.length}`);
  }

  return points;
}

test.describe("Node Creation", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("creates node via Shift+Click at clicked position", async ({ page, topoViewerPage }) => {
    // Verify initial state - simple.clab.yml should have 2 nodes
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Fit viewport to ensure consistent positioning
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    // Get node IDs before creation
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    // Shift+Click on guaranteed empty pane area.
    const [clickPoint] = await getEmptyPanePoints(page, topoViewerPage, 1);
    const clickX = clickPoint.x;
    const clickY = clickPoint.y;
    await shiftClick(page, clickX, clickY);

    // Wait for node to be created (use polling to handle timing variations)
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected node to be created via Shift+Click"
      })
      .toBe(initialNodeCount + 1);

    // Get node IDs after creation and find the new node
    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const newNodeId = nodeIdsAfter.find((id) => !nodeIdsBefore.includes(id));
    expect(newNodeId).toBeDefined();

    // Verify the new node has a valid position (not default 0,0)
    const nodePosition = await topoViewerPage.getNodePosition(newNodeId!);
    expect(nodePosition).toHaveProperty("x");
    expect(nodePosition).toHaveProperty("y");
    expect(typeof nodePosition.x).toBe("number");
    expect(typeof nodePosition.y).toBe("number");

    // Verify the node's rendered bounding box is near the click location
    const boundingBox = await topoViewerPage.getNodeBoundingBox(newNodeId!);
    expect(boundingBox).not.toBeNull();
    const nodeScreenX = boundingBox!.x + boundingBox!.width / 2;
    const nodeScreenY = boundingBox!.y + boundingBox!.height / 2;

    // Node should be within 150px of click position (accounting for icon size and centering)
    expect(Math.abs(nodeScreenX - clickX)).toBeLessThan(150);
    expect(Math.abs(nodeScreenY - clickY)).toBeLessThan(150);
  });

  test("does not create node when canvas is locked or in view mode", async ({
    page,
    topoViewerPage
  }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Test locked state
    await topoViewerPage.lock();
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    let newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);

    // Unlock for view mode test
    await topoViewerPage.unlock();

    // Test view mode
    await topoViewerPage.setViewMode();
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test("creates multiple nodes with sequential Shift+Clicks", async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIdsBefore = await topoViewerPage.getNodeIds();
    const points = await getEmptyPanePoints(page, topoViewerPage, 3);

    // Create 3 nodes on empty pane positions.
    await shiftClick(page, points[0].x, points[0].y);
    await page.waitForTimeout(300);

    await shiftClick(page, points[1].x, points[1].y);
    await page.waitForTimeout(300);

    await shiftClick(page, points[2].x, points[2].y);
    await page.waitForTimeout(300);

    // Wait for all 3 nodes to appear (shift-click can be timing-sensitive under load)
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected 3 nodes to be created via sequential Shift+Clicks"
      })
      .toBe(initialNodeCount + 3);

    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const createdIds = nodeIdsAfter.filter((id) => !nodeIdsBefore.includes(id));
    expect(createdIds.length).toBe(3);
  });
});

/**
 * File Persistence Tests for Node Creation
 *
 * These tests verify that node creation properly updates:
 * - .clab.yml file (adds node with kind and image)
 * - .clab.yml.annotations.json file (saves node position)
 */
test.describe("Node Creation - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("created node appears in YAML file with position in annotations", async ({
    page,
    topoViewerPage
  }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(initialYaml).not.toContain("test-node1:");

    // Create a node at a specific position
    const targetPosition = { x: 300, y: 250 };
    await topoViewerPage.createNode("test-node1", targetPosition, KIND_NOKIA_SRLINUX);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated YAML
    const updatedYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);

    // Node should be in the YAML with proper structure
    expect(updatedYaml).toContain("test-node1:");
    expect(updatedYaml).toContain(`kind: ${KIND_NOKIA_SRLINUX}`);
    expect(updatedYaml).toContain("image:");

    // Read annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);

    // Find the node annotation
    const nodeAnnotation = annotations.nodeAnnotations?.find((n) => n.id === "test-node1");
    expect(nodeAnnotation).toBeDefined();
    expect(nodeAnnotation?.position).toBeDefined();

    // Position should be close to target (within 20px tolerance)
    expect(Math.abs(nodeAnnotation!.position!.x - targetPosition.x)).toBeLessThan(20);
    expect(Math.abs(nodeAnnotation!.position!.y - targetPosition.y)).toBeLessThan(20);
  });

  test("multiple created nodes appear in YAML and annotations", async ({
    page,
    topoViewerPage
  }) => {
    // Create 3 nodes
    await topoViewerPage.createNode("router1", { x: 200, y: 100 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router2", { x: 100, y: 300 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router3", { x: 300, y: 300 }, KIND_NOKIA_SRLINUX);

    // Wait for saves to complete
    await page.waitForTimeout(1000);

    // Verify YAML
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain("router1:");
    expect(yaml).toContain("router2:");
    expect(yaml).toContain("router3:");

    // Verify annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(3);

    const nodeIds = annotations.nodeAnnotations?.map((n) => n.id).sort();
    expect(nodeIds).toEqual(["router1", "router2", "router3"]);
  });

  test("created node persists after reload", async ({ page, topoViewerPage }) => {
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
