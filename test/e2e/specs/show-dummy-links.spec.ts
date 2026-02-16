import { test, expect } from "../fixtures/topoviewer";

/**
 * Show Dummy Links E2E Tests
 *
 * Tests the dummy links toggle functionality.
 * The network.clab.yml topology contains dummy links connected to nodes.
 * The toggle is managed by the topoViewerStore (showDummyLinks state).
 */
test.describe("Show Dummy Links Toggle", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("network.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test("network.clab.yml has dummy link visible by default", async ({ topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();

    // Verify dummy node exists
    const dummyNodes = nodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(dummyNodes.length).toBeGreaterThan(0);

    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test("toggling showDummyLinks hides and shows dummy nodes", async ({ page, topoViewerPage }) => {
    const initialNodeIds = await topoViewerPage.getNodeIds();
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const initialDummyNodes = initialNodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(initialDummyNodes.length).toBeGreaterThan(0);

    // Toggle dummy links OFF via store
    await page.evaluate(() => {
      (window as any).__DEV__.toggleDummyLinks();
    });
    await page.waitForTimeout(300);

    // Dummy nodes should be gone
    const afterHideNodeIds = await topoViewerPage.getNodeIds();
    const afterHideDummyNodes = afterHideNodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(afterHideDummyNodes.length).toBe(0);
    expect(afterHideNodeIds.length).toBe(initialNodeIds.length - initialDummyNodes.length);

    // Edge count should decrease
    const afterHideEdgeCount = await topoViewerPage.getEdgeCount();
    expect(afterHideEdgeCount).toBeLessThan(initialEdgeCount);

    // Toggle dummy links back ON
    await page.evaluate(() => {
      (window as any).__DEV__.toggleDummyLinks();
    });
    await page.waitForTimeout(300);

    // Dummy nodes should be back
    const afterShowNodeIds = await topoViewerPage.getNodeIds();
    const afterShowDummyNodes = afterShowNodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(afterShowDummyNodes.length).toBe(initialDummyNodes.length);
    expect(afterShowNodeIds.length).toBe(initialNodeIds.length);
    expect(await topoViewerPage.getEdgeCount()).toBe(initialEdgeCount);
  });
});
