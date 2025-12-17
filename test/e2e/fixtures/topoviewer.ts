import { test as base, Locator } from '@playwright/test';

// Test selectors
const CANVAS_SELECTOR = '[data-testid="cytoscape-canvas"]';
const APP_SELECTOR = '[data-testid="topoviewer-app"]';

/**
 * Topology names available in dev mode
 */
type TopologyName =
  | 'sample'
  | 'sampleWithAnnotations'
  | 'annotated'
  | 'network'
  | 'empty'
  | 'large'
  | 'large100'
  | 'large1000';

/**
 * Helper interface for interacting with TopoViewer
 */
interface TopoViewerPage {
  /** Navigate to TopoViewer and optionally load a specific topology */
  goto(topology?: TopologyName): Promise<void>;

  /** Wait for the canvas to be fully initialized */
  waitForCanvasReady(): Promise<void>;

  /** Get the center coordinates of the canvas in page coordinates */
  getCanvasCenter(): Promise<{ x: number; y: number }>;

  /** Get the current number of nodes in the graph */
  getNodeCount(): Promise<number>;

  /** Get a node's position in model coordinates */
  getNodePosition(nodeId: string): Promise<{ x: number; y: number }>;

  /** Get a node's bounding box in page coordinates */
  getNodeBoundingBox(nodeId: string): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;

  /** Get the canvas locator */
  getCanvas(): Locator;

  /** Set mode to edit */
  setEditMode(): Promise<void>;

  /** Set mode to view */
  setViewMode(): Promise<void>;

  /** Unlock the canvas for editing */
  unlock(): Promise<void>;

  /** Lock the canvas */
  lock(): Promise<void>;

  /** Check if canvas is locked */
  isLocked(): Promise<boolean>;

  /** Get the IDs of all nodes */
  getNodeIds(): Promise<string[]>;

  /** Select a node by clicking on it */
  selectNode(nodeId: string): Promise<void>;

  /** Get the number of groups */
  getGroupCount(): Promise<number>;

  /** Get all group IDs */
  getGroupIds(): Promise<string[]>;
}

/**
 * Extended test fixture with TopoViewer helpers
 */
export const test = base.extend<{ topoViewerPage: TopoViewerPage }>({
  topoViewerPage: async ({ page }, use) => {
    const topoViewerPage: TopoViewerPage = {
      goto: async (topology: TopologyName = 'sampleWithAnnotations') => {
        await page.goto('/');
        await page.waitForSelector(APP_SELECTOR, { timeout: 30000 });

        // Load specific topology via dev API
        if (topology !== 'sample') {
          await page.evaluate((topo) => {
            (window as any).__DEV__.loadTopology(topo);
          }, topology);
          // Wait for topology data to propagate
          await page.waitForTimeout(500);
        }
      },

      waitForCanvasReady: async () => {
        // Wait for canvas container
        await page.waitForSelector(CANVAS_SELECTOR, { timeout: 10000 });

        // Wait for Cytoscape instance to be exposed via __DEV__.cy
        await page.waitForFunction(
          () => {
            const dev = (window as any).__DEV__;
            return dev?.cy !== undefined;
          },
          { timeout: 15000 }
        );

        // Wait for layout to settle
        await page.waitForTimeout(1000);
      },

      getCanvasCenter: async () => {
        const canvas = page.locator(CANVAS_SELECTOR);
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Canvas not found');
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2
        };
      },

      getNodeCount: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return 0;
          // Filter out non-topology nodes (annotations, etc.)
          return cy.nodes().filter((n: any) => {
            const role = n.data('topoViewerRole');
            return role && role !== 'freeText' && role !== 'freeShape';
          }).length;
        });
      },

      getNodePosition: async (nodeId: string) => {
        return await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          const node = cy?.getElementById(id);
          if (!node || node.empty()) return { x: 0, y: 0 };
          return node.position();
        }, nodeId);
      },

      getNodeBoundingBox: async (nodeId: string) => {
        return await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          const node = cy?.getElementById(id);
          if (!node || node.empty()) return null;

          const bb = node.renderedBoundingBox();
          const container = cy.container();
          const rect = container.getBoundingClientRect();

          return {
            x: rect.left + bb.x1,
            y: rect.top + bb.y1,
            width: bb.w,
            height: bb.h
          };
        }, nodeId);
      },

      getCanvas: () => {
        return page.locator(CANVAS_SELECTOR);
      },

      setEditMode: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setMode('edit');
        });
        await page.waitForTimeout(100);
      },

      setViewMode: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setMode('view');
        });
        await page.waitForTimeout(100);
      },

      unlock: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setLocked(false);
        });
        await page.waitForTimeout(100);
      },

      lock: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setLocked(true);
        });
        await page.waitForTimeout(100);
      },

      isLocked: async () => {
        return await page.evaluate(() => {
          return (window as any).__DEV__.isLocked();
        });
      },

      getNodeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return [];
          return cy
            .nodes()
            .filter((n: any) => {
              const role = n.data('topoViewerRole');
              return role && role !== 'freeText' && role !== 'freeShape';
            })
            .map((n: any) => n.id());
        });
      },

      selectNode: async (nodeId: string) => {
        const box = await topoViewerPage.getNodeBoundingBox(nodeId);
        if (!box) throw new Error(`Node ${nodeId} not found`);

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
      },

      getGroupCount: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const annotations = dev?.stateManager?.getAnnotations?.();
          return annotations?.groupStyleAnnotations?.length ?? 0;
        });
      },

      getGroupIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const annotations = dev?.stateManager?.getAnnotations?.();
          return (annotations?.groupStyleAnnotations ?? []).map((g: any) => g.id);
        });
      }
    };

    await use(topoViewerPage);
  }
});

export { expect } from '@playwright/test';
