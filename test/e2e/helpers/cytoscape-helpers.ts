import { Page } from '@playwright/test';

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
 */
export async function shiftClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
}
