import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { shiftClick, rightClick } from "../helpers/react-flow-helpers";

// Test file names for file-based tests
const TOPOLOGY_FILE = "empty.clab.yml";
const SPINE_LEAF_FILE = "spine-leaf.clab.yml";
const DATACENTER_FILE = "datacenter.clab.yml";

const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';

type NodeBox = { x: number; y: number; width: number; height: number };

type GroupSelectionApi = {
  clearSelection: () => Promise<void>;
  selectNode: (nodeId: string) => Promise<void>;
  getNodeBoundingBox: (nodeId: string) => Promise<NodeBox | null>;
};

type GroupCreationApi = GroupSelectionApi & {
  createGroup: () => Promise<void>;
  getGroupIds: () => Promise<string[]>;
  getGroupCount: () => Promise<number>;
};

type GroupPromotionSnapshot = {
  innerExists: boolean;
  childParent: string | null;
  nodeCGroup: string | null;
  nodeDGroup: string | null;
  textGroup: string | null;
  shapeGroup: string | null;
};

type AnnotationsApi = {
  getAnnotationsFromFile: (filename: string) => Promise<{
    nodeAnnotations?: Array<{ id: string; groupId?: string }>;
    freeTextAnnotations?: Array<{ id: string; text: string; groupId?: string }>;
    freeShapeAnnotations?: Array<{ id: string; shapeType: string; groupId?: string }>;
    groupStyleAnnotations?: Array<{ id: string; name: string; parentId?: string }>;
  }>;
};

type TopoViewerPage = GroupCreationApi &
  AnnotationsApi & {
    resetFiles: () => Promise<void>;
    gotoFile: (filename: string) => Promise<void>;
    waitForCanvasReady: () => Promise<void>;
    setEditMode: () => Promise<void>;
    unlock: () => Promise<void>;
    createNode: (
      nodeId: string,
      position: { x: number; y: number },
      kind?: string
    ) => Promise<void>;
    fit: () => Promise<void>;
    undo: () => Promise<void>;
    writeAnnotationsFile: (filename: string, content: object) => Promise<void>;
  };

async function selectNodes(
  page: Page,
  topoViewerPage: GroupSelectionApi,
  nodeIds: string[]
): Promise<void> {
  await topoViewerPage.clearSelection();
  await topoViewerPage.selectNode(nodeIds[0]);
  for (const nodeId of nodeIds.slice(1)) {
    const box = await topoViewerPage.getNodeBoundingBox(nodeId);
    expect(box).not.toBeNull();
    // React Flow uses Shift for multi-select
    await shiftClick(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await page.waitForTimeout(200);
}

async function createGroupFromNodes(
  page: Page,
  topoViewerPage: GroupCreationApi,
  nodeIds: string[]
): Promise<string> {
  const groupIdsBefore = await topoViewerPage.getGroupIds();
  await selectNodes(page, topoViewerPage, nodeIds);
  await topoViewerPage.createGroup();

  await expect
    .poll(() => topoViewerPage.getGroupCount(), {
      timeout: 5000,
      message: "Expected group count to increase"
    })
    .toBe(groupIdsBefore.length + 1);

  const groupIdsAfter = await topoViewerPage.getGroupIds();
  const newGroupId = groupIdsAfter.find((id) => !groupIdsBefore.includes(id));
  expect(newGroupId).toBeDefined();
  return newGroupId!;
}

async function openGroupContextMenu(page: Page, groupId: string): Promise<void> {
  const label = page.locator(`[data-testid="group-label-${groupId}"]`);
  await label.waitFor({ state: "visible", timeout: 5000 });
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  await rightClick(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
}

function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

async function getGroupPromotionSnapshot(
  api: TopoViewerPage,
  ids: {
    innerGroupId: string;
    childGroupId: string;
    textAnnotationId: string;
    shapeAnnotationId: string;
  }
): Promise<GroupPromotionSnapshot> {
  const annotations = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
  const groups = annotations.groupStyleAnnotations ?? [];
  const nodes = annotations.nodeAnnotations ?? [];
  const texts = annotations.freeTextAnnotations ?? [];
  const shapes = annotations.freeShapeAnnotations ?? [];

  return {
    innerExists: groups.some((group) => group.id === ids.innerGroupId),
    childParent: findById(groups, ids.childGroupId)?.parentId ?? null,
    nodeCGroup: findById(nodes, "node-c")?.groupId ?? null,
    nodeDGroup: findById(nodes, "node-d")?.groupId ?? null,
    textGroup: findById(texts, ids.textAnnotationId)?.groupId ?? null,
    shapeGroup: findById(shapes, ids.shapeAnnotationId)?.groupId ?? null
  };
}

test.describe("Group Operations", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("gets group IDs", async ({ topoViewerPage }) => {
    const groupIds = await topoViewerPage.getGroupIds();
    const groupCount = await topoViewerPage.getGroupCount();
    expect(groupIds.length).toBe(groupCount);
  });

  test("creates group via Ctrl+G with selected nodes", async ({ page, topoViewerPage }) => {
    const initialGroupCount = await topoViewerPage.getGroupCount();
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select first node
    await topoViewerPage.selectNode(nodeIds[0]);

    // Ctrl+Click second node to add to selection
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();

    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    console.log(`[DEBUG] Selected IDs: ${selectedIds.join(", ")}`);
    console.log(`[DEBUG] Initial group count: ${initialGroupCount}`);
    expect(selectedIds.length).toBe(2);

    // Press Ctrl+G to create group using the fixture helper
    await topoViewerPage.createGroup();

    const newGroupCount = await topoViewerPage.getGroupCount();
    console.log(`[DEBUG] New group count: ${newGroupCount}`);
    expect(newGroupCount).toBe(initialGroupCount + 1);
  });

  test("group persists after all members are deleted", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    const initialGroupCount = await topoViewerPage.getGroupCount();
    const node1 = nodeIds[0];
    const node2 = nodeIds[1];

    // Select two nodes
    await topoViewerPage.selectNode(node1);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(node2);
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    // Create group using the fixture helper
    await topoViewerPage.createGroup();

    const groupCountAfterCreate = await topoViewerPage.getGroupCount();
    expect(groupCountAfterCreate).toBe(initialGroupCount + 1);

    // Delete first node
    await topoViewerPage.selectNode(node1);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Delete second node
    await topoViewerPage.selectNode(node2);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Group should persist even after all members are deleted (intended behavior)
    const groupCountAfterDelete = await topoViewerPage.getGroupCount();
    expect(groupCountAfterDelete).toBe(initialGroupCount + 1);
  });
});

test.describe("Group Operations - Membership promotions", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    const api = topoViewerPage as TopoViewerPage;
    await api.resetFiles();
    await api.gotoFile(TOPOLOGY_FILE);
    await api.waitForCanvasReady();
    await api.setEditMode();
    await api.unlock();
  });

  test("deleting a nested group promotes members, child groups, and annotations", async ({
    page,
    topoViewerPage
  }) => {
    const api = topoViewerPage as TopoViewerPage;
    const nodes = [
      { id: "node-a", position: { x: 100, y: 100 } },
      { id: "node-b", position: { x: 500, y: 400 } },
      { id: "node-c", position: { x: 200, y: 200 } },
      { id: "node-d", position: { x: 420, y: 320 } }
    ];

    for (const node of nodes) {
      await api.createNode(node.id, node.position);
    }
    await api.fit();

    const outerGroupId = await createGroupFromNodes(page, api, ["node-a", "node-b"]);
    const innerGroupId = await createGroupFromNodes(page, api, ["node-c", "node-d"]);

    await expect
      .poll(
        async () => {
          const annotations = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
          return (
            annotations.groupStyleAnnotations?.find((g) => g.id === innerGroupId)?.parentId ?? null
          );
        },
        { timeout: 5000, message: "Expected inner group to be nested under outer group" }
      )
      .toBe(outerGroupId);

    const annotationsBeforeWrite = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
    const innerGroup = annotationsBeforeWrite.groupStyleAnnotations?.find(
      (group) => group.id === innerGroupId
    );
    expect(innerGroup).toBeDefined();
    const nodeAnnotations = [...(annotationsBeforeWrite.nodeAnnotations ?? [])];
    const ensureNodeMembership = (nodeId: string): void => {
      const existing = nodeAnnotations.find((node) => node.id === nodeId);
      if (existing) {
        existing.groupId = innerGroupId;
        existing.group = innerGroup!.name;
        existing.level = innerGroup!.level;
        return;
      }
      nodeAnnotations.push({
        id: nodeId,
        groupId: innerGroupId,
        group: innerGroup!.name,
        level: innerGroup!.level
      });
    };
    ensureNodeMembership("node-c");
    ensureNodeMembership("node-d");
    const childGroupId = `group-${Date.now()}`;
    const childGroup = {
      ...innerGroup!,
      id: childGroupId,
      name: `${innerGroup!.name}-child`,
      parentId: innerGroupId,
      position: { ...innerGroup!.position },
      width: 120,
      height: 80,
      zIndex: (innerGroup!.zIndex ?? 0) + 1
    };
    const textAnnotationId = `text-${Date.now()}`;
    const shapeAnnotationId = `shape-${Date.now()}`;
    const updatedAnnotations = {
      ...annotationsBeforeWrite,
      nodeAnnotations,
      groupStyleAnnotations: [...(annotationsBeforeWrite.groupStyleAnnotations ?? []), childGroup],
      freeTextAnnotations: [
        ...(annotationsBeforeWrite.freeTextAnnotations ?? []),
        {
          id: textAnnotationId,
          text: "Inner note",
          position: { x: 260, y: 180 },
          groupId: innerGroupId
        }
      ],
      freeShapeAnnotations: [
        ...(annotationsBeforeWrite.freeShapeAnnotations ?? []),
        {
          id: shapeAnnotationId,
          shapeType: "rectangle",
          position: { x: 260, y: 200 },
          width: 80,
          height: 50,
          groupId: innerGroupId
        }
      ]
    };

    await api.writeAnnotationsFile(TOPOLOGY_FILE, updatedAnnotations);
    await api.gotoFile(TOPOLOGY_FILE);
    await api.waitForCanvasReady();
    await api.setEditMode();
    await api.unlock();
    await api.fit();

    await expect
      .poll(() => api.getGroupIds(), {
        timeout: 5000,
        message: "Expected groups to load after reload"
      })
      .toEqual(expect.arrayContaining([outerGroupId, innerGroupId, childGroupId]));

    const annotationsAfterReload = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
    const textAnnotation = annotationsAfterReload.freeTextAnnotations?.find(
      (a) => a.id === textAnnotationId
    );
    const shapeAnnotation = annotationsAfterReload.freeShapeAnnotations?.find(
      (a) => a.id === shapeAnnotationId
    );
    expect(textAnnotation?.groupId).toBe(innerGroupId);
    expect(shapeAnnotation?.groupId).toBe(innerGroupId);

    await expect
      .poll(
        async () => {
          const annotations = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
          return (
            annotations.groupStyleAnnotations?.find((g) => g.id === childGroupId)?.parentId ?? null
          );
        },
        { timeout: 5000, message: "Expected child group to be nested under inner group" }
      )
      .toBe(innerGroupId);

    await openGroupContextMenu(page, innerGroupId);
    await page.getByRole("button", { name: "Delete" }).click();

    await expect
      .poll(
        () =>
          getGroupPromotionSnapshot(api, {
            innerGroupId,
            childGroupId,
            textAnnotationId,
            shapeAnnotationId
          }),
        { timeout: 5000, message: "Expected promotions after group delete" }
      )
      .toEqual({
        innerExists: false,
        childParent: outerGroupId,
        nodeCGroup: outerGroupId,
        nodeDGroup: outerGroupId,
        textGroup: outerGroupId,
        shapeGroup: outerGroupId
      });

    await api.undo();

    await expect
      .poll(
        () =>
          getGroupPromotionSnapshot(api, {
            innerGroupId,
            childGroupId,
            textAnnotationId,
            shapeAnnotationId
          }),
        { timeout: 5000, message: "Expected undo to restore nested memberships" }
      )
      .toEqual({
        innerExists: true,
        childParent: innerGroupId,
        nodeCGroup: innerGroupId,
        nodeDGroup: innerGroupId,
        textGroup: innerGroupId,
        shapeGroup: innerGroupId
      });
  });

  test("allows duplicate group names with distinct ids", async ({ page, topoViewerPage }) => {
    const api = topoViewerPage as TopoViewerPage;
    const nodes = [
      { id: "dup-a", position: { x: 100, y: 100 } },
      { id: "dup-b", position: { x: 180, y: 100 } },
      { id: "dup-c", position: { x: 500, y: 400 } },
      { id: "dup-d", position: { x: 580, y: 400 } }
    ];

    for (const node of nodes) {
      await api.createNode(node.id, node.position);
    }
    await api.fit();

    const firstGroupId = await createGroupFromNodes(page, api, ["dup-a", "dup-b"]);
    const secondGroupId = await createGroupFromNodes(page, api, ["dup-c", "dup-d"]);

    const annotations = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
    const firstGroup = annotations.groupStyleAnnotations?.find((g) => g.id === firstGroupId);
    const secondGroup = annotations.groupStyleAnnotations?.find((g) => g.id === secondGroupId);
    expect(firstGroup).toBeDefined();
    expect(secondGroup).toBeDefined();

    await openGroupContextMenu(page, secondGroupId);
    await page.getByRole("button", { name: "Edit" }).first().click();

    const groupEditor = page.locator('[data-testid="group-editor"]');
    await expect(groupEditor).toBeVisible({ timeout: 3000 });
    const nameInput = groupEditor.locator('input[type="text"]').first();
    await nameInput.fill(firstGroup!.name);
    await groupEditor.locator(SEL_PANEL_OK_BTN).click();

    await expect
      .poll(
        async () => {
          const updated = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
          return (
            updated.groupStyleAnnotations
              ?.filter((g) => g.name === firstGroup!.name)
              .map((g) => g.id) ?? []
          );
        },
        { timeout: 5000, message: "Expected duplicate group names to be persisted" }
      )
      .toEqual(expect.arrayContaining([firstGroupId, secondGroupId]));
  });
});

/**
 * File Persistence Tests for Group Operations
 *
 * These tests verify that group operations properly update:
 * - .clab.yml.annotations.json file (saves group definitions and membership)
 */
test.describe("Group Operations - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("created group appears in annotations file", async ({ page, topoViewerPage }) => {
    // Get initial annotations
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const initialGroupCount = initialAnnotations.groupStyleAnnotations?.length || 0;

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select two nodes
    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    // Create group with Ctrl+G using fixture helper
    await topoViewerPage.createGroup();

    // Wait for save to complete
    await page.waitForTimeout(500);

    // Read updated annotations
    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const updatedGroupCount = updatedAnnotations.groupStyleAnnotations?.length || 0;

    // Should have one more group
    expect(updatedGroupCount).toBe(initialGroupCount + 1);

    // New group should have a name
    const groups = updatedAnnotations.groupStyleAnnotations || [];
    const newGroups = groups.slice(initialGroupCount);
    expect(newGroups.length).toBe(1);
    expect(newGroups[0].name).toBeDefined();
  });

  test("datacenter topology has groups in annotations file", async ({ topoViewerPage }) => {
    // Load datacenter topology which has pre-defined groups
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Read annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);

    // Should have groups defined
    expect(annotations.groupStyleAnnotations?.length).toBeGreaterThan(0);

    // Check for expected group names
    const groupNames = annotations.groupStyleAnnotations?.map((g) => g.name);
    expect(groupNames).toContain("Border");
    expect(groupNames).toContain("Spine");
  });

  test("group persists after reload", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    // Select two nodes and create a group
    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    // Create group using fixture helper
    await topoViewerPage.createGroup();

    // Wait for save (debounce is 300ms + async save time)
    await page.waitForTimeout(1000);

    // Get group count before reload
    const groupCountBefore = await topoViewerPage.getGroupCount();
    expect(groupCountBefore).toBeGreaterThan(0);

    // Verify group was saved to annotations file
    const annotationsBeforeReload = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const savedGroupCount = annotationsBeforeReload.groupStyleAnnotations?.length || 0;
    expect(savedGroupCount).toBeGreaterThan(0);

    // Reload the file
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Wait for groups to be loaded from annotations into React state
    await page.waitForTimeout(1000);

    // Verify group count is preserved
    const groupCountAfterReload = await topoViewerPage.getGroupCount();
    expect(groupCountAfterReload).toBe(groupCountBefore);
  });
});
