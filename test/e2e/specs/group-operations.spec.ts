import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { shiftClick, rightClick } from "../helpers/react-flow-helpers";

// Test file names
const TOPOLOGY_FILE = "empty.clab.yml";
const SPINE_LEAF_FILE = "spine-leaf.clab.yml";
const DATACENTER_FILE = "datacenter.clab.yml";

const SEL_PANEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';
const SEL_PANEL_TOGGLE_BTN = '[data-testid="panel-toggle-btn"]';
const SEL_CONTEXT_PANEL = '[data-testid="context-panel"]';

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
  getSelectedNodeIds: () => Promise<string[]>;
};

type AnnotationsApi = {
  getAnnotationsFromFile: (filename: string) => Promise<{
    nodeAnnotations?: Array<{ id: string; groupId?: string; group?: string; level?: string }>;
    freeTextAnnotations?: Array<{ id: string; text: string; groupId?: string }>;
    freeShapeAnnotations?: Array<{ id: string; shapeType: string; groupId?: string }>;
    groupStyleAnnotations?: Array<{
      id: string;
      name: string;
      parentId?: string;
      position?: { x: number; y: number };
      zIndex?: number;
      level?: string;
    }>;
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
    getNodeIds: () => Promise<string[]>;
  };

async function selectNodes(page: Page, topoViewerPage: GroupSelectionApi, nodeIds: string[]) {
  await topoViewerPage.clearSelection();
  // Use React Flow selection directly for stability: group creation uses rf node.selected.
  await page.evaluate((ids) => {
    const dev = (window as any).__DEV__;
    dev?.selectNodesForClipboard?.(ids);
    // Keep TopoViewerContext in sync when available (single-select only).
    if (typeof dev?.selectNode === "function") dev.selectNode(ids[0] ?? null);
  }, nodeIds);

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
    .poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 })
    .toBe(groupIdsBefore.length + 1);

  const groupIdsAfter = await topoViewerPage.getGroupIds();
  const newGroupId = groupIdsAfter.find((id) => !groupIdsBefore.includes(id));
  expect(newGroupId).toBeDefined();
  return newGroupId!;
}

async function openGroupContextMenu(page: Page, groupId: string) {
  const groupNode = page.locator(`[data-testid="group-node-${groupId}"]`);
  await groupNode.waitFor({ state: "visible", timeout: 5000 });
  const box = await groupNode.boundingBox();
  expect(box).not.toBeNull();
  const clickX = box!.x + Math.min(10, box!.width / 4);
  const clickY = box!.y + box!.height / 2;
  await rightClick(page, clickX, clickY);
}

async function applyAndBack(page: Page) {
  const apply = page.locator(SEL_PANEL_APPLY_BTN);
  const hasUnsavedChanges = await apply.isVisible().catch(() => false);
  if (hasUnsavedChanges) {
    // In dev mode, a floating dev toggle can intercept pointer clicks on footer buttons.
    // Keyboard activation avoids that flake without weakening assertions.
    await apply.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }

  // Return to palette by toggling panel closed/open.
  const toggle = page.locator(SEL_PANEL_TOGGLE_BTN);
  await expect(toggle).toBeVisible({ timeout: 3000 });
  await toggle.click();
  await page.waitForTimeout(200);
  await toggle.click();
  await expect(page.getByPlaceholder("Search nodes...")).toBeVisible({ timeout: 5000 });
}

function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

type GroupPromotionSnapshot = {
  innerExists: boolean;
  childParent: string | null;
  nodeCGroup: string | null;
  nodeDGroup: string | null;
  textGroup: string | null;
  shapeGroup: string | null;
};

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

    await topoViewerPage.selectNode(nodeIds[0]);

    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    expect((await topoViewerPage.getSelectedNodeIds()).length).toBe(2);

    await topoViewerPage.createGroup();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 }).toBe(
      initialGroupCount + 1
    );
  });

  test("group persists after all members are deleted", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    const initialGroupCount = await topoViewerPage.getGroupCount();
    const node1 = nodeIds[0];
    const node2 = nodeIds[1];

    await topoViewerPage.selectNode(node1);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(node2);
    expect(secondNodeBox).not.toBeNull();
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 }).toBe(
      initialGroupCount + 1
    );

    // Delete both members.
    await topoViewerPage.selectNode(node1);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    await topoViewerPage.selectNode(node2);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // Group should persist even after all members are deleted.
    await expect.poll(() => topoViewerPage.getGroupCount(), { timeout: 5000 }).toBe(
      initialGroupCount + 1
    );
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
          return annotations.groupStyleAnnotations?.find((g) => g.id === innerGroupId)?.parentId ?? null;
        },
        { timeout: 5000 }
      )
      .toBe(outerGroupId);

    const annotationsBeforeWrite = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
    const innerGroup = annotationsBeforeWrite.groupStyleAnnotations?.find((g) => g.id === innerGroupId);
    expect(innerGroup).toBeDefined();

    const nodeAnnotations = [...(annotationsBeforeWrite.nodeAnnotations ?? [])];
    const ensureNodeMembership = (nodeId: string) => {
      const existing = nodeAnnotations.find((node) => node.id === nodeId);
      if (existing) {
        existing.groupId = innerGroupId;
        existing.group = innerGroup!.name;
        existing.level = innerGroup!.level;
        return;
      }
      nodeAnnotations.push({ id: nodeId, groupId: innerGroupId, group: innerGroup!.name, level: innerGroup!.level });
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
        { id: textAnnotationId, text: "Inner note", position: { x: 260, y: 180 }, groupId: innerGroupId }
      ],
      freeShapeAnnotations: [
        ...(annotationsBeforeWrite.freeShapeAnnotations ?? []),
        { id: shapeAnnotationId, shapeType: "rectangle", position: { x: 260, y: 200 }, width: 80, height: 50, groupId: innerGroupId }
      ]
    };

    await api.writeAnnotationsFile(TOPOLOGY_FILE, updatedAnnotations);
    await api.gotoFile(TOPOLOGY_FILE);
    await api.waitForCanvasReady();
    await api.setEditMode();
    await api.unlock();
    await api.fit();

    await expect
      .poll(() => api.getGroupIds(), { timeout: 5000 })
      .toEqual(expect.arrayContaining([outerGroupId, innerGroupId, childGroupId]));

    await expect
      .poll(
        async () => {
          const annotations = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
          return annotations.groupStyleAnnotations?.find((g) => g.id === childGroupId)?.parentId ?? null;
        },
        { timeout: 5000 }
      )
      .toBe(innerGroupId);

    await openGroupContextMenu(page, innerGroupId);
    await page.locator('[data-testid="context-menu-item-delete-group"]').click();

    await expect
      .poll(
        () =>
          getGroupPromotionSnapshot(api, {
            innerGroupId,
            childGroupId,
            textAnnotationId,
            shapeAnnotationId
          }),
        { timeout: 5000 }
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
        { timeout: 5000 }
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
    expect(firstGroup).toBeDefined();

    await openGroupContextMenu(page, secondGroupId);
    await page.locator('[data-testid="context-menu-item-edit-group"]').click();

    await expect(page.getByText("Edit Group", { exact: true })).toBeVisible({ timeout: 5000 });
    // Group editor uses a Typography label, not a native <label> association.
    // Target the unique placeholder instead of an accessible name to avoid false negatives.
    const panel = page.locator(SEL_CONTEXT_PANEL);
    const nameInput = panel.getByPlaceholder("e.g., rack1");
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    const currentName = await nameInput.inputValue();
    if (currentName !== firstGroup!.name) {
      await nameInput.fill(firstGroup!.name);
      await expect(page.locator(SEL_PANEL_APPLY_BTN)).toBeVisible({ timeout: 3000 });
    } else {
      await expect(page.locator(SEL_PANEL_APPLY_BTN)).toHaveCount(0);
    }
    await applyAndBack(page);

    await expect
      .poll(
        async () => {
          const updated = await api.getAnnotationsFromFile(TOPOLOGY_FILE);
          return updated.groupStyleAnnotations?.filter((g) => g.name === firstGroup!.name).map((g) => g.id) ?? [];
        },
        { timeout: 5000 }
      )
      .toEqual(expect.arrayContaining([firstGroupId, secondGroupId]));
  });
});

test.describe("Group Operations - File Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("created group appears in annotations file", async ({ page, topoViewerPage }) => {
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const initialGroupCount = initialAnnotations.groupStyleAnnotations?.length ?? 0;

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await page.waitForTimeout(700);

    const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
    const updatedGroupCount = updatedAnnotations.groupStyleAnnotations?.length ?? 0;
    expect(updatedGroupCount).toBe(initialGroupCount + 1);
  });

  test("datacenter topology has groups in annotations file", async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    expect(annotations.groupStyleAnnotations?.length).toBeGreaterThan(0);

    const groupNames = annotations.groupStyleAnnotations?.map((g) => g.name);
    expect(groupNames).toContain("Border");
    expect(groupNames).toContain("Spine");
  });

  test("group persists after reload", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);

    await topoViewerPage.selectNode(nodeIds[0]);
    const secondNodeBox = await topoViewerPage.getNodeBoundingBox(nodeIds[1]);
    expect(secondNodeBox).not.toBeNull();
    await shiftClick(
      page,
      secondNodeBox!.x + secondNodeBox!.width / 2,
      secondNodeBox!.y + secondNodeBox!.height / 2
    );
    await page.waitForTimeout(200);

    await topoViewerPage.createGroup();
    await page.waitForTimeout(1000);

    const groupCountBefore = await topoViewerPage.getGroupCount();
    expect(groupCountBefore).toBeGreaterThan(0);

    await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
    await topoViewerPage.waitForCanvasReady();
    await page.waitForTimeout(700);

    expect(await topoViewerPage.getGroupCount()).toBe(groupCountBefore);
  });
});
