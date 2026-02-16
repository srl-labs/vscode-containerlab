import { test, expect } from "../fixtures/topoviewer";
import { mouseWheelZoom } from "../helpers/react-flow-helpers";

test.describe("Zoom and Pan", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test("gets initial zoom level", async ({ topoViewerPage }) => {
    const zoom = await topoViewerPage.getZoom();
    expect(zoom).toBeGreaterThan(0);
  });

  test("sets zoom level programmatically", async ({ topoViewerPage }) => {
    const initialZoom = await topoViewerPage.getZoom();

    // Set a specific zoom level
    await topoViewerPage.setZoom(2.0);
    const newZoom = await topoViewerPage.getZoom();

    expect(newZoom).toBeCloseTo(2.0, 1);
    expect(newZoom).not.toBeCloseTo(initialZoom, 1);
  });

  test("zooms in with mouse wheel (negative delta)", async ({ page, topoViewerPage }) => {
    const initialZoom = await topoViewerPage.getZoom();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Zoom in (negative delta = scroll up = zoom in)
    await mouseWheelZoom(page, canvasCenter.x, canvasCenter.y, -100);
    await page.waitForTimeout(300);

    const newZoom = await topoViewerPage.getZoom();
    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test("zooms out with mouse wheel (positive delta)", async ({ page, topoViewerPage }) => {
    // First zoom in a bit so we have room to zoom out
    await topoViewerPage.setZoom(2.0);
    const initialZoom = await topoViewerPage.getZoom();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Zoom out (positive delta = scroll down = zoom out)
    await mouseWheelZoom(page, canvasCenter.x, canvasCenter.y, 100);
    await page.waitForTimeout(300);

    const newZoom = await topoViewerPage.getZoom();
    expect(newZoom).toBeLessThan(initialZoom);
  });

  test("gets initial pan position", async ({ topoViewerPage }) => {
    const pan = await topoViewerPage.getPan();
    expect(pan).toHaveProperty("x");
    expect(pan).toHaveProperty("y");
  });

  test("sets pan position programmatically", async ({ topoViewerPage }) => {
    const targetPan = { x: 100, y: 150 };

    await topoViewerPage.setPan(targetPan.x, targetPan.y);
    const newPan = await topoViewerPage.getPan();

    expect(newPan.x).toBeCloseTo(targetPan.x, 0);
    expect(newPan.y).toBeCloseTo(targetPan.y, 0);
  });

  test("dragging on pane does not change pan in default mode", async ({ page, topoViewerPage }) => {
    const initialPan = await topoViewerPage.getPan();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    const dragDistance = 100;

    // Use middle-button drag to pan reliably with the current React Flow settings.
    const start = { x: canvasCenter.x + 220, y: canvasCenter.y + 180 };
    const end = { x: start.x - dragDistance, y: start.y - dragDistance };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up({ button: "middle" });
    await page.waitForTimeout(300);

    const newPan = await topoViewerPage.getPan();

    // Current interaction model keeps pan fixed while drag is used for selection.
    const panDeltaX = Math.abs(newPan.x - initialPan.x);
    const panDeltaY = Math.abs(newPan.y - initialPan.y);

    expect(panDeltaX).toBeLessThan(5);
    expect(panDeltaY).toBeLessThan(5);
  });

  test("fit to viewport centers and scales graph", async ({ topoViewerPage }) => {
    // First set an extreme zoom and pan
    await topoViewerPage.setZoom(5.0);
    await topoViewerPage.setPan(500, 500);

    // Record the pan position before fit
    const panBeforeFit = await topoViewerPage.getPan();

    // Fit the graph
    await topoViewerPage.fit();

    // After fit, graph should be reasonably zoomed (cy.fit() calculates zoom
    // geometrically based on viewport and element bounding box, not previous zoom)
    const zoom = await topoViewerPage.getZoom();
    expect(zoom).toBeGreaterThan(0.1);
    expect(zoom).toBeLessThan(20); // sanity upper bound

    // Pan should have changed from the extreme offset (500, 500) toward center
    const panAfterFit = await topoViewerPage.getPan();
    const panMoved =
      Math.abs(panAfterFit.x - panBeforeFit.x) > 50 ||
      Math.abs(panAfterFit.y - panBeforeFit.y) > 50;
    expect(panMoved).toBe(true);
  });

  test("zoom can be set to extreme values", async ({ topoViewerPage }) => {
    // Set zoom to very small value
    await topoViewerPage.setZoom(0.1);
    const smallZoom = await topoViewerPage.getZoom();
    expect(smallZoom).toBeCloseTo(0.1, 1);

    // Set zoom to larger value
    await topoViewerPage.setZoom(3.0);
    const largeZoom = await topoViewerPage.getZoom();
    expect(largeZoom).toBeCloseTo(3.0, 1);

    // Zoom values are set correctly
    expect(largeZoom).toBeGreaterThan(smallZoom);
  });
});
