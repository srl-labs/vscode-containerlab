import { test, expect } from "../fixtures/topoviewer";

/**
 * GeoMap E2E Tests
 *
 * Tests the GeoMap (geographic layout) functionality including:
 * - Switching to geo layout
 * - Node geo coordinate assignment
 * - Dragging nodes in geo mode updates their lat/lng
 */
const TEST_FILE = "simple.clab.yml";

test.describe("GeoMap Layout", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile(TEST_FILE);
    await topoViewerPage.waitForCanvasReady();
  });

  test("geo layout is currently disabled in ReactFlow (no geo coordinates assigned)", async ({
    page,
    topoViewerPage
  }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      if (dev?.setLayout) {
        dev.setLayout("geo");
      } else {
        throw new Error("setLayout not available");
      }
    });

    await page.waitForTimeout(500);

    // Geo layout is not yet available in ReactFlow migration
    const isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(false);

    // Verify nodes do NOT have geo coordinates assigned
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeGeo = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return null;
      const node = (rf.getNodes?.() ?? []).find((n: any) => n.id === nodeId);
      if (!node) return null;
      return node.data?.geoCoordinates ?? node.data?.extraData?.geoCoordinates ?? null;
    }, nodeIds[0]);

    expect(nodeGeo).toBeNull();
  });

  test("dragging node after geo mode request does not create geo coordinates", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Use specific known node ID (simple.clab.yml has srl1 and srl2)
    const testNodeId = "srl2";

    // Get original annotation position BEFORE enabling geo layout
    // This is the preset position that should NOT change when dragging in geo mode
    const originalAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_FILE);
    const originalNodeAnnotation = originalAnnotations.nodeAnnotations?.find(
      (ann: { id: string }) => ann.id === testNodeId
    ) as
      | {
          id: string;
          position?: { x: number; y: number };
          geoCoordinates?: { lat: number; lng: number };
        }
      | undefined;
    const originalPosition = originalNodeAnnotation?.position;
    console.log(`[DEBUG] Original annotation position: ${JSON.stringify(originalPosition)}`);

    // Enable geo layout (currently a no-op in ReactFlow migration)
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.("geo");
    });

    await page.waitForTimeout(500);

    // Switch to geo edit mode (state only)
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.("edit");
    });

    // Wait for mode to be applied
    await page.waitForTimeout(500);

    // Capture initial node position from React Flow
    const initialPosition = await topoViewerPage.getNodePosition(testNodeId);
    console.log(`[DEBUG] Initial position: (${initialPosition.x}, ${initialPosition.y})`);

    // Capture console errors during drag
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Perform the drag - this would trigger the bug before the fix
    await topoViewerPage.dragNode(testNodeId, { x: 150, y: 75 });

    // Wait for drag to complete and persistence to happen (debounce + file write)
    await page.waitForTimeout(1500);

    // Check for errors - specifically the "Cannot read properties of undefined (reading 'group')" error
    const relevantErrors = consoleErrors.filter(
      (err) =>
        err.includes("Cannot read properties of undefined (reading 'group')") ||
        err.includes("isNode")
    );
    expect(relevantErrors).toHaveLength(0);

    // Position should have changed (node was dragged)
    const updatedPosition = await topoViewerPage.getNodePosition(testNodeId);
    console.log(`[DEBUG] Updated position: (${updatedPosition.x}, ${updatedPosition.y})`);
    expect(updatedPosition.x).not.toBeCloseTo(initialPosition.x, 0);

    // Verify geo coordinates were NOT added to annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(TEST_FILE);

    expect(annotations.nodeAnnotations).toBeDefined();
    expect(annotations.nodeAnnotations!.length).toBeGreaterThan(0);

    // Find the annotation for the dragged node
    const nodeAnnotation = annotations.nodeAnnotations!.find(
      (ann: { id: string }) => ann.id === testNodeId
    ) as
      | {
          id: string;
          position?: { x: number; y: number };
          geoCoordinates?: { lat: number; lng: number };
        }
      | undefined;

    console.log(`[DEBUG] Annotation for ${testNodeId}: ${JSON.stringify(nodeAnnotation)}`);

    expect(nodeAnnotation).toBeDefined();
    expect(nodeAnnotation!.geoCoordinates).toBeUndefined();

    // CRITICAL: Verify that the preset x/y position did NOT change
    // In GeoMap mode, only geo coordinates should be updated, not the preset position
    // If there was no original position, there should still be no position after drag
    console.log(`[DEBUG] Final annotation position: ${JSON.stringify(nodeAnnotation!.position)}`);
    if (originalPosition) {
      // Original had position - it should remain unchanged
      expect(nodeAnnotation!.position).toBeDefined();
      expect(nodeAnnotation!.position!.x).toBe(originalPosition.x);
      expect(nodeAnnotation!.position!.y).toBe(originalPosition.y);
    } else {
      // Original had no position - should still have no position (not added by geo drag)
      expect(nodeAnnotation!.position).toBeUndefined();
    }
  });

  test("geo mode toggle works correctly", async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.("geo");
    });

    await page.waitForTimeout(200);

    // Check initial mode is 'pan' (state-only)
    const initialMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(initialMode).toBe("pan");

    // Switch to edit mode
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.("edit");
    });

    await page.waitForTimeout(200);

    const editMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(editMode).toBe("edit");

    // Switch back to pan mode
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.("pan");
    });

    await page.waitForTimeout(200);

    const panMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(panMode).toBe("pan");
  });

  test("disabling geo layout restores normal view", async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.("geo");
    });

    await page.waitForTimeout(200);

    // Verify geo layout is not active
    let isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(false);

    // Switch back to preset layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.("preset");
    });

    await page.waitForTimeout(1000);

    // Verify geo layout is still not active
    isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(false);

    // Canvas should still be functional
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBeGreaterThan(0);
  });
});
