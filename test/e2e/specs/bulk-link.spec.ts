import { test, expect } from "../fixtures/topoviewer";
import { rightClick } from "../helpers/react-flow-helpers";

const EMPTY_FILE = "empty.clab.yml";
const KIND = "nokia_srlinux";
const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_BULK_LINK_ITEM = '[data-testid="context-menu-item-bulk-link"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';

test.describe("Bulk Link Devices", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("creates links and updates UI without reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("leaf1", { x: 200, y: 120 }, KIND);
    await topoViewerPage.createNode("leaf2", { x: 200, y: 260 }, KIND);
    await topoViewerPage.createNode("spine1", { x: 460, y: 120 }, KIND);
    await topoViewerPage.createNode("spine2", { x: 460, y: 260 }, KIND);

    await expect.poll(() => topoViewerPage.getNodeCount()).toBe(4);

    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(0);

    const canvasBox = await topoViewerPage.getCanvas().boundingBox();
    if (!canvasBox) throw new Error("Canvas not found");
    await rightClick(page, canvasBox.x + 30, canvasBox.y + 30);
    const contextMenu = page.locator(SEL_CONTEXT_MENU);
    await expect(contextMenu).toBeVisible();
    await page.locator(SEL_BULK_LINK_ITEM).click();
    await expect(contextMenu).not.toBeVisible();

    await page.locator('input[placeholder^="e.g. leaf*"]').fill("leaf*");
    await page.locator('input[placeholder^="e.g. spine*"]').fill("spine*");
    await page.locator(SEL_PANEL_OK_BTN).click();

    await page.getByRole("button", { name: "Create Links" }).click();

    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(4);

    const edges = await topoViewerPage.getEdgesData();
    const normalize = (edge: {
      source: string;
      target: string;
      sourceEndpoint?: string;
      targetEndpoint?: string;
    }) => {
      const left = `${edge.source}:${edge.sourceEndpoint ?? ""}`;
      const right = `${edge.target}:${edge.targetEndpoint ?? ""}`;
      return [left, right].sort().join("--");
    };
    const normalizedEdges = edges.map(normalize);
    const expectedEdges = [
      "leaf1:e1-1--spine1:e1-1",
      "leaf1:e1-2--spine2:e1-1",
      "leaf2:e1-1--spine1:e1-2",
      "leaf2:e1-2--spine2:e1-2"
    ].map((edge) => edge.split("--").sort().join("--"));
    for (const expected of expectedEdges) {
      expect(normalizedEdges).toContain(expected);
    }

    const getEndpointCount = async () => {
      const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
      return (yaml.match(/endpoints:/g) ?? []).length;
    };

    await expect.poll(getEndpointCount).toBe(4);

    // Batch undo removes all links at once (batch command creates single history entry)
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(0);
    await expect.poll(getEndpointCount).toBe(0);

    // Batch redo restores all links at once
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(4);
    await expect.poll(getEndpointCount).toBe(4);
  });
});
