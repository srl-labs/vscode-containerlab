import type { Page, Locator } from '@playwright/test';

/**
 * Convert Cytoscape model coordinates to page/screen coordinates.
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
      const cy = dev?.stateManager?.cy;
      if (!cy) return { x: 0, y: 0 };

      const pan = cy.pan();
      const zoom = cy.zoom();
      const container = cy.container();
      const rect = container.getBoundingClientRect();

      return {
        x: rect.left + mx * zoom + pan.x,
        y: rect.top + my * zoom + pan.y
      };
    },
    { mx: modelX, my: modelY }
  );
}

/**
 * Convert page/screen coordinates to Cytoscape model coordinates.
 */
export async function pageToModelCoords(
  page: Page,
  pageX: number,
  pageY: number
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    ({ px, py }) => {
      const dev = (window as any).__DEV__;
      const cy = dev?.stateManager?.cy;
      if (!cy) return { x: 0, y: 0 };

      const pan = cy.pan();
      const zoom = cy.zoom();
      const container = cy.container();
      const rect = container.getBoundingClientRect();

      return {
        x: (px - rect.left - pan.x) / zoom,
        y: (py - rect.top - pan.y) / zoom
      };
    },
    { px: pageX, py: pageY }
  );
}

/**
 * Get the current zoom level of the Cytoscape canvas.
 */
export async function getZoom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    return dev?.stateManager?.cy?.zoom() ?? 1;
  });
}

/**
 * Get the current pan position of the Cytoscape canvas.
 */
export async function getPan(page: Page): Promise<{ x: number; y: number }> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    return dev?.stateManager?.cy?.pan() ?? { x: 0, y: 0 };
  });
}

/**
 * Fit the graph to the viewport.
 */
export async function fitGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    dev?.stateManager?.cy?.fit();
  });
  await page.waitForTimeout(300);
}

/**
 * Get all node IDs in the graph.
 */
export async function getAllNodeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.stateManager?.cy;
    if (!cy) return [];
    return cy
      .nodes()
      .filter((n: any) => {
        const role = n.data('topoViewerRole');
        return role && role !== 'freeText' && role !== 'freeShape';
      })
      .map((n: any) => n.id());
  });
}

/**
 * Get all edge IDs in the graph.
 */
export async function getAllEdgeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.stateManager?.cy;
    if (!cy) return [];
    return cy.edges().map((e: any) => e.id());
  });
}

/**
 * Check if a node is selected.
 */
export async function isNodeSelected(page: Page, nodeId: string): Promise<boolean> {
  return await page.evaluate((id) => {
    const dev = (window as any).__DEV__;
    const cy = dev?.stateManager?.cy;
    const node = cy?.getElementById(id);
    return node?.selected() ?? false;
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
 * Uses a small delay to ensure Shift key is registered before click.
 */
export async function shiftClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('Shift');
  // Small delay to ensure Shift key state is registered
  await page.waitForTimeout(50);
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
}

/**
 * Perform a Ctrl+Click (or Cmd+Click on Mac) at the specified position.
 */
export async function ctrlClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('Control');
  await page.mouse.click(x, y);
  await page.keyboard.up('Control');
}

/**
 * Perform an Alt+Click at the specified position.
 * Used for deleting elements (nodes, edges, annotations, groups).
 */
export async function altClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('Alt');
  // Small delay to ensure Alt key state is registered
  await page.waitForTimeout(50);
  await page.mouse.click(x, y);
  await page.keyboard.up('Alt');
}

/**
 * Perform an Alt+Click directly on an element using dispatchEvent.
 * This is useful for narrow or overlapping HTML elements where coordinate-based
 * clicking might land on the wrong element.
 * Used for deleting HTML overlay elements (text annotations, shape annotations).
 */
export async function altClickElement(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error('Element not found');

  await page.evaluate((el) => {
    const clickEvent = new MouseEvent('click', {
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
  await page.mouse.click(x, y, { button: 'right' });
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
    const cy = dev?.cy;
    if (!cy) return 0;
    return cy.nodes(':selected').length;
  });
}

/**
 * Get the IDs of selected nodes.
 */
export async function getSelectedNodeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (!cy) return [];
    return cy.nodes(':selected').map((n: any) => n.id());
  });
}

/**
 * Get the number of selected edges.
 */
export async function getSelectedEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (!cy) return 0;
    return cy.edges(':selected').length;
  });
}

/**
 * Get the IDs of selected edges.
 */
export async function getSelectedEdgeIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (!cy) return [];
    return cy.edges(':selected').map((e: any) => e.id());
  });
}

/**
 * Clear all selections in the graph.
 */
export async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (cy) {
      cy.elements().unselect();
    }
  });
}

/**
 * Get the edge count in the graph.
 */
export async function getEdgeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const dev = (window as any).__DEV__;
    const cy = dev?.cy;
    if (!cy) return 0;
    return cy.edges().length;
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
    const cy = dev?.cy;
    const edge = cy?.getElementById(id);
    if (!edge || edge.empty()) return null;

    const bb = edge.renderedBoundingBox();
    const container = cy.container();
    const rect = container.getBoundingClientRect();

    return {
      x: rect.left + bb.x1,
      y: rect.top + bb.y1,
      width: bb.w,
      height: bb.h
    };
  }, edgeId);
}

/**
 * Get the midpoint of an edge in page coordinates.
 */
export async function getEdgeMidpoint(
  page: Page,
  edgeId: string
): Promise<{ x: number; y: number } | null> {
  const box = await getEdgeBoundingBox(page, edgeId);
  if (!box) return null;
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

/**
 * Press a keyboard shortcut.
 */
export async function pressShortcut(
  page: Page,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
): Promise<void> {
  if (modifiers.ctrl) await page.keyboard.down('Control');
  if (modifiers.shift) await page.keyboard.down('Shift');
  if (modifiers.alt) await page.keyboard.down('Alt');
  if (modifiers.meta) await page.keyboard.down('Meta');

  await page.keyboard.press(key);

  if (modifiers.meta) await page.keyboard.up('Meta');
  if (modifiers.alt) await page.keyboard.up('Alt');
  if (modifiers.shift) await page.keyboard.up('Shift');
  if (modifiers.ctrl) await page.keyboard.up('Control');
}

/**
 * Perform box selection by dragging from one corner to another.
 */
export async function boxSelect(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await page.keyboard.down('Shift');
  await drag(page, from, to, { steps: 5 });
  await page.keyboard.up('Shift');
}
