import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { shiftClick } from "../helpers/react-flow-helpers";

const TOPOLOGY_FILE = "empty.clab.yml";
const KIND = "nokia_srlinux";

// Selectors
const SEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';
const SEL_PANEL_TOGGLE_BTN = '[data-testid="panel-toggle-btn"]';
const SEL_PANEL_TAB_BASIC = '[data-testid="panel-tab-basic"]';
const SEL_NODE_NAME = "#node-name";

const CORE_ROUTER = "core-router";
const CORE_ROUTER_YAML_KEY = `${CORE_ROUTER}:`;

async function clickNode(page: Page, nodeId: string): Promise<void> {
  const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
  await nodeHandle.scrollIntoViewIfNeeded();
  await expect(nodeHandle).toBeVisible({ timeout: 3000 });
  const box = await nodeHandle.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

async function returnToPalette(page: Page): Promise<void> {
  const search = page.getByPlaceholder("Search nodes...");
  if (await search.isVisible().catch(() => false)) return;

  const toggle = page.locator(SEL_PANEL_TOGGLE_BTN);
  await expect(toggle).toBeVisible({ timeout: 3000 });
  await toggle.click();
  await page.waitForTimeout(200);
  await toggle.click();
  await expect(search).toBeVisible({ timeout: 5000 });
}

/**
 * Full Workflow E2E Test (MUI version)
 *
 * Tests a complete multi-step workflow: create nodes, link them,
 * edit properties, verify YAML, undo/redo.
 */
test.describe("Full Workflow", () => {
  test("create nodes, link, edit, and verify YAML", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Step 1: Create nodes
    await topoViewerPage.createNode("router1", { x: 200, y: 100 }, KIND);
    await topoViewerPage.createNode("router2", { x: 400, y: 100 }, KIND);
    await page.waitForTimeout(300);

    await expect.poll(() => topoViewerPage.getNodeCount()).toBe(2);

    // Step 2: Create link
    await topoViewerPage.createLink("router1", "router2", "e1-1", "e1-1");
    await page.waitForTimeout(300);

    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(1);

    // Verify YAML has both nodes and link
    let yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("router1:");
    expect(yaml).toContain("router2:");
    expect(yaml).toContain("endpoints:");

    // Step 3: Edit node kind via editor
    await clickNode(page, "router1");
    await expect(page.locator(SEL_PANEL_TAB_BASIC)).toBeVisible({ timeout: 3000 });

    const kindField = page.locator("#node-kind");
    await kindField.clear();
    await kindField.fill("linux");
    await kindField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("kind: linux");

    // Step 4: Undo the kind change
    await returnToPalette(page);
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain(`kind: ${KIND}`);

    // Step 5: Redo the kind change
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("kind: linux");
  });

  test("node rename updates YAML and graph", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await topoViewerPage.createNode("router1", { x: 200, y: 100 }, KIND);
    await page.waitForTimeout(300);

    // Open editor and rename
    await clickNode(page, "router1");
    await expect(page.locator(SEL_PANEL_TAB_BASIC)).toBeVisible({ timeout: 3000 });

    const nameField = page.locator(SEL_NODE_NAME);
    await nameField.clear();
    await nameField.fill(CORE_ROUTER);
    await nameField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Verify YAML has new name
    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain(CORE_ROUTER_YAML_KEY);
    expect(yaml).not.toContain("router1:");

    // Verify graph has new name
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(CORE_ROUTER);
    expect(nodeIds).not.toContain("router1");
  });
});

/**
 * Integration-style suite migrated from deprecated specs.
 * Uses serial execution and larger timeouts, since it exercises many interacting features.
 */
test.describe.serial("Full Workflow E2E Test (Integration)", () => {
  test.setTimeout(180000);

  const NODE_POSITIONS = {
    router1: { x: 200, y: 100 },
    router2: { x: 400, y: 100 },
    router3: { x: 400, y: 300 },
    router4: { x: 200, y: 300 }
  };

  async function setup(topoViewerPage: any) {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  }

  async function createInitialNodes(page: Page, topoViewerPage: any) {
    for (const [nodeId, pos] of Object.entries(NODE_POSITIONS)) {
      await topoViewerPage.createNode(nodeId, pos, KIND);
    }
    await page.waitForTimeout(500);
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 10000 }).toBe(4);
  }

  async function createInitialLinks(page: Page, topoViewerPage: any) {
    await topoViewerPage.createLink("router1", "router2", "eth1", "eth1");
    await topoViewerPage.createLink("router2", "router3", "eth2", "eth1");
    await topoViewerPage.createLink("router3", "router4", "eth2", "eth1");
    await topoViewerPage.createLink("router4", "router1", "eth2", "eth2");
    await page.waitForTimeout(500);
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 10000 }).toBe(4);
  }

  test("1. Create nodes and verify YAML persistence", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    expect(await topoViewerPage.getNodeCount()).toBe(0);

    await createInitialNodes(page, topoViewerPage);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    for (const nodeId of Object.keys(NODE_POSITIONS)) {
      expect(yaml).toContain(`${nodeId}:`);
    }

    const annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    expect(annotations.nodeAnnotations?.length).toBe(4);
  });

  test("2. Create links between nodes", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);

    expect(await topoViewerPage.getEdgeCount()).toBe(0);
    await createInitialLinks(page, topoViewerPage);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain("links:");
    expect(yaml).toContain("router1:eth1");
    expect(yaml).toContain("router2:eth1");
  });

  test("3. Rename node via editor", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    await clickNode(page, "router1");
    await expect(page.getByText("Node Editor", { exact: true })).toBeVisible({ timeout: 5000 });

    const nameField = page.locator(SEL_NODE_NAME);
    await nameField.clear();
    await nameField.fill(CORE_ROUTER);
    await nameField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await expect.poll(() => topoViewerPage.getYamlFromFile(TOPOLOGY_FILE), { timeout: 10000 }).toContain(
      CORE_ROUTER_YAML_KEY
    );

    await returnToPalette(page);

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(CORE_ROUTER);
    expect(nodeIds).not.toContain("router1");
  });

  test("4. Create group from selected nodes", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);
    await topoViewerPage.fit();

    const initialGroupCount = await topoViewerPage.getGroupCount();

    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(200);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();
    await shiftClick(page, router3Box!.x + router3Box!.width / 2, router3Box!.y + router3Box!.height / 2);
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 10000 }).toBe(initialGroupCount + 1);

    // A single undo must fully remove the group (not require two undos).
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 10000 }).toBe(initialGroupCount);

    // A single redo must fully restore the group.
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 10000 }).toBe(initialGroupCount + 1);

  });

  test("5-6. Complex undo/redo with interleaved operations", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    await topoViewerPage.createNode("router5", { x: 300, y: 200 }, KIND);
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 10000 }).toBe(5);

    await topoViewerPage.createLink("router4", "router5", "eth3", "eth1");
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 10000 }).toBe(5);

    // Undo link, create different link.
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 10000 }).toBe(4);

    await topoViewerPage.createLink("router3", "router5", "eth3", "eth2");
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 10000 }).toBe(5);

    // Redo should have no effect because redo stack is cleared by the new link creation.
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 5000 }).toBe(5);

    await topoViewerPage.deleteNode("router5");
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 10000 }).toBe(4);
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 10000 }).toBe(4);

    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 10000 }).toBe(5);

    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 10000 }).toBe(4);
  });

  test("7. Undo/redo node drag", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    const initialPos = await topoViewerPage.getNodePosition("router3");
    await topoViewerPage.dragNode("router3", { x: 120, y: 0 });
    await page.waitForTimeout(400);

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
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);
    await topoViewerPage.fit();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const nodeCountBefore = await topoViewerPage.getNodeCount();
    const edgeCountBefore = await topoViewerPage.getEdgeCount();
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();
    await shiftClick(page, router3Box!.x + router3Box!.width / 2, router3Box!.y + router3Box!.height / 2);
    await page.waitForTimeout(200);

    await topoViewerPage.copy();
    await topoViewerPage.paste();
    await page.waitForTimeout(1200);

    const nodeCountAfter = await topoViewerPage.getNodeCount();
    const edgeCountAfter = await topoViewerPage.getEdgeCount();
    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const pastedNodeIds = nodeIdsAfter.filter((id: string) => !nodeIdsBefore.includes(id));

    expect(nodeCountAfter - nodeCountBefore).toBe(2);
    expect(edgeCountAfter - edgeCountBefore).toBe(1);

    // Undo until pasted nodes are removed.
    let currentNodeCount = await topoViewerPage.getNodeCount();
    let steps = 0;
    while (currentNodeCount > nodeCountBefore && steps < 6) {
      await topoViewerPage.undo();
      await page.waitForTimeout(500);
      currentNodeCount = await topoViewerPage.getNodeCount();
      steps++;
    }

    expect(await topoViewerPage.getEdgeCount()).toBe(edgeCountBefore);
    expect(currentNodeCount).toBe(nodeCountBefore);

    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    for (const pastedId of pastedNodeIds) {
      expect(nodeIdsAfterUndo).not.toContain(pastedId);
    }
  });

  test("9. Copy/paste group with batched undo", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);
    await topoViewerPage.fit();

    // Create a group with router2 + router3.
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    expect(router3Box).not.toBeNull();
    await shiftClick(page, router3Box!.x + router3Box!.width / 2, router3Box!.y + router3Box!.height / 2);
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await page.waitForTimeout(700);

    const groupIds = await topoViewerPage.getGroupIds();
    expect(groupIds.length).toBeGreaterThan(0);

    const groupCountBefore = await topoViewerPage.getGroupCount();
    const nodeCountBefore = await topoViewerPage.getNodeCount();
    const nodeIdsBefore = await topoViewerPage.getNodeIds();

    await topoViewerPage.selectGroup(groupIds[0]);
    await page.waitForTimeout(200);
    await topoViewerPage.copy();
    await topoViewerPage.paste();
    await page.waitForTimeout(1200);

    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const newNodeIds = nodeIdsAfter.filter((id: string) => !nodeIdsBefore.includes(id));
    expect(newNodeIds.length).toBeGreaterThan(0);

    // Undo until pasted group and nodes are removed.
    let currentGroupCount = await topoViewerPage.getGroupCount();
    let currentNodeCount = await topoViewerPage.getNodeCount();
    let steps = 0;
    while ((currentGroupCount > groupCountBefore || currentNodeCount > nodeCountBefore) && steps < 10) {
      await topoViewerPage.undo();
      await page.waitForTimeout(500);
      currentGroupCount = await topoViewerPage.getGroupCount();
      currentNodeCount = await topoViewerPage.getNodeCount();
      steps++;
    }

    expect(currentGroupCount).toBe(groupCountBefore);
    expect(currentNodeCount).toBe(nodeCountBefore);
  });

  test("10. Persistence verification after reload", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await createInitialLinks(page, topoViewerPage);

    // Rename router1
    await topoViewerPage.fit();
    await page.waitForTimeout(500);
    await clickNode(page, "router1");
    await expect(page.getByText("Node Editor", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.locator(SEL_NODE_NAME).fill(CORE_ROUTER);
    await page.locator(SEL_APPLY_BTN).click();
    await returnToPalette(page);
    await page.waitForTimeout(500);

    // Reload file
    await topoViewerPage.gotoFile(TOPOLOGY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await page.waitForTimeout(700);

    const nodeIds = await topoViewerPage.getNodeIds();
    for (const nodeId of [CORE_ROUTER, "router2", "router3", "router4"]) {
      expect(nodeIds).toContain(nodeId);
    }
    expect(await topoViewerPage.getEdgeCount()).toBeGreaterThanOrEqual(4);

    const yaml = await topoViewerPage.getYamlFromFile(TOPOLOGY_FILE);
    expect(yaml).toContain(CORE_ROUTER_YAML_KEY);
  });

  test("11. Nested groups", async ({ page, topoViewerPage }) => {
    await setup(topoViewerPage);
    await createInitialNodes(page, topoViewerPage);
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    const groupCountBefore = await topoViewerPage.getGroupCount();

    // Outer group: router2, router3, router4
    await topoViewerPage.selectNode("router2");
    await page.waitForTimeout(100);
    const router3Box = await topoViewerPage.getNodeBoundingBox("router3");
    const router4Box = await topoViewerPage.getNodeBoundingBox("router4");
    expect(router3Box).not.toBeNull();
    expect(router4Box).not.toBeNull();
    await shiftClick(page, router3Box!.x + router3Box!.width / 2, router3Box!.y + router3Box!.height / 2);
    await shiftClick(page, router4Box!.x + router4Box!.width / 2, router4Box!.y + router4Box!.height / 2);
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 10000 }).toBe(groupCountBefore + 1);
    const outerGroupIds = await topoViewerPage.getGroupIds();
    const outerGroupId = outerGroupIds[outerGroupIds.length - 1];

    // Inner group: router3
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await topoViewerPage.selectNode("router3");
    await page.waitForTimeout(200);
    await topoViewerPage.createGroup();

    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 10000 }).toBe(groupCountBefore + 2);
    const innerGroupIds = await topoViewerPage.getGroupIds();
    const innerGroupId = innerGroupIds.find((id: string) => id !== outerGroupId);
    expect(innerGroupId).toBeDefined();

    const annotations = await topoViewerPage.getAnnotationsFromFile(TOPOLOGY_FILE);
    const innerGroup = annotations.groupStyleAnnotations?.find((g: any) => g.id === innerGroupId);
    expect(innerGroup).toBeDefined();
    expect(innerGroup?.parentId).toBe(outerGroupId);
  });
});
