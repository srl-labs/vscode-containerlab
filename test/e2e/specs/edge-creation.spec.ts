import { test, expect } from "../fixtures/topoviewer";

// Test file names for file-based tests
const SIMPLE_FILE = "simple.clab.yml";
const EMPTY_FILE = "empty.clab.yml";

/**
 * Edge Creation E2E Tests
 *
 * Tests edge/link creation functionality including:
 * - Creating edges via API
 * - Edge persistence to YAML
 * - Endpoint assignment
 * - Self-loop prevention
 * - Protection in view mode and locked state
 * - Multi-edge scenarios
 * - Cascade deletion
 */
test.describe("Edge Creation", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("creates edge between two nodes with correct endpoints and persists to YAML", async ({
    page,
    topoViewerPage
  }) => {
    // Get initial edge count - simple.clab.yml has 1 edge
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1);

    // Get node IDs - simple.clab.yml has srl1 and srl2
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain("srl1");
    expect(nodeIds).toContain("srl2");

    // Create a new link with specific endpoints
    const sourceEndpoint = "e1-4";
    const targetEndpoint = "e1-5";
    await topoViewerPage.createLink("srl1", "srl2", sourceEndpoint, targetEndpoint);

    // Wait for edge to be created and saved
    await page.waitForTimeout(1000);

    // Verify edge count increased
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 1);

    // Verify the edge exists in the graph
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds).toContain(`srl1:${sourceEndpoint}-srl2:${targetEndpoint}`);

    // Read YAML and verify endpoints
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain(`srl1:${sourceEndpoint}`);
    expect(yaml).toContain(`srl2:${targetEndpoint}`);

    // Verify via browser-side API (via React Flow API)
    const edgeData = await page.evaluate((expectedId) => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return null;

      const edges = rf.getEdges?.() ?? [];
      const edge = edges.find((e: any) => e.id === expectedId);
      if (!edge) return null;

      return {
        source: edge.source,
        target: edge.target,
        sourceEndpoint: edge.data?.sourceEndpoint,
        targetEndpoint: edge.data?.targetEndpoint
      };
    }, `srl1:${sourceEndpoint}-srl2:${targetEndpoint}`);

    expect(edgeData).not.toBeNull();
    expect(edgeData?.source).toBe("srl1");
    expect(edgeData?.target).toBe("srl2");
    expect(edgeData?.sourceEndpoint).toBe(sourceEndpoint);
    expect(edgeData?.targetEndpoint).toBe(targetEndpoint);
  });

  test("can create self-loop edge (hairpin)", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create a self-loop/hairpin (edge from node to itself with different endpoints)
    await topoViewerPage.createLink("srl1", "srl1", "e1-6", "e1-7");

    // Edge count should increase by 1
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 1);

    // Verify self-loop edge exists (via React Flow API)
    const selfLoopData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return null;

      const edges = rf.getEdges?.() ?? [];
      for (const edge of edges) {
        if (edge.source === edge.target) {
          return {
            source: edge.source,
            target: edge.target,
            sourceEndpoint: edge.data?.sourceEndpoint,
            targetEndpoint: edge.data?.targetEndpoint
          };
        }
      }
      return null;
    });

    expect(selfLoopData).not.toBeNull();
    expect(selfLoopData?.source).toBe("srl1");
    expect(selfLoopData?.target).toBe("srl1");
    expect(selfLoopData?.sourceEndpoint).toBe("e1-6");
    expect(selfLoopData?.targetEndpoint).toBe("e1-7");
  });

  test("edge creation blocked when canvas is locked or in view mode", async ({
    page,
    topoViewerPage
  }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Test locked state
    await topoViewerPage.lock();
    await topoViewerPage.createLink("srl1", "srl2", "e1-8", "e1-8");
    await page.waitForTimeout(500);

    let newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount);

    // Unlock for view mode test
    await topoViewerPage.unlock();

    // Test view mode
    await topoViewerPage.setViewMode();
    await topoViewerPage.createLink("srl1", "srl2", "e1-9", "e1-9");
    await page.waitForTimeout(500);

    newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount);
  });

  test("creates multiple edges between same nodes with different endpoints", async ({
    page,
    topoViewerPage
  }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create three additional edges
    await topoViewerPage.createLink("srl1", "srl2", "e1-10", "e1-10");
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("srl1", "srl2", "e1-11", "e1-11");
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("srl1", "srl2", "e1-12", "e1-12");
    await page.waitForTimeout(500);

    // Verify all edges were created
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 3);

    // Verify all edges are between the same two nodes (via React Flow API)
    const edgeConnections = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return [];

      const edges = rf.getEdges?.() ?? [];
      return edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        sourceEndpoint: e.data?.sourceEndpoint,
        targetEndpoint: e.data?.targetEndpoint
      }));
    });

    // Count edges between srl1 and srl2
    const srl1Srl2Edges = edgeConnections.filter(
      (e: any) =>
        (e.source === "srl1" && e.target === "srl2") || (e.source === "srl2" && e.target === "srl1")
    );
    expect(srl1Srl2Edges.length).toBeGreaterThanOrEqual(4);
  });

  test("deleting node removes connected edges", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1);

    // Create additional edge to srl1
    await topoViewerPage.createNode("srl3", { x: 300, y: 300 }, "nokia_srlinux");
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("srl1", "srl3", "e1-13", "e1-13");
    await page.waitForTimeout(500);

    // Verify we now have 2 edges
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(2);

    // Delete srl1 node
    await topoViewerPage.deleteNode("srl1");
    await page.waitForTimeout(500);

    // Both edges connected to srl1 should be deleted
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    // Verify the edges are truly gone
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds).toHaveLength(0);
  });
});

/**
 * Edge Creation File Persistence Tests
 *
 * Tests that verify edge creation properly persists to YAML files
 */
test.describe("Edge Creation - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("created edge persists after reload with correct endpoints", async ({
    page,
    topoViewerPage
  }) => {
    // Create two nodes and a link
    await topoViewerPage.createNode("node1", { x: 200, y: 200 }, "nokia_srlinux");
    await topoViewerPage.createNode("node2", { x: 400, y: 200 }, "nokia_srlinux");
    await page.waitForTimeout(500);

    const sourceEndpoint = "eth10";
    const targetEndpoint = "eth20";
    await topoViewerPage.createLink("node1", "node2", sourceEndpoint, targetEndpoint);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read YAML and verify endpoints are persisted correctly
    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`node1:${sourceEndpoint}`);
    expect(yaml).toContain(`node2:${targetEndpoint}`);

    // Verify the endpoint appears in a proper endpoints array format
    expect(yaml).toMatch(
      new RegExp(`endpoints:\\s*\\[.*node1:${sourceEndpoint}.*node2:${targetEndpoint}.*\\]`, "s")
    );

    // Reload the file
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify edge count
    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    // Verify the edge connects the right nodes (via React Flow API)
    const edgeData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      const edges = rf?.getEdges?.() ?? [];
      if (edges.length === 0) return null;
      const edge = edges[0];
      return {
        source: edge.source,
        target: edge.target
      };
    });
    expect(edgeData).not.toBeNull();
    expect([edgeData!.source, edgeData!.target].sort()).toEqual(["node1", "node2"]);
  });

  test("multiple created edges persist to YAML correctly", async ({ page, topoViewerPage }) => {
    // Create three nodes
    await topoViewerPage.createNode("router1", { x: 200, y: 100 }, "nokia_srlinux");
    await topoViewerPage.createNode("router2", { x: 100, y: 300 }, "nokia_srlinux");
    await topoViewerPage.createNode("router3", { x: 300, y: 300 }, "nokia_srlinux");
    await page.waitForTimeout(500);

    // Create links in a triangle topology
    await topoViewerPage.createLink("router1", "router2", "e1-1", "e1-1");
    await page.waitForTimeout(200);
    await topoViewerPage.createLink("router2", "router3", "e1-1", "e1-1");
    await page.waitForTimeout(200);
    await topoViewerPage.createLink("router3", "router1", "e1-1", "e1-1");
    await page.waitForTimeout(1000);

    // Verify YAML has all links
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain("router1:e1-1");
    expect(yaml).toContain("router2:e1-1");
    expect(yaml).toContain("router3:e1-1");

    // Count links in YAML
    const endpointsCount = (yaml.match(/endpoints:/g) || []).length;
    expect(endpointsCount).toBe(3);

    // Verify YAML has proper structure
    expect(yaml).toContain("links:");
    expect(yaml).toContain("endpoints:");

    const structureRegex = /topology:\s*nodes:[\s\S]*links:[\s\S]*endpoints:/;
    const hasProperStructure = structureRegex.exec(yaml);
    expect(hasProperStructure).not.toBeNull();
  });
});

/**
 * Edge Creation Undo/Redo Tests
 *
 * Tests undo/redo functionality for edge creation
 */
test.describe("Edge Creation - Undo/Redo", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("can undo and redo edge creation", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create a new edge
    await topoViewerPage.createLink("srl1", "srl2", "e1-14", "e1-14");
    await page.waitForTimeout(500);

    // Verify edge was created
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Edge should be removed
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Edge should be back
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount + 1);

    // Verify edge exists
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds).toContain("srl1:e1-14-srl2:e1-14");
  });

  test("undo multiple edge creations in reverse order", async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create three edges
    await topoViewerPage.createLink("srl1", "srl2", "e1-16", "e1-16");
    await page.waitForTimeout(200);
    await topoViewerPage.createLink("srl1", "srl2", "e1-17", "e1-17");
    await page.waitForTimeout(200);
    await topoViewerPage.createLink("srl1", "srl2", "e1-18", "e1-18");
    await page.waitForTimeout(500);

    // Verify all created
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount + 3);

    // Undo three times
    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Should be back to initial count
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount);
  });

  test("undo edge creation removes edge from YAML file", async ({ page, topoViewerPage }) => {
    // Get initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    const initialLinkCount = (initialYaml.match(/endpoints:/g) || []).length;

    // Create a new edge
    await topoViewerPage.createLink("srl1", "srl2", "e1-20", "e1-20");
    await page.waitForTimeout(500);

    // Verify edge was added to YAML
    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain("e1-20");
    let linkCount = (yaml.match(/endpoints:/g) || []).length;
    expect(linkCount).toBe(initialLinkCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify edge was removed from YAML
    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).not.toContain("e1-20");
    linkCount = (yaml.match(/endpoints:/g) || []).length;
    expect(linkCount).toBe(initialLinkCount);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify edge is back in YAML
    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain("e1-20");
    linkCount = (yaml.match(/endpoints:/g) || []).length;
    expect(linkCount).toBe(initialLinkCount + 1);
  });
});
