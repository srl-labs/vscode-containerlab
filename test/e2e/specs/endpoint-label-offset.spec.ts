import { test, expect } from "../fixtures/topoviewer";
import { rightClick, getEdgeMidpoint } from "../helpers/react-flow-helpers";

const SIMPLE_FILE = "simple.clab.yml";

const SEL_LINK_LABELS_BTN = '[data-testid="navbar-link-labels"]';
const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_EDIT_EDGE_ITEM = '[data-testid="context-menu-item-edit-edge"]';

/**
 * Endpoint Label Offset E2E Tests (MUI version)
 *
 * The MUI navbar link labels menu now only controls label mode.
 * Endpoint offset is set per-link in the Link Editor.
 */
test.describe("Endpoint Label Offset", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("link labels menu has Show All, On Select, and Hide options", async ({ page }) => {
    await page.locator(SEL_LINK_LABELS_BTN).click();
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="navbar-link-label-show-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="navbar-link-label-on-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="navbar-link-label-hide"]')).toBeVisible();
  });

  test("undo/redo syncs per-link endpoint offset override", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);
    const edgeId = edgeIds[0];

    // Open context menu on edge and click Edit
    const midpoint = await getEdgeMidpoint(page, edgeId);
    expect(midpoint).not.toBeNull();
    await rightClick(page, midpoint!.x, midpoint!.y);
    await expect(page.locator(SEL_CONTEXT_MENU)).toBeVisible();
    await page.locator(SEL_EDIT_EDGE_ITEM).click();
    await expect(page.locator(SEL_CONTEXT_MENU)).not.toBeVisible();

    // Slider is an MUI Slider (role="slider")
    const slider = page.locator("#link-endpoint-offset").getByRole("slider");
    await expect(slider).toBeVisible({ timeout: 3000 });

    const readState = async () => {
      const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
      const entry = annotations.edgeAnnotations?.find((e: any) => e.id === edgeId);
      if (!entry) return null;
      return {
        enabled: entry.endpointLabelOffsetEnabled ?? false,
        offset: entry.endpointLabelOffset
      };
    };

    const initialState = await readState();

    const initialValue = Number(await slider.getAttribute("aria-valuenow"));
    expect(Number.isFinite(initialValue)).toBe(true);

    // Nudge the slider via keyboard to avoid brittle pointer math.
    await slider.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    const newValue = Number(await slider.getAttribute("aria-valuenow"));
    expect(newValue).toBeGreaterThanOrEqual(initialValue);

    // Verify persisted
    await expect
      .poll(readState, { timeout: 5000 })
      .toEqual({ enabled: true, offset: newValue });

    // Undo should revert
    // Ensure canvas has focus so Ctrl+Z triggers the app-level undo handler (not an input undo).
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await page.waitForTimeout(500);
    await expect.poll(readState, { timeout: 5000 }).toEqual(initialState);

    // Redo should restore
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await page.waitForTimeout(500);
    await expect
      .poll(readState, { timeout: 5000 })
      .toEqual({ enabled: true, offset: newValue });
  });

  test("loads global endpoint label offset from annotations and restores on reload", async ({
    page,
    topoViewerPage
  }) => {
    const TARGET_OFFSET = 40;

    // Write viewer settings directly to the annotations file (global setting).
    const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    await topoViewerPage.writeAnnotationsFile(SIMPLE_FILE, {
      ...annotations,
      viewerSettings: {
        ...(annotations.viewerSettings ?? {}),
        endpointLabelOffsetEnabled: true,
        endpointLabelOffset: TARGET_OFFSET
      }
    });

    // Reload to ensure settings are applied from disk.
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    const openLinkEditorForEdge = async (edgeId: string) => {
      const midpoint = await getEdgeMidpoint(page, edgeId);
      expect(midpoint).not.toBeNull();
      await rightClick(page, midpoint!.x, midpoint!.y);
      await expect(page.locator(SEL_CONTEXT_MENU)).toBeVisible();
      await page.locator(SEL_EDIT_EDGE_ITEM).click();
      await expect(page.locator(SEL_CONTEXT_MENU)).not.toBeVisible();
    };

    await openLinkEditorForEdge(edgeIds[0]);

    const slider = page.locator("#link-endpoint-offset").getByRole("slider");
    await expect(slider).toBeVisible({ timeout: 3000 });
    const value = Number(await slider.getAttribute("aria-valuenow"));
    expect(value).toBe(TARGET_OFFSET);

    // Close editor and reload again to ensure it restores.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await openLinkEditorForEdge(edgeIds[0]);
    const valueAfterReload = Number(await slider.getAttribute("aria-valuenow"));
    expect(valueAfterReload).toBe(TARGET_OFFSET);
  });
});
