import { test, expect } from '../fixtures/topoviewer';

/**
 * GeoMap E2E Tests
 *
 * Tests the GeoMap (geographic layout) functionality including:
 * - Switching to geo layout
 * - Node geo coordinate assignment
 * - Dragging nodes in geo mode updates their lat/lng
 */
const TEST_FILE = 'simple.clab.yml';

test.describe('GeoMap Layout', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile(TEST_FILE);
    await topoViewerPage.waitForCanvasReady();
  });

  test('switching to geo layout initializes map and assigns geo coordinates', async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      if (dev?.setLayout) {
        dev.setLayout('geo');
      } else {
        throw new Error('setLayout not available');
      }
    });

    // Wait for geo map to initialize (map loads asynchronously)
    await page.waitForFunction(
      () => (window as any).__DEV__?.isGeoLayout?.() === true,
      { timeout: 15000 }
    );

    // Wait for MapLibre to load (it has a timeout of 10 seconds)
    await page.waitForTimeout(2000);

    // Verify geo layout is active
    const isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(true);

    // Verify nodes have geo coordinates assigned
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeWithGeo = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return null;
      const node = cy.getElementById(nodeId);
      if (!node || node.empty()) return null;
      return {
        id: nodeId,
        lat: node.data('lat'),
        lng: node.data('lng')
      };
    }, nodeIds[0]);

    expect(nodeWithGeo).not.toBeNull();
    expect(nodeWithGeo?.lat).toBeDefined();
    expect(nodeWithGeo?.lng).toBeDefined();
    // Lat/lng should be numeric strings (not NaN)
    expect(parseFloat(nodeWithGeo!.lat)).not.toBeNaN();
    expect(parseFloat(nodeWithGeo!.lng)).not.toBeNaN();
  });

  test('dragging node in geo edit mode updates geo coordinates and persists to file', async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Use specific known node ID (simple.clab.yml has srl1 and srl2)
    const testNodeId = 'srl2';

    // Get original annotation position BEFORE enabling geo layout
    // This is the preset position that should NOT change when dragging in geo mode
    const originalAnnotations = await topoViewerPage.getAnnotationsFromFile(TEST_FILE);
    const originalNodeAnnotation = originalAnnotations.nodeAnnotations?.find(
      (ann: { id: string }) => ann.id === testNodeId
    ) as { id: string; position?: { x: number; y: number }; geoCoordinates?: { lat: number; lng: number } } | undefined;
    const originalPosition = originalNodeAnnotation?.position;
    console.log(`[DEBUG] Original annotation position: ${JSON.stringify(originalPosition)}`);

    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.('geo');
    });

    // Wait for geo map to initialize
    await page.waitForFunction(
      () => (window as any).__DEV__?.isGeoLayout?.() === true,
      { timeout: 15000 }
    );

    // Wait for MapLibre to fully load
    await page.waitForTimeout(3000);

    // Switch to edit mode for geo (allows node dragging)
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.('edit');
    });

    // Wait for mode to be applied
    await page.waitForTimeout(500);

    // Verify the node exists
    const nodeExists = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return false;
      const node = cy.getElementById(nodeId);
      return node && !node.empty();
    }, testNodeId);
    expect(nodeExists).toBe(true);

    // Get initial geo coordinates from node data
    const initialGeo = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return null;
      const node = cy.getElementById(nodeId);
      if (!node || node.empty()) return null;
      return {
        lat: parseFloat(node.data('lat')),
        lng: parseFloat(node.data('lng')),
        position: node.position()
      };
    }, testNodeId);

    expect(initialGeo).not.toBeNull();
    console.log(`[DEBUG] Initial position: (${initialGeo!.position.x}, ${initialGeo!.position.y})`);
    console.log(`[DEBUG] Initial geo: lat=${initialGeo!.lat}, lng=${initialGeo!.lng}`);

    // Capture console errors during drag
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Perform the drag - this would trigger the bug before the fix
    await topoViewerPage.dragNode(testNodeId, { x: 150, y: 75 });

    // Wait for drag to complete and persistence to happen (debounce + file write)
    await page.waitForTimeout(1500);

    // Check for errors - specifically the "Cannot read properties of undefined (reading 'group')" error
    const relevantErrors = consoleErrors.filter(err =>
      err.includes("Cannot read properties of undefined (reading 'group')") ||
      err.includes('isNode')
    );
    expect(relevantErrors).toHaveLength(0);

    // Get updated geo coordinates from node data
    const updatedGeo = await page.evaluate((nodeId) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return null;
      const node = cy.getElementById(nodeId);
      if (!node || node.empty()) return null;
      return {
        lat: parseFloat(node.data('lat')),
        lng: parseFloat(node.data('lng')),
        position: node.position()
      };
    }, testNodeId);

    expect(updatedGeo).not.toBeNull();
    console.log(`[DEBUG] Updated position: (${updatedGeo!.position.x}, ${updatedGeo!.position.y})`);
    console.log(`[DEBUG] Updated geo: lat=${updatedGeo!.lat}, lng=${updatedGeo!.lng}`);

    // Position should have changed (node was dragged)
    expect(updatedGeo!.position.x).not.toBeCloseTo(initialGeo!.position.x, 0);

    // Geo coordinates should be valid (not NaN) - this is the key fix
    // The bug caused isNode() to crash when trying to update coordinates
    expect(updatedGeo!.lat).not.toBeNaN();
    expect(updatedGeo!.lng).not.toBeNaN();

    // Verify the coordinates are reasonable lat/lng values (within valid ranges)
    expect(updatedGeo!.lat).toBeGreaterThanOrEqual(-90);
    expect(updatedGeo!.lat).toBeLessThanOrEqual(90);
    expect(updatedGeo!.lng).toBeGreaterThanOrEqual(-180);
    expect(updatedGeo!.lng).toBeLessThanOrEqual(180);

    // CRITICAL: Verify geo coordinates are persisted to the annotations file
    const annotations = await topoViewerPage.getAnnotationsFromFile(TEST_FILE);

    expect(annotations.nodeAnnotations).toBeDefined();
    expect(annotations.nodeAnnotations!.length).toBeGreaterThan(0);

    // Find the annotation for the dragged node
    const nodeAnnotation = annotations.nodeAnnotations!.find(
      (ann: { id: string }) => ann.id === testNodeId
    ) as { id: string; position?: { x: number; y: number }; geoCoordinates?: { lat: number; lng: number } } | undefined;

    console.log(`[DEBUG] Annotation for ${testNodeId}: ${JSON.stringify(nodeAnnotation)}`);

    expect(nodeAnnotation).toBeDefined();
    expect(nodeAnnotation!.geoCoordinates).toBeDefined();
    expect(nodeAnnotation!.geoCoordinates!.lat).not.toBeNaN();
    expect(nodeAnnotation!.geoCoordinates!.lng).not.toBeNaN();

    // Verify persisted geo coordinates match what's in the node data (within tolerance)
    expect(nodeAnnotation!.geoCoordinates!.lat).toBeCloseTo(updatedGeo!.lat, 5);
    expect(nodeAnnotation!.geoCoordinates!.lng).toBeCloseTo(updatedGeo!.lng, 5);

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

  test('geo mode toggle works correctly', async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.('geo');
    });

    // Wait for geo map to initialize
    await page.waitForFunction(
      () => (window as any).__DEV__?.isGeoLayout?.() === true,
      { timeout: 15000 }
    );

    await page.waitForTimeout(2000);

    // Check initial mode is 'pan'
    const initialMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(initialMode).toBe('pan');

    // Switch to edit mode
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.('edit');
    });

    await page.waitForTimeout(200);

    const editMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(editMode).toBe('edit');

    // Switch back to pan mode
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setGeoMode?.('pan');
    });

    await page.waitForTimeout(200);

    const panMode = await page.evaluate(() => {
      return (window as any).__DEV__?.geoMode?.();
    });
    expect(panMode).toBe('pan');
  });

  test('disabling geo layout restores normal view', async ({ page, topoViewerPage }) => {
    // Enable geo layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.('geo');
    });

    // Wait for geo map to initialize
    await page.waitForFunction(
      () => (window as any).__DEV__?.isGeoLayout?.() === true,
      { timeout: 15000 }
    );

    await page.waitForTimeout(2000);

    // Verify geo layout is active
    let isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(true);

    // Switch back to preset layout
    await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      dev?.setLayout?.('preset');
    });

    await page.waitForTimeout(1000);

    // Verify geo layout is no longer active
    isGeoLayout = await page.evaluate(() => {
      return (window as any).__DEV__?.isGeoLayout?.() ?? false;
    });
    expect(isGeoLayout).toBe(false);

    // Canvas should still be functional
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBeGreaterThan(0);
  });
});
