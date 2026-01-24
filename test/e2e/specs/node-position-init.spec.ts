import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Constants for topology files
const DATACENTER_TOPOLOGY = "datacenter.clab.yml";
const SPINE_LEAF_TOPOLOGY = "spine-leaf.clab.yml";
const SIMPLE_TOPOLOGY = "simple.clab.yml";

// Default tolerance for position comparison
const POSITION_TOLERANCE = 50;

// Type for position records
type PositionMap = Record<string, { x: number; y: number }>;

/** Get node positions from Cytoscape */
async function getCytoscapePositions(page: Page): Promise<PositionMap> {
  return page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (!cy) return {};

    const positions: Record<string, { x: number; y: number }> = {};
    cy.nodes().forEach((n: any) => {
      const role = n.data("topoViewerRole");
      if (role && role !== "freeText" && role !== "freeShape" && role !== "group") {
        const pos = n.position();
        positions[n.id()] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      }
    });
    return positions;
  });
}

/** Poll a single node's position over time */
async function pollNodePosition(
  page: Page,
  nodeId: string,
  iterations: number,
  intervalMs: number
): Promise<Array<{ time: number; pos: { x: number; y: number } }>> {
  const history: Array<{ time: number; pos: { x: number; y: number } }> = [];

  for (let i = 0; i < iterations; i++) {
    const pos = await page.evaluate((id) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return null;
      const node = cy.getElementById(id);
      if (node.empty()) return null;
      const p = node.position();
      return { x: Math.round(p.x), y: Math.round(p.y) };
    }, nodeId);

    if (pos) {
      history.push({ time: i * intervalMs, pos });
    }
    await page.waitForTimeout(intervalMs);
  }

  return history;
}

/** Check for position drift between expected and actual positions */
function detectDrift(
  annotationPositions: PositionMap,
  positionsT0: PositionMap,
  positionsT2: PositionMap,
  reactPositions: PositionMap,
  tolerance: number
): boolean {
  let driftDetected = false;

  for (const nodeId of Object.keys(annotationPositions)) {
    const expected = annotationPositions[nodeId];
    const atT0 = positionsT0[nodeId];
    const atT2 = positionsT2[nodeId];
    const inReact = reactPositions[nodeId];

    if (!atT0 || !atT2) continue;

    // Check if positions changed between T0 and T2
    const deltaT0T2 = Math.abs(atT0.x - atT2.x) + Math.abs(atT0.y - atT2.y);
    if (deltaT0T2 > 5) {
      console.log(
        `[DELAYED DRIFT] ${nodeId}: T0=(${atT0.x}, ${atT0.y}) -> T2=(${atT2.x}, ${atT2.y})`
      );
      driftDetected = true;
    }

    // Check if final positions differ from annotations
    const deltaFromFile = Math.abs(atT2.x - expected.x) + Math.abs(atT2.y - expected.y);
    if (deltaFromFile > tolerance) {
      console.log(
        `[DRIFT FROM FILE] ${nodeId}: expected=(${expected.x}, ${expected.y}), got=(${atT2.x}, ${atT2.y}), react=(${inReact?.x}, ${inReact?.y})`
      );
      driftDetected = true;
    }

    // Check if React state differs from Cytoscape
    if (inReact) {
      const deltaReactCy = Math.abs(atT2.x - inReact.x) + Math.abs(atT2.y - inReact.y);
      if (deltaReactCy > 5) {
        console.log(
          `[REACT VS CY] ${nodeId}: React=(${inReact.x}, ${inReact.y}), Cy=(${atT2.x}, ${atT2.y})`
        );
      }
    }
  }

  return driftDetected;
}

/**
 * Tests for node position initialization from annotations file.
 *
 * These tests verify that when a topology with stored positions is loaded,
 * the nodes appear at their correct positions without drift caused by
 * COSE layout being incorrectly applied.
 *
 * Related bug fix: commit 183ba508bd54dacb14d09c36dd367283f28c3738
 */
test.describe("Node Position Initialization", () => {
  test("nodes load at positions from annotations file without drift", async ({
    topoViewerPage
  }) => {
    // Load datacenter topology which has stored positions in annotations file
    await topoViewerPage.gotoFile(DATACENTER_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    // Get expected positions from annotations file
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_TOPOLOGY);

    // Get actual positions from Cytoscape
    const spine1Actual = await topoViewerPage.getNodePosition("spine1");
    const border1Actual = await topoViewerPage.getNodePosition("border1");
    const leaf1Actual = await topoViewerPage.getNodePosition("leaf1");

    // Get expected positions from annotations
    const spine1Expected = annotations.nodeAnnotations?.find((n) => n.id === "spine1")?.position;
    const border1Expected = annotations.nodeAnnotations?.find((n) => n.id === "border1")?.position;
    const leaf1Expected = annotations.nodeAnnotations?.find((n) => n.id === "leaf1")?.position;

    expect(spine1Expected).toBeDefined();
    expect(border1Expected).toBeDefined();
    expect(leaf1Expected).toBeDefined();

    // Tolerance of 50px is reasonable for zoom/pan/fit adjustments
    // If COSE ran incorrectly, positions will be hundreds of pixels off
    const tolerance = 50;

    // Check spine1 position
    const spine1DeltaX = Math.abs(spine1Actual.x - spine1Expected!.x);
    const spine1DeltaY = Math.abs(spine1Actual.y - spine1Expected!.y);
    expect(
      spine1DeltaX,
      `spine1 X drift: expected ${spine1Expected!.x}, got ${spine1Actual.x}`
    ).toBeLessThan(tolerance);
    expect(
      spine1DeltaY,
      `spine1 Y drift: expected ${spine1Expected!.y}, got ${spine1Actual.y}`
    ).toBeLessThan(tolerance);

    // Check border1 position
    const border1DeltaX = Math.abs(border1Actual.x - border1Expected!.x);
    const border1DeltaY = Math.abs(border1Actual.y - border1Expected!.y);
    expect(
      border1DeltaX,
      `border1 X drift: expected ${border1Expected!.x}, got ${border1Actual.x}`
    ).toBeLessThan(tolerance);
    expect(
      border1DeltaY,
      `border1 Y drift: expected ${border1Expected!.y}, got ${border1Actual.y}`
    ).toBeLessThan(tolerance);

    // Check leaf1 position
    const leaf1DeltaX = Math.abs(leaf1Actual.x - leaf1Expected!.x);
    const leaf1DeltaY = Math.abs(leaf1Actual.y - leaf1Expected!.y);
    expect(
      leaf1DeltaX,
      `leaf1 X drift: expected ${leaf1Expected!.x}, got ${leaf1Actual.x}`
    ).toBeLessThan(tolerance);
    expect(
      leaf1DeltaY,
      `leaf1 Y drift: expected ${leaf1Expected!.y}, got ${leaf1Actual.y}`
    ).toBeLessThan(tolerance);
  });

  test("spine-leaf topology preserves node positions on load", async ({ topoViewerPage }) => {
    // Test with a different topology to ensure this isn't datacenter-specific
    await topoViewerPage.gotoFile(SPINE_LEAF_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    const annotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_TOPOLOGY);

    // Check spine1 node
    const spine1Expected = annotations.nodeAnnotations?.find((n) => n.id === "spine1")?.position;
    if (spine1Expected) {
      const spine1Actual = await topoViewerPage.getNodePosition("spine1");
      const tolerance = 50;

      const deltaX = Math.abs(spine1Actual.x - spine1Expected.x);
      const deltaY = Math.abs(spine1Actual.y - spine1Expected.y);

      expect(
        deltaX,
        `spine1 X drift: expected ${spine1Expected.x}, got ${spine1Actual.x}`
      ).toBeLessThan(tolerance);
      expect(
        deltaY,
        `spine1 Y drift: expected ${spine1Expected.y}, got ${spine1Actual.y}`
      ).toBeLessThan(tolerance);
    }

    // Check leaf1 node
    const leaf1Expected = annotations.nodeAnnotations?.find((n) => n.id === "leaf1")?.position;
    if (leaf1Expected) {
      const leaf1Actual = await topoViewerPage.getNodePosition("leaf1");
      const tolerance = 50;

      const deltaX = Math.abs(leaf1Actual.x - leaf1Expected.x);
      const deltaY = Math.abs(leaf1Actual.y - leaf1Expected.y);

      expect(
        deltaX,
        `leaf1 X drift: expected ${leaf1Expected.x}, got ${leaf1Actual.x}`
      ).toBeLessThan(tolerance);
      expect(
        deltaY,
        `leaf1 Y drift: expected ${leaf1Expected.y}, got ${leaf1Actual.y}`
      ).toBeLessThan(tolerance);
    }
  });

  test("all datacenter nodes maintain relative positions", async ({ topoViewerPage }) => {
    // This test checks that the spatial relationships between nodes are preserved
    // Even if there's some global offset, border nodes should be above spine nodes,
    // spine nodes above leaf nodes, etc.

    await topoViewerPage.gotoFile(DATACENTER_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    // Get actual positions
    const border1 = await topoViewerPage.getNodePosition("border1");
    const spine1 = await topoViewerPage.getNodePosition("spine1");
    const leaf1 = await topoViewerPage.getNodePosition("leaf1");
    const server1 = await topoViewerPage.getNodePosition("server1");

    // In the datacenter layout, the Y positions should increase as we go down the layers:
    // Border (top) < Spine < Leaf < Server (bottom)
    // Allow some tolerance for the check
    expect(border1.y, "border1 should be above spine1").toBeLessThan(spine1.y + 20);
    expect(spine1.y, "spine1 should be above leaf1").toBeLessThan(leaf1.y + 20);
    expect(leaf1.y, "leaf1 should be above server1").toBeLessThan(server1.y + 20);
  });

  test("rapid file switch does not cause position drift", async ({ topoViewerPage }) => {
    // This test simulates rapid file switching which might expose race conditions
    // between initCytoscape and useElementsUpdate

    // Load simple file first
    await topoViewerPage.gotoFile(SIMPLE_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    // Now load datacenter - this switch might expose race conditions
    await topoViewerPage.gotoFile(DATACENTER_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_TOPOLOGY);
    const spine1Expected = annotations.nodeAnnotations?.find((n) => n.id === "spine1")?.position;
    expect(spine1Expected).toBeDefined();

    const spine1Actual = await topoViewerPage.getNodePosition("spine1");
    const tolerance = 50;

    const deltaX = Math.abs(spine1Actual.x - spine1Expected!.x);
    const deltaY = Math.abs(spine1Actual.y - spine1Expected!.y);

    expect(
      deltaX,
      `spine1 X drift after file switch: expected ${spine1Expected!.x}, got ${spine1Actual.x}`
    ).toBeLessThan(tolerance);
    expect(
      deltaY,
      `spine1 Y drift after file switch: expected ${spine1Expected!.y}, got ${spine1Actual.y}`
    ).toBeLessThan(tolerance);
  });

  test("position drift detection with logging", async ({ page, topoViewerPage }) => {
    // This test adds logging to help diagnose the race condition
    await topoViewerPage.gotoFile(DATACENTER_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    // Get detailed initialization info from the browser
    const initInfo = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return { error: "No Cytoscape instance" };

      const nodes = cy.nodes().filter((n: any) => {
        const role = n.data("topoViewerRole");
        return role && role !== "freeText" && role !== "freeShape" && role !== "group";
      });

      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n: any) => {
        const pos = n.position();
        positions[n.id()] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      });

      return {
        nodeCount: nodes.length,
        initialLayoutDone: cy.scratch("initialLayoutDone"),
        positions
      };
    });

    console.log("[DEBUG] Init info:", JSON.stringify(initInfo, null, 2));

    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_TOPOLOGY);

    // Log expected vs actual for all nodes
    let driftDetected = false;
    const tolerance = 50;

    for (const ann of annotations.nodeAnnotations || []) {
      if (!ann.position) continue;

      const actual = initInfo.positions?.[ann.id];
      if (!actual) continue;

      const deltaX = Math.abs(actual.x - ann.position.x);
      const deltaY = Math.abs(actual.y - ann.position.y);

      if (deltaX > tolerance || deltaY > tolerance) {
        console.log(
          `[DRIFT] ${ann.id}: expected (${ann.position.x}, ${ann.position.y}), got (${actual.x}, ${actual.y}), delta: (${deltaX}, ${deltaY})`
        );
        driftDetected = true;
      }
    }

    expect(driftDetected, "Position drift detected - see logs for details").toBe(false);
  });

  test("delayed position drift - React state vs annotations vs Cytoscape", async ({
    page,
    topoViewerPage
  }) => {
    // This test checks for DELAYED drift - positions might be correct initially
    // but then change after COSE layout runs asynchronously

    await topoViewerPage.gotoFile(DATACENTER_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();

    // Get positions IMMEDIATELY after canvas ready
    const positionsT0 = await getCytoscapePositions(page);
    console.log(
      "[T0] Positions immediately after canvas ready:",
      JSON.stringify(positionsT0, null, 2)
    );

    // Get React state positions
    const reactPositions = (await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const elements = dev?.getElements?.() || [];
      const positions: Record<string, { x: number; y: number } | null> = {};

      for (const el of elements) {
        if (el.group === "nodes" && el.position) {
          const role = el.data?.topoViewerRole;
          if (role && role !== "freeText" && role !== "freeShape" && role !== "group") {
            positions[el.data.id] = {
              x: Math.round(el.position.x),
              y: Math.round(el.position.y)
            };
          }
        }
      }
      return positions;
    })) as PositionMap;

    console.log("[T0] React state positions:", JSON.stringify(reactPositions, null, 2));

    // Get annotations file positions
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_TOPOLOGY);
    const annotationPositions: PositionMap = {};
    for (const ann of annotations.nodeAnnotations || []) {
      if (ann.position) {
        annotationPositions[ann.id] = ann.position;
      }
    }
    console.log("[FILE] Annotations file positions:", JSON.stringify(annotationPositions, null, 2));

    // Poll positions every 100ms for 2 seconds
    console.log("[POLL] Starting position polling for 2 seconds...");
    const positionHistory = await pollNodePosition(page, "border1", 20, 100);
    console.log("[POLL] Position history:", JSON.stringify(positionHistory));

    // Get positions AFTER 2 seconds
    const positionsT2 = await getCytoscapePositions(page);
    console.log("[T2] Positions after 2 seconds:", JSON.stringify(positionsT2, null, 2));

    // Compare T0 vs T2 - did positions change?
    const driftDetected = detectDrift(
      annotationPositions,
      positionsT0,
      positionsT2,
      reactPositions,
      POSITION_TOLERANCE
    );

    expect(driftDetected, "Position drift detected - see logs above").toBe(false);
  });
});
