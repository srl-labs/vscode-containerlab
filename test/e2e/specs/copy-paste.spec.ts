import { test, expect } from "../fixtures/topoviewer";
import { shiftClick } from "../helpers/react-flow-helpers";

/**
 * Copy, Paste, and Cut Operations E2E Tests
 *
 * This test file focuses specifically on copy/paste/cut functionality in isolation.
 * It covers:
 * - Single and multiple node copy/paste operations
 * - Edge preservation during copy/paste
 * - Cut operations (move nodes)
 * - YAML and annotation persistence
 * - Undo/redo behavior (especially batched undo for paste)
 * - Edge cases: empty clipboard, locked canvas, view mode
 *
 * Coverage gaps addressed:
 * - Isolated testing of copy/paste/cut without other operations interfering
 * - Verification of unique ID generation for pasted nodes
 * - Position offset validation for pasted elements
 * - Link preservation between copied nodes
 * - Batched undo behavior (critical for UX)
 * - Error handling and graceful degradation
 */

const SIMPLE_FILE = "simple.clab.yml";
const EMPTY_FILE = "empty.clab.yml";

test.describe("Copy, Paste, and Cut Operations", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  // ============================================================================
  // BASIC COPY/PASTE TESTS
  // ============================================================================

  test("copy single node creates clipboard data", async ({ topoViewerPage, page }) => {
    console.log("[TEST] copy single node creates clipboard data");

    // Verify we start with 2 nodes (simple.clab.yml has srl1 and srl2)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    const initialNodeIds = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Initial node IDs: ${initialNodeIds.join(", ")}`);

    // Select srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);

    // Verify selection
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds).toContain("srl1");

    // Copy (Ctrl+C)
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    console.log("[DEBUG] Copy operation completed");

    // Paste (Ctrl+V)
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify a new node was created
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(3);

    const nodeIds = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after paste: ${nodeIds.join(", ")}`);

    // Find the new node (should not be srl1 or srl2)
    const newNodeId = nodeIds.find((id) => !initialNodeIds.includes(id));
    expect(newNodeId).toBeDefined();
    console.log(`[INFO] Pasted node ID: ${newNodeId}`);
  });

  test("paste creates new node with unique ID", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste creates new node with unique ID");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select and copy srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Paste
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeId = nodeIds.find((id) => !initialNodeIds.includes(id));

    // Verify unique ID
    expect(pastedNodeId).toBeDefined();
    expect(pastedNodeId).not.toBe("srl1");
    expect(pastedNodeId).not.toBe("srl2");

    console.log(`[INFO] Pasted node has unique ID: ${pastedNodeId}`);
  });

  test("paste places node offset from original", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste places node offset from original");

    // Get original position of srl1
    const originalPosition = await topoViewerPage.getNodePosition("srl1");
    console.log(`[DEBUG] Original srl1 position: x=${originalPosition.x}, y=${originalPosition.y}`);

    // Select, copy, and paste srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Find the pasted node ID
    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeId = nodeIds.find((id) => id !== "srl1" && id !== "srl2");
    expect(pastedNodeId).toBeDefined();

    // Get pasted node position
    const pastedPosition = await topoViewerPage.getNodePosition(pastedNodeId!);
    console.log(`[DEBUG] Pasted node position: x=${pastedPosition.x}, y=${pastedPosition.y}`);

    // Verify position is offset (not identical to original)
    const offsetX = Math.abs(pastedPosition.x - originalPosition.x);
    const offsetY = Math.abs(pastedPosition.y - originalPosition.y);

    console.log(`[DEBUG] Position offset: x=${offsetX}, y=${offsetY}`);

    // Expect some offset to avoid a complete overlap.
    // When the copied selection is visible, paste is anchored near it (with a small offset).
    const distance = Math.hypot(offsetX, offsetY);
    expect(distance).toBeGreaterThan(10);
  });

  test("paste persists to YAML", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste persists to YAML");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select, copy, and paste srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Find pasted node
    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeId = nodeIds.find((id) => !initialNodeIds.includes(id));
    expect(pastedNodeId).toBeDefined();

    // Wait for file save
    await page.waitForTimeout(500);

    // Verify YAML contains the pasted node
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain(`${pastedNodeId}:`);
    expect(yaml).toContain("kind:"); // Should have kind field

    console.log(`[INFO] Pasted node ${pastedNodeId} persisted to YAML`);
  });

  test("paste persists position to annotations", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste persists position to annotations");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select, copy, and paste srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Find pasted node
    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeId = nodeIds.find((id) => !initialNodeIds.includes(id));
    expect(pastedNodeId).toBeDefined();

    // Wait for file save
    await page.waitForTimeout(500);

    // Verify annotations contain position for pasted node
    const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    const pastedAnnotation = annotations.nodeAnnotations?.find((n) => n.id === pastedNodeId);

    expect(pastedAnnotation).toBeDefined();
    expect(pastedAnnotation?.position).toBeDefined();
    expect(pastedAnnotation!.position!.x).toBeGreaterThan(0);
    expect(pastedAnnotation!.position!.y).toBeGreaterThan(0);

    console.log(
      `[INFO] Pasted node position in annotations: x=${pastedAnnotation!.position!.x}, y=${pastedAnnotation!.position!.y}`
    );
  });

  // ============================================================================
  // MULTIPLE NODE COPY/PASTE
  // ============================================================================

  test("copy and paste multiple nodes", async ({ topoViewerPage, page }) => {
    console.log("[TEST] copy and paste multiple nodes");

    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select both srl1 and srl2
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);

    const srl2Box = await topoViewerPage.getNodeBoundingBox("srl2");
    expect(srl2Box).not.toBeNull();
    await shiftClick(page, srl2Box!.x + srl2Box!.width / 2, srl2Box!.y + srl2Box!.height / 2);
    await page.waitForTimeout(200);

    // Verify both selected
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain("srl1");
    expect(selectedIds).toContain("srl2");

    // Copy both nodes
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Paste
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify 2 new nodes created
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount + 2);

    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeIds = nodeIds.filter((id) => !initialNodeIds.includes(id));

    expect(pastedNodeIds.length).toBe(2);
    console.log(`[INFO] Pasted 2 nodes: ${pastedNodeIds.join(", ")}`);
  });

  test("copy and paste preserves edges between copied nodes", async ({ topoViewerPage, page }) => {
    console.log("[TEST] copy and paste preserves edges between copied nodes");

    // First create a link between srl1 and srl2 if it doesn't exist
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Initial edge count: ${initialEdgeCount}`);

    // Create link if needed
    if (initialEdgeCount === 0) {
      await topoViewerPage.createLink("srl1", "srl2", "eth1", "eth1");
      await page.waitForTimeout(500);
    }

    const edgeCountBeforeCopy = await topoViewerPage.getEdgeCount();
    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select both connected nodes
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);

    const srl2Box = await topoViewerPage.getNodeBoundingBox("srl2");
    await shiftClick(page, srl2Box!.x + srl2Box!.width / 2, srl2Box!.y + srl2Box!.height / 2);
    await page.waitForTimeout(200);

    // Copy and paste
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Check if edge was copied
    const edgeCountAfterPaste = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count: before=${edgeCountBeforeCopy}, after=${edgeCountAfterPaste}`);

    // When copying connected nodes, their connecting edge should be duplicated too.
    expect(edgeCountAfterPaste).toBe(edgeCountBeforeCopy + 1);

    // Verify nodes were still copied regardless
    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeIds = nodeIds.filter((id) => !initialNodeIds.includes(id));
    expect(pastedNodeIds.length).toBe(2);
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  test("paste without copy does nothing", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste without copy does nothing");

    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Try to paste without copying first
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify no change
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount);

    console.log("[INFO] Paste without copy did nothing (expected)");
  });

  test("copy blocked when nothing selected", async ({ topoViewerPage, page }) => {
    console.log("[TEST] copy blocked when nothing selected");

    // Clear selection
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Verify nothing selected
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(0);

    // Try to copy (should not crash)
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Try to paste (should do nothing)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount);

    console.log("[INFO] Copy with nothing selected handled gracefully");
  });

  test("paste blocked in view mode", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste blocked in view mode");

    // Copy a node in edit mode
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Switch to view mode
    await topoViewerPage.setViewMode();
    await page.waitForTimeout(200);

    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Try to paste in view mode (should be blocked)
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify no change
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount);

    console.log("[INFO] Paste blocked in view mode (expected)");
  });

  test("paste blocked when canvas is locked", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste blocked when canvas is locked");

    // Copy a node while unlocked
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Lock the canvas
    await topoViewerPage.lock();
    await page.waitForTimeout(200);

    const initialNodeCount = await topoViewerPage.getNodeCount();

    // Try to paste when locked (should be blocked)
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify no change
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount);

    console.log("[INFO] Paste blocked when locked (expected)");
  });

  // ============================================================================
  // UNDO/REDO TESTS (CRITICAL)
  // ============================================================================

  test("single undo removes all pasted elements", async ({ topoViewerPage, page }) => {
    console.log("[TEST] single undo removes all pasted elements");

    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select both nodes
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);

    const srl2Box = await topoViewerPage.getNodeBoundingBox("srl2");
    await shiftClick(page, srl2Box!.x + srl2Box!.width / 2, srl2Box!.y + srl2Box!.height / 2);
    await page.waitForTimeout(200);

    // Copy and paste
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify paste created 2 nodes
    const pastedNodeIds = (await topoViewerPage.getNodeIds()).filter(
      (id) => !initialNodeIds.includes(id)
    );
    expect(pastedNodeIds.length).toBe(2);

    console.log(`[DEBUG] Pasted nodes: ${pastedNodeIds.join(", ")}`);

    // CRITICAL TEST: Single undo should remove ALL pasted elements
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify complete restoration to initial state
    const nodeCountAfterUndo = await topoViewerPage.getNodeCount();
    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();

    expect(nodeCountAfterUndo).toBe(initialNodeCount);

    // Verify neither pasted node exists
    for (const pastedId of pastedNodeIds) {
      expect(nodeIdsAfterUndo).not.toContain(pastedId);
    }

    console.log("[INFO] Single undo removed ALL pasted elements (batched undo works!)");
  });

  test("redo restores pasted elements", async ({ topoViewerPage, page }) => {
    console.log("[TEST] redo restores pasted elements");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Copy, paste, get pasted IDs
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    const pastedNodeIds = (await topoViewerPage.getNodeIds()).filter(
      (id) => !initialNodeIds.includes(id)
    );
    expect(pastedNodeIds.length).toBeGreaterThan(0);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify removed
    let nodeIds = await topoViewerPage.getNodeIds();
    for (const pastedId of pastedNodeIds) {
      expect(nodeIds).not.toContain(pastedId);
    }

    // Redo
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify restored
    nodeIds = await topoViewerPage.getNodeIds();
    for (const pastedId of pastedNodeIds) {
      expect(nodeIds).toContain(pastedId);
    }

    console.log("[INFO] Redo successfully restored all pasted elements");
  });

  test("paste keeps selection additive and supports undo/redo", async ({
    topoViewerPage,
    page
  }) => {
    console.log("[TEST] paste keeps selection additive and supports undo/redo");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Select and copy srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Paste once
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    let nodeIds = await topoViewerPage.getNodeIds();
    const pastedAfterFirst = nodeIds.filter((id) => !initialNodeIds.includes(id));
    expect(pastedAfterFirst.length).toBe(1);
    const firstPastedId = pastedAfterFirst[0];

    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);
    expect(selectedIds).toContain("srl1");
    expect(selectedIds).toContain(firstPastedId);

    // Paste again - selection should stay additive
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    nodeIds = await topoViewerPage.getNodeIds();
    const pastedAfterSecond = nodeIds.filter((id) => !initialNodeIds.includes(id));
    expect(pastedAfterSecond.length).toBe(2);
    const secondPastedId = pastedAfterSecond.find((id) => id !== firstPastedId);
    expect(secondPastedId).toBeDefined();

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(3);
    expect(selectedIds).toContain("srl1");
    expect(selectedIds).toContain(firstPastedId);
    expect(selectedIds).toContain(secondPastedId!);

    // Undo should remove the last paste
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).not.toContain(secondPastedId!);

    selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds).toContain("srl1");
    expect(selectedIds).toContain(firstPastedId);
    expect(selectedIds).not.toContain(secondPastedId!);

    // Redo should restore it
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(secondPastedId!);
  });

  // ============================================================================
  // PERSISTENCE VERIFICATION
  // ============================================================================

  test("paste persists correctly after reload", async ({ topoViewerPage, page }) => {
    console.log("[TEST] paste persists correctly after reload");

    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Copy and paste srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    const pastedNodeIds = (await topoViewerPage.getNodeIds()).filter(
      (id) => !initialNodeIds.includes(id)
    );
    expect(pastedNodeIds.length).toBe(1);
    const pastedNodeId = pastedNodeIds[0];

    // Wait for save
    await page.waitForTimeout(500);

    // Reload
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify pasted node still exists
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(pastedNodeId);

    console.log(`[INFO] Pasted node ${pastedNodeId} persisted after reload`);
  });

  // ============================================================================
  // ADDITIONAL EDGE CASES
  // ============================================================================

  test("multiple paste operations create multiple copies", async ({ topoViewerPage, page }) => {
    console.log("[TEST] multiple paste operations create multiple copies");

    const initialNodeCount = await topoViewerPage.getNodeCount();
    const initialNodeIds = await topoViewerPage.getNodeIds();

    // Copy srl1
    await topoViewerPage.selectNode("srl1");
    await page.waitForTimeout(100);
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Paste 3 times
    await topoViewerPage.paste();
    await page.waitForTimeout(500);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify 3 new nodes created
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(initialNodeCount + 3);

    const nodeIds = await topoViewerPage.getNodeIds();
    const pastedNodeIds = nodeIds.filter((id) => !initialNodeIds.includes(id));
    expect(pastedNodeIds.length).toBe(3);

    // Verify all have unique IDs
    const uniqueIds = new Set(pastedNodeIds);
    expect(uniqueIds.size).toBe(3);

    console.log(`[INFO] 3 paste operations created 3 unique nodes: ${pastedNodeIds.join(", ")}`);
  });

  test("copy on empty topology does nothing gracefully", async ({ topoViewerPage, page }) => {
    console.log("[TEST] copy on empty topology does nothing gracefully");

    // Load empty topology
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify empty
    const nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(0);

    // Try to copy (nothing selected, nothing to select)
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Try to paste
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify still empty
    const nodeCountAfter = await topoViewerPage.getNodeCount();
    expect(nodeCountAfter).toBe(0);

    console.log("[INFO] Copy/paste on empty topology handled gracefully");
  });
});
