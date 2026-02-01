import type { Locator, Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { getEdgeMidpoint } from "../helpers/react-flow-helpers";

const SIMPLE_FILE = "simple.clab.yml";

const SEL_LINK_LABELS_BTN = '[data-testid="navbar-link-labels"]';
const SEL_LINK_LABELS_MENU = '.navbar-menu:has-text("Endpoint offset")';
const SEL_ENDPOINT_SLIDER = `${SEL_LINK_LABELS_MENU} input[aria-label="Endpoint label offset"]`;
const SEL_LINK_EDITOR = '[data-testid="link-editor"]';
const SEL_LINK_OFFSET_SLIDER = "#link-endpoint-offset";

async function openLinkLabelsMenu(page: Page): Promise<Locator> {
  await page.locator(SEL_LINK_LABELS_BTN).click();
  const menu = page.locator(SEL_LINK_LABELS_MENU);
  await expect(menu).toBeVisible();
  return menu;
}

async function openLinkEditorForEdge(page: Page, edgeId: string): Promise<Locator> {
  const midpoint = await getEdgeMidpoint(page, edgeId);

  if (!midpoint) throw new Error(`Edge ${edgeId} not found`);
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  const panel = page.locator(SEL_LINK_EDITOR);
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("Endpoint Label Offset", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("persists global endpoint label offset and restores on reload", async ({
    page,
    topoViewerPage
  }) => {
    await openLinkLabelsMenu(page);
    const slider = page.locator(SEL_ENDPOINT_SLIDER);

    // Slider should be enabled by default
    await expect(slider).toBeEnabled();

    // Get initial value and set a new one
    const initialValue = Number(await slider.inputValue());
    const newValue = initialValue === 30 ? 40 : 30;

    // Change the slider value and trigger commit via mouseup
    await slider.fill(String(newValue));
    await slider.dispatchEvent("mouseup");

    // Verify the new value persists to the annotations file
    await expect
      .poll(
        async () => {
          const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
          return annotations.viewerSettings?.endpointLabelOffset;
        },
        { timeout: 5000, message: "endpoint label offset should persist after slider change" }
      )
      .toBe(newValue);

    // Reload and verify value is restored
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await openLinkLabelsMenu(page);
    await expect(page.locator(SEL_ENDPOINT_SLIDER)).toHaveValue(String(newValue));
  });

  test("undo/redo syncs per-link endpoint offset override", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);
    const edgeId = edgeIds[0];

    const panel = await openLinkEditorForEdge(page, edgeId);
    const slider = panel.locator(SEL_LINK_OFFSET_SLIDER);
    const initialValue = Number(await slider.inputValue());
    const maxValue = Number((await slider.getAttribute("max")) ?? "60");
    const minValue = Number((await slider.getAttribute("min")) ?? "0");
    const nextValue =
      initialValue + 7 <= maxValue ? initialValue + 7 : Math.max(minValue, initialValue - 7);

    await slider.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, nextValue);

    await expect(slider).toHaveValue(String(nextValue));

    const getOffsetState = async () => {
      const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
      const entry = annotations.edgeAnnotations?.find((edge) => edge.id === edgeId);
      return {
        enabled: entry?.endpointLabelOffsetEnabled ?? false,
        offset: entry?.endpointLabelOffset
      };
    };
    const initialOffsetState = await getOffsetState();

    await expect
      .poll(getOffsetState, {
        timeout: 5000,
        message: "per-link endpoint offset should persist after slider change"
      })
      .toEqual({ enabled: true, offset: nextValue });

    await topoViewerPage.undo();
    await expect
      .poll(getOffsetState, {
        timeout: 5000,
        message: "undo should revert per-link endpoint offset override"
      })
      .toEqual(initialOffsetState);

    await topoViewerPage.redo();
    await expect
      .poll(getOffsetState, {
        timeout: 5000,
        message: "redo should restore per-link endpoint offset override"
      })
      .toEqual({ enabled: true, offset: nextValue });
  });
});
