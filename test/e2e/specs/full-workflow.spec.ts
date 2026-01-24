import { test, expect } from "../fixtures/topoviewer";
import { drag, ctrlClick } from "../helpers/cytoscape-helpers";

/**
 * Full Workflow E2E Test
 *
 * Comprehensive test covering the complete topology editing workflow:
 * - Node creation and YAML persistence
 * - Link creation and verification
 * - Node editor (rename via double-click)
 * - Group creation and node membership
 * - Complex undo/redo with interleaved operations
 * - Copy/paste/cut operations
 * - Free text and shape annotations
 * - Nested groups (group-in-group)
 * - Final persistence verification after reload
 *
 * This test is intended to be strict: failures should be asserted, not logged as "known bugs".
 */

// Test configuration
const TOPOLOGY_FILE = "empty.clab.yml";
const KIND_NOKIA_SRLINUX = "nokia_srlinux";
const RENAMED_NODE = "core-router";

// Selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';
const SEL_NODE_NAME = "#node-name";
const SEL_APPLY_BTN = '[data-testid="node-editor"] [data-testid="panel-apply-btn"]';
const SEL_OK_BTN = '[data-testid="node-editor"] [data-testid="panel-ok-btn"]';
const SEL_FREE_TEXT_EDITOR = '[data-testid="free-text-editor"]';
const SEL_FREE_SHAPE_EDITOR = '[data-testid="free-shape-editor"]';
const SEL_ADD_TEXT_BTN = '[data-testid="floating-panel-add-text-btn"]';
const SEL_ADD_SHAPES_BTN = '[data-testid="floating-panel-add-shapes-btn"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';
const SEL_PANEL_CLOSE_BTN = '[data-testid="panel-close-btn"]';

// ============================================================================
// STRICTER VALIDATION HELPERS
// ============================================================================

/**
 * Validate a specific node exists in YAML with correct kind
 */
function validateNodeInYaml(yaml: string, nodeId: string, expectedKind: string): void {
  // Check node exists
  expect(yaml).toContain(`${nodeId}:`);

  // Check kind is set (allows for YAML format variations)
  const kindPattern = new RegExp(`${nodeId}:[\\s\\S]*?kind:\\s*${expectedKind}`, "m");
  expect(yaml).toMatch(kindPattern);
}

/**
 * Validate a link exists in YAML with correct endpoints
 */
function validateLinkInYaml(
  yaml: string,
  source: string,
  target: string,
  srcEp: string,
  tgtEp: string
): void {
  // Check both endpoints exist in the links section
  expect(yaml).toContain(`${source}:${srcEp}`);
  expect(yaml).toContain(`${target}:${tgtEp}`);
}

/**
 * Validate node annotation exists with expected position (within tolerance)
 */
function validateNodePosition(
  annotations: { nodeAnnotations?: Array<{ id: string; position?: { x: number; y: number } }> },
  nodeId: string,
  expected: { x: number; y: number },
  tolerance = 20
): void {
  const ann = annotations.nodeAnnotations?.find((n) => n.id === nodeId);
  expect(ann).toBeDefined();
  expect(ann?.position).toBeDefined();
  if (ann?.position) {
    expect(Math.abs(ann.position.x - expected.x)).toBeLessThan(tolerance);
    expect(Math.abs(ann.position.y - expected.y)).toBeLessThan(tolerance);
  }
}

test.describe("Full Workflow E2E Test", () => {
  // Increase timeout for comprehensive test (2 minutes)
  test.setTimeout(120000);

  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
  test("comprehensive workflow: nodes, links, groups, undo/redo, copy/paste", async ({
    page,
    topoViewerPage
  }) => {
    // ============================================================================
    // SETUP
    // ============================================================================
    console.log("[STEP] Setup: Reset files and load empty topology");
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify starting state is empty
    let nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(0);

    // ============================================================================
    // STEP 1: Create nodes and verify YAML persistence
    // ============================================================================
    console.log("[STEP 1] Create nodes and verify YAML persistence");

    // Create 4 nodes in a square pattern
    const nodePositions = {
      router1: { x: 200, y: 100 },
      router2: { x: 400, y: 100 },
      router3: { x: 400, y: 300 },
      router4: { x: 200, y: 300 }
    };
    await topoViewerPage.createNode("router1", nodePositions.router1, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router2", nodePositions.router2, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router3", nodePositions.router3, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router4", nodePositions.router4, KIND_NOKIA_SRLINUX);

    // Wait for file saves
    await page.waitForTimeout(500);

    // Verify node count
    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(4);

    // Verify YAML persistence with STRICTER validation - check each node individually
    let yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    validateNodeInYaml(yaml, "router1", KIND_NOKIA_SRLINUX);
    validateNodeInYaml(yaml, "router2", KIND_NOKIA_SRLINUX);
    validateNodeInYaml(yaml, "router3", KIND_NOKIA_SRLINUX);
    validateNodeInYaml(yaml, "router4", KIND_NOKIA_SRLINUX);

    expect(yaml).toContain("image:");

    // Verify annotations with position validation
    let annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(4);

    const annotationIds = annotations.nodeAnnotations?.map((n) => n.id).sort();
    expect(annotationIds).toEqual(["router1", "router2", "router3", "router4"]);

    // STRICTER: Verify positions are saved correctly (within 50px tolerance for initial creation)
    validateNodePosition(annotations, "router1", nodePositions.router1, 50);
    validateNodePosition(annotations, "router2", nodePositions.router2, 50);
    validateNodePosition(annotations, "router3", nodePositions.router3, 50);
    validateNodePosition(annotations, "router4", nodePositions.router4, 50);

    // ============================================================================
    // STEP 2: Interconnect nodes and verify links
    // ============================================================================
    console.log("[STEP 2] Interconnect nodes and verify links");

    // Initial edge count should be 0
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    // Create links forming a square: r1-r2, r2-r3, r3-r4, r4-r1
    await topoViewerPage.createLink("router1", "router2", "eth1", "eth1");
    await topoViewerPage.createLink("router2", "router3", "eth2", "eth1");
    await topoViewerPage.createLink("router3", "router4", "eth2", "eth1");
    await topoViewerPage.createLink("router4", "router1", "eth2", "eth2");

    // Wait for file saves
    await page.waitForTimeout(500);

    // Verify edge count
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(4);

    // Verify YAML contains links section with STRICTER validation
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("links:");
    expect(yaml).toContain("endpoints:");

    // STRICTER: Validate each link has correct endpoint structure
    validateLinkInYaml(yaml, "router1", "router2", "eth1", "eth1");
    validateLinkInYaml(yaml, "router2", "router3", "eth2", "eth1");
    validateLinkInYaml(yaml, "router3", "router4", "eth2", "eth1");
    validateLinkInYaml(yaml, "router4", "router1", "eth2", "eth2");

    // ============================================================================
    // STEP 3: Change node name via node editor
    // ============================================================================
    console.log("[STEP 3] Change node name via node editor");

    // Fit viewport to ensure nodes are visible
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    // Verify router1 exists
    let nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain("router1");
    console.log(`[DEBUG] Node IDs before rename: ${nodeIds.join(", ")}`);

    // Get router1's bounding box for double-click
    let router1Box = await topoViewerPage.getNodeBoundingBox("router1");
    expect(router1Box).not.toBeNull();
    console.log(
      `[DEBUG] router1 bounding box: x=${router1Box!.x}, y=${router1Box!.y}, w=${router1Box!.width}, h=${router1Box!.height}`
    );

    // Double-click to open node editor
    await page.mouse.dblclick(
      router1Box!.x + router1Box!.width / 2,
      router1Box!.y + router1Box!.height / 2
    );
    await page.waitForTimeout(1000); // Longer wait for editor to appear

    // Verify editor panel opens
    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).toBeVisible();

    // Change node name from router1 to core-router
    const nameInput = page.locator(SEL_NODE_NAME);
    await nameInput.clear();
    await nameInput.fill(RENAMED_NODE);
    await page.waitForTimeout(200);

    // Click Apply button
    const applyBtn = page.locator(SEL_APPLY_BTN);
    await applyBtn.click();
    await page.waitForTimeout(2000); // Wait for persistence - longer wait

    // Debug: Check current file after apply
    const currentFile = await page.evaluate(() => (window as any).__DEV__?.getCurrentFile?.());
    console.log(`[DEBUG] Current file after apply: ${currentFile}`);

    // Debug: Check YAML after apply
    const yamlAfterApply = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    console.log(
      `[DEBUG] YAML after apply contains ${RENAMED_NODE}: ${yamlAfterApply.includes(RENAMED_NODE)}`
    );

    // Close the editor
    const okBtn = page.locator(SEL_OK_BTN);
    await okBtn.click();
    await page.waitForTimeout(500);

    // Verify editor closed
    await expect(editorPanel).not.toBeVisible();

    // Verify node ID changed in graph
    nodeIds = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after close: ${nodeIds.join(", ")}`);
    expect(nodeIds).toContain(RENAMED_NODE);
    expect(nodeIds).not.toContain("router1");

    // Verify YAML updated
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain(`${RENAMED_NODE}:`);
    expect(yaml).not.toContain("router1:");

    // Assert both endpoints were updated
    expect(yaml).toContain(`${RENAMED_NODE}:eth1`);
    expect(yaml).toContain(`${RENAMED_NODE}:eth2`);

    // ============================================================================
    // STEP 4: Create groups and add nodes to groups
    // ============================================================================
    console.log("[STEP 4] Create groups and add nodes to groups");

    // DEBUG: Check if editor is still visible before proceeding
    const editorStillVisible = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible before Step 4: ${editorStillVisible}`);

    // DEBUG: Get bounding boxes to see coordinates
    const router2BoxDebug = await topoViewerPage.getNodeBoundingBox("router2");
    const router3BoxDebug = await topoViewerPage.getNodeBoundingBox("router3");
    console.log(`[DEBUG] router2 box: x=${router2BoxDebug?.x}, y=${router2BoxDebug?.y}`);
    console.log(`[DEBUG] router3 box: x=${router3BoxDebug?.x}, y=${router3BoxDebug?.y}`);

    // Get initial group count
    let groupCount = await topoViewerPage.getGroupCount();
    const initialGroupCount = groupCount;

    // Select router2 first
    console.log("[DEBUG] About to select router2");
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(300); // Wait longer to avoid double-click detection

    // DEBUG: Check if editor opened unexpectedly
    const editorAfterSelect = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after selecting router2: ${editorAfterSelect}`);

    // Ctrl+Click router3 to add to selection
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();
    console.log(
      `[DEBUG] About to ctrlClick router3 at x=${router3Box!.x + router3Box!.width / 2}, y=${router3Box!.y + router3Box!.height / 2}`
    );
    await ctrlClick(
      page,
      router3Box!.x + router3Box!.width / 2,
      router3Box!.y + router3Box!.height / 2
    );
    await page.waitForTimeout(200);

    // DEBUG: Check editor after ctrlClick on router3
    const editorAfterCtrlClick = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after ctrlClick router3: ${editorAfterCtrlClick}`);

    // Close editor if it opened unexpectedly (timing issue with Ctrl+click)
    if (editorAfterCtrlClick) {
      console.log("[DEBUG] Closing unexpected editor");
      const closeBtnStep4 = editorPanel.locator(SEL_PANEL_CLOSE_BTN);
      await closeBtnStep4.click();
      await page.waitForTimeout(200);
    }

    // Verify both nodes are selected
    let selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBe(2);

    // Create group with Ctrl+G
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    // Verify group count increased
    groupCount = await topoViewerPage.getGroupCount();
    expect(groupCount).toBe(initialGroupCount + 1);

    // Verify annotations contain groupStyleAnnotations
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.groupStyleAnnotations?.length).toBeGreaterThan(0);

    // ============================================================================
    // STEP 5: Complex undo/redo with interleaved operations (Part 1)
    // ============================================================================
    console.log("[STEP 5] Complex undo/redo with interleaved operations (Part 1)");

    // DEBUG: Check editor at start of Step 5
    const editorStep5Start = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible at start of Step 5: ${editorStep5Start}`);

    // Record initial state: 4 nodes, 4 edges, 1 group
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(4);
    expect(edgeCount).toBe(4);

    // ACTION 1: Create a new node router5
    await topoViewerPage.createNode("router5", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(500);

    // DEBUG: Check editor after createNode
    const editorAfterCreateNode = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after createNode: ${editorAfterCreateNode}`);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(5);

    // ACTION 2: Create a link router4-router5
    await topoViewerPage.createLink("router4", "router5", "eth3", "eth1");
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(5);

    // UNDO 1: Undo the link creation
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(4); // Link undone

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(5); // Node still exists

    // NEW ACTION: While undo stack has the undone link, create a DIFFERENT link
    await topoViewerPage.createLink("router3", "router5", "eth3", "eth2");
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(5); // New link created

    // VERIFY REDO CLEARED: Redo should have no effect (redo stack cleared by new action)
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(5); // Should still be 5 (redo did nothing)

    // ============================================================================
    // STEP 6: Complex undo/redo with interleaved operations (Part 2)
    // ============================================================================
    console.log("[STEP 6] Complex undo/redo with interleaved operations (Part 2)");

    // DEBUG: Check editor at start of Step 6
    const editorStep6Start = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible at start of Step 6: ${editorStep6Start}`);

    // STATE: 5 nodes, 5 edges
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(5);
    expect(edgeCount).toBe(5);

    // ACTION 1: Delete router5 node (this should also remove router3-router5 edge)
    await topoViewerPage.deleteNode("router5");
    await page.waitForTimeout(500);

    // DEBUG: Check editor after delete
    const editorAfterDelete = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after deleting router5: ${editorAfterDelete}`);

    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(4);
    expect(edgeCount).toBe(4); // router3-router5 edge should be removed

    // ACTION 2: Create new group with router3 and router4
    await topoViewerPage.selectNode("router3");
    await page.waitForTimeout(300); // Wait longer to avoid double-click detection

    // DEBUG: Check editor after selecting router3
    const editorAfterSelectR3 = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after selecting router3: ${editorAfterSelectR3}`);

    const router4Box = await topoViewerPage.getNodeBoundingBox("router4");
    await ctrlClick(
      page,
      router4Box!.x + router4Box!.width / 2,
      router4Box!.y + router4Box!.height / 2
    );
    await page.waitForTimeout(200);

    // DEBUG: Check editor after ctrlClick on router4
    const editorAfterCtrlClickR4 = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after ctrlClick router4: ${editorAfterCtrlClickR4}`);
    if (editorAfterCtrlClickR4) {
      console.log("[DEBUG] Closing unexpected editor after ctrlClick router4");
      const closeBtnR4 = editorPanel.locator(SEL_PANEL_CLOSE_BTN);
      await closeBtnR4.click();
      await page.waitForTimeout(200);
    }

    const groupCountBefore = await topoViewerPage.getGroupCount();
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    groupCount = await topoViewerPage.getGroupCount();
    expect(groupCount).toBe(groupCountBefore + 1);

    // UNDO: Undo group creation
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    groupCount = await topoViewerPage.getGroupCount();
    expect(groupCount).toBe(groupCountBefore);

    // REDO: Redo group creation
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    groupCount = await topoViewerPage.getGroupCount();
    expect(groupCount).toBe(groupCountBefore + 1);

    // UNDO again: Undo group and node deletion
    await topoViewerPage.undo(); // undo group
    await page.waitForTimeout(300);
    await topoViewerPage.undo(); // undo node deletion
    await page.waitForTimeout(500);

    // Verify router5 is back
    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(5);

    nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain("router5");

    // REDO: Redo node deletion
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(4);

    // ============================================================================
    // STEP 7: Undo across multiple operation types
    // ============================================================================
    console.log("[STEP 7] Undo across multiple operation types");

    // DEBUG: Check editor state at start of Step 7
    const editorBeforeStep7 = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible at start of Step 7: ${editorBeforeStep7}`);

    // Record initial position of router3
    const initialRouter3Pos = await topoViewerPage.getNodePosition("router3");

    // ACTION 1: Move router3 100px right using drag
    let router3BoxDrag = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3BoxDrag).not.toBeNull();
    console.log(
      `[DEBUG] About to drag router3 from x=${router3BoxDrag!.x + router3BoxDrag!.width / 2}`
    );

    await drag(
      page,
      {
        x: router3BoxDrag!.x + router3BoxDrag!.width / 2,
        y: router3BoxDrag!.y + router3BoxDrag!.height / 2
      },
      {
        x: router3BoxDrag!.x + router3BoxDrag!.width / 2 + 100,
        y: router3BoxDrag!.y + router3BoxDrag!.height / 2
      },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    // DEBUG: Check editor state after drag
    const editorAfterDrag = await editorPanel.isVisible().catch(() => false);
    console.log(`[DEBUG] Editor visible after dragging router3: ${editorAfterDrag}`);

    const movedRouter3Pos = await topoViewerPage.getNodePosition("router3");
    expect(movedRouter3Pos.x).toBeGreaterThan(initialRouter3Pos.x);

    // UNDO node move
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const restoredRouter3Pos = await topoViewerPage.getNodePosition("router3");
    expect(restoredRouter3Pos.x).toBeCloseTo(initialRouter3Pos.x, 0);

    // REDO node move
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    const redoRouter3Pos = await topoViewerPage.getNodePosition("router3");
    expect(redoRouter3Pos.x).toBeGreaterThan(initialRouter3Pos.x);

    // ============================================================================
    // STEP 8: Copy and paste MULTIPLE nodes with links, then test batched undo
    // ============================================================================
    console.log("[STEP 8] Copy and paste multiple nodes with links");

    // Close any open node editor panel first
    const nodeEditorPanel = page.locator('[data-testid="node-editor"]');
    if (await nodeEditorPanel.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("[DEBUG] Node editor is open, closing it");
      const closeBtn = nodeEditorPanel.locator(SEL_PANEL_CLOSE_BTN);
      await closeBtn.click();
      await page.waitForTimeout(300);
      await expect(nodeEditorPanel).toBeHidden({ timeout: 2000 });
    }

    // Press Escape to deselect
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Record initial counts BEFORE copy
    const nodeCountBeforeCopy = await topoViewerPage.getNodeCount();
    const edgeCountBeforeCopy = await topoViewerPage.getEdgeCount();
    const nodeIdsBeforeCopy = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Before copy: ${nodeCountBeforeCopy} nodes, ${edgeCountBeforeCopy} edges`);
    console.log(`[DEBUG] Node IDs: ${nodeIdsBeforeCopy.join(", ")}`);

    // Select TWO connected nodes: router2 and router3 (they have a link between them from Step 2)
    // First select router2
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);

    // Then Ctrl+Click on router3 to add to selection
    const router3BoxForCopy = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3BoxForCopy).not.toBeNull();
    await page.keyboard.down("Control");
    await page.mouse.click(
      router3BoxForCopy!.x + router3BoxForCopy!.width / 2,
      router3BoxForCopy!.y + router3BoxForCopy!.height / 2
    );
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    console.log("[DEBUG] Selected router2 and router3 (connected nodes)");

    // Copy (Ctrl+C) - should copy both nodes AND the link between them
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    console.log("[DEBUG] Copied 2 nodes with link");

    // Paste (Ctrl+V)
    await topoViewerPage.paste();
    await page.waitForTimeout(1000);
    console.log("[DEBUG] Pasted nodes");

    // Get state after paste
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    const nodeIdsAfterPaste = await topoViewerPage.getNodeIds();

    // Find the pasted node IDs (new nodes that didn't exist before)
    const pastedNodeIds = nodeIdsAfterPaste.filter((id) => !nodeIdsBeforeCopy.includes(id));
    const nodesAdded = nodeCount - nodeCountBeforeCopy;
    const edgesAdded = edgeCount - edgeCountBeforeCopy;

    console.log(
      `[DEBUG] After paste: ${nodeCount} nodes (+${nodesAdded}), ${edgeCount} edges (+${edgesAdded})`
    );
    console.log(`[INFO] Pasted node IDs: ${pastedNodeIds.join(", ")}`);

    // Verify at least 2 nodes were added (may be more if group members are included)
    expect(nodesAdded).toBeGreaterThanOrEqual(2);
    expect(pastedNodeIds.length).toBeGreaterThanOrEqual(2);

    // When copying connected nodes, their connecting edges should be pasted as well.
    expect(edgesAdded).toBeGreaterThan(0);

    // Verify YAML contains BOTH new nodes
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      expect(yaml).toContain(`${pastedId}:`);
    }
    console.log("[DEBUG] YAML contains both pasted nodes");

    // Verify annotations contain positions for both new nodes
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      const ann = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === pastedId);
      expect(ann).toBeDefined();
      expect(ann?.position).toBeDefined();
    }
    console.log("[DEBUG] Annotations contain positions for both pasted nodes");

    // ============================================================================
    // CRITICAL TEST: Single UNDO should remove ALL pasted elements (2 nodes + link)
    // If paste is NOT batched, this will FAIL because multiple undos would be needed
    // ============================================================================
    console.log("[DEBUG] Testing UNDO - single undo should remove ALL pasted elements");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Check canvas state after single undo
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] After 1 UNDO: ${nodeCount} nodes, ${edgeCount} edges`);
    console.log(`[DEBUG] Node IDs after undo: ${nodeIdsAfterUndo.join(", ")}`);

    // Assert: Single undo should restore EXACT original state
    expect(nodeCount).toBe(nodeCountBeforeCopy);
    expect(edgeCount).toBe(edgeCountBeforeCopy);

    // Assert: Neither pasted node should exist
    for (const pastedId of pastedNodeIds) {
      expect(nodeIdsAfterUndo).not.toContain(pastedId);
    }

    // Verify YAML no longer contains pasted nodes
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      expect(yaml).not.toContain(`${pastedId}:`);
    }
    console.log("[DEBUG] YAML correctly removed all pasted nodes after single undo");

    // Verify annotations restored
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      const ann = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === pastedId);
      expect(ann).toBeUndefined();
    }
    console.log("[DEBUG] Annotations correctly removed pasted nodes after undo");

    // REDO should restore all pasted elements
    console.log("[DEBUG] Testing REDO");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] After REDO: ${nodeCount} nodes, ${edgeCount} edges`);

    // REDO should restore the same state as after paste
    expect(nodeCount).toBe(nodeCountBeforeCopy + nodesAdded);
    expect(edgeCount).toBe(edgeCountBeforeCopy + edgesAdded);

    // Verify YAML has nodes again
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      expect(yaml).toContain(`${pastedId}:`);
    }
    console.log("[DEBUG] REDO correctly restored all pasted elements");

    // ============================================================================
    // STEP 9: Copy and paste group with contents
    // ============================================================================
    console.log("[STEP 9] Copy and paste group with contents");

    {
      // Get group IDs
      const groupIds = await topoViewerPage.getGroupIds();
      expect(groupIds.length).toBeGreaterThan(0);
      const groupId = groupIds[0];

      // Record initial counts and state
      const groupCountBeforeGroupPaste = await topoViewerPage.getGroupCount();
      const nodeCountBeforeGroupPaste = await topoViewerPage.getNodeCount();
      const nodeIdsBeforeGroupPaste = await topoViewerPage.getNodeIds();

      // Get initial annotations state
      const annotationsBeforeGroupPaste =
        await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      console.log(
        `[DEBUG] Before group paste: ${groupCountBeforeGroupPaste} groups, ${nodeCountBeforeGroupPaste} nodes`
      );
      console.log(
        `[DEBUG] Annotations before: groups=${annotationsBeforeGroupPaste.groupStyleAnnotations?.length || 0}, nodes=${annotationsBeforeGroupPaste.nodeAnnotations?.length || 0}`
      );

      // Select the group
      await topoViewerPage.selectGroup(groupId);
      await page.waitForTimeout(200);

      // Copy (Ctrl+C) - should copy group
      await topoViewerPage.copy();
      await page.waitForTimeout(200);

      // Paste (Ctrl+V)
      await topoViewerPage.paste();
      await page.waitForTimeout(1000); // Longer wait for group paste

      // Verify counts changed
      const groupCountAfterGroupPaste = await topoViewerPage.getGroupCount();
      const nodeCountAfterGroupPaste = await topoViewerPage.getNodeCount();
      const nodeIdsAfterGroupPaste = await topoViewerPage.getNodeIds();
      console.log(
        `[INFO] Group paste: groups ${groupCountBeforeGroupPaste} -> ${groupCountAfterGroupPaste}, nodes ${nodeCountBeforeGroupPaste} -> ${nodeCountAfterGroupPaste}`
      );

      // Verify YAML contains new nodes from group paste
      yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
      const newNodeIds = nodeIdsAfterGroupPaste.filter(
        (id) => !nodeIdsBeforeGroupPaste.includes(id)
      );
      console.log(`[DEBUG] New node IDs from group paste: ${newNodeIds.join(", ")}`);

      // Each new node should be in YAML
      for (const newNodeId of newNodeIds) {
        expect(yaml).toContain(`${newNodeId}:`);
      }
      console.log("[DEBUG] All pasted nodes found in YAML");

      // Verify annotations contain new group and nodes
      annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      console.log(
        `[DEBUG] Annotations after: groups=${annotations.groupStyleAnnotations?.length || 0}, nodes=${annotations.nodeAnnotations?.length || 0}`
      );

      // UNDO GROUP PASTE - Critical test: A single undo should remove ALL pasted elements
      // If paste is not batched, this will fail because multiple undos would be needed
      console.log("[DEBUG] Testing UNDO of group paste (should be a single atomic operation)");
      await topoViewerPage.undo();
      await page.waitForTimeout(500);

      const groupCountAfterUndo = await topoViewerPage.getGroupCount();
      const nodeCountAfterUndo = await topoViewerPage.getNodeCount();
      const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
      console.log(`[DEBUG] After UNDO: groups ${groupCountAfterUndo}, nodes ${nodeCountAfterUndo}`);

      // This assertion tests that group paste is batched - single undo should restore original state
      expect(groupCountAfterUndo).toBe(groupCountBeforeGroupPaste);
      expect(nodeCountAfterUndo).toBe(nodeCountBeforeGroupPaste);

      // Verify no new nodes exist after undo
      for (const newNodeId of newNodeIds) {
        expect(nodeIdsAfterUndo).not.toContain(newNodeId);
      }

      // Verify YAML is restored (no pasted nodes)
      yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
      for (const newNodeId of newNodeIds) {
        expect(yaml).not.toContain(`${newNodeId}:`);
      }
      console.log("[DEBUG] YAML correctly removed all pasted nodes after undo");

      // Verify annotations are restored
      annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      expect(annotations.groupStyleAnnotations?.length || 0).toBe(
        annotationsBeforeGroupPaste.groupStyleAnnotations?.length || 0
      );
      console.log("[DEBUG] Annotations correctly restored after undo");
    }

    // ============================================================================
    // STEP 10: Final persistence verification after reload
    // ============================================================================
    console.log("[STEP 10] Final persistence verification after reload");

    // Get current state before reload
    const nodeCountBeforeReload = await topoViewerPage.getNodeCount();
    const edgeCountBeforeReload = await topoViewerPage.getEdgeCount();
    const groupCountBeforeReload = await topoViewerPage.getGroupCount();
    const nodeIdsBeforeReload = await topoViewerPage.getNodeIds();

    // Get positions before reload
    const positionsBeforeReload: Record<string, { x: number; y: number }> = {};
    for (const nodeId of nodeIdsBeforeReload) {
      positionsBeforeReload[nodeId] = await topoViewerPage.getNodePosition(nodeId);
    }

    // Wait for any pending file operations to complete before reload
    await page.waitForTimeout(500);

    // Reload the topology file
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify all nodes are present
    const nodeCountAfterReload = await topoViewerPage.getNodeCount();
    expect(nodeCountAfterReload).toBe(nodeCountBeforeReload);

    const nodeIdsAfterReload = await topoViewerPage.getNodeIds();
    expect([...nodeIdsAfterReload].sort()).toEqual([...nodeIdsBeforeReload].sort());

    // Verify all edges are present
    const edgeCountAfterReload = await topoViewerPage.getEdgeCount();
    expect(edgeCountAfterReload).toBe(edgeCountBeforeReload);

    // Verify groups are preserved
    const groupCountAfterReload = await topoViewerPage.getGroupCount();
    expect(groupCountAfterReload).toBe(groupCountBeforeReload);

    // Verify node positions are preserved (from annotations)
    for (const nodeId of nodeIdsAfterReload) {
      const posAfter = await topoViewerPage.getNodePosition(nodeId);
      const posBefore = positionsBeforeReload[nodeId];

      if (posBefore) {
        // STRICTER: Allow only 20px tolerance for position drift during save/reload cycle
        const toleranceX = Math.abs(posAfter.x - posBefore.x);
        const toleranceY = Math.abs(posAfter.y - posBefore.y);
        expect(toleranceX).toBeLessThan(20);
        expect(toleranceY).toBeLessThan(20);
      }
    }

    // Final YAML verification
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("topology:");
    expect(yaml).toContain("nodes:");
    expect(yaml).toContain(`${RENAMED_NODE}:`); // Renamed from router1 in Step 3

    // Final annotations verification
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(nodeCountAfterReload);

    // ============================================================================
    // STEP 11: Free text annotations
    // ============================================================================
    console.log("[STEP 11] Free text annotations");

    // Get initial free text annotation count
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const freeTextCountBefore = annotations.freeTextAnnotations?.length || 0;

    // Click Add Text button via floating panel
    await page.locator(SEL_ADD_TEXT_BTN).click();
    await page.waitForTimeout(200);

    // Click on canvas at specific position to create text annotation
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(500);

    // Editor should open - verify it's visible
    const textEditor = page.locator(SEL_FREE_TEXT_EDITOR);
    await expect(textEditor).toBeVisible({ timeout: 3000 });

    // Enter text content
    const textArea = textEditor.locator("textarea").first();
    await textArea.fill("Test annotation text");
    await page.waitForTimeout(200);

    // Click OK to save
    await textEditor.locator(SEL_PANEL_OK_BTN).click();
    await page.waitForTimeout(500);

    // Verify text annotation was created in annotations file
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const freeTextCountAfter = annotations.freeTextAnnotations?.length || 0;
    expect(freeTextCountAfter).toBe(freeTextCountBefore + 1);

    // Verify text content was saved
    const createdTextAnn = annotations.freeTextAnnotations?.[freeTextCountAfter - 1];
    expect(createdTextAnn?.text).toBe("Test annotation text");
    console.log("[DEBUG] Free text annotation created successfully");

    // Test undo of text annotation creation
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    await expect
      .poll(
        async () => {
          const a = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
          return a.freeTextAnnotations?.length || 0;
        },
        { timeout: 5000, message: "Undo should remove the created free text annotation" }
      )
      .toBe(freeTextCountBefore);
    console.log(
      `[DEBUG] Free text annotation undo: expected ${freeTextCountBefore}, got ${freeTextCountBefore}`
    );

    // Redo to restore text annotation (if undo worked)
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    await expect
      .poll(
        async () => {
          const a = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
          return a.freeTextAnnotations?.length || 0;
        },
        { timeout: 5000, message: "Redo should restore the created free text annotation" }
      )
      .toBe(freeTextCountAfter);
    console.log("[DEBUG] Free text annotation redo completed");

    console.log("[DEBUG] Free text annotation undo/redo test completed (bugs logged if any)");

    // ============================================================================
    // STEP 12: Free shape annotations
    // ============================================================================
    console.log("[STEP 12] Free shape annotations");

    // Get initial free shape annotation count
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const freeShapeCountBefore = annotations.freeShapeAnnotations?.length || 0;

    // Click Add Shapes button to open dropdown
    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);

    // Select Rectangle from dropdown
    await page.locator("text=Rectangle").click();
    await page.waitForTimeout(200);

    // Click on canvas to create rectangle shape
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(500);

    // Verify shape editor opens (or shape is created directly)
    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      // If editor opens, click OK to save
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(300);
    }

    // Verify rectangle shape was created
    await expect
      .poll(
        async () => {
          const a = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
          return a.freeShapeAnnotations?.length || 0;
        },
        { timeout: 5000, message: "Shape annotation should be persisted after creation" }
      )
      .toBe(freeShapeCountBefore + 1);

    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const createdShape = annotations.freeShapeAnnotations?.find((s) => s.shapeType === "rectangle");
    expect(createdShape).toBeDefined();
    console.log("[DEBUG] Rectangle shape annotation created successfully");

    // Test undo/redo for shape
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    await expect
      .poll(
        async () => {
          const a = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
          return a.freeShapeAnnotations?.length || 0;
        },
        { timeout: 5000, message: "Undo should remove the created shape annotation" }
      )
      .toBe(freeShapeCountBefore);
    console.log(
      `[DEBUG] Free shape annotation undo: expected ${freeShapeCountBefore}, got ${freeShapeCountBefore}`
    );

    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    await expect
      .poll(
        async () => {
          const a = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
          return a.freeShapeAnnotations?.length || 0;
        },
        { timeout: 5000, message: "Redo should restore the created shape annotation" }
      )
      .toBe(freeShapeCountBefore + 1);
    console.log("[DEBUG] Free shape annotation redo completed");

    console.log("[DEBUG] Free shape annotation undo/redo test completed (bugs logged if any)");

    // ============================================================================
    // STEP 13: Nested groups (group in group)
    // ============================================================================
    console.log("[STEP 13] Nested groups (group in group)");

    // Clear selection first
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Get current group count
    const groupCountBeforeNested = await topoViewerPage.getGroupCount();
    const groupIdsBeforeOuter = await topoViewerPage.getGroupIds();
    console.log(`[DEBUG] Group count before nested groups: ${groupCountBeforeNested}`);

    // Select two nodes to create outer group
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);

    // Get router3 position and ctrl+click to add to selection
    const router3BoxNested = await topoViewerPage.getNodeBoundingBox("router3");
    if (router3BoxNested) {
      await ctrlClick(
        page,
        router3BoxNested.x + router3BoxNested.width / 2,
        router3BoxNested.y + router3BoxNested.height / 2
      );
      await page.waitForTimeout(200);
    }

    // Create outer group with Ctrl+G
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    await expect
      .poll(() => topoViewerPage.getGroupCount(), {
        timeout: 5000,
        message: "Outer group count should increase after createGroup"
      })
      .toBe(groupCountBeforeNested + 1);
    const groupCountAfterOuter = await topoViewerPage.getGroupCount();

    // Get the outer group ID
    const groupIdsAfterOuter = await topoViewerPage.getGroupIds();
    const outerGroupId = groupIdsAfterOuter.find((id) => !groupIdsBeforeOuter.includes(id));
    expect(outerGroupId).toBeDefined();
    console.log(`[DEBUG] Created outer group: ${outerGroupId}`);

    // Now select only router3 and create inner group
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await topoViewerPage.selectNode("router3");
    await page.waitForTimeout(200);

    // Create inner group
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    await expect
      .poll(() => topoViewerPage.getGroupCount(), {
        timeout: 5000,
        message: "Inner group count should increase after createGroup"
      })
      .toBe(groupCountAfterOuter + 1);

    const groupIdsAfterInner = await topoViewerPage.getGroupIds();
    const innerGroupId = groupIdsAfterInner.find((id) => !groupIdsAfterOuter.includes(id));
    expect(innerGroupId).toBeDefined();

    // Verify hierarchy - inner group should have parentId pointing to outer group
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const groups = annotations.groupStyleAnnotations || [];
    const innerGroup = groups.find((g) => g.id === innerGroupId);
    expect(innerGroup).toBeDefined();
    expect(innerGroup?.parentId).toBe(outerGroupId);

    console.log("[DEBUG] Nested groups test completed");

    // ============================================================================
    // STEP 14: Copy-paste with annotations
    // ============================================================================
    console.log("[STEP 14] Copy-paste with annotations");

    // Get current state
    const nodeCountBeforeAnnCopy = await topoViewerPage.getNodeCount();

    // Select a node that we can copy along with its nearby annotations
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);

    const nodeIdsBeforeAnnCopy = await topoViewerPage.getNodeIds();

    // Copy the selected node
    await topoViewerPage.copy();
    await page.waitForTimeout(300);

    // Paste
    await topoViewerPage.paste();
    await page.waitForTimeout(500);

    // Verify node was pasted
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Paste should create at least one new node"
      })
      .toBeGreaterThan(nodeCountBeforeAnnCopy);
    const nodeCountAfterAnnCopy = await topoViewerPage.getNodeCount();
    console.log(
      `[DEBUG] Copy-paste created new node (before: ${nodeCountBeforeAnnCopy}, after: ${nodeCountAfterAnnCopy})`
    );

    // Verify in YAML
    await expect
      .poll(
        async () => {
          const ids = await topoViewerPage.getNodeIds();
          return ids.find((id) => !nodeIdsBeforeAnnCopy.includes(id)) ?? null;
        },
        { timeout: 5000, message: "Expected a new node ID after paste" }
      )
      .not.toBeNull();

    const nodeIdsAfterCopy = await topoViewerPage.getNodeIds();
    const newNodeId = nodeIdsAfterCopy.find((id) => !nodeIdsBeforeAnnCopy.includes(id));
    expect(newNodeId).toBeDefined();
    await expect
      .poll(() => topoViewerPage.getYamlFromFile(TOPOLOGY_FILE), {
        timeout: 5000,
        message: "Expected pasted node to be persisted to YAML"
      })
      .toContain(`${newNodeId}:`);
    console.log(`[DEBUG] Pasted node ${newNodeId} found in YAML`);

    // Test single undo removes all pasted elements
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Undo should restore node count after paste"
      })
      .toBe(nodeCountBeforeAnnCopy);

    console.log("[DEBUG] Copy-paste with single undo works correctly");

    console.log("[SUCCESS] Full workflow test completed");
    console.log(
      `Final state: ${nodeCountAfterReload} nodes, ${edgeCountAfterReload} edges, ${groupCountAfterReload} groups`
    );
  });
});
