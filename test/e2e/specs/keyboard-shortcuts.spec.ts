import { test, expect } from '../fixtures/topoviewer';
import { pressShortcut, shiftClick } from '../helpers/cytoscape-helpers';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test('Escape clears selection', async ({ page, topoViewerPage }) => {
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

  test('Delete key removes selected node', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount - 1);
  });

  test('Backspace key removes selected node', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Press Backspace
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount - 1);
  });

  test('Ctrl+Z triggers undo', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    const afterCreateCount = await topoViewerPage.getNodeCount();
    expect(afterCreateCount).toBe(initialNodeCount + 1);

    // Press Ctrl+Z
    await pressShortcut(page, 'z', { ctrl: true });
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);
  });

  test('Ctrl+Shift+Z triggers redo', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create and undo a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    await pressShortcut(page, 'z', { ctrl: true });
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);

    // Press Ctrl+Shift+Z
    await pressShortcut(page, 'z', { ctrl: true, shift: true });
    await page.waitForTimeout(300);

    const afterRedoCount = await topoViewerPage.getNodeCount();
    expect(afterRedoCount).toBe(initialNodeCount + 1);
  });

  test('Ctrl+Y triggers redo', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Create and undo a node
    await shiftClick(page, canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    await pressShortcut(page, 'z', { ctrl: true });
    await page.waitForTimeout(300);

    const afterUndoCount = await topoViewerPage.getNodeCount();
    expect(afterUndoCount).toBe(initialNodeCount);

    // Press Ctrl+Y
    await pressShortcut(page, 'y', { ctrl: true });
    await page.waitForTimeout(300);

    const afterRedoCount = await topoViewerPage.getNodeCount();
    expect(afterRedoCount).toBe(initialNodeCount + 1);
  });

  test('Delete does nothing when canvas is locked', async ({ page, topoViewerPage }) => {
    const initialNodeCount = await topoViewerPage.getNodeCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Lock the canvas
    await topoViewerPage.lock();
    const isLocked = await topoViewerPage.isLocked();
    expect(isLocked).toBe(true);

    // Select a node
    await topoViewerPage.selectNode(nodeIds[0]);
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(1);

    // Press Delete - should be blocked when canvas is locked
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Node count should NOT change when locked
    const newNodeCount = await topoViewerPage.getNodeCount();
    expect(newNodeCount).toBe(initialNodeCount);
  });

  test('Ctrl+A selects all nodes', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Press Ctrl+A
    await pressShortcut(page, 'a', { ctrl: true });
    await page.waitForTimeout(200);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    // Should have selected all nodes
    expect(selectedIds.length).toBe(nodeIds.length);
  });
});
