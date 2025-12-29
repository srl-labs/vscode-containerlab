import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import * as path from 'path';

import type { Locator, TestInfo } from '@playwright/test';
import { test as base } from '@playwright/test';

// Test selectors
const CANVAS_SELECTOR = '[data-testid="cytoscape-canvas"]';
const APP_SELECTOR = '[data-testid="topoviewer-app"]';

// Topologies directory path (must match dev server config)
const TOPOLOGIES_DIR = path.resolve(__dirname, '../../../dev/topologies');

/**
 * Generate a unique session ID for test isolation
 */
function generateSessionId(): string {
  return `test-${randomUUID()}`;
}

// Type definitions for browser-side evaluation results
interface CreateGroupResult {
  method: string;
  selectedBefore: string[];
  selectedAfter?: string[];
  mode?: string;
  isLocked?: boolean;
  groupsBefore: number;
  groupsAfter: number | null;
  reactGroupsBefore: number | string;
  reactGroupsAfter?: number | string;
  hasCy?: boolean;
}

interface GroupDebugInfo {
  reactGroupCount: number;
  reactGroupsDirectCount: number | string;
  stateManagerGroupCount: number;
  reactGroupIds: string[];
  stateManagerGroupIds: string[];
}

/**
 * Browser-side function to create a group from selected nodes.
 * Note: All helper logic is inlined because page.evaluate() only serializes this function,
 * not any external references from the module scope.
 */
function browserCreateGroup(): CreateGroupResult {
  const dev = (window as any).__DEV__;
  const cy = dev?.cy;

  // Inline helper: get selected node IDs
  const getSelectedNodeIds = (c: any): string[] => {
    if (!c) return [];
    return c.nodes(':selected').map((n: any) => n.id());
  };

  // Inline helper: get state manager group count
  const getStateManagerGroupCount = (d: any): number => {
    const annotations = d?.stateManager?.getAnnotations?.();
    return annotations?.groupStyleAnnotations?.length ?? 0;
  };

  // Inline helper: get react group count
  const getReactGroupCount = (d: any): number | string => {
    const groups = d?.getReactGroups?.();
    return groups?.length ?? 'undefined';
  };

  // Inline helper: dispatch keyboard event
  const dispatchGroupKeyboardEvent = (): void => {
    const event = new KeyboardEvent('keydown', {
      key: 'g',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
  };

  const selectedBefore = getSelectedNodeIds(cy);
  const mode = dev?.stateManager?.getMode?.();
  const isLocked = dev?.isLocked?.();
  const groupsBefore = getStateManagerGroupCount(dev);
  const reactGroupsBefore = getReactGroupCount(dev);

  if (!dev?.createGroupFromSelected) {
    dispatchGroupKeyboardEvent();
    return { method: 'keyboard', selectedBefore, mode, isLocked, groupsBefore, groupsAfter: null, reactGroupsBefore };
  }

  dev.createGroupFromSelected();
  return {
    method: 'direct',
    selectedBefore,
    selectedAfter: getSelectedNodeIds(cy),
    mode,
    isLocked,
    groupsBefore,
    groupsAfter: getStateManagerGroupCount(dev),
    reactGroupsBefore,
    reactGroupsAfter: getReactGroupCount(dev),
    hasCy: !!cy
  };
}

/**
 * Browser-side function to get group debug info.
 * Note: Helper logic is inlined for page.evaluate() compatibility.
 */
function browserGetGroupDebugInfo(): GroupDebugInfo {
  const dev = (window as any).__DEV__;
  const reactGroups = dev?.getReactGroups?.() ?? [];
  const stateManagerGroups = dev?.stateManager?.getAnnotations?.()?.groupStyleAnnotations ?? [];

  // Inline helper: get group IDs
  const getGroupIds = (groups: any[]): string[] => groups.map((g: any) => g.id);

  return {
    reactGroupCount: reactGroups.length,
    reactGroupsDirectCount: dev?.groupsCount ?? 'undefined',
    stateManagerGroupCount: stateManagerGroups.length,
    reactGroupIds: getGroupIds(reactGroups),
    stateManagerGroupIds: getGroupIds(stateManagerGroups)
  };
}

/**
 * Topology files available in dev/topologies/ (file-based)
 */
type TopologyFileName =
  | 'simple.clab.yml'
  | 'spine-leaf.clab.yml'
  | 'datacenter.clab.yml'
  | 'network.clab.yml'
  | 'empty.clab.yml'
  | string; // Allow any filename for dynamic tests

/**
 * Annotations structure from file API
 */
interface TopologyAnnotations {
  nodeAnnotations?: Array<{ id: string; position?: { x: number; y: number }; group?: string; level?: string }>;
  freeTextAnnotations?: Array<{ id: string; text: string; position: { x: number; y: number } }>;
  freeShapeAnnotations?: Array<{ id: string; shapeType: string; position: { x: number; y: number } }>;
  groupStyleAnnotations?: Array<{ id: string; name: string; parentId?: string }>;
  networkNodeAnnotations?: Array<{ id: string; type: string; label: string; position: { x: number; y: number } }>;
  aliasEndpointAnnotations?: Array<{ id: string }>;
}

/**
 * Helper interface for interacting with TopoViewer
 */
interface TopoViewerPage {
  /** Navigate to TopoViewer and load a file-based topology (real file I/O) */
  gotoFile(filename: TopologyFileName): Promise<void>;

  /** Get the currently loaded file path (null if in-memory) */
  getCurrentFile(): Promise<string | null>;

  /** Read annotations from file API */
  getAnnotationsFromFile(filename: TopologyFileName): Promise<TopologyAnnotations>;

  /** Read YAML content from file API */
  getYamlFromFile(filename: TopologyFileName): Promise<string>;

  /** List available topology files */
  listTopologyFiles(): Promise<Array<{ filename: string; hasAnnotations: boolean }>>;

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

  /** Get all edge IDs */
  getEdgeIds(): Promise<string[]>;

  /** Get edge count */
  getEdgeCount(): Promise<number>;

  /** Select an edge by clicking on it */
  selectEdge(edgeId: string): Promise<void>;

  /** Get the current zoom level */
  getZoom(): Promise<number>;

  /** Get the current pan position */
  getPan(): Promise<{ x: number; y: number }>;

  /** Set zoom level */
  setZoom(zoom: number): Promise<void>;

  /** Set pan position */
  setPan(x: number, y: number): Promise<void>;

  /** Fit graph to viewport */
  fit(): Promise<void>;

  /** Get selected node IDs */
  getSelectedNodeIds(): Promise<string[]>;

  /** Get selected edge IDs */
  getSelectedEdgeIds(): Promise<string[]>;

  /** Clear all selections */
  clearSelection(): Promise<void>;

  /** Delete selected elements */
  deleteSelected(): Promise<void>;

  /** Trigger undo */
  undo(): Promise<void>;

  /** Trigger redo */
  redo(): Promise<void>;

  /** Check if can undo */
  canUndo(): Promise<boolean>;

  /** Check if can redo */
  canRedo(): Promise<boolean>;

  /** Create a node at a specific position */
  createNode(nodeId: string, position: { x: number; y: number }, kind?: string): Promise<void>;

  /** Create a link between two nodes */
  createLink(sourceId: string, targetId: string, sourceEndpoint?: string, targetEndpoint?: string): Promise<void>;

  /** Reset all topology and annotation files to defaults (for test isolation) */
  resetFiles(): Promise<void>;

  /** Select a group by ID (programmatic) */
  selectGroup(groupId: string): Promise<void>;

  /** Get member node IDs for a group */
  getGroupMembers(groupId: string): Promise<string[]>;

  /** Perform copy (Ctrl+C) */
  copy(): Promise<void>;

  /** Perform paste (Ctrl+V) */
  paste(): Promise<void>;

  /** Create a group from selected nodes (Ctrl+G) */
  createGroup(): Promise<void>;

  /** Resize a group by dragging a resize handle */
  resizeGroup(groupId: string, corner: 'nw' | 'ne' | 'sw' | 'se', delta: { x: number; y: number }): Promise<void>;

  /** Delete a node by ID */
  deleteNode(nodeId: string): Promise<void>;

  /** Delete an edge by ID */
  deleteEdge(edgeId: string): Promise<void>;

  /** Write YAML content to a file (for live update testing) */
  writeYamlFile(filename: TopologyFileName, content: string): Promise<void>;

  /** Write annotations content to a file (for live update testing) */
  writeAnnotationsFile(filename: TopologyFileName, content: object): Promise<void>;

  /** Read YAML content from a file (for verifying persistence) */
  readYamlFile(filename: TopologyFileName): Promise<string>;
}

/**
 * Extended test fixture with TopoViewer helpers
 */
// Base URL for API requests (must be absolute since page hasn't navigated yet)
const API_BASE_URL = 'http://localhost:5173';

export const test = base.extend<{ topoViewerPage: TopoViewerPage }>({
  topoViewerPage: async ({ page, request }, use, testInfo: TestInfo) => {
    // Generate unique session ID for test isolation
    const sessionId = generateSessionId();

    // Capture browser console logs for debugging on failure
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const timestamp = new Date().toISOString();
      const type = msg.type().toUpperCase().padEnd(7);
      consoleLogs.push(`[${timestamp}] [${type}] ${msg.text()}`);
    });

    // Helper to add session ID to API URLs (uses absolute URL for API calls)
    const withSession = (url: string) => {
      const separator = url.includes('?') ? '&' : '?';
      return `${API_BASE_URL}${url}${separator}sessionId=${sessionId}`;
    };

    // Initialize session with default files using request fixture
    await request.post(withSession('/api/reset'));

    const topoViewerPage: TopoViewerPage = {
      gotoFile: async (filename: string) => {
        // Pass session ID via URL so auto-load uses correct session
        await page.goto(`${API_BASE_URL}/?sessionId=${sessionId}`);
        await page.waitForSelector(APP_SELECTOR, { timeout: 30000 });

        // Wait for the page to be ready (including auto-load of default topology)
        await page.waitForFunction(
          () => (window as any).__DEV__?.cy !== undefined,
          { timeout: 15000 }
        );

        // Wait a bit for any auto-load to settle
        await page.waitForTimeout(300);

        // Load file-based topology via dev API with session ID
        // Retry up to 3 times if loading fails
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // Load the file
            const loadResult = await page.evaluate(async ({ file, sid }) => {
              try {
                await (window as any).__DEV__.loadTopologyFile(file, sid);
                return { success: true };
              } catch (e: any) {
                return { success: false, error: e?.message || String(e) };
              }
            }, { file: filename, sid: sessionId });

            if (!loadResult.success) {
              throw new Error(`loadTopologyFile failed: ${loadResult.error}`);
            }

            // Wait for the topology data to propagate and confirm the file is loaded
            await page.waitForFunction(
              (expectedFile) => {
                const currentFile = (window as any).__DEV__?.getCurrentFile?.();
                return currentFile === expectedFile;
              },
              filename,
              { timeout: 5000 }
            );

            // Verify nodes are actually loaded if this is not empty.clab.yml
            if (filename === 'simple.clab.yml') {
              await page.waitForFunction(
                () => {
                  const dev = (window as any).__DEV__;
                  const cy = dev?.cy;
                  if (!cy) return false;
                  const nodes = cy.nodes().filter((n: any) => {
                    const role = n.data('topoViewerRole');
                    return role && role !== 'freeText' && role !== 'freeShape';
                  });
                  return nodes.length >= 2;
                },
                { timeout: 5000 }
              );
            }

            // Success - break out of retry loop
            break;
          } catch (error) {
            if (attempt === maxRetries) {
              throw new Error(`Failed to load ${filename} after ${maxRetries} attempts: ${error}`);
            }
            // Wait before retrying
            await page.waitForTimeout(500);
          }
        }

        // Additional wait for graph to stabilize
        await page.waitForTimeout(300);
      },

      getCurrentFile: async () => {
        return await page.evaluate(() => {
          return (window as any).__DEV__.getCurrentFile();
        });
      },

      getAnnotationsFromFile: async (filename: string) => {
        // Build full path to annotations file
        const annotationsPath = path.join(TOPOLOGIES_DIR, `${filename}.annotations.json`);
        const response = await page.request.get(withSession(`/file/${encodeURIComponent(annotationsPath)}`));
        if (!response.ok()) {
          if (response.status() === 404) {
            // Return empty annotations if file doesn't exist
            return { nodeAnnotations: [], freeTextAnnotations: [], freeShapeAnnotations: [], groupStyleAnnotations: [] };
          }
          throw new Error(`Failed to read annotations: ${response.statusText()}`);
        }
        const text = await response.text();
        return JSON.parse(text);
      },

      getYamlFromFile: async (filename: string) => {
        // Build full path to YAML file
        const yamlPath = path.join(TOPOLOGIES_DIR, filename);
        const response = await page.request.get(withSession(`/file/${encodeURIComponent(yamlPath)}`));
        if (!response.ok()) {
          throw new Error(`Failed to read YAML: ${response.statusText()}`);
        }
        return response.text();
      },

      listTopologyFiles: async () => {
        const response = await page.request.get(withSession('/files'));
        if (!response.ok()) {
          throw new Error(`Failed to list files: ${response.statusText()}`);
        }
        return response.json();
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

        // Wait for the initial layout to complete (or be skipped for preset layouts).
        // This is set by `useElementsUpdate` via `cy.scratch('initialLayoutDone', true)`.
        await page.waitForFunction(
          () => {
            const dev = (window as any).__DEV__;
            const cy = dev?.cy;
            if (!cy) return false;
            return cy.scratch?.('initialLayoutDone') === true;
          },
          { timeout: 15000, polling: 200 }
        );
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
          // Try React state first
          const reactGroups = dev?.getReactGroups?.();
          const stateManagerGroups = dev?.stateManager?.getAnnotations?.()?.groupStyleAnnotations ?? [];

          // If React has groups, use React count
          if (reactGroups && reactGroups.length > 0) {
            return reactGroups.length;
          }
          // If React is empty but stateManager has groups (initial load scenario), use stateManager
          if (stateManagerGroups.length > 0) {
            return stateManagerGroups.length;
          }
          // Both empty
          return reactGroups?.length ?? 0;
        });
      },

      getGroupIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          // Try React state first
          const reactGroups = dev?.getReactGroups?.();
          const stateManagerGroups = dev?.stateManager?.getAnnotations?.()?.groupStyleAnnotations ?? [];

          // If React has groups, use React IDs
          if (reactGroups && reactGroups.length > 0) {
            return reactGroups.map((g: any) => g.id);
          }
          // If React is empty but stateManager has groups (initial load scenario), use stateManager
          if (stateManagerGroups.length > 0) {
            return stateManagerGroups.map((g: any) => g.id);
          }
          // Both empty
          return [];
        });
      },

      getEdgeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return [];
          return cy.edges().map((e: any) => e.id());
        });
      },

      getEdgeCount: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return 0;
          return cy.edges().length;
        });
      },

      selectEdge: async (edgeId: string) => {
        const midpoint = await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          const edge = cy?.getElementById(id);
          if (!edge || edge.empty()) return null;

          const bb = edge.renderedBoundingBox();
          const container = cy.container();
          const rect = container.getBoundingClientRect();

          return {
            x: rect.left + bb.x1 + bb.w / 2,
            y: rect.top + bb.y1 + bb.h / 2
          };
        }, edgeId);

        if (!midpoint) throw new Error(`Edge ${edgeId} not found`);
        await page.mouse.click(midpoint.x, midpoint.y);
        await page.waitForTimeout(100);
      },

      getZoom: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          return dev?.cy?.zoom() ?? 1;
        });
      },

      getPan: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          return dev?.cy?.pan() ?? { x: 0, y: 0 };
        });
      },

      setZoom: async (zoom: number) => {
        await page.evaluate((z) => {
          const dev = (window as any).__DEV__;
          dev?.cy?.zoom(z);
        }, zoom);
        await page.waitForTimeout(100);
      },

      setPan: async (x: number, y: number) => {
        await page.evaluate(({ px, py }) => {
          const dev = (window as any).__DEV__;
          dev?.cy?.pan({ x: px, y: py });
        }, { px: x, py: y });
        await page.waitForTimeout(100);
      },

      fit: async () => {
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          dev?.cy?.fit();
        });
        await page.waitForTimeout(300);
      },

      getSelectedNodeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return [];
          return cy.nodes(':selected').map((n: any) => n.id());
        });
      },

      getSelectedEdgeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const cy = dev?.cy;
          if (!cy) return [];
          return cy.edges(':selected').map((e: any) => e.id());
        });
      },

      clearSelection: async () => {
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          dev?.cy?.elements().unselect();
        });
        await page.waitForTimeout(100);
      },

      deleteSelected: async () => {
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);
      },

      undo: async () => {
        await page.keyboard.down('Control');
        await page.keyboard.press('z');
        await page.keyboard.up('Control');
        await page.waitForTimeout(200);
      },

      redo: async () => {
        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        await page.keyboard.press('z');
        await page.keyboard.up('Shift');
        await page.keyboard.up('Control');
        await page.waitForTimeout(200);
      },

      canUndo: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          return dev?.undoRedo?.canUndo ?? false;
        });
      },

      canRedo: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          return dev?.undoRedo?.canRedo ?? false;
        });
      },

      createNode: async (nodeId: string, position: { x: number; y: number }, kind = 'nokia_srlinux') => {
        // Wait for handleNodeCreatedCallback to be available (exposed via __DEV__)
        await page.waitForFunction(
          () => (window as any).__DEV__?.handleNodeCreatedCallback !== undefined,
          { timeout: 10000 }
        );

        await page.evaluate(
          ({ nodeId, position, kind }) => {
            const dev = (window as any).__DEV__;
            if (!dev?.handleNodeCreatedCallback) {
              throw new Error('handleNodeCreatedCallback not available');
            }

            // Create node data matching the structure expected by the handler
            const nodeData = {
              id: nodeId,
              name: nodeId,
              topoViewerRole: 'pe',
              extraData: {
                kind,
                image: 'ghcr.io/nokia/srlinux:latest',
                longname: '',
                mgmtIpv4Address: ''
              }
            };

            // Create the node element
            const nodeElement = {
              group: 'nodes' as const,
              data: nodeData,
              position
            };

            // Call handleNodeCreatedCallback which:
            // 1. Adds the node to React state
            // 2. Sends create-node to extension
            // 3. Pushes undo action
            dev.handleNodeCreatedCallback(nodeId, nodeElement, position);
          },
          { nodeId, position, kind }
        );

        // Wait for the node to appear in Cytoscape (state-driven sync)
        await page.waitForFunction(
          (id) => {
            const dev = (window as any).__DEV__;
            const cy = dev?.cy;
            if (!cy) return false;
            const el = cy.getElementById(id);
            return el && el.length > 0;
          },
          nodeId,
          { timeout: 5000 }
        );
      },

      createLink: async (
        sourceId: string,
        targetId: string,
        sourceEndpoint = 'eth1',
        targetEndpoint = 'eth1'
      ) => {
        // Wait for handleEdgeCreated to be available (exposed via __DEV__)
        await page.waitForFunction(
          () => (window as any).__DEV__?.handleEdgeCreated !== undefined,
          { timeout: 10000 }
        );

        // Check lock state and mode before proceeding (respects UI restrictions)
        const canCreate = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          // Block if locked (isLocked is a function) or not in edit mode
          if (typeof dev?.isLocked === 'function' && dev.isLocked() === true) return false;
          if (typeof dev?.mode === 'function' && dev.mode() !== 'edit') return false;
          return true;
        });

        if (!canCreate) {
          // Silently skip edge creation when locked or in view mode
          // (matches UI behavior where edge handles are disabled)
          return;
        }

        await page.evaluate(
          ({ sourceId, targetId, sourceEndpoint, targetEndpoint }) => {
            const dev = (window as any).__DEV__;
            if (!dev?.handleEdgeCreated) {
              throw new Error('handleEdgeCreated not available');
            }

            // Include endpoints in ID to allow multiple edges between same nodes
            const linkId = `${sourceId}:${sourceEndpoint}-${targetId}:${targetEndpoint}`;
            const linkData = {
              id: linkId,
              source: sourceId,
              target: targetId,
              sourceEndpoint,
              targetEndpoint
            };

            // Call handleEdgeCreated which:
            // 1. Adds the edge to React state
            // 2. Sends create-link to extension
            // 3. Pushes undo action
            dev.handleEdgeCreated(sourceId, targetId, linkData);
          },
          { sourceId, targetId, sourceEndpoint, targetEndpoint }
        );

        // Include endpoints in ID to allow multiple edges between same nodes (including self-loops/hairpins)
        const linkId = `${sourceId}:${sourceEndpoint}-${targetId}:${targetEndpoint}`;
        await page.waitForFunction(
          (id) => {
            const dev = (window as any).__DEV__;
            const cy = dev?.cy;
            if (!cy) return false;
            const el = cy.getElementById(id);
            return el && el.length > 0;
          },
          linkId,
          { timeout: 5000 }
        );
      },

      resetFiles: async () => {
        const response = await request.post(withSession('/api/reset'));
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to reset files');
        }
        // Wait for session reset to settle
        await page.waitForTimeout(100);
      },

      selectGroup: async (groupId: string) => {
        await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          if (dev?.stateManager?.groups?.selectGroup) {
            dev.stateManager.groups.selectGroup(id);
          } else if (dev?.groups?.selectGroup) {
            dev.groups.selectGroup(id);
          }
        }, groupId);
        await page.waitForTimeout(100);
      },

      getGroupMembers: async (groupId: string) => {
        return await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          const annotations = dev?.stateManager?.getAnnotations?.();
          if (!annotations?.nodeAnnotations) return [];
          return annotations.nodeAnnotations
            .filter((n: { id: string; group?: string }) => n.group === id || n.group?.startsWith(id.split('__')[0]))
            .map((n: { id: string; group?: string }) => n.id);
        }, groupId);
      },

      copy: async () => {
        await page.keyboard.down('Control');
        await page.keyboard.press('c');
        await page.keyboard.up('Control');
        await page.waitForTimeout(200);
      },

      paste: async () => {
        await page.keyboard.down('Control');
        await page.keyboard.press('v');
        await page.keyboard.up('Control');
        await page.waitForTimeout(300);
      },

      createGroup: async () => {
        // Use direct API call instead of keyboard events for reliability
        const result = await page.evaluate(browserCreateGroup);
        console.log(`[DEBUG] createGroup: method=${result.method}, hasCy=${result.hasCy}, selected=${result.selectedBefore} -> ${result.selectedAfter}, mode=${result.mode}, isLocked=${result.isLocked}, stateManager: ${result.groupsBefore} -> ${result.groupsAfter}, react: ${result.reactGroupsBefore} -> ${result.reactGroupsAfter}`);
        // Wait for debounced save (300ms) plus processing time
        await page.waitForTimeout(1000);
        // Check again after wait - both React state and stateManager
        const debugInfo = await page.evaluate(browserGetGroupDebugInfo);
        console.log(`[DEBUG] After 1000ms: React groups=${debugInfo.reactGroupCount} (direct: ${debugInfo.reactGroupsDirectCount}) (${debugInfo.reactGroupIds}), StateManager groups=${debugInfo.stateManagerGroupCount} (${debugInfo.stateManagerGroupIds})`);
      },

      resizeGroup: async (groupId: string, corner: 'nw' | 'ne' | 'sw' | 'se', delta: { x: number; y: number }) => {
        // Click the group label to ensure resize handles are rendered (selection/hover-driven UI)
        const label = page.locator(`[data-testid="group-label-${groupId}"]`);
        await label.waitFor({ state: 'visible', timeout: 5000 });
        await label.click();
        await page.waitForTimeout(200);

        const handle = page.locator(`[data-testid="resize-${corner}-${groupId}"]`);
        await handle.waitFor({ state: 'visible', timeout: 5000 });
        const box = await handle.boundingBox();
        if (!box) throw new Error(`Resize handle not found for group ${groupId} (${corner})`);

        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        const endX = startX + delta.x;
        const endY = startY + delta.y;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.mouse.up();

        // Wait for debounced save (300ms) plus processing time
        await page.waitForTimeout(800);
      },

      deleteNode: async (nodeId: string) => {
        // Close any open editor panel first to ensure Delete key goes to the canvas
        const nodeEditor = page.locator('[data-testid="node-editor"]');
        if (await nodeEditor.isVisible()) {
          const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
          await closeBtn.click();
          await page.waitForTimeout(200);
        }

        // Click on canvas background to clear any focus/selection state
        await page.mouse.click(50, 50);
        await page.waitForTimeout(100);

        await topoViewerPage.selectNode(nodeId);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);
      },

      deleteEdge: async (edgeId: string) => {
        // Close any open editor panel first to ensure Delete key goes to the canvas
        const nodeEditor = page.locator('[data-testid="node-editor"]');
        if (await nodeEditor.isVisible()) {
          const closeBtn = page.locator('[data-testid="node-editor"] [data-testid="panel-close-btn"]');
          await closeBtn.click();
          await page.waitForTimeout(200);
        }
        const edgeEditor = page.locator('[data-testid="edge-editor"]');
        if (await edgeEditor.isVisible()) {
          const closeBtn = page.locator('[data-testid="edge-editor"] [data-testid="panel-close-btn"]');
          await closeBtn.click();
          await page.waitForTimeout(200);
        }

        // Click on canvas background to clear any focus/selection state
        await page.mouse.click(50, 50);
        await page.waitForTimeout(100);

        await topoViewerPage.selectEdge(edgeId);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);
      },

      writeYamlFile: async (filename: string, content: string) => {
        // Build full path to YAML file
        const yamlPath = path.join(TOPOLOGIES_DIR, filename);
        const response = await request.put(withSession(`/file/${encodeURIComponent(yamlPath)}`), {
          data: content,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        if (!response.ok()) {
          throw new Error(`Failed to write YAML: ${response.statusText()}`);
        }
      },

      writeAnnotationsFile: async (filename: string, content: object) => {
        // Build full path to annotations file
        const annotationsPath = path.join(TOPOLOGIES_DIR, `${filename}.annotations.json`);
        const response = await request.put(withSession(`/file/${encodeURIComponent(annotationsPath)}`), {
          data: JSON.stringify(content, null, 2),
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        if (!response.ok()) {
          throw new Error(`Failed to write annotations: ${response.statusText()}`);
        }
      },

      readYamlFile: async (filename: string) => {
        // Build full path to YAML file
        const yamlPath = path.join(TOPOLOGIES_DIR, filename);
        const response = await request.get(withSession(`/file/${encodeURIComponent(yamlPath)}`));
        if (!response.ok()) {
          throw new Error(`Failed to read YAML: ${response.statusText()}`);
        }
        return response.text();
      }
    };

    await use(topoViewerPage);

    // Save browser console logs on test failure for debugging
    if (testInfo.status !== testInfo.expectedStatus && consoleLogs.length > 0) {
      const logsContent = consoleLogs.join('\n');

      // Write to file in test-results folder
      const logFilePath = testInfo.outputPath('browser-console-logs.txt');
      writeFileSync(logFilePath, logsContent);

      // Also attach to HTML report
      await testInfo.attach('browser-console-logs', {
        body: logsContent,
        contentType: 'text/plain',
      });
    }
  }
});

export { expect } from '@playwright/test';
