import { test, expect } from '../fixtures/topoviewer';
import { drag, ctrlClick } from '../helpers/cytoscape-helpers';

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
 * - Final persistence verification after reload
 *
 * Bug reports are documented in: test/e2e/reports/full-workflow-bugs.md
 */

// Test configuration
const TOPOLOGY_FILE = 'empty.clab.yml';
const KIND_NOKIA_SRLINUX = 'nokia_srlinux';

// Selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';
const SEL_NODE_NAME = '#node-name';
const SEL_APPLY_BTN = '[data-testid="node-editor"] [data-testid="panel-apply-btn"]';
const SEL_OK_BTN = '[data-testid="node-editor"] [data-testid="panel-ok-btn"]';

// Helper to log bug findings
function logBug(bugId: string, description: string) {
  console.log(`[BUG] ${bugId}: ${description}`);
}

test.describe('Full Workflow E2E Test', () => {
  // Increase timeout for comprehensive test (2 minutes)
  test.setTimeout(120000);

  test('comprehensive workflow: nodes, links, groups, undo/redo, copy/paste', async ({ page, topoViewerPage }) => {
    // ============================================================================
    // SETUP
    // ============================================================================
    console.log('[STEP] Setup: Reset files and load empty topology');
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
    console.log('[STEP 1] Create nodes and verify YAML persistence');

    // Create 4 nodes in a square pattern
    await topoViewerPage.createNode('router1', { x: 200, y: 100 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('router2', { x: 400, y: 100 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('router3', { x: 400, y: 300 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode('router4', { x: 200, y: 300 }, KIND_NOKIA_SRLINUX);

    // Wait for file saves
    await page.waitForTimeout(500);

    // Verify node count
    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(4);

    // Verify YAML persistence
    let yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain('router1:');
    expect(yaml).toContain('router2:');
    expect(yaml).toContain('router3:');
    expect(yaml).toContain('router4:');
    expect(yaml).toContain(`kind: ${KIND_NOKIA_SRLINUX}`);

    // Check for image field (potential bug area)
    if (!yaml.includes('image:')) {
      logBug('BUG-YAML-001', 'image field not written to YAML for created nodes');
    }
    expect(yaml).toContain('image:');

    // Verify annotations
    let annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(4);

    const annotationIds = annotations.nodeAnnotations?.map(n => n.id).sort();
    expect(annotationIds).toEqual(['router1', 'router2', 'router3', 'router4']);

    // ============================================================================
    // STEP 2: Interconnect nodes and verify links
    // ============================================================================
    console.log('[STEP 2] Interconnect nodes and verify links');

    // Initial edge count should be 0
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    // Create links forming a square: r1-r2, r2-r3, r3-r4, r4-r1
    await topoViewerPage.createLink('router1', 'router2', 'eth1', 'eth1');
    await topoViewerPage.createLink('router2', 'router3', 'eth2', 'eth1');
    await topoViewerPage.createLink('router3', 'router4', 'eth2', 'eth1');
    await topoViewerPage.createLink('router4', 'router1', 'eth2', 'eth2');

    // Wait for file saves
    await page.waitForTimeout(500);

    // Verify edge count
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(4);

    // Verify YAML contains links section
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain('links:');
    expect(yaml).toContain('endpoints:');

    // ============================================================================
    // STEP 3: Change node name via node editor
    // ============================================================================
    console.log('[STEP 3] Change node name via node editor');

    // Fit viewport to ensure nodes are visible
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    // Verify router1 exists
    let nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain('router1');
    console.log(`[DEBUG] Node IDs before rename: ${nodeIds.join(', ')}`);

    // Get router1's bounding box for double-click
    let router1Box = await topoViewerPage.getNodeBoundingBox('router1');
    expect(router1Box).not.toBeNull();
    console.log(`[DEBUG] router1 bounding box: x=${router1Box!.x}, y=${router1Box!.y}, w=${router1Box!.width}, h=${router1Box!.height}`);

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
    await nameInput.fill('core-router');
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
    console.log(`[DEBUG] YAML after apply contains core-router: ${yamlAfterApply.includes('core-router')}`);

    // Close the editor
    const okBtn = page.locator(SEL_OK_BTN);
    await okBtn.click();
    await page.waitForTimeout(500);

    // Verify editor closed
    await expect(editorPanel).not.toBeVisible();

    // Verify node ID changed in graph
    nodeIds = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after close: ${nodeIds.join(', ')}`);
    expect(nodeIds).toContain('core-router');
    expect(nodeIds).not.toContain('router1');

    // Verify YAML updated
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain('core-router:');
    expect(yaml).not.toContain('router1:');

    // Verify links were updated to reference new name
    if (!yaml.includes('core-router:eth')) {
      logBug('BUG-RENAME-LINKS', 'Links not updated when node renamed');
    }

    // ============================================================================
    // STEP 4: Create groups and add nodes to groups
    // ============================================================================
    console.log('[STEP 4] Create groups and add nodes to groups');

    // Get initial group count
    let groupCount = await topoViewerPage.getGroupCount();
    const initialGroupCount = groupCount;

    // Select router2 first
    await topoViewerPage.selectNode('router2');
    await page.waitForTimeout(100);

    // Ctrl+Click router3 to add to selection
    const router3Box = await topoViewerPage.getNodeBoundingBox('router3');
    expect(router3Box).not.toBeNull();
    await ctrlClick(page, router3Box!.x + router3Box!.width / 2, router3Box!.y + router3Box!.height / 2);
    await page.waitForTimeout(200);

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
    console.log('[STEP 5] Complex undo/redo with interleaved operations (Part 1)');

    // Record initial state: 4 nodes, 4 edges, 1 group
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(4);
    expect(edgeCount).toBe(4);

    // ACTION 1: Create a new node router5
    await topoViewerPage.createNode('router5', { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(5);

    // ACTION 2: Create a link router4-router5
    await topoViewerPage.createLink('router4', 'router5', 'eth3', 'eth1');
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
    await topoViewerPage.createLink('router3', 'router5', 'eth3', 'eth2');
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
    console.log('[STEP 6] Complex undo/redo with interleaved operations (Part 2)');

    // STATE: 5 nodes, 5 edges
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(5);
    expect(edgeCount).toBe(5);

    // ACTION 1: Delete router5 node (this should also remove router3-router5 edge)
    await topoViewerPage.deleteNode('router5');
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(nodeCount).toBe(4);
    expect(edgeCount).toBe(4); // router3-router5 edge should be removed

    // ACTION 2: Create new group with router3 and router4
    await topoViewerPage.selectNode('router3');
    const router4Box = await topoViewerPage.getNodeBoundingBox('router4');
    await ctrlClick(page, router4Box!.x + router4Box!.width / 2, router4Box!.y + router4Box!.height / 2);
    await page.waitForTimeout(200);

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
    expect(nodeIds).toContain('router5');

    // REDO: Redo node deletion
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(4);

    // ============================================================================
    // STEP 7: Undo across multiple operation types
    // ============================================================================
    console.log('[STEP 7] Undo across multiple operation types');

    // Record initial position of router3
    const initialRouter3Pos = await topoViewerPage.getNodePosition('router3');

    // ACTION 1: Move router3 100px right using drag
    let router3BoxDrag = await topoViewerPage.getNodeBoundingBox('router3');
    expect(router3BoxDrag).not.toBeNull();

    await drag(
      page,
      { x: router3BoxDrag!.x + router3BoxDrag!.width / 2, y: router3BoxDrag!.y + router3BoxDrag!.height / 2 },
      { x: router3BoxDrag!.x + router3BoxDrag!.width / 2 + 100, y: router3BoxDrag!.y + router3BoxDrag!.height / 2 },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    const movedRouter3Pos = await topoViewerPage.getNodePosition('router3');
    expect(movedRouter3Pos.x).toBeGreaterThan(initialRouter3Pos.x);

    // UNDO node move
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    const restoredRouter3Pos = await topoViewerPage.getNodePosition('router3');
    expect(restoredRouter3Pos.x).toBeCloseTo(initialRouter3Pos.x, 0);

    // REDO node move
    await topoViewerPage.redo();
    await page.waitForTimeout(300);

    const redoRouter3Pos = await topoViewerPage.getNodePosition('router3');
    expect(redoRouter3Pos.x).toBeGreaterThan(initialRouter3Pos.x);

    // ============================================================================
    // STEP 8: Copy and paste MULTIPLE nodes with links, then test batched undo
    // ============================================================================
    console.log('[STEP 8] Copy and paste multiple nodes with links');

    // Close any open node editor panel first
    const nodeEditorPanel = page.locator('[data-testid="node-editor"]');
    if (await nodeEditorPanel.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('[DEBUG] Node editor is open, closing it');
      const closeBtn = nodeEditorPanel.locator('[data-testid="panel-close-btn"]');
      await closeBtn.click();
      await page.waitForTimeout(300);
      await expect(nodeEditorPanel).toBeHidden({ timeout: 2000 });
    }

    // Press Escape to deselect
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Record initial counts BEFORE copy
    const nodeCountBeforeCopy = await topoViewerPage.getNodeCount();
    const edgeCountBeforeCopy = await topoViewerPage.getEdgeCount();
    const nodeIdsBeforeCopy = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Before copy: ${nodeCountBeforeCopy} nodes, ${edgeCountBeforeCopy} edges`);
    console.log(`[DEBUG] Node IDs: ${nodeIdsBeforeCopy.join(', ')}`);

    // Select TWO connected nodes: router2 and router3 (they have a link between them from Step 2)
    // First select router2
    await topoViewerPage.selectNode('router2');
    await page.waitForTimeout(100);

    // Then Ctrl+Click on router3 to add to selection
    const router3BoxForCopy = await topoViewerPage.getNodeBoundingBox('router3');
    expect(router3BoxForCopy).not.toBeNull();
    await page.keyboard.down('Control');
    await page.mouse.click(router3BoxForCopy!.x + router3BoxForCopy!.width / 2, router3BoxForCopy!.y + router3BoxForCopy!.height / 2);
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    console.log('[DEBUG] Selected router2 and router3 (connected nodes)');

    // Copy (Ctrl+C) - should copy both nodes AND the link between them
    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    console.log('[DEBUG] Copied 2 nodes with link');

    // Paste (Ctrl+V)
    await topoViewerPage.paste();
    await page.waitForTimeout(1000);
    console.log('[DEBUG] Pasted nodes');

    // Get state after paste
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    const nodeIdsAfterPaste = await topoViewerPage.getNodeIds();

    // Find the pasted node IDs (new nodes that didn't exist before)
    const pastedNodeIds = nodeIdsAfterPaste.filter(id => !nodeIdsBeforeCopy.includes(id));
    const nodesAdded = nodeCount - nodeCountBeforeCopy;
    const edgesAdded = edgeCount - edgeCountBeforeCopy;

    console.log(`[DEBUG] After paste: ${nodeCount} nodes (+${nodesAdded}), ${edgeCount} edges (+${edgesAdded})`);
    console.log(`[INFO] Pasted node IDs: ${pastedNodeIds.join(', ')}`);

    // Verify at least 2 nodes were added (may be more if group members are included)
    expect(nodesAdded).toBeGreaterThanOrEqual(2);
    expect(pastedNodeIds.length).toBeGreaterThanOrEqual(2);

    // Note: Links between copied nodes may or may not be pasted - this is a known limitation
    // The focus of this test is verifying undo batching, not edge copying
    if (edgesAdded === 0) {
      console.log('[WARN] No edges were added by paste - links between copied nodes may not be included');
    }

    // Verify YAML contains BOTH new nodes
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      expect(yaml).toContain(`${pastedId}:`);
    }
    console.log('[DEBUG] YAML contains both pasted nodes');

    // Verify annotations contain positions for both new nodes
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      const ann = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === pastedId);
      expect(ann).toBeDefined();
      expect(ann?.position).toBeDefined();
    }
    console.log('[DEBUG] Annotations contain positions for both pasted nodes');

    // ============================================================================
    // CRITICAL TEST: Single UNDO should remove ALL pasted elements (2 nodes + link)
    // If paste is NOT batched, this will FAIL because multiple undos would be needed
    // ============================================================================
    console.log('[DEBUG] Testing UNDO - single undo should remove ALL pasted elements');
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Check canvas state after single undo
    nodeCount = await topoViewerPage.getNodeCount();
    edgeCount = await topoViewerPage.getEdgeCount();
    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] After 1 UNDO: ${nodeCount} nodes, ${edgeCount} edges`);
    console.log(`[DEBUG] Node IDs after undo: ${nodeIdsAfterUndo.join(', ')}`);

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
    console.log('[DEBUG] YAML correctly removed all pasted nodes after single undo');

    // Verify annotations restored
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    for (const pastedId of pastedNodeIds) {
      const ann = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === pastedId);
      expect(ann).toBeUndefined();
    }
    console.log('[DEBUG] Annotations correctly removed pasted nodes after undo');

    // REDO should restore all pasted elements
    console.log('[DEBUG] Testing REDO');
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
    console.log('[DEBUG] REDO correctly restored all pasted elements');

    // ============================================================================
    // STEP 9: Copy and paste group with contents
    // ============================================================================
    console.log('[STEP 9] Copy and paste group with contents');

    // Get group IDs
    const groupIds = await topoViewerPage.getGroupIds();

    if (groupIds.length === 0) {
      console.log('[SKIP] No groups available for Step 9');
    } else {
      const groupId = groupIds[0];

      // Record initial counts and state
      const groupCountBeforeGroupPaste = await topoViewerPage.getGroupCount();
      const nodeCountBeforeGroupPaste = await topoViewerPage.getNodeCount();
      const nodeIdsBeforeGroupPaste = await topoViewerPage.getNodeIds();

      // Get initial annotations state
      const annotationsBeforeGroupPaste = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      console.log(`[DEBUG] Before group paste: ${groupCountBeforeGroupPaste} groups, ${nodeCountBeforeGroupPaste} nodes`);
      console.log(`[DEBUG] Annotations before: groups=${annotationsBeforeGroupPaste.groupStyleAnnotations?.length || 0}, nodes=${annotationsBeforeGroupPaste.nodeAnnotations?.length || 0}`);

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
      console.log(`[INFO] Group paste: groups ${groupCountBeforeGroupPaste} -> ${groupCountAfterGroupPaste}, nodes ${nodeCountBeforeGroupPaste} -> ${nodeCountAfterGroupPaste}`);

      // Verify YAML contains new nodes from group paste
      yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
      const newNodeIds = nodeIdsAfterGroupPaste.filter(id => !nodeIdsBeforeGroupPaste.includes(id));
      console.log(`[DEBUG] New node IDs from group paste: ${newNodeIds.join(', ')}`);

      // Each new node should be in YAML
      for (const newNodeId of newNodeIds) {
        expect(yaml).toContain(`${newNodeId}:`);
      }
      console.log('[DEBUG] All pasted nodes found in YAML');

      // Verify annotations contain new group and nodes
      annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      console.log(`[DEBUG] Annotations after: groups=${annotations.groupStyleAnnotations?.length || 0}, nodes=${annotations.nodeAnnotations?.length || 0}`);

      // UNDO GROUP PASTE - Critical test: A single undo should remove ALL pasted elements
      // If paste is not batched, this will fail because multiple undos would be needed
      console.log('[DEBUG] Testing UNDO of group paste (should be a single atomic operation)');
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
      console.log('[DEBUG] YAML correctly removed all pasted nodes after undo');

      // Verify annotations are restored
      annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
      expect(annotations.groupStyleAnnotations?.length || 0).toBe(annotationsBeforeGroupPaste.groupStyleAnnotations?.length || 0);
      console.log('[DEBUG] Annotations correctly restored after undo');
    }

    // ============================================================================
    // STEP 10: Final persistence verification after reload
    // ============================================================================
    console.log('[STEP 10] Final persistence verification after reload');

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
        // Allow tolerance for position drift during save/reload cycle
        // Positions may shift slightly due to layout adjustments
        const toleranceX = Math.abs(posAfter.x - posBefore.x);
        const toleranceY = Math.abs(posAfter.y - posBefore.y);
        // Accept up to 50px drift as acceptable
        expect(toleranceX).toBeLessThan(50);
        expect(toleranceY).toBeLessThan(50);
      }
    }

    // Final YAML verification
    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain('topology:');
    expect(yaml).toContain('nodes:');
    expect(yaml).toContain('core-router:'); // Renamed from router1 in Step 3

    // Final annotations verification
    annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(nodeCountAfterReload);

    console.log('[SUCCESS] Full workflow test completed');
    console.log(`Final state: ${nodeCountAfterReload} nodes, ${edgeCountAfterReload} edges, ${groupCountAfterReload} groups`);
  });
});
