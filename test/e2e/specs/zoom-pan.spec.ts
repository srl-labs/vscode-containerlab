import { test, expect } from '../fixtures/topoviewer';
import { drag, mouseWheelZoom } from '../helpers/cytoscape-helpers';

test.describe('Zoom and Pan', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
  });

  test('gets initial zoom level', async ({ topoViewerPage }) => {
    const zoom = await topoViewerPage.getZoom();
    expect(zoom).toBeGreaterThan(0);
  });

  test('sets zoom level programmatically', async ({ topoViewerPage }) => {
    const initialZoom = await topoViewerPage.getZoom();

    // Set a specific zoom level
    await topoViewerPage.setZoom(2.0);
    const newZoom = await topoViewerPage.getZoom();

    expect(newZoom).toBeCloseTo(2.0, 1);
    expect(newZoom).not.toBeCloseTo(initialZoom, 1);
  });

  test('zooms in with mouse wheel (negative delta)', async ({ page, topoViewerPage }) => {
    const initialZoom = await topoViewerPage.getZoom();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    // Zoom in (negative delta = scroll up = zoom in)
    await mouseWheelZoom(page, canvasCenter.x, canvasCenter.y, -100);
    await page.waitForTimeout(300);

    const newZoom = await topoViewerPage.getZoom();
    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test('zooms out with mouse wheel (positive delta)', async ({ page, topoViewerPage }) => {
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

  test('gets initial pan position', async ({ topoViewerPage }) => {
    const pan = await topoViewerPage.getPan();
    expect(pan).toHaveProperty('x');
    expect(pan).toHaveProperty('y');
  });

  test('sets pan position programmatically', async ({ topoViewerPage }) => {
    const targetPan = { x: 100, y: 150 };

    await topoViewerPage.setPan(targetPan.x, targetPan.y);
    const newPan = await topoViewerPage.getPan();

    expect(newPan.x).toBeCloseTo(targetPan.x, 0);
    expect(newPan.y).toBeCloseTo(targetPan.y, 0);
  });

  test('pans canvas with mouse drag', async ({ page, topoViewerPage }) => {
    const initialPan = await topoViewerPage.getPan();
    const canvasCenter = await topoViewerPage.getCanvasCenter();

    const dragDistance = 100;
    // Drag the canvas (without clicking on a node)
    // Click on empty area and drag
    await drag(
      page,
      { x: canvasCenter.x + 200, y: canvasCenter.y + 200 },
      { x: canvasCenter.x + 200 - dragDistance, y: canvasCenter.y + 200 - dragDistance },
      { steps: 5 }
    );
    await page.waitForTimeout(300);

    const newPan = await topoViewerPage.getPan();

    // Pan should have changed by approximately the drag distance
    const panDeltaX = Math.abs(newPan.x - initialPan.x);
    const panDeltaY = Math.abs(newPan.y - initialPan.y);

    // Each direction should have moved at least 50% of drag distance
    expect(panDeltaX).toBeGreaterThan(dragDistance * 0.5);
    expect(panDeltaY).toBeGreaterThan(dragDistance * 0.5);
  });

  test('fit to viewport centers and scales graph', async ({ topoViewerPage }) => {
    // First set an extreme zoom
    await topoViewerPage.setZoom(5.0);
    await topoViewerPage.setPan(500, 500);

    // Fit the graph
    await topoViewerPage.fit();

    // After fit, graph should be reasonably zoomed and centered
    const zoom = await topoViewerPage.getZoom();
    expect(zoom).toBeLessThan(5.0);
    expect(zoom).toBeGreaterThan(0.1);
  });

  test('zoom can be set to extreme values', async ({ topoViewerPage }) => {
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
