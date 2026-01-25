import { test, expect } from "../fixtures/topoviewer";
import { altClick, altClickElement, getEdgeMidpoint } from "../helpers/react-flow-helpers";

const SPINE_LEAF_FILE = "spine-leaf.clab.yml";
const DATACENTER_FILE = "datacenter.clab.yml";

/**
 * Tests for Alt+Click delete functionality across all element types:
 * - Nodes (React Flow elements)
 * - Edges (React Flow elements)
 * - Groups (HTML overlays)
 * - Free Text annotations (HTML overlays)
 * - Free Shape annotations (HTML overlays)
 */
test.describe("Alt+Click Delete", () => {
  test.describe("Node Deletion", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile("simple.clab.yml");
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test("Alt+Click deletes a node", async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      const nodeToDelete = nodeIds[0];
      const nodeBB = await topoViewerPage.getNodeBoundingBox(nodeToDelete);
      expect(nodeBB).not.toBeNull();

      // Alt+Click on the node
      await altClick(page, nodeBB!.x + nodeBB!.width / 2, nodeBB!.y + nodeBB!.height / 2);
      await page.waitForTimeout(300);

      // Node should be deleted
      const newNodeCount = await topoViewerPage.getNodeCount();
      expect(newNodeCount).toBe(initialNodeCount - 1);

      const remainingNodeIds = await topoViewerPage.getNodeIds();
      expect(remainingNodeIds).not.toContain(nodeToDelete);
    });

    test("Alt+Click does not delete node when locked", async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      // Lock the canvas
      await topoViewerPage.lock();

      const nodeToDelete = nodeIds[0];
      const nodeBB = await topoViewerPage.getNodeBoundingBox(nodeToDelete);
      expect(nodeBB).not.toBeNull();

      // Alt+Click on the node
      await altClick(page, nodeBB!.x + nodeBB!.width / 2, nodeBB!.y + nodeBB!.height / 2);
      await page.waitForTimeout(300);

      // Node count should remain the same
      const newNodeCount = await topoViewerPage.getNodeCount();
      expect(newNodeCount).toBe(initialNodeCount);
    });

    test("Alt+Click does not delete node in view mode", async ({ page, topoViewerPage }) => {
      const initialNodeCount = await topoViewerPage.getNodeCount();
      const nodeIds = await topoViewerPage.getNodeIds();
      expect(nodeIds.length).toBeGreaterThan(0);

      // Switch to view mode
      await topoViewerPage.setViewMode();

      const nodeToDelete = nodeIds[0];
      const nodeBB = await topoViewerPage.getNodeBoundingBox(nodeToDelete);
      expect(nodeBB).not.toBeNull();

      // Alt+Click on the node
      await altClick(page, nodeBB!.x + nodeBB!.width / 2, nodeBB!.y + nodeBB!.height / 2);
      await page.waitForTimeout(300);

      // Node count should remain the same
      const newNodeCount = await topoViewerPage.getNodeCount();
      expect(newNodeCount).toBe(initialNodeCount);
    });
  });

  test.describe("Edge Deletion", () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile("simple.clab.yml");
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test("Alt+Click deletes an edge", async ({ page, topoViewerPage }) => {
      const initialEdgeCount = await topoViewerPage.getEdgeCount();
      expect(initialEdgeCount).toBeGreaterThan(0);

      const edgeIds = await topoViewerPage.getEdgeIds();
      expect(edgeIds.length).toBeGreaterThan(0);

      const edgeToDelete = edgeIds[0];
      const edgeMidpoint = await getEdgeMidpoint(page, edgeToDelete);
      expect(edgeMidpoint).not.toBeNull();

      // Alt+Click on the edge
      await altClick(page, edgeMidpoint!.x, edgeMidpoint!.y);
      await page.waitForTimeout(300);

      // Edge should be deleted
      const newEdgeCount = await topoViewerPage.getEdgeCount();
      expect(newEdgeCount).toBe(initialEdgeCount - 1);
    });

    test("Alt+Click does not delete edge when locked", async ({ page, topoViewerPage }) => {
      const initialEdgeCount = await topoViewerPage.getEdgeCount();
      expect(initialEdgeCount).toBeGreaterThan(0);

      // Lock the canvas
      await topoViewerPage.lock();

      const edgeIds = await topoViewerPage.getEdgeIds();
      const edgeToDelete = edgeIds[0];
      const edgeMidpoint = await getEdgeMidpoint(page, edgeToDelete);
      expect(edgeMidpoint).not.toBeNull();

      // Alt+Click on the edge
      await altClick(page, edgeMidpoint!.x, edgeMidpoint!.y);
      await page.waitForTimeout(300);

      // Edge count should remain the same
      const newEdgeCount = await topoViewerPage.getEdgeCount();
      expect(newEdgeCount).toBe(initialEdgeCount);
    });
  });

  test.describe("Group Deletion", () => {
    test("Alt+Click deletes an existing group", async ({ page, topoViewerPage }) => {
      // Use datacenter topology which has pre-existing groups
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Wait for groups to be loaded and fit to viewport
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        (window as any).__DEV__?.cy?.fit();
      });
      await page.waitForTimeout(300);

      const groupIds = await topoViewerPage.getGroupIds();
      expect(groupIds.length).toBeGreaterThan(0);

      const initialGroupCount = await topoViewerPage.getGroupCount();

      // Use group-spine (index 1) which has a clearly visible label in the viewport
      // group-border (index 0) has its label at y=12 which can be at the edge
      const groupToDelete = groupIds[1]; // group-spine

      // Get the group label's bounding box using raw coordinates
      const groupLabel = page.locator(`[data-testid="group-label-${groupToDelete}"]`);
      await groupLabel.waitFor({ state: "visible", timeout: 5000 });
      const labelBox = await groupLabel.boundingBox();
      expect(labelBox).not.toBeNull();

      // Use raw mouse coordinates with altClick to avoid Playwright's actionability checks
      await altClick(page, labelBox!.x + labelBox!.width / 2, labelBox!.y + labelBox!.height / 2);

      // Group should be deleted - use poll for reliability
      await expect
        .poll(() => topoViewerPage.getGroupCount(), {
          timeout: 5000,
          message: "Expected group to be deleted"
        })
        .toBe(initialGroupCount - 1);
    });

    test("Alt+Click does not delete group when locked", async ({ page, topoViewerPage }) => {
      // Use datacenter topology which has pre-existing groups
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Wait for groups to be loaded and fit to viewport
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        (window as any).__DEV__?.cy?.fit();
      });
      await page.waitForTimeout(300);

      const groupIds = await topoViewerPage.getGroupIds();
      const initialGroupCount = await topoViewerPage.getGroupCount();
      expect(groupIds.length).toBeGreaterThan(0);

      // Use group-spine (index 1) which has a clearly visible label
      const groupToDelete = groupIds[1]; // group-spine

      // Lock the canvas
      await topoViewerPage.lock();

      // Get label bounding box
      const groupLabel = page.locator(`[data-testid="group-label-${groupToDelete}"]`);
      const labelBox = await groupLabel.boundingBox();
      expect(labelBox).not.toBeNull();

      // Alt+Click using raw coordinates
      await altClick(page, labelBox!.x + labelBox!.width / 2, labelBox!.y + labelBox!.height / 2);
      await page.waitForTimeout(300);

      // Group count should remain the same
      const newGroupCount = await topoViewerPage.getGroupCount();
      expect(newGroupCount).toBe(initialGroupCount);
    });
  });

  test.describe("Free Text Deletion", () => {
    test("Alt+Click deletes a free text annotation", async ({ page, topoViewerPage }) => {
      // Use datacenter topology which has pre-existing text annotations
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Wait for annotations to load and fit to viewport
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        (window as any).__DEV__?.cy?.fit();
      });
      await page.waitForTimeout(300);

      // Get initial text annotation count from file
      const beforeAnnotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
      const initialTextCount = beforeAnnotations.freeTextAnnotations?.length ?? 0;
      expect(initialTextCount).toBeGreaterThan(0);

      // Find a visible text annotation - click on .free-text-markdown which bubbles up to handler
      // Playwright's coordinate-based click can miss narrow rotated elements, so we use dispatchEvent
      const markdownDivs = page.locator(".free-text-layer .free-text-markdown");
      const count = await markdownDivs.count();
      let visibleElement = null;

      for (let i = 0; i < count; i++) {
        const el = markdownDivs.nth(i);
        const box = await el.boundingBox();
        // Check if the element is within the viewport (y > 50 to avoid edge, y < 600 to be visible)
        if (box && box.y > 50 && box.y < 600 && box.x > 0) {
          visibleElement = el;
          break;
        }
      }
      expect(visibleElement).not.toBeNull();

      // Use altClickElement which dispatches the event directly to the element
      await altClickElement(page, visibleElement!);

      // Text should be deleted - verify in file
      await expect
        .poll(
          async () => {
            const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
            return after.freeTextAnnotations?.length ?? 0;
          },
          { timeout: 5000, message: "Expected free text annotation to be deleted" }
        )
        .toBe(initialTextCount - 1);
    });
  });

  test.describe("Free Shape Deletion", () => {
    test("Alt+Click deletes a free shape annotation", async ({ page, topoViewerPage }) => {
      // Use datacenter topology which has a pre-existing shape annotation
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Wait for annotations to load and fit to viewport
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        (window as any).__DEV__?.cy?.fit();
      });
      await page.waitForTimeout(300);

      // Get initial shape annotation count from file
      const beforeAnnotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
      const initialShapeCount = beforeAnnotations.freeShapeAnnotations?.length ?? 0;
      expect(initialShapeCount).toBeGreaterThan(0);

      // Get the position of the shape from annotations file
      const shapeAnnotation = beforeAnnotations.freeShapeAnnotations[0];

      // Click on the border edge of the shape (shapes have pointerEvents only on 12px border frame)
      // Use left edge: position.x - width/2 + 6 (middle of border)
      const shapeLeftEdgeX = shapeAnnotation.position.x - (shapeAnnotation.width || 100) / 2 + 6;
      const shapeCenterY = shapeAnnotation.position.y;

      // Convert model position to page coordinates for clicking
      const pageCoords = await page.evaluate(
        ({ modelX, modelY }) => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return { x: 0, y: 0 };
          const pan = cy.pan();
          const zoom = cy.zoom();
          const container = cy.container();
          const rect = container.getBoundingClientRect();
          return {
            x: rect.left + modelX * zoom + pan.x,
            y: rect.top + modelY * zoom + pan.y
          };
        },
        { modelX: shapeLeftEdgeX, modelY: shapeCenterY }
      );

      // Alt+Click on the shape
      await altClick(page, pageCoords.x, pageCoords.y);

      // Shape should be deleted - verify in file
      await expect
        .poll(
          async () => {
            const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
            return after.freeShapeAnnotations?.length ?? 0;
          },
          { timeout: 5000, message: "Expected free shape annotation to be deleted" }
        )
        .toBe(initialShapeCount - 1);
    });
  });

  test.describe("File Persistence", () => {
    test("Alt+Click delete persists node removal to YAML file", async ({
      page,
      topoViewerPage
    }) => {
      await topoViewerPage.resetFiles();
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
      expect(initialYaml).toContain("leaf1:");

      const nodeBB = await topoViewerPage.getNodeBoundingBox("leaf1");
      expect(nodeBB).not.toBeNull();

      // Alt+Click to delete leaf1
      await altClick(page, nodeBB!.x + nodeBB!.width / 2, nodeBB!.y + nodeBB!.height / 2);

      // Wait for save to complete
      await page.waitForTimeout(1000);

      // Read updated YAML
      const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

      // leaf1 node should be gone
      expect(updatedYaml).not.toContain("leaf1:");
    });
  });
});
