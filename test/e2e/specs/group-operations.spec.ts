import { test, expect } from '../fixtures/topoviewer';

test.describe('Group Operations', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
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

    if (nodeIds.length < 2) {
      test.skip();
      return;
    }

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
    expect(selectedIds.length).toBe(2);

    // Press Ctrl+G to create group
    await page.keyboard.down('Control');
    await page.keyboard.press('g');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    const newGroupCount = await topoViewerPage.getGroupCount();
    expect(newGroupCount).toBe(initialGroupCount + 1);
  });

  test('group persists after all members are deleted', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    if (nodeIds.length < 2) {
      test.skip();
      return;
    }

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

    // Create group
    await page.keyboard.down('Control');
    await page.keyboard.press('g');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

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
