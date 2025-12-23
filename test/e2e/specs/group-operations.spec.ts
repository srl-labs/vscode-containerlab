import { test, expect } from '../fixtures/topoviewer';

// Test file names for file-based tests
const SPINE_LEAF_FILE = 'spine-leaf.clab.yml';
const DATACENTER_FILE = 'datacenter.clab.yml';

test.describe('Group Operations', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile('simple.clab.yml');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('gets group IDs', async ({ topoViewerPage }) => {
    const groupIds = await topoViewerPage.getGroupIds();
    const groupCount = await topoViewerPage.getGroupCount();
    expect(groupIds.length).toBe(groupCount);
  });

  test('creates group via Ctrl+G with selected nodes', async ({ page, topoViewerPage }) => {
    const initialGroupCount = await topoViewerPage.getGroupCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select first node
    await topoViewerPage.selectNode(nodeIds[0]);

    // Ctrl+Click second node to add to selection
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();

    await page.keyboard.down('Control');
    await page.mouse.click(
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    console.log(`[DEBUG] Selected IDs: ${selectedIds.join(', ')}`);
    console.log(`[DEBUG] Initial group count: ${initialGroupCount}`);
    expect(selectedIds.length).toBe(2);

    // Press Ctrl+G to create group using the fixture helper
    await topoViewerPage.createGroup();

    const newGroupCount = await topoViewerPage.getGroupCount();
    console.log(`[DEBUG] New group count: ${newGroupCount}`);
    expect(newGroupCount).toBe(initialGroupCount + 1);
  });

  test('group persists after all members are deleted', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    const initialGroupCount = await topoViewerPage.getGroupCount();
    const node1 = nodeIds[0];
    const node2 = nodeIds[1];

    // Select two nodes
    await topoViewerPage.selectNode(node1);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(node2);
    await page.keyboard.down('Control');
    await page.mouse.click(
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    // Create group using the fixture helper
    await topoViewerPage.createGroup();

    const groupCountAfterCreate = await topoViewerPage.getGroupCount();
    expect(groupCountAfterCreate).toBe(initialGroupCount + 1);

    // Delete first node
    await topoViewerPage.selectNode(node1);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Delete second node
    await topoViewerPage.selectNode(node2);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Group should persist even after all members are deleted (intended behavior)
    const groupCountAfterDelete = await topoViewerPage.getGroupCount();
    expect(groupCountAfterDelete).toBe(initialGroupCount + 1);
  });
});

/**
 * File Persistence Tests for Group Operations
 *
 * These tests verify that group operations properly update:
 * - .clab.yml.annotations.json file (saves group definitions and membership)
 */
test.describe('Group Operations - File Persistence', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('created group appears in annotations file', async ({ page, topoViewerPage }) => {
    // Get initial annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const initialGroupCount = initialAnnotations.groupStyleAnnotations?.length || 0;

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select two nodes
    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    await page.keyboard.down('Control');
    await page.mouse.click(
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    // Create group with Ctrl+G using fixture helper
    await topoViewerPage.createGroup();

    // Wait for save to complete
    await page.waitForTimeout(500);

    // Read updated annotations
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const updatedGroupCount = updatedAnnotations.groupStyleAnnotations?.length || 0;

    // Should have one more group
    expect(updatedGroupCount).toBe(initialGroupCount + 1);

    // New group should have a name
    const groups = updatedAnnotations.groupStyleAnnotations || [];
    const newGroups = groups.slice(initialGroupCount);
    expect(newGroups.length).toBe(1);
    expect(newGroups[0].name).toBeDefined();
  });

  test('datacenter topology has groups in annotations file', async ({ topoViewerPage }) => {
    // Load datacenter topology which has pre-defined groups
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Read annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);

    // Should have groups defined
    expect(annotations.groupStyleAnnotations?.length).toBeGreaterThan(0);

    // Check for expected group names
    const groupNames = annotations.groupStyleAnnotations?.map(g => g.name);
    expect(groupNames).toContain('Border');
    expect(groupNames).toContain('Spine');
  });

  test('group persists after reload', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select two nodes and create a group
    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    await page.keyboard.down('Control');
    await page.mouse.click(
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);

    // Create group using fixture helper
    await topoViewerPage.createGroup();

    // Wait for save (debounce is 300ms + async save time)
    await page.waitForTimeout(1000);

    // Get group count before reload
    const groupCountBefore = await topoViewerPage.getGroupCount();
    expect(groupCountBefore).toBeGreaterThan(0);

    // Verify group was saved to annotations file
    const annotationsBeforeReload = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const savedGroupCount = annotationsBeforeReload.groupStyleAnnotations?.length || 0;
    expect(savedGroupCount).toBeGreaterThan(0);

    // Reload the file
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Wait for groups to be loaded from annotations into React state
    await page.waitForTimeout(1000);

    // Verify group count is preserved
    const groupCountAfterReload = await topoViewerPage.getGroupCount();
    expect(groupCountAfterReload).toBe(groupCountBefore);
  });
});
