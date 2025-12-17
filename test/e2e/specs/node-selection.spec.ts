import { test, expect } from '../fixtures/topoviewer';
import { ctrlClick } from '../helpers/cytoscape-helpers';

test.describe('Node Selection', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('selects single node on click', async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];
    await topoViewerPage.selectNode(nodeId);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds).toContain(nodeId);
    expect(selectedIds.length).toBe(1);
  });

  test('deselects node when clicking empty canvas', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node first
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Click on empty area (far from center to avoid nodes)
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 300, canvasCenter.y + 300);
    await page.waitForTimeout(200);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(0);
  });

  test('selects multiple nodes with Ctrl+Click', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Select first node normally
    await topoViewerPage.selectNode(nodeIds[0]);

    // Ctrl+Click second node
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();
    await ctrlClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds).toContain(nodeIds[1]);
  });

  test('clicking different node replaces selection', async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Select first node
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds).toContain(nodeIds[0]);
    expect(selectedIds.length).toBe(1);

    // Click second node without modifier - should replace selection
    await topoViewerPage.selectNode(nodeIds[1]);
    selectedIds = await topoViewerPage.getSelectedNodeIds();

    // Should only have the second node selected (replacement, not addition)
    expect(selectedIds.length).toBe(1);
    expect(selectedIds).toContain(nodeIds[1]);
    expect(selectedIds).not.toContain(nodeIds[0]);
  });

  test('clears selection with Escape key', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(0);
  });

  test('programmatic clear selection works', async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Clear selection via fixture method
    await topoViewerPage.clearSelection();

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(0);
  });
});
