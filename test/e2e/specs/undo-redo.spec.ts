import { test, expect } from '../fixtures/topoviewer';
import { shiftClick, drag } from '../helpers/cytoscape-helpers';

test.describe('Undo and Redo', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('undoes node creation', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    const afterCreateCount = await topoViewerPage.getNodeCount();
    expect(afterCreateCount).toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);
  });

  test('redoes undone node creation', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    const afterCreateCount = await topoViewerPage.getNodeCount();
    expect(afterCreateCount).toBe(initialNodeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    const afterRedoCount = await topoViewerPage.getNodeCount();
    expect(afterRedoCount).toBe(initialNodeCount + 1);
  });

  test('undoes node position change', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const nodeId = nodeIds[0];
    const initialPosition = await topoViewerPage.getNodePosition(nodeId);

    // Drag the node
    const box = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await drag(
      page,
      { x: startX, y: startY },
      { x: startX + 100, y: startY + 100 },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    const movedPosition = await topoViewerPage.getNodePosition(nodeId);
    expect(movedPosition.x).not.toBeCloseTo(initialPosition.x, 0);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const afterUndoPosition = await topoViewerPage.getNodePosition(nodeId);
    // Position should be back to initial (with some tolerance)
    expect(afterUndoPosition.x).toBeCloseTo(initialPosition.x, 0);
    expect(afterUndoPosition.y).toBeCloseTo(initialPosition.y, 0);
  });

  test('multiple undos work in sequence', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create first node
    await shiftClick(page, canvasCenter.x - 50, canvasCenter.y);
    await page.waitForTimeout(500);

    // Create second node
    await shiftClick(page, canvasCenter.x + 50, canvasCenter.y);
    await page.waitForTimeout(500);

    const afterTwoNodes = await topoViewerPage.getNodeCount();
    expect(afterTwoNodes).toBe(initialNodeCount + 2);

    // Undo first
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Undo second
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);
  });

  test('multiple redos work in sequence', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create two nodes
    await shiftClick(page, canvasCenter.x - 50, canvasCenter.y);
    await page.waitForTimeout(500);

    await shiftClick(page, canvasCenter.x + 50, canvasCenter.y);
    await page.waitForTimeout(500);

    // Undo both
    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);

    // Redo first
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Redo second
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 2);
  });

  test('new action clears redo stack', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    let currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount);

    // Create a different node (new action)
    await shiftClick(page, canvasCenter.x + 100, canvasCenter.y);
    await page.waitForTimeout(500);

    currentCount = await topoViewerPage.getNodeCount();
    expect(currentCount).toBe(initialNodeCount + 1);

    // Redo should have no effect (redo stack cleared by new action)
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    currentCount = await topoViewerPage.getNodeCount();
    // Should still be initialNodeCount + 1 (redo did nothing)
    expect(currentCount).toBe(initialNodeCount + 1);
  });
});
