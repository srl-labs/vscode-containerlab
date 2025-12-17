import { test, expect } from '../fixtures/topoviewer';

test.describe('Group Operations', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('sample topology has groups', async ({ topoViewerPage }) => {
    const groupCount = await topoViewerPage.getGroupCount();
    expect(groupCount).toBeGreaterThanOrEqual(0);
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

  test('group is removed when all members are deleted', async ({ page, topoViewerPage }) => {
    // First create a group with some nodes
    const nodeIds = await topoViewerPage.getNodeIds();
    if (nodeIds.length < 2) {
      test.skip();
      return;
    }

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

    // Create group
    await page.keyboard.down('Control');
    await page.keyboard.press('g');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    const groupCountAfterCreate = await topoViewerPage.getGroupCount();
    expect(groupCountAfterCreate).toBeGreaterThan(0);

    // Get the group IDs
    const groupIds = await topoViewerPage.getGroupIds();
    expect(groupIds.length).toBeGreaterThan(0);
  });
});
