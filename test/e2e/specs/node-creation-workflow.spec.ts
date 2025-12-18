import { test, expect } from '../fixtures/topoviewer';

/**
 * Node creation workflow tests
 *
 * Tests the full workflow of:
 * 1. Loading an empty canvas
 * 2. Creating nodes
 * 3. Creating links between nodes
 * 4. Saving and reloading to verify persistence
 */
// Use test.describe.serial to run all tests sequentially
test.describe.serial('Node Creation Workflow', () => {

  test('create 3 nodes, interconnect them, save and reload', async ({ page, topoViewerPage }) => {
    // Reset files to ensure clean state
    await topoViewerPage.resetFiles();

    // Step 1: Load empty topology
    await topoViewerPage.gotoFile('empty.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify it's empty
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(0);

    // Step 2: Create 3 nodes in a triangle pattern
    await topoViewerPage.createNode('router1', { x: 300, y: 100 }, 'nokia_srlinux');
    await topoViewerPage.createNode('router2', { x: 150, y: 300 }, 'nokia_srlinux');
    await topoViewerPage.createNode('router3', { x: 450, y: 300 }, 'nokia_srlinux');

    // Verify nodes were created in UI
    const nodesAfterCreation = await topoViewerPage.getNodeCount();
    expect(nodesAfterCreation).toBe(3);

    // Wait for file saves to complete
    await page.waitForTimeout(500);

    // Step 3: Create links between all nodes (triangle topology)
    await topoViewerPage.createLink('router1', 'router2', 'eth1', 'eth1');
    await topoViewerPage.createLink('router2', 'router3', 'eth2', 'eth1');
    await topoViewerPage.createLink('router3', 'router1', 'eth2', 'eth2');

    // Verify edges were created
    const edgesAfterCreation = await topoViewerPage.getEdgeCount();
    expect(edgesAfterCreation).toBe(3);

    // Wait for all saves to complete
    await page.waitForTimeout(500);

    // Step 4: Verify YAML was saved correctly
    const yaml = await topoViewerPage.getYamlFromFile('empty.clab.yml');
    expect(yaml).toContain('router1:');
    expect(yaml).toContain('router2:');
    expect(yaml).toContain('router3:');
    expect(yaml).toContain('kind: nokia_srlinux');
    expect(yaml).toContain('image: ghcr.io/nokia/srlinux:latest');
    expect(yaml).toContain('endpoints:');

    // Step 5: Verify annotations were saved
    const annotations = await topoViewerPage.getAnnotationsFromFile('empty.clab.yml');
    expect(annotations.nodeAnnotations?.length).toBe(3);

    const nodeIds = annotations.nodeAnnotations?.map(n => n.id).sort();
    expect(nodeIds).toEqual(['router1', 'router2', 'router3']);

    // Step 6: Reload the topology to test persistence
    await topoViewerPage.gotoFile('empty.clab.yml');
    await topoViewerPage.waitForCanvasReady();

    // Verify nodes and edges are restored
    const nodesAfterReload = await topoViewerPage.getNodeCount();
    expect(nodesAfterReload).toBe(3);

    const edgesAfterReload = await topoViewerPage.getEdgeCount();
    expect(edgesAfterReload).toBe(3);

    // Verify node IDs are correct
    const reloadedNodeIds = await topoViewerPage.getNodeIds();
    expect(reloadedNodeIds.sort()).toEqual(['router1', 'router2', 'router3']);

    // Step 7: Verify files are untouched when in view mode (locked)
    await topoViewerPage.setViewMode();
    const yamlBeforeLock = await topoViewerPage.getYamlFromFile('empty.clab.yml');
    const annotationsBeforeLock = await topoViewerPage.getAnnotationsFromFile('empty.clab.yml');

    // Wait a moment
    await page.waitForTimeout(200);

    // Files should remain the same
    const yamlAfterLock = await topoViewerPage.getYamlFromFile('empty.clab.yml');
    const annotationsAfterLock = await topoViewerPage.getAnnotationsFromFile('empty.clab.yml');

    expect(yamlAfterLock).toBe(yamlBeforeLock);
    expect(JSON.stringify(annotationsAfterLock)).toBe(JSON.stringify(annotationsBeforeLock));
  });

  test('nodes have correct kind and image after reload', async ({ page, topoViewerPage }) => {
    // This test creates its own state to be independent
    // Reset files first
    await topoViewerPage.resetFiles();

    // Load empty and create nodes
    await topoViewerPage.gotoFile('empty.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Create two test nodes
    await topoViewerPage.createNode('test-node1', { x: 200, y: 200 }, 'nokia_srlinux');
    await topoViewerPage.createNode('test-node2', { x: 400, y: 200 }, 'nokia_srlinux');
    await page.waitForTimeout(500);

    // Reload and check YAML content
    await topoViewerPage.gotoFile('empty.clab.yml');
    await topoViewerPage.waitForCanvasReady();

    const yaml = await topoViewerPage.getYamlFromFile('empty.clab.yml');

    // Both nodes should have kind and image
    expect(yaml).toContain('test-node1:');
    expect(yaml).toContain('test-node2:');
    expect(yaml).toContain('kind: nokia_srlinux');
    expect(yaml).toContain('image: ghcr.io/nokia/srlinux:latest');
  });

  test('topology renders correctly after multiple reloads', async ({ page, topoViewerPage }) => {
    // Reset files to ensure clean state
    await topoViewerPage.resetFiles();

    // Use spine-leaf which has a fixed number of nodes
    // Load multiple times to ensure consistency
    for (let i = 0; i < 3; i++) {
      await topoViewerPage.gotoFile('spine-leaf.clab.yml');
      await topoViewerPage.waitForCanvasReady();

      const nodeCount = await topoViewerPage.getNodeCount();
      const edgeCount = await topoViewerPage.getEdgeCount();

      // spine-leaf has 6 nodes and 6 links
      expect(nodeCount).toBe(6);
      expect(edgeCount).toBe(6);
    }
  });
});
