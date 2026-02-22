import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

const SIMPLE_FILE = "simple.clab.yml";

/**
 * Get a node's role (icon id) from React Flow node data.
 * This is what drives which SVG icon gets rendered on the canvas.
 */
async function getNodeRole(page: Page, nodeId: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (rf === undefined || rf === null) return undefined;
    const nodes = rf.getNodes?.() ?? [];
    const node = nodes.find((n: any) => n.id === id);
    const data = node?.data ?? {};
    return data.role ?? data.extraData?.topoViewerRole;
  }, nodeId);
}

/**
 * Click a node to open the editor
 */
async function clickNode(page: Page, nodeId: string): Promise<void> {
  const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
  await nodeHandle.scrollIntoViewIfNeeded();
  await expect(nodeHandle).toBeVisible({ timeout: 3000 });
  const box = await nodeHandle.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

async function openNodeEditor(page: Page, nodeId: string): Promise<void> {
  await clickNode(page, nodeId);
  // Ensure we actually opened the Node Editor (not e.g. link editor/info view).
  await expect(page.getByText("Node Editor", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#node-kind")).toBeVisible({ timeout: 5000 });
}

/**
 * Node Icon Change E2E Tests (MUI version)
 *
 * Tests that changing a node's icon via the editor updates the graph
 * and persists to the annotations file.
 */
test.describe("Node Icon Change", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
  });

  test("can read initial node icon", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const role = await getNodeRole(page, nodeIds[0]);
    expect(role).toBeDefined();
  });

  test("changing kind updates node data", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);

    // Change kind to linux
    const kindField = page.locator("#node-kind");
    await kindField.clear();
    await kindField.fill("linux");
    await kindField.blur();
    await page.waitForTimeout(200);

    await page.locator('[data-testid="panel-apply-btn"]').click();
    await page.waitForTimeout(500);

    // Verify YAML updated
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain("kind: linux");
  });

  test("changing node icon persists to canvas and annotations file", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds.includes("srl1") ? "srl1" : nodeIds[0];

    const initialRole = await getNodeRole(page, nodeId);
    const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    const initialNodeAnn = initialAnnotations.nodeAnnotations?.find((n: { id: string }) => n.id === nodeId);
    const initialIcon = initialNodeAnn?.icon;

    await openNodeEditor(page, nodeId);
    await page.locator('[data-testid="panel-tab-basic"]').click();

    // Select "Leaf" icon (label) from the dropdown. Stored value should be "leaf".
    // MUI Autocomplete uses the provided id on the input element.
    const iconCombobox = page.locator("#node-icon");
    await expect(iconCombobox).toBeVisible({ timeout: 5000 });
    await iconCombobox.scrollIntoViewIfNeeded();
    await iconCombobox.click({ force: true });
    await iconCombobox.fill("Leaf");
    await expect(page.getByRole("option", { name: "Leaf" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("option", { name: "Leaf" }).click();
    await page.waitForTimeout(200);

    await page.locator('[data-testid="panel-apply-btn"]').click();

    // Verify persisted to annotations file
    await expect
      .poll(async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
        const ann = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === nodeId);
        return ann?.icon;
      }, { timeout: 5000 })
      .toBe("leaf");

    // Verify canvas role reflects updated icon value
    await expect
      .poll(async () => await getNodeRole(page, nodeId), { timeout: 5000 })
      .toBe("leaf");

    // Sanity: it actually changed from whatever was there
    expect(initialRole).not.toBe("leaf");
    expect(initialIcon).not.toBe("leaf");
  });
});
