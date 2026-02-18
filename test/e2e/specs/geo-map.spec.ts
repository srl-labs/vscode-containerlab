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
const GEO_LAYOUT = "geo";
const GEO_MAP_CANVAS_SELECTOR = "#react-topoviewer-geo-map canvas";

test.describe("GeoMap Layout", () => {
  const getNodeGeoFromStore = async (page: any, nodeId: string) => {
    return page.evaluate((id: string) => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return null;
      const node = (rf.getNodes?.() ?? []).find((n: any) => n.id === id);
      if (!node?.data?.geoCoordinates) return null;
      const { lat, lng } = node.data.geoCoordinates;
      return { lat, lng };
    }, nodeId);
  };

  const getNodeGeoFromFile = async (topoViewerPage: any, nodeId: string) => {
    const annotations = await topoViewerPage.getAnnotationsFromFile(TEST_FILE);
    const nodeAnnotation = annotations.nodeAnnotations?.find(
      (ann: { id: string }) => ann.id === nodeId
    ) as { geoCoordinates?: { lat: number; lng: number } } | undefined;
    return nodeAnnotation?.geoCoordinates ?? null;
  };

  const expectGeoClose = (
    actual: { lat: number; lng: number } | null,
    expected: { lat: number; lng: number } | null
  ) => {
    expect(actual).not.toBeNull();
    expect(expected).not.toBeNull();
    expect(actual!.lat).toBeCloseTo(expected!.lat, 5);
    expect(actual!.lng).toBeCloseTo(expected!.lng, 5);
  };

  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TEST_FILE);
    await topoViewerPage.waitForCanvasReady();
  });

  test("geo layout enables map mode and assigns geo coordinates", async ({
    page,
    topoViewerPage
  }) => {
    // Enable geo layout
    await page.evaluate((layout) => {
      const dev = (window as any).__DEV__;
      if (dev?.setLayout) {
        dev.setLayout(layout);
      } else {
        throw new Error("setLayout not available");
      }
    }, GEO_LAYOUT);

    await page.waitForSelector(GEO_MAP_CANVAS_SELECTOR);

    // Geo layout should be active
    const isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(true);

    // Verify nodes have geo coordinates assigned (wait for async assignment)
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Wait for geo coordinates to be assigned (async after map loads)
    await expect
      .poll(() => getNodeGeoFromStore(page, nodeIds[0]), {
        timeout: 5000,
        message: "geo coordinates should be assigned"
      })
      .not.toBeNull();
  });

  test("dragging node in geo layout updates geo coordinates only", async ({
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

    // Enable geo layout
    await page.evaluate((layout) => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.(layout);
    }, GEO_LAYOUT);

    await page.waitForSelector(GEO_MAP_CANVAS_SELECTOR);

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

    // Verify geo coordinates were added to annotations
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
    expect(nodeAnnotation!.geoCoordinates).toBeDefined();

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

  test("clicking map background deselects selected nodes and edges", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.evaluate((layout) => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.(layout);
    }, GEO_LAYOUT);

    await page.waitForSelector(GEO_MAP_CANVAS_SELECTOR);

    await topoViewerPage.selectNode("srl1");
    await expect
      .poll(async () => (await topoViewerPage.getSelectedNodeIds()).includes("srl1"), {
        timeout: 3000,
        message: "node should be selected before map click"
      })
      .toBe(true);

    await page.click(GEO_MAP_CANVAS_SELECTOR, { position: { x: 10, y: 10 } });
    await expect
      .poll(async () => topoViewerPage.getSelectedNodeIds(), {
        timeout: 3000,
        message: "map click should clear selected nodes"
      })
      .toEqual([]);

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);
    const edgeId = edgeIds[0];
    await topoViewerPage.selectEdge(edgeId);
    await expect
      .poll(async () => (await topoViewerPage.getSelectedEdgeIds()).includes(edgeId), {
        timeout: 3000,
        message: "edge should be selected before map click"
      })
      .toBe(true);

    await page.click(GEO_MAP_CANVAS_SELECTOR, { position: { x: 20, y: 20 } });
    await expect
      .poll(async () => topoViewerPage.getSelectedEdgeIds(), {
        timeout: 3000,
        message: "map click should clear selected edges"
      })
      .toEqual([]);
  });

  test("undo/redo restores geo coordinates in store and annotations", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const testNodeId = "srl2";

    await page.evaluate((layout) => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.(layout);
    }, GEO_LAYOUT);

    await page.waitForSelector(GEO_MAP_CANVAS_SELECTOR);

    await expect
      .poll(
        async () => {
          return getNodeGeoFromStore(page, testNodeId);
        },
        { timeout: 5000, message: "initial geo coordinates should be assigned" }
      )
      .not.toBeNull();

    const initialGeoStore = await getNodeGeoFromStore(page, testNodeId);
    const initialGeoFile = await getNodeGeoFromFile(topoViewerPage, testNodeId);
    expectGeoClose(initialGeoFile, initialGeoStore);

    await topoViewerPage.dragNode(testNodeId, { x: 160, y: 90 });
    await page.waitForTimeout(1500);

    const movedGeoStore = await getNodeGeoFromStore(page, testNodeId);
    const movedGeoFile = await getNodeGeoFromFile(topoViewerPage, testNodeId);
    expect(movedGeoStore).not.toBeNull();
    expect(movedGeoFile).not.toBeNull();
    expect(movedGeoStore!.lat).not.toBeCloseTo(initialGeoStore!.lat, 5);
    expect(movedGeoStore!.lng).not.toBeCloseTo(initialGeoStore!.lng, 5);
    expectGeoClose(movedGeoFile, movedGeoStore);

    await expect.poll(() => topoViewerPage.canUndo(), { timeout: 3000 }).toBe(true);

    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.canRedo(), { timeout: 3000 }).toBe(true);

    const undoGeoStore = await getNodeGeoFromStore(page, testNodeId);
    const undoGeoFile = await getNodeGeoFromFile(topoViewerPage, testNodeId);
    expectGeoClose(undoGeoStore, initialGeoStore);
    expectGeoClose(undoGeoFile, initialGeoStore);

    await topoViewerPage.redo();
    await page.waitForTimeout(800);

    const redoGeoStore = await getNodeGeoFromStore(page, testNodeId);
    const redoGeoFile = await getNodeGeoFromFile(topoViewerPage, testNodeId);
    expectGeoClose(redoGeoStore, movedGeoStore);
    expectGeoClose(redoGeoFile, movedGeoStore);
  });

  test("disabling geo layout restores normal view", async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate((layout) => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.(layout);
    }, GEO_LAYOUT);

    await page.waitForTimeout(200);

    // Verify geo layout is active
    let isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(true);

    // Switch back to preset layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.("preset");
    });

    await page.waitForTimeout(1000);

    // Verify geo layout is not active after switching back
    isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(false);

    // Canvas should still be functional
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBeGreaterThan(0);
  });
});
