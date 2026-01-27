import type { Page, Locator } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { drag, shiftClick } from "../helpers/react-flow-helpers";

/**
 * Full Workflow E2E Test Suite
 *
 * Tests split into focused test cases to manage complexity.
 * Each test builds on the previous state via serial execution.
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
const SEL_PANEL_CLOSE_BTN = '[data-testid="panel-close-btn"]';

// Shared types
interface Annotations {
  nodeAnnotations?: Array<{ id: string; position?: { x: number; y: number }; group?: string }>;
  groupStyleAnnotations?: Array<{ id: string; name?: string; parentId?: string }>;
}

// Node positions for the test topology
const NODE_POSITIONS = {
  router1: { x: 200, y: 100 },
  router2: { x: 400, y: 100 },
  router3: { x: 400, y: 300 },
  router4: { x: 200, y: 300 }
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateNodeInYaml(yaml: string, nodeId: string, expectedKind: string): void {
  expect(yaml).toContain(`${nodeId}:`);
  const kindPattern = new RegExp(`${nodeId}:[\\s\\S]*?kind:\\s*${expectedKind}`, "m");
  expect(yaml).toMatch(kindPattern);
}

function validateLinkInYaml(
  yaml: string,
  source: string,
  target: string,
  srcEp: string,
  tgtEp: string
): void {
  expect(yaml).toContain(`${source}:${srcEp}`);
  expect(yaml).toContain(`${target}:${tgtEp}`);
}

function validateNodePosition(
  annotations: Annotations,
  nodeId: string,
  expected: { x: number; y: number },
  tolerance = 20
): void {
  const ann = annotations.nodeAnnotations?.find((n) => n.id === nodeId);
  expect(ann).toBeDefined();
  if (ann?.position) {
    expect(Math.abs(ann.position.x - expected.x)).toBeLessThan(tolerance);
    expect(Math.abs(ann.position.y - expected.y)).toBeLessThan(tolerance);
  }
}

async function closeEditorIfVisible(page: Page, editorPanel: Locator): Promise<void> {
  const isVisible = await editorPanel.isVisible().catch(() => false);
  if (isVisible) {
    await editorPanel.locator(SEL_PANEL_CLOSE_BTN).click();
    await page.waitForTimeout(200);
  }
}

// ============================================================================
// SETUP HELPER - creates initial topology state
// ============================================================================

interface TopoViewerPage {
  resetFiles(): Promise<void>;
  gotoFile(filename: string): Promise<void>;
  waitForCanvasReady(): Promise<void>;
  setEditMode(): Promise<void>;
  unlock(): Promise<void>;
  fit(): Promise<void>;
  getNodeCount(): Promise<number>;
  getEdgeCount(): Promise<number>;
  getGroupCount(): Promise<number>;
  getNodeIds(): Promise<string[]>;
  getGroupIds(): Promise<string[]>;
  getSelectedNodeIds(): Promise<string[]>;
  createNode(nodeId: string, position: { x: number; y: number }, kind: string): Promise<void>;
  createLink(source: string, target: string, srcEp: string, tgtEp: string): Promise<void>;
  getYamlFromFile(filename: string): Promise<string>;
  getAnnotationsFromFile(filename: string): Promise<Annotations>;
  getNodeBoundingBox(
    nodeId: string
  ): Promise<{ x: number; y: number; width: number; height: number } | null>;
  getNodePosition(nodeId: string): Promise<{ x: number; y: number }>;
  selectNode(nodeId: string): Promise<void>;
  selectGroup(groupId: string): Promise<void>;
  createGroup(): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  copy(): Promise<void>;
  paste(): Promise<void>;
}

async function setupTopology(page: Page, topoViewerPage: TopoViewerPage): Promise<void> {
  await topoViewerPage.resetFiles();
  await topoViewerPage.gotoFile(TOPOLOGY_FILE);
  await topoViewerPage.waitForCanvasReady();
  await topoViewerPage.setEditMode();
  await topoViewerPage.unlock();
}

async function createInitialNodes(page: Page, topoViewerPage: TopoViewerPage): Promise<void> {
  for (const [nodeId, position] of Object.entries(NODE_POSITIONS)) {
    await topoViewerPage.createNode(nodeId, position, KIND_NOKIA_SRLINUX);
  }
  await page.waitForTimeout(500);
}

async function createInitialLinks(page: Page, topoViewerPage: TopoViewerPage): Promise<void> {
  await topoViewerPage.createLink("router1", "router2", "eth1", "eth1");
  await topoViewerPage.createLink("router2", "router3", "eth2", "eth1");
  await topoViewerPage.createLink("router3", "router4", "eth2", "eth1");
  await topoViewerPage.createLink("router4", "router1", "eth2", "eth2");
  await page.waitForTimeout(500);
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe.serial("Full Workflow E2E Test", () => {
  test.setTimeout(120000);

  test("1. Create nodes and verify YAML persistence", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    expect(await topoViewerPage.getNodeCount()).toBe(0);

    await createInitialNodes(page, topoViewerPage);
    expect(await topoViewerPage.getNodeCount()).toBe(4);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const nodeId of Object.keys(NODE_POSITIONS)) {
      validateNodeInYaml(yaml, nodeId, KIND_NOKIA_SRLINUX);
    }
    expect(yaml).toContain("image:");

    const annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(4);
    for (const [nodeId, position] of Object.entries(NODE_POSITIONS)) {
      validateNodePosition(annotations, nodeId, position, 50);
    }
  });

  test("2. Create links between nodes", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);

    expect(await topoViewerPage.getEdgeCount()).toBe(0);
    await createInitialLinks(page, topoViewerPage);
    expect(await topoViewerPage.getEdgeCount()).toBe(4);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("links:");
    validateLinkInYaml(yaml, "router1", "router2", "eth1", "eth1");
    validateLinkInYaml(yaml, "router2", "router3", "eth2", "eth1");
    validateLinkInYaml(yaml, "router3", "router4", "eth2", "eth1");
    validateLinkInYaml(yaml, "router4", "router1", "eth2", "eth2");
  });

  test("3. Rename node via editor", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    const router1Box = await topoViewerPage.getNodeBoundingBox("router1");
    expect(router1Box).not.toBeNull();

    await page.mouse.dblclick(
      router1Box!.x + router1Box!.width / 2,
      router1Box!.y + router1Box!.height / 2
    );
    await page.waitForTimeout(1000);

    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await expect(editorPanel).toBeVisible();

    await page.locator(SEL_NODE_NAME).clear();
    await page.locator(SEL_NODE_NAME).fill(RENAMED_NODE);
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(2000);
    await page.locator(SEL_OK_BTN).click();
    await page.waitForTimeout(500);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(RENAMED_NODE);
    expect(nodeIds).not.toContain("router1");

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain(`${RENAMED_NODE}:`);
    expect(yaml).not.toContain("router1:");
  });

  test("4. Create group from selected nodes", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    const initialGroupCount = await topoViewerPage.getGroupCount();

    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(300);

    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();
    await shiftClick(
      page,
      router3Box!.x + router3Box!.width / 2,
      router3Box!.y + router3Box!.height / 2
    );
    await page.waitForTimeout(200);

    const editorPanel = page.locator(SEL_NODE_EDITOR);
    await closeEditorIfVisible(page, editorPanel);

    expect((await topoViewerPage.getSelectedNodeIds()).length).toBe(2);

    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    expect(await topoViewerPage.getGroupCount()).toBe(initialGroupCount + 1);
  });

  test("5-6. Complex undo/redo with interleaved operations", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    // Create router5 and link
    await topoViewerPage.createNode("router5", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getNodeCount()).toBe(5);

    await topoViewerPage.createLink("router4", "router5", "eth3", "eth1");
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getEdgeCount()).toBe(5);

    // Undo link, create different link
    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    expect(await topoViewerPage.getEdgeCount()).toBe(4);

    await topoViewerPage.createLink("router3", "router5", "eth3", "eth2");
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getEdgeCount()).toBe(5);

    // Redo should have no effect (redo stack cleared)
    await topoViewerPage.redo();
    await page.waitForTimeout(300);
    expect(await topoViewerPage.getEdgeCount()).toBe(5);

    // Delete router5
    await topoViewerPage.deleteNode("router5");
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getNodeCount()).toBe(4);
    expect(await topoViewerPage.getEdgeCount()).toBe(4);

    // Undo deletion
    await topoViewerPage.undo();
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getNodeCount()).toBe(5);
    expect(await topoViewerPage.getNodeIds()).toContain("router5");

    // Redo deletion
    await topoViewerPage.redo();
    await page.waitForTimeout(500);
    expect(await topoViewerPage.getNodeCount()).toBe(4);
  });

  test("7. Undo/redo node drag", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    const initialPos = await topoViewerPage.getNodePosition("router3");
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();

    await drag(
      page,
      { x: router3Box!.x + router3Box!.width / 2, y: router3Box!.y + router3Box!.height / 2 },
      { x: router3Box!.x + router3Box!.width / 2 + 100, y: router3Box!.y + router3Box!.height / 2 },
      { steps: 10 }
    );
    await page.waitForTimeout(500);

    const movedPos = await topoViewerPage.getNodePosition("router3");
    expect(movedPos.x).toBeGreaterThan(initialPos.x);

    await topoViewerPage.undo();
    await page.waitForTimeout(300);
    const restoredPos = await topoViewerPage.getNodePosition("router3");
    expect(restoredPos.x).toBeCloseTo(initialPos.x, 0);

    await topoViewerPage.redo();
    await page.waitForTimeout(300);
    const redoPos = await topoViewerPage.getNodePosition("router3");
    expect(redoPos.x).toBeGreaterThan(initialPos.x);
  });

  test("8. Copy/paste multiple nodes with batched undo", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const nodeCountBefore = await topoViewerPage.getNodeCount();
    const edgeCountBefore = await topoViewerPage.getEdgeCount();
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    // Select router2 and router3
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    await shiftClick(
      page,
      router3Box!.x + router3Box!.width / 2,
      router3Box!.y + router3Box!.height / 2
    );
    await page.waitForTimeout(200);

    await topoViewerPage.copy();
    await page.waitForTimeout(300);
    await topoViewerPage.paste();
    await page.waitForTimeout(1000);

    const nodeCountAfter = await topoViewerPage.getNodeCount();
    const edgeCountAfter = await topoViewerPage.getEdgeCount();
    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const pastedNodeIds = nodeIdsAfter.filter((id) => !nodeIdsBefore.includes(id));

    expect(nodeCountAfter - nodeCountBefore).toBe(2);
    expect(edgeCountAfter - edgeCountBefore).toBe(1);

    // Single undo should remove ALL pasted elements
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    expect(await topoViewerPage.getNodeCount()).toBe(nodeCountBefore);
    expect(await topoViewerPage.getEdgeCount()).toBe(edgeCountBefore);

    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    for (const pastedId of pastedNodeIds) {
      expect(nodeIdsAfterUndo).not.toContain(pastedId);
    }
  });

  test("9. Copy/paste group with batched undo", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    // Create a group first
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(300);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    await shiftClick(
      page,
      router3Box!.x + router3Box!.width / 2,
      router3Box!.y + router3Box!.height / 2
    );
    await page.waitForTimeout(200);
    await closeEditorIfVisible(page, page.locator(SEL_NODE_EDITOR));
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    const groupIds = await topoViewerPage.getGroupIds();
    expect(groupIds.length).toBeGreaterThan(0);

    const groupCountBefore = await topoViewerPage.getGroupCount();
    const nodeCountBefore = await topoViewerPage.getNodeCount();
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    await topoViewerPage.selectGroup(groupIds[0]);
    await page.waitForTimeout(200);
    await topoViewerPage.copy();
    await page.waitForTimeout(200);
    await topoViewerPage.paste();
    await page.waitForTimeout(1000);

    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const newNodeIds = nodeIdsAfter.filter((id) => !nodeIdsBefore.includes(id));

    // Single undo should remove ALL pasted elements
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    expect(await topoViewerPage.getGroupCount()).toBe(groupCountBefore);
    expect(await topoViewerPage.getNodeCount()).toBe(nodeCountBefore);

    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    for (const newNodeId of newNodeIds) {
      expect(nodeIdsAfterUndo).not.toContain(newNodeId);
    }
  });

  test("10. Persistence verification after reload", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    // Rename router1 to core-router
    await topoViewerPage.fit();
    await page.waitForTimeout(500);
    const router1Box = await topoViewerPage.getNodeBoundingBox("router1");
    await page.mouse.dblclick(
      router1Box!.x + router1Box!.width / 2,
      router1Box!.y + router1Box!.height / 2
    );
    await page.waitForTimeout(1000);
    await page.locator(SEL_NODE_NAME).clear();
    await page.locator(SEL_NODE_NAME).fill(RENAMED_NODE);
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(2000);
    await page.locator(SEL_OK_BTN).click();
    await page.waitForTimeout(500);

    // Reload
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const nodeIds = await topoViewerPage.getNodeIds();
    const coreNodes = [RENAMED_NODE, "router2", "router3", "router4"];
    for (const nodeId of coreNodes) {
      expect(nodeIds).toContain(nodeId);
    }

    expect(await topoViewerPage.getEdgeCount()).toBeGreaterThanOrEqual(4);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("topology:");
    expect(yaml).toContain(`${RENAMED_NODE}:`);
  });

  test("11. Nested groups", async ({ page, topoViewerPage }) => {
    await setupTopology(page, topoViewerPage);
    await createInitialNodes(page, topoViewerPage);

    const groupCountBefore = await topoViewerPage.getGroupCount();

    // Create outer group with router2, router3, router4
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    await shiftClick(
      page,
      router3Box!.x + router3Box!.width / 2,
      router3Box!.y + router3Box!.height / 2
    );
    const router4Box = await topoViewerPage.getNodeBoundingBox("router4");
    await shiftClick(
      page,
      router4Box!.x + router4Box!.width / 2,
      router4Box!.y + router4Box!.height / 2
    );
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    await expect
      .poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 })
      .toBe(groupCountBefore + 1);
    const outerGroupIds = await topoViewerPage.getGroupIds();
    const outerGroupId = outerGroupIds[outerGroupIds.length - 1];

    // Create inner group with just router3
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await topoViewerPage.selectNode("router3");
    await page.waitForTimeout(200);
    await topoViewerPage.createGroup();
    await page.waitForTimeout(500);

    await expect
      .poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 })
      .toBe(groupCountBefore + 2);

    const innerGroupIds = await topoViewerPage.getGroupIds();
    const innerGroupId = innerGroupIds.find(
      (id) => id !== outerGroupId && !outerGroupIds.slice(0, -1).includes(id)
    );

    const annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const innerGroup = annotations.groupStyleAnnotations?.find((g) => g.id === innerGroupId);
    expect(innerGroup).toBeDefined();
    expect(innerGroup?.parentId).toBe(outerGroupId);
  });
});
