/**
 * Live File Updates - Playwright E2E Tests
 *
 * Tests that the React TopoViewer automatically updates when the underlying
 * .clab.yml file is modified externally (via HTTP API).
 *
 * This proves the SSE-based live update mechanism works correctly.
 */

import { test, expect } from '../fixtures/topoviewer';

test.describe.serial('Live File Updates', () => {
  // Use simple.clab.yml as our test file
  const testFile = 'simple.clab.yml';

  test.beforeEach(async ({ topoViewerPage }) => {
    // Reset files to clean state
    await topoViewerPage.resetFiles();

    // Load the test topology
    await topoViewerPage.gotoFile(testFile);
    await topoViewerPage.waitForCanvasReady();
  });

  test('adding node via external edit updates canvas', async ({ topoViewerPage }) => {
    // Verify initial state (simple.clab.yml has 2 nodes: srl1, srl2)
    const initialNodeCount = await topoViewerPage.getNodeCount();
    expect(initialNodeCount).toBe(2);

    const initialNodeIds = await topoViewerPage.getNodeIds();
    expect(initialNodeIds).toContain('srl1');
    expect(initialNodeIds).toContain('srl2');

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
    await expect.poll(
      () => topoViewerPage.getNodeCount(),
      {
        timeout: 5000,
        message: 'Expected canvas to update with 3 nodes after external edit'
      }
    ).toBe(3);

    // Verify the new node is present
    const updatedNodeIds = await topoViewerPage.getNodeIds();
    expect(updatedNodeIds).toContain('srl3');
  });

  test('removing node via external edit updates canvas', async ({ topoViewerPage }) => {
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
    await expect.poll(
      () => topoViewerPage.getNodeCount(),
      {
        timeout: 5000,
        message: 'Expected canvas to update with 1 node after external edit'
      }
    ).toBe(1);

    // Verify srl2 is gone
    const updatedNodeIds = await topoViewerPage.getNodeIds();
    expect(updatedNodeIds).not.toContain('srl2');
    expect(updatedNodeIds).toContain('srl1');
  });

  test('adding link via external edit updates canvas', async ({ topoViewerPage }) => {
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
    await expect.poll(
      () => topoViewerPage.getEdgeCount(),
      {
        timeout: 5000,
        message: 'Expected canvas to update with 2 edges after external edit'
      }
    ).toBe(2);
  });

  test('modifying node kind via external edit updates canvas', async ({ topoViewerPage, page }) => {
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
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return null;
          const node = cy.getElementById('srl1');
          if (!node || node.empty()) return null;
          return node.data('extraData')?.kind;
        });
      },
      {
        timeout: 5000,
        message: 'Expected node kind to update after external edit'
      }
    ).toBe('linux');
  });

  test('rapid file changes are debounced correctly', async ({ topoViewerPage }) => {
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
    await expect.poll(
      () => topoViewerPage.getNodeCount(),
      {
        timeout: 5000,
        message: 'Expected final state to have 4 nodes after rapid changes'
      }
    ).toBe(4);
  });
});
