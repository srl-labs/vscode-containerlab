import type { Page, Locator } from "@playwright/test";

/**
 * Convert React Flow model coordinates to page/screen coordinates.
 * This accounts for pan, zoom, and container position.
 */
export async function modelToPageCoords(
  page: Page,
  modelX: number,
  modelY: number
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    ({ mx, my }) => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return { x: 0, y: 0 };

      const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
      const container = document.querySelector(".react-flow");
      const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

      return {
        x: rect.left + mx * viewport.zoom + viewport.x,
        y: rect.top + my * viewport.zoom + viewport.y
      };
    },
    { mx: modelX, my: modelY }
  );
}

/**
 * Convert page/screen coordinates to React Flow model coordinates.
 */
export async function pageToModelCoords(
  page: Page,
  pageX: number,
  pageY: number
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    ({ px, py }) => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return { x: 0, y: 0 };

      const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
      const container = document.querySelector(".react-flow");
      const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

      return {
        x: (px - rect.left - viewport.x) / viewport.zoom,
        y: (py - rect.top - viewport.y) / viewport.zoom
      };
    },
    { px: pageX, py: pageY }
  );
}

/**
 * Get the current zoom level of the React Flow canvas.
 */
export async function getZoom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    return rf?.getViewport?.()?.zoom ?? 1;
  });
}

/**
 * Get the current pan position of the React Flow canvas.
 */
export async function getPan(page: Page): Promise<{ x: number; y: number }> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    const viewport = rf?.getViewport?.() ?? { x: 0, y: 0 };
    return { x: viewport.x, y: viewport.y };
  });
}

/**
 * Fit the graph to the viewport.
 */
export async function fitGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    dev?.rfInstance?.fitView?.({ padding: 0.1 });
  });
  await page.waitForTimeout(300);
}

/**
 * Get all node IDs in the graph.
 */
export async function getAllNodeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return [];
    const nodes = rf.getNodes?.() ?? [];
    return nodes
      .filter((n: any) => n.type === "topology-node" || n.type === "cloud-node")
      .map((n: any) => n.id);
  });
}

/**
 * Get all edge IDs in the graph.
 */
export async function getAllEdgeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return [];
    const edges = rf.getEdges?.() ?? [];
    return edges.map((e: any) => e.id);
  });
}

/**
 * Check if a node is selected.
 */
export async function isNodeSelected(page: Page, nodeId: string): Promise<boolean> {
  return await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return false;
    const nodes = rf.getNodes?.() ?? [];
    const node = nodes.find((n: any) => n.id === id);
    return node?.selected ?? false;
  }, nodeId);
}

/**
 * Perform a drag operation from one point to another.
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options?: { steps?: number }
): Promise<void> {
  const steps = options?.steps ?? 10;

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  // Move in steps for smoother dragging
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await page.mouse.move(x, y);
  }

  await page.mouse.up();
}

/**
 * Perform a Shift+Click at the specified position.
 * Uses a delay to ensure Shift key is registered before click.
 */
export async function shiftClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down("Shift");
  // Delay to ensure Shift key state is registered before the click event
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await page.keyboard.up("Shift");
}

/**
 * Perform a Ctrl+Click (or Cmd+Click on Mac) at the specified position.
 */
export async function ctrlClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down("Control");
  await page.mouse.click(x, y);
  await page.keyboard.up("Control");
}

/**
 * Perform an Alt+Click at the specified position.
 * Used for deleting elements (nodes, edges, annotations, groups).
 */
export async function altClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down("Alt");
  // Small delay to ensure Alt key state is registered
  await page.waitForTimeout(50);
  await page.mouse.click(x, y);
  await page.keyboard.up("Alt");
}

/**
 * Perform an Alt+Click directly on an element using dispatchEvent.
 * This is useful for narrow or overlapping HTML elements where coordinate-based
 * clicking might land on the wrong element.
 * Used for deleting HTML overlay elements (text annotations, shape annotations).
 */
export async function altClickElement(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error("Element not found");

  await page.evaluate((el) => {
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      altKey: true
    });
    el.dispatchEvent(clickEvent);
  }, handle);
}

/**
 * Perform a double-click at the specified position.
 */
export async function doubleClick(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.dblclick(x, y);
}

/**
 * Perform a right-click at the specified position.
 */
export async function rightClick(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y, { button: "right" });
}

/**
 * Open context menu for a node by calculating its position.
 */
export async function openNodeContextMenu(page: Page, nodeId: string): Promise<void> {
  const coords = await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return null;

    const nodes = rf.getNodes?.() ?? [];
    const node = nodes.find((n: any) => n.id === id);
    if (!node) return null;

    const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    const container = document.querySelector(".react-flow");
    const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

    // Node center (assuming 60x60 node size)
    const nodeCenter = {
      x: node.position.x + 30,
      y: node.position.y + 30
    };

    return {
      x: rect.left + nodeCenter.x * viewport.zoom + viewport.x,
      y: rect.top + nodeCenter.y * viewport.zoom + viewport.y
    };
  }, nodeId);

  if (!coords) {
    throw new Error(`Failed to open context menu for node: ${nodeId}`);
  }

  await page.mouse.click(coords.x, coords.y, { button: "right" });
}

/**
 * Open the network editor panel for a given network node.
 */
export async function openNetworkEditor(page: Page, nodeId: string): Promise<void> {
  const opened = await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    if (!dev?.openNetworkEditor) return false;
    dev.openNetworkEditor(id);
    return true;
  }, nodeId);

  if (!opened) {
    throw new Error("openNetworkEditor is not available on window.__DEV__");
  }
}

/**
 * Perform zoom via mouse wheel.
 */
export async function mouseWheelZoom(
  page: Page,
  x: number,
  y: number,
  deltaY: number
): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, deltaY);
}

/**
 * Get the number of selected nodes.
 */
export async function getSelectedNodeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return 0;
    const nodes = rf.getNodes?.() ?? [];
    return nodes.filter((n: any) => n.selected).length;
  });
}

/**
 * Get the IDs of selected nodes.
 */
export async function getSelectedNodeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return [];
    const nodes = rf.getNodes?.() ?? [];
    return nodes.filter((n: any) => n.selected).map((n: any) => n.id);
  });
}

/**
 * Get the number of selected edges.
 */
export async function getSelectedEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return 0;
    const edges = rf.getEdges?.() ?? [];
    return edges.filter((e: any) => e.selected).length;
  });
}

/**
 * Get the IDs of selected edges.
 */
export async function getSelectedEdgeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return [];
    const edges = rf.getEdges?.() ?? [];
    return edges.filter((e: any) => e.selected).map((e: any) => e.id);
  });
}

/**
 * Clear all selections in the graph.
 */
export async function clearSelection(page: Page): Promise<void> {
  // Press Escape to clear selection
  await page.keyboard.press("Escape");
}

/**
 * Get the edge count in the graph.
 */
export async function getEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return 0;
    const edges = rf.getEdges?.() ?? [];
    return edges.length;
  });
}

/**
 * Get an edge's bounding box in page coordinates.
 */
export async function getEdgeBoundingBox(
  page: Page,
  edgeId: string
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return null;

    const edges = rf.getEdges?.() ?? [];
    const edge = edges.find((e: any) => e.id === id);
    if (!edge) return null;

    const nodes = rf.getNodes?.() ?? [];
    const sourceNode = nodes.find((n: any) => n.id === edge.source);
    const targetNode = nodes.find((n: any) => n.id === edge.target);
    if (!sourceNode || !targetNode) return null;

    const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    const container = document.querySelector(".react-flow");
    const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

    // Calculate bounding box from source and target positions
    const minX = Math.min(sourceNode.position.x, targetNode.position.x);
    const minY = Math.min(sourceNode.position.y, targetNode.position.y);
    const maxX = Math.max(sourceNode.position.x, targetNode.position.x) + 60; // Add node width
    const maxY = Math.max(sourceNode.position.y, targetNode.position.y) + 60;

    return {
      x: rect.left + minX * viewport.zoom + viewport.x,
      y: rect.top + minY * viewport.zoom + viewport.y,
      width: (maxX - minX) * viewport.zoom,
      height: (maxY - minY) * viewport.zoom
    };
  }, edgeId);
}

/**
 * Get the midpoint of an edge line in page coordinates.
 * Uses the geometric midpoint between source and target nodes.
 */
export async function getEdgeMidpoint(
  page: Page,
  edgeId: string
): Promise<{ x: number; y: number } | null> {
  return await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const rf = dev?.rfInstance;
    if (!rf) return null;

    const edges = rf.getEdges?.() ?? [];
    const edge = edges.find((e: any) => e.id === id);
    if (!edge) return null;

    const nodes = rf.getNodes?.() ?? [];
    const sourceNode = nodes.find((n: any) => n.id === edge.source);
    const targetNode = nodes.find((n: any) => n.id === edge.target);
    if (!sourceNode || !targetNode) return null;

    const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
    const container = document.querySelector(".react-flow");
    const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

    // Calculate geometric midpoint (adding 30 for node center offset)
    const midX = (sourceNode.position.x + targetNode.position.x) / 2 + 30;
    const midY = (sourceNode.position.y + targetNode.position.y) / 2 + 30;

    return {
      x: rect.left + midX * viewport.zoom + viewport.x,
      y: rect.top + midY * viewport.zoom + viewport.y
    };
  }, edgeId);
}

/**
 * Press a keyboard shortcut.
 */
export async function pressShortcut(
  page: Page,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
): Promise<void> {
  if (modifiers.ctrl) await page.keyboard.down("Control");
  if (modifiers.shift) await page.keyboard.down("Shift");
  if (modifiers.alt) await page.keyboard.down("Alt");
  if (modifiers.meta) await page.keyboard.down("Meta");

  await page.keyboard.press(key);

  if (modifiers.meta) await page.keyboard.up("Meta");
  if (modifiers.alt) await page.keyboard.up("Alt");
  if (modifiers.shift) await page.keyboard.up("Shift");
  if (modifiers.ctrl) await page.keyboard.up("Control");
}

/**
 * Perform box selection by dragging from one corner to another.
 * Uses a delay after pressing Shift to ensure the key state is registered.
 */
export async function boxSelect(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await page.keyboard.down("Shift");
  // Delay to ensure Shift key state is registered before the drag (same as shiftClick)
  await page.waitForTimeout(100);
  await drag(page, from, to, { steps: 5 });
  await page.keyboard.up("Shift");
}
