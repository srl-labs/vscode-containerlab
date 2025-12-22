import { test, expect } from '../fixtures/topoviewer';
import { drag } from '../helpers/cytoscape-helpers';

// Test file names
const SPINE_LEAF_FILE = 'spine-leaf.clab.yml';
const SIMPLE_FILE = 'simple.clab.yml';
const EMPTY_FILE = 'empty.clab.yml';

// Node kinds
const KIND_NOKIA_SRLINUX = 'nokia_srlinux';

// Test node names
const NEW_ROUTER = 'new-router';

/**
 * Verification tests for file persistence
 * These tests verify that changes are actually persisted to files
 */
test.describe.serial('File Persistence Verification', () => {
  test('moving node updates annotations JSON file', async ({ page, topoViewerPage }) => {
    // Reset to ensure clean state
    await topoViewerPage.resetFiles();

    // Load spine-leaf topology (has predefined positions in annotations)
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Read initial annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Initial = initialAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
    console.log('Initial spine1 position:', spine1Initial?.position);
    expect(spine1Initial).toBeDefined();
    expect(spine1Initial?.position).toBeDefined();

    const initialX = spine1Initial!.position!.x;
    const initialY = spine1Initial!.position!.y;

    // Get node bounding box for dragging
    const nodeBox = await topoViewerPage.getNodeBoundingBox('spine1');
    expect(nodeBox).not.toBeNull();

    // Drag the node by 100px
    await drag(
      page,
      { x: nodeBox!.x + nodeBox!.width / 2, y: nodeBox!.y + nodeBox!.height / 2 },
      { x: nodeBox!.x + nodeBox!.width / 2 + 100, y: nodeBox!.y + nodeBox!.height / 2 + 100 },
      { steps: 20 }
    );

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read annotations again
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const spine1Updated = updatedAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
    console.log('Updated spine1 position:', spine1Updated?.position);

    expect(spine1Updated).toBeDefined();
    expect(spine1Updated?.position).toBeDefined();

    // Position should have changed
    const deltaX = Math.abs(spine1Updated!.position!.x - initialX);
    const deltaY = Math.abs(spine1Updated!.position!.y - initialY);
    console.log('Position delta:', { deltaX, deltaY });

    // At least one coordinate should have changed significantly
    expect(deltaX + deltaY).toBeGreaterThan(30);
  });

  test('creating link updates YAML file', async ({ page, topoViewerPage }) => {
    // Reset to ensure clean state
    await topoViewerPage.resetFiles();

    // Load spine-leaf topology
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Read initial YAML
    const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const initialLinkCount = (initialYaml.match(/endpoints:/g) || []).length;
    console.log('Initial link count:', initialLinkCount);

    // Verify the specific link we'll create doesn't exist
    // We'll create a link using unique endpoint names
    expect(initialYaml).not.toContain('e1-99');
    expect(initialYaml).not.toContain('eth99');

    // Create a new link between spine1 and client2 via API using unique endpoint names
    await topoViewerPage.createLink('spine1', 'client2', 'e1-99', 'eth99');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read YAML again
    const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
    const updatedLinkCount = (updatedYaml.match(/endpoints:/g) || []).length;
    console.log('Updated link count:', updatedLinkCount);
    console.log('Updated YAML links section:', updatedYaml.split('links:')[1]?.substring(0, 500));

    // Should have one more link
    expect(updatedLinkCount).toBe(initialLinkCount + 1);

    // New link should be in the YAML with the specific endpoint names
    expect(updatedYaml).toContain('spine1:e1-99');
    expect(updatedYaml).toContain('client2:eth99');
  });

  test('add node and connect to existing nodes persists correctly', async ({ page, topoViewerPage }) => {
    // Reset to ensure clean state
    await topoViewerPage.resetFiles();

    // Load simple topology (has 2 nodes: srl1, srl2 from disk)
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Get initial state
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    console.log(`Initial state: ${initialNodeCount} nodes, ${initialEdgeCount} edges`);

    // Get initial positions of existing nodes
    const srl1PosInitial = await topoViewerPage.getNodePosition('srl1');
    const srl2PosInitial = await topoViewerPage.getNodePosition('srl2');
    console.log('srl1 initial position:', srl1PosInitial);
    console.log('srl2 initial position:', srl2PosInitial);

    // Create a new node
    await topoViewerPage.createNode(NEW_ROUTER, { x: 300, y: 300 }, KIND_NOKIA_SRLINUX);

    // Wait for node to be created + state to settle
    await expect.poll(
      () => topoViewerPage.getNodeCount(),
      { timeout: 5000, message: 'Node count should increase after createNode' }
    ).toBe(initialNodeCount + 1);

    // Verify node was added WITHOUT canvas reload (positions should be unchanged)
    const srl1PosAfterAdd = await topoViewerPage.getNodePosition('srl1');
    const srl2PosAfterAdd = await topoViewerPage.getNodePosition('srl2');
    console.log('srl1 position after add:', srl1PosAfterAdd);
    console.log('srl2 position after add:', srl2PosAfterAdd);

    // Positions should NOT have changed (canvas didn't reload)
    expect(Math.abs(srl1PosAfterAdd.x - srl1PosInitial.x)).toBeLessThan(5);
    expect(Math.abs(srl1PosAfterAdd.y - srl1PosInitial.y)).toBeLessThan(5);
    expect(Math.abs(srl2PosAfterAdd.x - srl2PosInitial.x)).toBeLessThan(5);
    expect(Math.abs(srl2PosAfterAdd.y - srl2PosInitial.y)).toBeLessThan(5);

    const nodeCountAfterAdd = await topoViewerPage.getNodeCount();

    // Connect new node to both existing nodes
    await topoViewerPage.createLink(NEW_ROUTER, 'srl1', 'e1-1', 'e1-2');
    await topoViewerPage.createLink(NEW_ROUTER, 'srl2', 'e1-2', 'e1-2');

    // Wait for edges to appear
    await expect.poll(
      () => topoViewerPage.getEdgeCount(),
      { timeout: 5000, message: 'Edge count should increase after createLink calls' }
    ).toBe(initialEdgeCount + 2);
    const edgeCountAfterLinks = await topoViewerPage.getEdgeCount();

    // Verify YAML persistence
    await expect.poll(
      () => topoViewerPage.getYamlFromFile(SIMPLE_FILE),
      { timeout: 5000, message: 'YAML should include the created node and links' }
    ).toContain(`${NEW_ROUTER}:`);
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log('YAML after changes:', yaml);
    expect(yaml).toContain(`kind: ${KIND_NOKIA_SRLINUX}`);
    expect(yaml).toContain(`${NEW_ROUTER}:e1-1`);
    expect(yaml).toContain('srl1:e1-2');
    expect(yaml).toContain(`${NEW_ROUTER}:e1-2`);
    expect(yaml).toContain('srl2:e1-2');

    // Verify annotations persistence
    await expect.poll(
      async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
        return Boolean(annotations.nodeAnnotations?.some(n => n.id === NEW_ROUTER && Boolean(n.position)));
      },
      { timeout: 5000, message: 'Annotations JSON should include new node position' }
    ).toBe(true);

    const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    const newRouterAnnotation = annotations.nodeAnnotations?.find(n => n.id === NEW_ROUTER);
    console.log('new-router annotation:', newRouterAnnotation);

    // Final state check before reload
    console.log(`State before reload: ${nodeCountAfterAdd} nodes, ${edgeCountAfterLinks} edges`);

    // RELOAD the topology to verify everything persists
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify node and edge counts after reload
    const nodeCountAfterReload = await topoViewerPage.getNodeCount();
    const edgeCountAfterReload = await topoViewerPage.getEdgeCount();
    console.log(`State after reload: ${nodeCountAfterReload} nodes, ${edgeCountAfterReload} edges`);

    expect(nodeCountAfterReload).toBe(nodeCountAfterAdd);
    expect(edgeCountAfterReload).toBe(edgeCountAfterLinks);

    // Verify all nodes are present
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain('srl1');
    expect(nodeIds).toContain('srl2');
    expect(nodeIds).toContain(NEW_ROUTER);
    console.log('Node IDs after reload:', nodeIds);

    // Verify new-router position was persisted (allow 20px tolerance for node centering)
    const newRouterPosAfterReload = await topoViewerPage.getNodePosition(NEW_ROUTER);
    console.log('new-router position after reload:', newRouterPosAfterReload);
    expect(Math.abs(newRouterPosAfterReload.x - 300)).toBeLessThan(20);
    expect(Math.abs(newRouterPosAfterReload.y - 300)).toBeLessThan(20);
  });

  test('created nodes have kind and image in YAML', async ({ page, topoViewerPage }) => {
    // Reset to ensure clean state
    await topoViewerPage.resetFiles();

    // Load empty topology
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Initial YAML should have empty nodes
    const initialYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    console.log('Initial YAML:', initialYaml);

    // Create two nodes
    await topoViewerPage.createNode('test-router1', { x: 200, y: 200 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('test-router2', { x: 400, y: 200 }, KIND_NOKIA_SRLINUX);

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Read YAML again
    const updatedYaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    console.log('Updated YAML:', updatedYaml);

    // Check that both nodes have proper structure
    expect(updatedYaml).toContain('test-router1:');
    expect(updatedYaml).toContain('test-router2:');
    expect(updatedYaml).toContain(`kind: ${KIND_NOKIA_SRLINUX}`);
    expect(updatedYaml).toContain('image:');
  });
});
