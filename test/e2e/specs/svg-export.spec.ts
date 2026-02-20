import { test, expect } from "../fixtures/topoviewer";

const SIMPLE_FILE = "simple.clab.yml";
const DATACENTER_FILE = "datacenter.clab.yml";

// Test selectors for the new MUI Dialog-based SVG export
const SEL_NAVBAR_CAPTURE = '[data-testid="navbar-capture"]';
const SEL_SVG_EXPORT_MODAL = '[data-testid="svg-export-modal"]';
const SEL_SVG_EXPORT_BTN = '[data-testid="svg-export-btn"]';
const SEL_SVG_EXPORT_FILENAME = '[data-testid="svg-export-filename"]';

// Annotation layer identifiers in exported SVG
const LAYER_GROUPS = "annotation-groups-layer";
const LAYER_SHAPES = "annotation-shapes-layer";
const LAYER_TEXT = "annotation-text-layer";

async function readDownloadAsString(download: any): Promise<string> {
  const stream = await download.createReadStream();
  const chunks = await stream.toArray();
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * SVG Export Modal E2E Tests (MUI Dialog version)
 *
 * In the new MUI design, SVG export is shown in a Dialog with
 * quality settings, background options, annotations toggle,
 * filename input, and export button.
 */
test.describe("SVG Export Modal", () => {
  test("opens SVG export modal and shows all controls", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_SVG_EXPORT_MODAL);
    await expect(modal).toBeVisible();

    // Title
    await expect(modal.locator("h2")).toHaveText("Export SVG");

    // Background options
    await expect(modal.getByText("Transparent", { exact: true })).toBeVisible();
    await expect(modal.getByText("Custom", { exact: true })).toBeVisible();

    // Filename input
    await expect(page.locator(SEL_SVG_EXPORT_FILENAME)).toBeVisible();

    // Export button
    await expect(page.locator(SEL_SVG_EXPORT_BTN)).toBeVisible();
  });

  test("exports SVG with default filename", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    await page.locator(SEL_SVG_EXPORT_BTN).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("simple.svg");

    // Read and verify SVG content
    const svgString = await readDownloadAsString(download);

    expect(svgString).toContain("<svg");
    expect(svgString).toContain("</svg>");
  });

  test("exports SVG with custom background color", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_SVG_EXPORT_MODAL);
    await expect(modal).toBeVisible();

    await modal.getByRole("radio", { name: "Custom" }).check();
    const colorInput = modal.getByRole("textbox", { name: "Color" });
    await colorInput.fill("ffffff");
    await page.waitForTimeout(100);

    const downloadPromise = page.waitForEvent("download");
    await page.locator(SEL_SVG_EXPORT_BTN).click();
    const download = await downloadPromise;

    const svgString = await readDownloadAsString(download);
    expect(svgString).toContain("<svg");
    expect(svgString).toContain('fill="#ffffff"');
  });

  test("exports SVG with annotations from datacenter topology", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Ensure the topology actually has annotations on disk
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const total =
      (annotations.freeTextAnnotations?.length ?? 0) +
      (annotations.freeShapeAnnotations?.length ?? 0) +
      (annotations.groupStyleAnnotations?.length ?? 0);
    expect(total).toBeGreaterThan(0);

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_SVG_EXPORT_MODAL);
    await expect(modal).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.locator(SEL_SVG_EXPORT_BTN).click();
    const download = await downloadPromise;

    const svgString = await readDownloadAsString(download);

    // Verify annotation layers exist
    expect(svgString).toContain(LAYER_GROUPS);
    expect(svgString).toContain(LAYER_SHAPES);
    expect(svgString).toContain(LAYER_TEXT);

    // Verify annotation content made it into the SVG for existing annotation kinds.
    const expectedAnnotationMarkers = [
      [(annotations.groupStyleAnnotations?.length ?? 0) > 0, "annotation-group"],
      [(annotations.freeShapeAnnotations?.length ?? 0) > 0, "annotation-shape"],
      [(annotations.freeTextAnnotations?.length ?? 0) > 0, "foreignObject"],
    ] as const;

    expectedAnnotationMarkers
      .filter(([shouldExist]) => shouldExist)
      .forEach(([, marker]) => expect(svgString).toContain(marker));
  });

  test("exports SVG with custom filename", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    // Change filename
    const filenameInput = page.locator(SEL_SVG_EXPORT_FILENAME).locator("input");
    await filenameInput.clear();
    await filenameInput.fill("my-topology");

    const downloadPromise = page.waitForEvent("download");
    await page.locator(SEL_SVG_EXPORT_BTN).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("my-topology.svg");
  });

  test("annotation layer transforms match React Flow transform", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_SVG_EXPORT_MODAL);
    await expect(modal).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.locator(SEL_SVG_EXPORT_BTN).click();
    const download = await downloadPromise;

    const svgString = await readDownloadAsString(download);

    // Extract the annotation layer transforms.
    const groupsLayerMatch = new RegExp(`${LAYER_GROUPS}[^>]*transform="([^"]+)"`).exec(svgString);
    const textLayerMatch = new RegExp(`${LAYER_TEXT}[^>]*transform="([^"]+)"`).exec(svgString);

    expect(groupsLayerMatch).not.toBeNull();
    expect(textLayerMatch).not.toBeNull();
    expect(groupsLayerMatch![1]).toBe(textLayerMatch![1]);
    expect(groupsLayerMatch![1]).toContain("translate(");
    expect(groupsLayerMatch![1]).toContain("scale(");

    // Sanity: exported SVG still contains expected annotation layers.
    expect(svgString).toContain(LAYER_GROUPS);
    expect(svgString).toContain(LAYER_TEXT);
  });

  test("modal closes with Escape key", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_SVG_EXPORT_MODAL);
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });
});
