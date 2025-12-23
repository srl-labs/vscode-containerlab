import { test, expect } from '../fixtures/topoviewer';

// Test file names for file-based tests
const SIMPLE_FILE = 'simple.clab.yml';
const EMPTY_FILE = 'empty.clab.yml';

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
test.describe('Edge Creation', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('creates edge between two nodes via API', async ({ page, topoViewerPage }) => {
    // Get initial edge count - simple.clab.yml has 1 edge
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1);

    // Get node IDs - simple.clab.yml has srl1 and srl2
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain('srl1');
    expect(nodeIds).toContain('srl2');

    // Create a new link with different endpoints
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-2', 'e1-2');

    // Wait for edge to be created
    await page.waitForTimeout(500);

    // Verify edge count increased
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 1);

    // Verify the edge exists in the graph (ID format: sourceId:sourceEndpoint-targetId:targetEndpoint)
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds).toContain('srl1:e1-2-srl2:e1-2');
  });

  test('edge creation adds link to YAML file', async ({ page, topoViewerPage }) => {
    // Create a new link between existing nodes with new endpoints
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-3', 'e1-3');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read updated YAML
    const updatedYaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);

    // Verify the link appears in YAML with correct endpoints
    expect(updatedYaml).toContain('srl1:e1-3');
    expect(updatedYaml).toContain('srl2:e1-3');
    expect(updatedYaml).toContain('endpoints:');

    // Count number of links - should be 2 now (original + new)
    const endpointsCount = (updatedYaml.match(/endpoints:/g) || []).length;
    expect(endpointsCount).toBe(2);
  });

  test('edge has correct source and target endpoints', async ({ page, topoViewerPage }) => {
    const sourceEndpoint = 'e1-4';
    const targetEndpoint = 'e1-5';

    // Create link with specific endpoints
    await topoViewerPage.createLink('srl1', 'srl2', sourceEndpoint, targetEndpoint);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read YAML and verify endpoints
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain(`srl1:${sourceEndpoint}`);
    expect(yaml).toContain(`srl2:${targetEndpoint}`);

    // Verify via browser-side API
    const edgeData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      const edge = cy?.getElementById('srl1:e1-4-srl2:e1-5');
      if (!edge || edge.empty()) return null;

      return {
        source: edge.source().id(),
        target: edge.target().id(),
        sourceEndpoint: edge.data('sourceEndpoint'),
        targetEndpoint: edge.data('targetEndpoint')
      };
    });

    expect(edgeData).not.toBeNull();
    expect(edgeData?.source).toBe('srl1');
    expect(edgeData?.target).toBe('srl2');
    expect(edgeData?.sourceEndpoint).toBe(sourceEndpoint);
    expect(edgeData?.targetEndpoint).toBe(targetEndpoint);
  });

  test('can create self-loop edge (hairpin)', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create a self-loop/hairpin (edge from node to itself with different endpoints)
    await topoViewerPage.createLink('srl1', 'srl1', 'e1-6', 'e1-7');

    // Edge count should increase by 1
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 1);

    // Verify self-loop edge exists
    const selfLoopData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return null;

      const edges = cy.edges();
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        if (edge.source().id() === edge.target().id()) {
          return {
            source: edge.source().id(),
            target: edge.target().id(),
            sourceEndpoint: edge.data('sourceEndpoint'),
            targetEndpoint: edge.data('targetEndpoint')
          };
        }
      }
      return null;
    });

    expect(selfLoopData).not.toBeNull();
    expect(selfLoopData?.source).toBe('srl1');
    expect(selfLoopData?.target).toBe('srl1');
    expect(selfLoopData?.sourceEndpoint).toBe('e1-6');
    expect(selfLoopData?.targetEndpoint).toBe('e1-7');
  });

  test('edge creation blocked when canvas is locked', async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Attempt to create an edge when locked
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-8', 'e1-8');

    // Wait for potential edge creation
    await page.waitForTimeout(500);

    // Edge count should remain the same
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount);
  });

  test('edge creation blocked in view mode', async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Attempt to create an edge in view mode
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-9', 'e1-9');

    // Wait for potential edge creation
    await page.waitForTimeout(500);

    // Edge count should remain the same
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount);
  });

  test('creates multiple edges between same nodes with different endpoints', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create first additional edge
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-10', 'e1-10');
    await page.waitForTimeout(300);

    // Create second additional edge
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-11', 'e1-11');
    await page.waitForTimeout(300);

    // Create third additional edge
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-12', 'e1-12');
    await page.waitForTimeout(500);

    // Verify all edges were created
    const newEdgeCount = await topoViewerPage.getEdgeCount();
    expect(newEdgeCount).toBe(initialEdgeCount + 3);

    // Verify all edges are between the same two nodes
    const edgeConnections = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      if (!cy) return [];

      const edges = cy.edges();
      return edges.map((e: any) => ({
        source: e.source().id(),
        target: e.target().id(),
        sourceEndpoint: e.data('sourceEndpoint'),
        targetEndpoint: e.data('targetEndpoint')
      }));
    });

    // Count edges between srl1 and srl2
    const srl1Srl2Edges = edgeConnections.filter(
      (e: any) => (e.source === 'srl1' && e.target === 'srl2') ||
                  (e.source === 'srl2' && e.target === 'srl1')
    );
    expect(srl1Srl2Edges.length).toBeGreaterThanOrEqual(4);
  });

  test('deleting node removes connected edges', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1);

    // Create additional edge to srl1
    await topoViewerPage.createNode('srl3', { x: 300, y: 300 }, 'nokia_srlinux');
    await page.waitForTimeout(300);

    await topoViewerPage.createLink('srl1', 'srl3', 'e1-13', 'e1-13');
    await page.waitForTimeout(500);

    // Verify we now have 2 edges
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(2);

    // Delete srl1 node
    await topoViewerPage.deleteNode('srl1');
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
test.describe('Edge Creation - File Persistence', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('created edge persists after reload', async ({ page, topoViewerPage }) => {
    // Create two nodes
    await topoViewerPage.createNode('node1', { x: 200, y: 200 }, 'nokia_srlinux');
    await topoViewerPage.createNode('node2', { x: 400, y: 200 }, 'nokia_srlinux');
    await page.waitForTimeout(500);

    // Create a link between them
    await topoViewerPage.createLink('node1', 'node2', 'e1-1', 'e1-1');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Reload the file
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify edge count (edge IDs are regenerated on load, so we don't check specific ID)
    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    // Verify the edge connects the right nodes
    const edgeData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const cy = dev?.cy;
      const edges = cy?.edges();
      if (!edges || edges.length === 0) return null;
      const edge = edges[0];
      return {
        source: edge.source().id(),
        target: edge.target().id()
      };
    });
    expect(edgeData).not.toBeNull();
    expect([edgeData!.source, edgeData!.target].sort()).toEqual(['node1', 'node2']);
  });

  test('multiple created edges persist to YAML correctly', async ({ page, topoViewerPage }) => {
    // Create three nodes
    await topoViewerPage.createNode('router1', { x: 200, y: 100 }, 'nokia_srlinux');
    await topoViewerPage.createNode('router2', { x: 100, y: 300 }, 'nokia_srlinux');
    await topoViewerPage.createNode('router3', { x: 300, y: 300 }, 'nokia_srlinux');
    await page.waitForTimeout(500);

    // Create links in a triangle topology
    await topoViewerPage.createLink('router1', 'router2', 'e1-1', 'e1-1');
    await page.waitForTimeout(200);
    await topoViewerPage.createLink('router2', 'router3', 'e1-1', 'e1-1');
    await page.waitForTimeout(200);
    await topoViewerPage.createLink('router3', 'router1', 'e1-1', 'e1-1');
    await page.waitForTimeout(1000);

    // Verify YAML has all links
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain('router1:e1-1');
    expect(yaml).toContain('router2:e1-1');
    expect(yaml).toContain('router3:e1-1');

    // Count links in YAML
    const endpointsCount = (yaml.match(/endpoints:/g) || []).length;
    expect(endpointsCount).toBe(3);
  });

  test('edge endpoints persist correctly in YAML', async ({ page, topoViewerPage }) => {
    // Create two nodes
    await topoViewerPage.createNode('switch1', { x: 200, y: 200 }, 'nokia_srlinux');
    await topoViewerPage.createNode('switch2', { x: 400, y: 200 }, 'nokia_srlinux');
    await page.waitForTimeout(500);

    // Create link with specific endpoints
    const sourceEndpoint = 'eth10';
    const targetEndpoint = 'eth20';
    await topoViewerPage.createLink('switch1', 'switch2', sourceEndpoint, targetEndpoint);

    // Wait for save
    await page.waitForTimeout(1000);

    // Read YAML and verify endpoints
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`switch1:${sourceEndpoint}`);
    expect(yaml).toContain(`switch2:${targetEndpoint}`);

    // Verify the endpoint appears in a proper endpoints array format
    expect(yaml).toMatch(new RegExp(`endpoints:\\s*\\[.*switch1:${sourceEndpoint}.*switch2:${targetEndpoint}.*\\]`, 's'));
  });

  test('edge creation updates links section in YAML', async ({ page, topoViewerPage }) => {
    // Create nodes and link
    await topoViewerPage.createNode('host1', { x: 200, y: 200 }, 'nokia_srlinux');
    await topoViewerPage.createNode('host2', { x: 400, y: 200 }, 'nokia_srlinux');
    await page.waitForTimeout(500);

    await topoViewerPage.createLink('host1', 'host2', 'e1-1', 'e1-1');
    await page.waitForTimeout(1000);

    // Verify YAML now has links section
    const updatedYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(updatedYaml).toContain('links:');
    expect(updatedYaml).toContain('endpoints:');

    // Verify structure is correct using RegExp.exec
    const structureRegex = /topology:\s*nodes:[\s\S]*links:[\s\S]*endpoints:/;
    const hasProperStructure = structureRegex.exec(updatedYaml);
    expect(hasProperStructure).not.toBeNull();
  });
});

/**
 * Edge Creation Undo/Redo Tests
 *
 * Tests undo/redo functionality for edge creation
 */
test.describe('Edge Creation - Undo/Redo', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('can undo edge creation', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create a new edge
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-14', 'e1-14');
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
  });

  test('can redo edge creation after undo', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create a new edge
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-15', 'e1-15');
    await page.waitForTimeout(500);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Edge should be back
    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(initialEdgeCount + 1);

    // Verify edge exists (ID format: sourceId:sourceEndpoint-targetId:targetEndpoint)
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds).toContain('srl1:e1-15-srl2:e1-15');
  });

  test('undo multiple edge creations in reverse order', async ({ page, topoViewerPage }) => {
    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    // Create three edges
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-16', 'e1-16');
    await page.waitForTimeout(200);
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-17', 'e1-17');
    await page.waitForTimeout(200);
    await topoViewerPage.createLink('srl1', 'srl2', 'e1-18', 'e1-18');
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
});
