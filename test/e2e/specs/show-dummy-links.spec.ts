import { test, expect } from "../fixtures/topoviewer";

/**
 * Show Dummy Links E2E Tests
 *
 * Tests the "Show Dummy Links" toggle functionality in the navbar.
 * This toggle should hide/show dummy nodes and their connected edges.
 *
 * The network.clab.yml topology contains:
 * - Regular nodes: srl1, srl2, linux1, bridge0
 * - Regular links between nodes
 * - A dummy link (type: dummy) connected to srl2
 */

const SEL_NAVBAR_LINK_LABELS = '[data-testid="navbar-link-labels"]';
const SEL_NAVBAR_MENU = ".navbar-menu";
const SEL_SHOW_DUMMY_LINKS = '.navbar-menu-option:has-text("Show Dummy Links")';

test.describe("Show Dummy Links Toggle", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("network.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test("network.clab.yml has dummy link visible by default", async ({ topoViewerPage }) => {
    // Get initial node count - should include dummy nodes
    const nodeIds = await topoViewerPage.getNodeIds();
    console.log("[DEBUG] Initial nodes:", nodeIds);

    // Verify dummy node exists (created from the dummy link in rnet.clab.yml)
    const dummyNodes = nodeIds.filter((id: string) => id.startsWith("dummy"));
    console.log("[DEBUG] Dummy nodes:", dummyNodes);
    expect(dummyNodes.length).toBeGreaterThan(0);

    // Get edge count - edges connected to dummy nodes are present
    // Note: Edge IDs use "Clab-LinkX" format, not "dummy" in the ID
    const edgeCount = await topoViewerPage.getEdgeCount();
    console.log("[DEBUG] Initial edge count:", edgeCount);
    expect(edgeCount).toBeGreaterThan(0);
  });

  test("toggling Show Dummy Links hides and shows dummy nodes and edges", async ({
    page,
    topoViewerPage
  }) => {
    // Get initial counts
    const initialNodeIds = await topoViewerPage.getNodeIds();
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    const initialNodeCount = initialNodeIds.length;

    console.log(`[DEBUG] Initial state: ${initialNodeCount} nodes, ${initialEdgeCount} edges`);

    // Count dummy nodes
    const initialDummyNodes = initialNodeIds.filter((id: string) => id.startsWith("dummy"));
    console.log(`[DEBUG] Dummy nodes: ${initialDummyNodes.length}`);

    expect(initialDummyNodes.length).toBeGreaterThan(0);

    // Open link labels dropdown
    const linkLabelsBtn = page.locator(SEL_NAVBAR_LINK_LABELS);
    await linkLabelsBtn.click();
    await page.waitForTimeout(200);

    // Verify menu is open
    const menu = page.locator(SEL_NAVBAR_MENU);
    await expect(menu).toBeVisible();

    // Click "Show Dummy Links" to toggle it OFF
    const dummyLinksOption = page.locator(SEL_SHOW_DUMMY_LINKS);
    await expect(dummyLinksOption).toBeVisible();

    // Verify it's currently checked (enabled by default)
    const checkmarkBefore = dummyLinksOption.locator(".fa-check");
    await expect(checkmarkBefore).toBeVisible();

    // Click to disable
    await dummyLinksOption.click();
    await page.waitForTimeout(300);

    // Menu closes after click, verify dummy nodes are hidden
    const afterHideNodeIds = await topoViewerPage.getNodeIds();
    const afterHideEdgeCount = await topoViewerPage.getEdgeCount();

    console.log(
      `[DEBUG] After hide: ${afterHideNodeIds.length} nodes, ${afterHideEdgeCount} edges`
    );

    // Dummy nodes should be gone
    const afterHideDummyNodes = afterHideNodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(afterHideDummyNodes.length).toBe(0);

    // Node count should decrease by the number of dummy nodes
    expect(afterHideNodeIds.length).toBe(initialNodeCount - initialDummyNodes.length);

    // Edge count should decrease (edges to dummy nodes are hidden)
    expect(afterHideEdgeCount).toBeLessThan(initialEdgeCount);

    // Menu stays open after clicking an option - verify it's still open and option is now unchecked
    await expect(menu).toBeVisible({ timeout: 3000 });

    // Verify option is unchecked (no longer checked after toggle)
    const checkmarkAfterHide = page.locator(`${SEL_SHOW_DUMMY_LINKS} .fa-check`);
    await expect(checkmarkAfterHide).not.toBeVisible();

    // Click to re-enable (menu is still open)
    const dummyLinksOptionReenable = page.locator(SEL_SHOW_DUMMY_LINKS);
    await expect(dummyLinksOptionReenable).toBeVisible();
    await dummyLinksOptionReenable.click();
    await page.waitForTimeout(300);

    // Verify dummy nodes are back
    const afterShowNodeIds = await topoViewerPage.getNodeIds();
    const afterShowEdgeCount = await topoViewerPage.getEdgeCount();

    console.log(
      `[DEBUG] After show: ${afterShowNodeIds.length} nodes, ${afterShowEdgeCount} edges`
    );

    const afterShowDummyNodes = afterShowNodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(afterShowDummyNodes.length).toBe(initialDummyNodes.length);
    expect(afterShowNodeIds.length).toBe(initialNodeCount);
    expect(afterShowEdgeCount).toBe(initialEdgeCount);
  });

  test("Show Dummy Links state persists through menu reopening", async ({
    page,
    topoViewerPage
  }) => {
    const linkLabelsBtn = page.locator(SEL_NAVBAR_LINK_LABELS);

    // Open menu
    await linkLabelsBtn.click();
    await page.waitForTimeout(200);

    // Disable Show Dummy Links
    await page.locator(SEL_SHOW_DUMMY_LINKS).click();
    await page.waitForTimeout(300);

    // Verify dummy nodes are hidden
    const nodeIds = await topoViewerPage.getNodeIds();
    const dummyNodes = nodeIds.filter((id: string) => id.startsWith("dummy"));
    expect(dummyNodes.length).toBe(0);

    // Open menu again
    await linkLabelsBtn.click();
    await page.waitForTimeout(200);

    // Verify the option is still unchecked (state persisted)
    const checkmark = page.locator(`${SEL_SHOW_DUMMY_LINKS} .fa-check`);
    await expect(checkmark).not.toBeVisible();

    // Click somewhere to close menu
    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(200);

    // Verify dummy nodes are still hidden
    const nodeIdsAfter = await topoViewerPage.getNodeIds();
    const dummyNodesAfter = nodeIdsAfter.filter((id: string) => id.startsWith("dummy"));
    expect(dummyNodesAfter.length).toBe(0);
  });
});
