/**
 * Live File Updates - Playwright E2E Tests
 *
 * Tests that the React TopoViewer automatically updates when the underlying
 * .clab.yml file is modified externally (via HTTP API).
 *
 * This proves the SSE-based live update mechanism works correctly.
 */

import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

const getNodeKindFromStore = async (page: Page, nodeId: string) => {
  return page.evaluate((id: string) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return null;
    const nodes = rf.getNodes?.() ?? [];
    const node = nodes.find((n: any) => n.id === id);
    return node?.data?.extraData?.kind ?? node?.data?.kind ?? null;
  }, nodeId);
};

test.describe.serial("Live File Updates", () => {
  // Use simple.clab.yml as our test file
  const testFile = "simple.clab.yml";

  test.beforeEach(async ({ topoViewerPage }) => {
    // Reset files to clean state
    await topoViewerPage.resetFiles();

    // Load the test topology
    await topoViewerPage.gotoFile(testFile);
    await topoViewerPage.waitForCanvasReady();
  });

  test("adding node via external edit updates canvas", async ({ topoViewerPage }) => {
    // Verify initial state (simple.clab.yml has 2 nodes: srl1, srl2)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    const initialNodeIds = await topoViewerPage.getNodeIds();
    expect(initialNodeIds).toContain("srl1");
    expect(initialNodeIds).toContain("srl2");

    // Externally modify the YAML to add a third node
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl3:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for live update to propagate (SSE + debounce + render)
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected canvas to update with 3 nodes after external edit"
      })
      .toBe(3);

    // Verify the new node is present
    const updatedNodeIds = await topoViewerPage.getNodeIds();
    expect(updatedNodeIds).toContain("srl3");
  });

  test("removing node via external edit updates canvas", async ({ topoViewerPage }) => {
    // Verify initial state
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Externally modify the YAML to remove srl2
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for live update
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected canvas to update with 1 node after external edit"
      })
      .toBe(1);

    // Verify srl2 is gone
    const updatedNodeIds = await topoViewerPage.getNodeIds();
    expect(updatedNodeIds).not.toContain("srl2");
    expect(updatedNodeIds).toContain("srl1");
  });

  test("adding link via external edit updates canvas", async ({ topoViewerPage }) => {
    // Verify initial edge count
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1); // simple.clab.yml has 1 link

    // Externally modify the YAML to add a second link
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
    - endpoints: ["srl1:e1-2", "srl2:e1-2"]
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for live update
    await expect
      .poll(() => topoViewerPage.getEdgeCount(), {
        timeout: 5000,
        message: "Expected canvas to update with 2 edges after external edit"
      })
      .toBe(2);
  });

  test("modifying node kind via external edit updates canvas", async ({ topoViewerPage, page }) => {
    // This test verifies that changes to node properties are reflected
    // We'll check that the node exists and has correct data after external edit

    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Externally modify the YAML to change node kind
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: linux
      image: alpine:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for the node kind to be updated
    await expect
      .poll(() => getNodeKindFromStore(page, "srl1"), {
        timeout: 5000,
        message: "Expected node kind to update after external edit"
      })
      .toBe("linux");
  });

  test("rapid file changes are debounced correctly", async ({ topoViewerPage }) => {
    // Verify initial state
    expect(await topoViewerPage.getNodeCount()).toBe(2);

    // Make 3 rapid changes
    const yaml1 = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
`;
    const yaml2 = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
    srl2:
      kind: nokia_srlinux
    srl3:
      kind: nokia_srlinux
`;
    const yaml3 = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
    srl2:
      kind: nokia_srlinux
    srl3:
      kind: nokia_srlinux
    srl4:
      kind: nokia_srlinux
`;

    // Fire all changes rapidly
    await topoViewerPage.writeYamlFile(testFile, yaml1);
    await topoViewerPage.writeYamlFile(testFile, yaml2);
    await topoViewerPage.writeYamlFile(testFile, yaml3);

    // The final state should be 4 nodes (from yaml3)
    // Debouncing should prevent intermediate renders
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected final state to have 4 nodes after rapid changes"
      })
      .toBe(4);
  });

  test("deleting externally-added node via UI persists to YAML", async ({
    topoViewerPage,
    page
  }) => {
    // This test reproduces a bug where deleting a node that was added
    // externally (via YAML edit) doesn't persist to the YAML file

    // Verify initial state (simple.clab.yml has 2 nodes: srl1, srl2)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Externally modify the YAML to add a third node
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl3:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for live update to propagate
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected canvas to update with 3 nodes after external edit"
      })
      .toBe(3);

    // Verify the new node is present
    const updatedNodeIds = await topoViewerPage.getNodeIds();
    expect(updatedNodeIds).toContain("srl3");

    // Unlock and ensure edit mode
    await topoViewerPage.unlock();

    // Wait for internal update window to expire (1000ms in dev server)
    // to ensure our UI deletion won't be ignored
    await page.waitForTimeout(1200);

    // Now delete the externally-added node via UI
    await topoViewerPage.deleteNode("srl3");

    // Wait for deletion to complete in canvas
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 3000,
        message: "Expected canvas to show 2 nodes after deleting srl3"
      })
      .toBe(2);

    // Verify node was actually removed from YAML file
    // Give it some time for file write to complete
    await page.waitForTimeout(500);

    const finalYaml = await topoViewerPage.readYamlFile(testFile);
    expect(finalYaml).not.toContain("srl3");
    expect(finalYaml).toContain("srl1");
    expect(finalYaml).toContain("srl2");
  });

  test("external file change clears undo history", async ({ topoViewerPage, page }) => {
    // Verify initial state (simple.clab.yml has 2 nodes: srl1, srl2)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    // Unlock and ensure edit mode for creating nodes
    await topoViewerPage.unlock();

    // Create a new node to build up undo history
    await topoViewerPage.createNode("testnode1", { x: 300, y: 300 });

    // Wait for node to be created
    await expect
      .poll(() => topoViewerPage.getNodeCount(), {
        timeout: 5000,
        message: "Expected 3 nodes after creating testnode1"
      })
      .toBe(3);

    // Verify we can undo (should have undo history)
    // Use polling since undo state may take time to sync
    await expect
      .poll(() => topoViewerPage.canUndo(), {
        timeout: 3000,
        message: "Expected undo history to be available after creating node"
      })
      .toBe(true);

    // Wait for internal update window to expire (1000ms in dev server)
    // This ensures the subsequent file write is treated as external
    await page.waitForTimeout(1200);

    // Externally modify the YAML to add another node
    const newYaml = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    externalnode:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
`;

    await topoViewerPage.writeYamlFile(testFile, newYaml);

    // Wait for live update to propagate
    await expect
      .poll(() => topoViewerPage.getNodeIds(), {
        timeout: 5000,
        message: "Expected canvas to update with externalnode after external edit"
      })
      .toContain("externalnode");

    // After external file change, undo history should be cleared
    // (testnode1 we created earlier won't be in the new topology,
    // but that's expected - the external edit replaced the file)
    // Use longer timeout and progressive intervals for state sync
    await expect
      .poll(() => topoViewerPage.canUndo(), {
        timeout: 5000,
        intervals: [100, 200, 500, 1000],
        message: "Expected undo history to be cleared after external file change"
      })
      .toBe(false);

    // Verify both undo and redo are cleared
    expect(await topoViewerPage.canUndo()).toBe(false);
    expect(await topoViewerPage.canRedo()).toBe(false);
  });
});
