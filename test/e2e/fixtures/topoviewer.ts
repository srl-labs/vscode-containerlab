import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import * as path from "path";

import type { Locator, TestInfo } from "@playwright/test";
import { test as base } from "@playwright/test";

// Test selectors
const CANVAS_SELECTOR = ".react-flow";
const APP_SELECTOR = '[data-testid="topoviewer-app"]';

// Node type constants (used in browser-side code)
const TOPOLOGY_NODE_TYPE = "topology-node";
const CLOUD_NODE_TYPE = "cloud-node";

// Topologies directory path (must match dev server config)
const TOPOLOGIES_DIR = path.resolve(__dirname, "../../../dev/topologies");

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
  reactGroupsBefore: number;
  reactGroupsAfter?: number;
  hasRf?: boolean;
}

interface GroupDebugInfo {
  reactGroupCount: number;
  reactGroupsDirectCount: number;
  stateManagerGroupCount: number;
  reactGroupIds: string[];
  stateManagerGroupIds: string[];
}

// Browser helper functions for page.evaluate() (must be inlined, not referenced)
const getSelectedNodeIds = (rfInstance: unknown): string[] => {
  if (!rfInstance) return [];
  const rf = rfInstance as { getNodes?: () => Array<{ id: string; selected?: boolean }> };
  const nodes = rf.getNodes?.() ?? [];
  return nodes.filter((n) => n.selected).map((n) => n.id);
};

const getReactGroupCount = (d: unknown): number => {
  const dev = d as { getReactGroups?: () => unknown[] } | undefined;
  const groups = dev?.getReactGroups?.();
  return groups?.length ?? -1;
};

const dispatchGroupKeyboardEvent = (): void => {
  const event = new KeyboardEvent("keydown", {
    key: "g",
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(event);
};

/**
 * Browser-side function to create a group from selected nodes.
 * Note: Helper functions must be inlined because page.evaluate() serializes only the function body.
 */
function browserCreateGroup(): CreateGroupResult {
  const dev = (
    window as {
      __DEV__?: {
        rfInstance?: unknown;
        mode?: () => string;
        isLocked?: () => boolean;
        getReactGroups?: () => unknown[];
        createGroupFromSelected?: () => void;
      };
    }
  ).__DEV__;
  const rf = dev?.rfInstance;
  const getSelected = (): string[] => {
    if (!rf) return [];
    const nodes =
      (rf as { getNodes?: () => Array<{ id: string; selected?: boolean }> }).getNodes?.() ?? [];
    return nodes.filter((node) => node.selected).map((node) => node.id);
  };
  const getGroupCount = (): number => (dev?.getReactGroups?.() ?? []).length;

  const base = {
    selectedBefore: getSelected(),
    mode: dev?.mode?.(),
    isLocked: dev?.isLocked?.(),
    groupsBefore: getGroupCount(),
    reactGroupsBefore: getGroupCount()
  };

  if (!dev?.createGroupFromSelected) {
    dispatchGroupKeyboardEvent();
    return { method: "keyboard", ...base, groupsAfter: null };
  }

  dev.createGroupFromSelected();
  return {
    method: "direct",
    ...base,
    selectedAfter: getSelected(),
    groupsAfter: getGroupCount(),
    reactGroupsAfter: getGroupCount(),
    hasRf: !!rf
  };
}

/**
 * Browser-side function to get group debug info.
 * Note: Helper logic is inlined for page.evaluate() compatibility.
 */
function browserGetGroupDebugInfo(): GroupDebugInfo {
  const dev = (window as any).__DEV__;
  const reactGroups = dev?.getReactGroups?.() ?? [];

  // Inline helper: get group IDs
  const getGroupIds = (groups: any[]): string[] => groups.map((g: any) => g.id);

  return {
    reactGroupCount: reactGroups.length,
    reactGroupsDirectCount: dev?.groupsCount ?? -1,
    stateManagerGroupCount: reactGroups.length, // Same as React groups now
    reactGroupIds: getGroupIds(reactGroups),
    stateManagerGroupIds: getGroupIds(reactGroups) // Same as React groups now
  };
}

/**
 * Topology files available in dev/topologies/ (file-based)
 */
type TopologyFileName =
  | "simple.clab.yml"
  | "spine-leaf.clab.yml"
  | "datacenter.clab.yml"
  | "network.clab.yml"
  | "empty.clab.yml"
  | string; // Allow any filename for dynamic tests

/**
 * Annotations structure from file API
 */
interface TopologyAnnotations {
  nodeAnnotations?: Array<{
    id: string;
    position?: { x: number; y: number };
    group?: string;
    level?: string;
  }>;
  freeTextAnnotations?: Array<{ id: string; text: string; position: { x: number; y: number } }>;
  freeShapeAnnotations?: Array<{
    id: string;
    shapeType: string;
    position: { x: number; y: number };
  }>;
  groupStyleAnnotations?: Array<{ id: string; name: string; parentId?: string }>;
  networkNodeAnnotations?: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
  }>;
  edgeAnnotations?: Array<{
    id?: string;
    source?: string;
    target?: string;
    sourceEndpoint?: string;
    targetEndpoint?: string;
    endpointLabelOffsetEnabled?: boolean;
    endpointLabelOffset?: number;
  }>;
  viewerSettings?: {
    endpointLabelOffsetEnabled?: boolean;
    endpointLabelOffset?: number;
  };
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

  /** Get edge data objects */
  getEdgesData(): Promise<
    Array<{
      id: string;
      source: string;
      target: string;
      sourceEndpoint?: string;
      targetEndpoint?: string;
    }>
  >;

  /** Find an edge by endpoints (order-insensitive) */
  findEdgeByEndpoints(
    source: string,
    target: string,
    sourceEndpoint?: string,
    targetEndpoint?: string
  ): Promise<{
    id: string;
    source: string;
    target: string;
    sourceEndpoint?: string;
    targetEndpoint?: string;
  } | null>;

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

  /** Create a network node (host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge) */
  createNetwork(position: { x: number; y: number }, networkType: string): Promise<string | null>;

  /** Create a link between two nodes */
  createLink(
    sourceId: string,
    targetId: string,
    sourceEndpoint?: string,
    targetEndpoint?: string
  ): Promise<void>;

  /** Get all network node IDs (nodes with topoViewerRole='cloud') */
  getNetworkNodeIds(): Promise<string[]>;

  /** Drag a node to a new position */
  dragNode(nodeId: string, delta: { x: number; y: number }): Promise<void>;

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

  /** Clear browser clipboard (for deterministic paste tests) */
  clearClipboard(): Promise<void>;

  /** Create a group from selected nodes (Ctrl+G) */
  createGroup(): Promise<void>;

  /** Resize a group by dragging a resize handle */
  resizeGroup(
    groupId: string,
    corner: "nw" | "ne" | "sw" | "se",
    delta: { x: number; y: number }
  ): Promise<void>;

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
const API_BASE_URL = "http://localhost:5173";

export const test = base.extend<{ topoViewerPage: TopoViewerPage }>({
  topoViewerPage: async ({ page, request }, use, testInfo: TestInfo) => {
    // Generate unique session ID for test isolation
    const sessionId = generateSessionId();

    // Capture browser console logs for debugging on failure
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const timestamp = new Date().toISOString();
      const type = msg.type().toUpperCase().padEnd(7);
      consoleLogs.push(`[${timestamp}] [${type}] ${msg.text()}`);
    });

    // Helper to add session ID to API URLs (uses absolute URL for API calls)
    const withSession = (url: string) => {
      const separator = url.includes("?") ? "&" : "?";
      return `${API_BASE_URL}${url}${separator}sessionId=${sessionId}`;
    };

    // Initialize session with default files using request fixture
    await request.post(withSession("/api/reset"));

    const topoViewerPage: TopoViewerPage = {
      gotoFile: async (filename: string) => {
        const resolvedFilePath = path.join(TOPOLOGIES_DIR, filename);
        // Pass session ID via URL so auto-load uses correct session
        await page.goto(`${API_BASE_URL}/?sessionId=${sessionId}`);
        await page.waitForSelector(APP_SELECTOR, { timeout: 30000 });

        // Wait for the page to be ready (including auto-load of default topology)
        // Wait for React Flow instance to be ready
        await page.waitForFunction(() => (window as any).__DEV__?.rfInstance !== undefined, {
          timeout: 15000
        });

        // Wait a bit for any auto-load to settle
        await page.waitForTimeout(300);

        // Load file-based topology via dev API with session ID
        // Retry up to 3 times if loading fails
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // Load the file
            const loadResult = await page.evaluate(
              async ({ file, sid }) => {
                try {
                  await (window as any).__DEV__.loadTopologyFile(file, sid);
                  return { success: true };
                } catch (e: any) {
                  return { success: false, error: e?.message || String(e) };
                }
              },
              { file: resolvedFilePath, sid: sessionId }
            );

            if (!loadResult.success) {
              throw new Error(`loadTopologyFile failed: ${loadResult.error}`);
            }

            // Wait for the topology data to propagate and confirm the file is loaded
            await page.waitForFunction(
              (expectedFile) => {
                const currentFile = (window as any).__DEV__?.getCurrentFile?.();
                if (!currentFile || typeof currentFile !== "string") return false;
                return currentFile.endsWith(expectedFile);
              },
              filename,
              { timeout: 5000 }
            );

            // Verify nodes are actually loaded for non-empty topologies
            if (filename !== "empty.clab.yml") {
              await page.waitForFunction(
                (types) => {
                  const dev = (window as any).__DEV__;
                  const rf = dev?.rfInstance;
                  if (!rf) return false;
                  const nodes = rf.getNodes?.() ?? [];
                  // Prefer topology nodes, but fall back to any node count
                  const topoNodes = nodes.filter(
                    (n: any) => n.type === types.topo || n.type === types.cloud
                  );
                  return topoNodes.length > 0 || nodes.length > 0;
                },
                { topo: TOPOLOGY_NODE_TYPE, cloud: CLOUD_NODE_TYPE },
                { timeout: 5000 }
              );
            }

            // Wait for React Flow to be fully initialized
            // Wait for React Flow instance to be initialized
            await page.waitForFunction(
              () => {
                const dev = (window as any).__DEV__;
                const rf = dev?.rfInstance;
                return rf !== undefined && rf !== null;
              },
              { timeout: 10000, polling: 100 }
            );

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

        // Small additional wait for React effects to settle (useEffect for __DEV__.cy)
        await page.waitForTimeout(100);
      },

      getCurrentFile: async () => {
        const currentFile = await page.evaluate(() => {
          return (window as any).__DEV__.getCurrentFile();
        });
        return currentFile ? path.basename(currentFile) : null;
      },

      getAnnotationsFromFile: async (filename: string) => {
        // Build full path to annotations file
        const annotationsPath = path.join(TOPOLOGIES_DIR, `${filename}.annotations.json`);
        const response = await page.request.get(
          withSession(`/file/${encodeURIComponent(annotationsPath)}`)
        );
        if (!response.ok()) {
          if (response.status() === 404) {
            // Return empty annotations if file doesn't exist
            return {
              nodeAnnotations: [],
              freeTextAnnotations: [],
              freeShapeAnnotations: [],
              groupStyleAnnotations: [],
              edgeAnnotations: [],
              viewerSettings: {}
            };
          }
          throw new Error(`Failed to read annotations: ${response.statusText()}`);
        }
        const text = await response.text();
        return JSON.parse(text);
      },

      getYamlFromFile: async (filename: string) => {
        // Build full path to YAML file
        const yamlPath = path.join(TOPOLOGIES_DIR, filename);
        const response = await page.request.get(
          withSession(`/file/${encodeURIComponent(yamlPath)}`)
        );
        if (!response.ok()) {
          throw new Error(`Failed to read YAML: ${response.statusText()}`);
        }
        return response.text();
      },

      listTopologyFiles: async () => {
        const response = await page.request.get(withSession("/files"));
        if (!response.ok()) {
          throw new Error(`Failed to list files: ${response.statusText()}`);
        }
        return response.json();
      },

      waitForCanvasReady: async () => {
        // Wait for canvas container
        await page.waitForSelector(CANVAS_SELECTOR, { timeout: 10000 });

        // Wait for React Flow instance to be exposed via __DEV__.rfInstance
        await page.waitForFunction(
          () => {
            const dev = (window as any).__DEV__;
            return dev?.rfInstance !== undefined;
          },
          { timeout: 15000 }
        );

        // Wait for React Flow instance to be usable
        await page.waitForFunction(
          () => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            return rf !== undefined && rf !== null && typeof rf.getNodes === "function";
          },
          { timeout: 15000, polling: 200 }
        );

        // If a non-empty file is loaded, wait for topology nodes to exist
        const currentFile = await page.evaluate(
          () => (window as any).__DEV__?.getCurrentFile?.() ?? null
        );
        const currentFileName =
          currentFile && typeof currentFile === "string" ? path.basename(currentFile) : null;
        if (currentFileName && currentFileName !== "empty.clab.yml") {
          await page.waitForFunction(
            (types) => {
              const dev = (window as any).__DEV__;
              const rf = dev?.rfInstance;
              if (!rf) return false;
              const nodes = rf.getNodes?.() ?? [];
              return nodes.some((n: any) => n.type === types.topo || n.type === types.cloud);
            },
            { topo: TOPOLOGY_NODE_TYPE, cloud: CLOUD_NODE_TYPE },
            { timeout: 10000, polling: 200 }
          );
        }

        // If topology nodes exist, wait for at least one to render in the DOM
        const firstNodeId = await page.evaluate(
          (types) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return null;
            const nodes = rf.getNodes?.() ?? [];
            const topoNode = nodes.find(
              (n: any) => n.type === types.topo || n.type === types.cloud
            );
            return topoNode?.id ?? null;
          },
          { topo: TOPOLOGY_NODE_TYPE, cloud: CLOUD_NODE_TYPE }
        );

        if (firstNodeId) {
          await page.waitForSelector(`[data-id="${firstNodeId}"]`, { timeout: 10000 });
          await page.waitForFunction(
            (nodeId) => {
              const el = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null;
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            },
            firstNodeId,
            { timeout: 10000 }
          );
        }

        // Check if nodes need layout (all at 0,0)
        const needsLayout = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return false;
          const nodes = rf.getNodes?.() ?? [];
          if (nodes.length <= 1) return false; // 1 or no nodes don't need layout

          // Check if all nodes are at the same position
          const firstPos = nodes[0]?.position;
          if (!firstPos) return false;
          return nodes.every(
            (n: any) =>
              Math.abs(n.position.x - firstPos.x) < 1 && Math.abs(n.position.y - firstPos.y) < 1
          );
        });

        // Run force layout if nodes are overlapping
        if (needsLayout) {
          await page.evaluate(() => {
            const dev = (window as any).__DEV__;
            dev?.setLayout?.("force");
          });
          // Wait for layout animation
          await page.waitForTimeout(500);
        }

        // Call fitView to ensure proper viewport
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          dev?.rfInstance?.fitView?.({ padding: 0.2 });
        });

        // Wait for fitView animation
        await page.waitForTimeout(300);
      },

      getCanvasCenter: async () => {
        const canvas = page.locator(CANVAS_SELECTOR);
        const box = await canvas.boundingBox();
        if (!box) throw new Error("Canvas not found");
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2
        };
      },

      getNodeCount: async () => {
        return await page.evaluate(
          (types) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return 0;
            const nodes = rf.getNodes?.() ?? [];
            // Filter out non-topology nodes (annotations, etc.)
            return nodes.filter((n: any) => n.type === types.topo || n.type === types.cloud).length;
          },
          { topo: TOPOLOGY_NODE_TYPE, cloud: CLOUD_NODE_TYPE }
        );
      },

      getNodePosition: async (nodeId: string) => {
        return await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return { x: 0, y: 0 };
          const nodes = rf.getNodes?.() ?? [];
          const node = nodes.find((n: any) => n.id === id);
          if (!node) return { x: 0, y: 0 };
          return node.position;
        }, nodeId);
      },

      getNodeBoundingBox: async (nodeId: string) => {
        // Try DOM element first - most reliable for visible nodes
        const domHandle = await page.$(`[data-id="${nodeId}"]`);
        if (domHandle) {
          const domBox = await domHandle.boundingBox();
          if (domBox) return domBox;
        }

        // Fallback to React Flow calculation (simplified - use default size)
        return await page.evaluate((id) => {
          const rf = (window as any).__DEV__?.rfInstance;
          if (!rf) return null;

          const nodes = rf.getNodes?.() ?? [];
          const node = nodes.find((n: any) => n.id === id);
          if (!node) return null;

          const vp = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
          const container = document.querySelector(".react-flow");
          const rect = container?.getBoundingClientRect();
          const ox = rect?.left ?? 0;
          const oy = rect?.top ?? 0;

          return {
            x: ox + node.position.x * vp.zoom + vp.x,
            y: oy + node.position.y * vp.zoom + vp.y,
            width: 60 * vp.zoom,
            height: 60 * vp.zoom
          };
        }, nodeId);
      },

      getCanvas: () => {
        return page.locator(CANVAS_SELECTOR);
      },

      setEditMode: async () => {
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          if (dev?.setModeState) {
            dev.setModeState("edit");
            return;
          }
          dev?.setMode?.("edit");
        });
        await page.waitForFunction(() => (window as any).__DEV__?.mode?.() === "edit", {
          timeout: 2000
        });
      },

      setViewMode: async () => {
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          if (dev?.setModeState) {
            dev.setModeState("view");
            return;
          }
          dev?.setMode?.("view");
        });
        await page.waitForFunction(() => (window as any).__DEV__?.mode?.() === "view", {
          timeout: 2000
        });
      },

      unlock: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setLocked(false);
        });
        await page.waitForFunction(() => (window as any).__DEV__?.isLocked?.() === false, {
          timeout: 2000
        });
      },

      lock: async () => {
        await page.evaluate(() => {
          (window as any).__DEV__.setLocked(true);
        });
        await page.waitForFunction(() => (window as any).__DEV__?.isLocked?.() === true, {
          timeout: 2000
        });
      },

      isLocked: async () => {
        return await page.evaluate(() => {
          return (window as any).__DEV__.isLocked();
        });
      },

      getNodeIds: async () => {
        return await page.evaluate(
          (types) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return [];
            const nodes = rf.getNodes?.() ?? [];
            return nodes
              .filter((n: any) => n.type === types.topo || n.type === types.cloud)
              .map((n: any) => n.id);
          },
          { topo: TOPOLOGY_NODE_TYPE, cloud: CLOUD_NODE_TYPE }
        );
      },

      selectNode: async (nodeId: string) => {
        // Use React Flow selection for proper clipboard support
        // This sets node.selected = true which is what clipboard copy checks
        await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          // Use selectNodesForClipboard for React Flow selection
          if (dev?.selectNodesForClipboard) {
            dev.selectNodesForClipboard([id]);
          }
          // Also update TopoViewerContext state for UI sync
          if (dev?.selectNode) {
            dev.selectNode(id);
          }
        }, nodeId);

        // Wait for React state to propagate
        await page.waitForTimeout(100);

        // Verify React Flow selection was set
        const selectedIds = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          if (!dev?.rfInstance) return [];
          const nodes = dev.rfInstance.getNodes();
          return nodes
            .filter((n: { selected?: boolean }) => n.selected)
            .map((n: { id: string }) => n.id);
        });

        if (!selectedIds.includes(nodeId)) {
          console.warn(
            `Selection verification failed: expected ${nodeId} in ${selectedIds.join(", ")}`
          );
        }
      },

      getGroupCount: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const reactGroups = dev?.getReactGroups?.() ?? [];
          return reactGroups.length;
        });
      },

      getGroupIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const reactGroups = dev?.getReactGroups?.() ?? [];
          return reactGroups.map((g: any) => g.id);
        });
      },

      getEdgeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return [];
          const edges = rf.getEdges?.() ?? [];
          return edges.map((e: any) => e.id);
        });
      },

      getEdgesData: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return [];
          const edges = rf.getEdges?.() ?? [];
          return edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceEndpoint: e.data?.sourceEndpoint,
            targetEndpoint: e.data?.targetEndpoint
          }));
        });
      },

      findEdgeByEndpoints: async (source, target, sourceEndpoint, targetEndpoint) => {
        return await page.evaluate(
          ({ source, target, sourceEndpoint, targetEndpoint }) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return null;
            const edges = rf.getEdges?.() ?? [];
            const matches = (edge: any) => {
              const data = edge.data ?? {};
              const se = data.sourceEndpoint;
              const te = data.targetEndpoint;
              const direct =
                edge.source === source &&
                edge.target === target &&
                (sourceEndpoint === undefined || se === sourceEndpoint) &&
                (targetEndpoint === undefined || te === targetEndpoint);
              const flipped =
                edge.source === target &&
                edge.target === source &&
                (sourceEndpoint === undefined || te === sourceEndpoint) &&
                (targetEndpoint === undefined || se === targetEndpoint);
              return direct || flipped;
            };
            const edge = edges.find(matches);
            if (!edge) return null;
            return {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceEndpoint: edge.data?.sourceEndpoint,
              targetEndpoint: edge.data?.targetEndpoint
            };
          },
          { source, target, sourceEndpoint, targetEndpoint }
        );
      },

      getEdgeCount: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return 0;
          const edges = rf.getEdges?.() ?? [];
          return edges.length;
        });
      },

      selectEdge: async (edgeId: string) => {
        // Use programmatic selection via __DEV__.selectEdge and also set React Flow edge.selected
        await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          // Update context state
          if (dev?.selectEdge) {
            dev.selectEdge(id);
          }
          // Also set React Flow edge.selected property
          const rf = dev?.rfInstance;
          if (rf) {
            const edges = rf.getEdges?.() ?? [];
            const updatedEdges = edges.map((e: any) => ({
              ...e,
              selected: e.id === id
            }));
            rf.setEdges(updatedEdges);
          }
        }, edgeId);

        // Wait for React state to propagate
        await page.waitForTimeout(100);

        // Verify selection was set
        const selectedId = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          return dev?.selectedEdge?.() ?? null;
        });

        if (selectedId !== edgeId) {
          console.warn(`Edge selection verification failed: expected ${edgeId}, got ${selectedId}`);
        }
      },

      getZoom: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          return rf?.getViewport?.()?.zoom ?? 1;
        });
      },

      getPan: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          const viewport = rf?.getViewport?.() ?? { x: 0, y: 0 };
          return { x: viewport.x, y: viewport.y };
        });
      },

      setZoom: async (zoom: number) => {
        await page.evaluate((z) => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (rf?.setViewport) {
            const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
            const container = document.querySelector(".react-flow") as HTMLElement | null;
            const rect = container?.getBoundingClientRect();
            const centerX = rect ? rect.width / 2 : 0;
            const centerY = rect ? rect.height / 2 : 0;
            const modelCenterX = (centerX - viewport.x) / viewport.zoom;
            const modelCenterY = (centerY - viewport.y) / viewport.zoom;
            rf.setViewport({
              x: centerX - modelCenterX * z,
              y: centerY - modelCenterY * z,
              zoom: z
            });
          }
        }, zoom);
        await page.waitForTimeout(100);
      },

      setPan: async (x: number, y: number) => {
        await page.evaluate(
          ({ px, py }) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (rf?.setViewport) {
              const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
              rf.setViewport({ x: px, y: py, zoom: viewport.zoom });
            }
          },
          { px: x, py: y }
        );
        await page.waitForTimeout(100);
      },

      fit: async () => {
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          dev?.rfInstance?.fitView?.({ padding: 0.1 });
        });
        await page.waitForTimeout(300);
      },

      getSelectedNodeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return [];
          const nodes = rf.getNodes?.() ?? [];
          return nodes.filter((n: any) => n.selected).map((n: any) => n.id);
        });
      },

      getSelectedEdgeIds: async () => {
        return await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return [];
          const edges = rf.getEdges?.() ?? [];
          return edges.filter((e: any) => e.selected).map((e: any) => e.id);
        });
      },

      clearSelection: async () => {
        // Press Escape to clear context selection, then clear React Flow selection
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
        // Also clear React Flow node.selected and edge.selected properties
        await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          dev?.clearNodeSelection?.();
          // Clear edge selection too
          const rf = dev?.rfInstance;
          if (rf) {
            const edges = rf.getEdges?.() ?? [];
            const updatedEdges = edges.map((e: any) => ({
              ...e,
              selected: false
            }));
            rf.setEdges(updatedEdges);
          }
        });
        await page.waitForTimeout(50);
      },

      deleteSelected: async () => {
        await page.keyboard.press("Delete");
        await page.waitForTimeout(200);
      },

      undo: async () => {
        await page
          .waitForFunction(() => (window as any).__DEV__?.undoRedo?.canUndo === true, {
            timeout: 2000
          })
          .catch(() => {});
        await page.keyboard.down("Control");
        await page.keyboard.press("z");
        await page.keyboard.up("Control");
        await page.waitForTimeout(200);
      },

      redo: async () => {
        await page
          .waitForFunction(() => (window as any).__DEV__?.undoRedo?.canRedo === true, {
            timeout: 2000
          })
          .catch(() => {});
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.press("z");
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
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

      createNode: async (
        nodeId: string,
        position: { x: number; y: number },
        kind = "nokia_srlinux"
      ) => {
        // Wait for handleNodeCreatedCallback to be available (exposed via __DEV__)
        await page.waitForFunction(
          () => (window as any).__DEV__?.handleNodeCreatedCallback !== undefined,
          { timeout: 10000 }
        );

        await page.evaluate(
          ({ nodeId, position, kind, nodeType }) => {
            const dev = (window as any).__DEV__;
            if (!dev?.handleNodeCreatedCallback) {
              throw new Error("handleNodeCreatedCallback not available");
            }

            // Create node element in React Flow format
            const nodeElement = {
              id: nodeId,
              type: nodeType,
              position,
              data: {
                label: nodeId,
                name: nodeId,
                role: "pe",
                topoViewerRole: "pe",
                kind,
                image: "ghcr.io/nokia/srlinux:latest",
                extraData: {
                  kind,
                  image: "ghcr.io/nokia/srlinux:latest",
                  longname: "",
                  mgmtIpv4Address: ""
                }
              }
            };

            // Call handleNodeCreatedCallback which:
            // 1. Adds the node to React state
            // 2. Persists to YAML via TopologyIO
            // 3. Pushes undo action
            dev.handleNodeCreatedCallback(nodeId, nodeElement, position);
          },
          { nodeId, position, kind, nodeType: TOPOLOGY_NODE_TYPE }
        );

        // Wait for the node to appear in React Flow
        await page.waitForFunction(
          (id) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return false;
            const nodes = rf.getNodes?.() ?? [];
            return nodes.some((n: any) => n.id === id);
          },
          nodeId,
          { timeout: 5000 }
        );
      },

      createLink: async (
        sourceId: string,
        targetId: string,
        sourceEndpoint = "eth1",
        targetEndpoint = "eth1"
      ) => {
        // Wait for handleEdgeCreated to be available (exposed via __DEV__)
        await page.waitForFunction(() => (window as any).__DEV__?.handleEdgeCreated !== undefined, {
          timeout: 10000
        });

        // Check lock state and mode before proceeding (respects UI restrictions)
        const canCreate = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          // Block if locked (isLocked is a function) or not in edit mode
          if (typeof dev?.isLocked === "function" && dev.isLocked() === true) return false;
          if (typeof dev?.mode === "function" && dev.mode() !== "edit") return false;
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
              throw new Error("handleEdgeCreated not available");
            }

            const linkData = {
              id: `${sourceId}:${sourceEndpoint}--${targetId}:${targetEndpoint}`,
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

        // Wait for matching edge to appear (ID may be re-written by snapshot sync)
        await page.waitForFunction(
          ({ sourceId, targetId, sourceEndpoint, targetEndpoint }) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return false;
            const edges = rf.getEdges?.() ?? [];
            return edges.some((edge: any) => {
              if (edge.source !== sourceId || edge.target !== targetId) return false;
              return (
                edge.data?.sourceEndpoint === sourceEndpoint &&
                edge.data?.targetEndpoint === targetEndpoint
              );
            });
          },
          { sourceId, targetId, sourceEndpoint, targetEndpoint },
          { timeout: 5000 }
        );
      },

      createNetwork: async (
        position: { x: number; y: number },
        networkType: string
      ): Promise<string | null> => {
        // Wait for createNetworkAtPosition to be available
        await page.waitForFunction(
          () => (window as any).__DEV__?.createNetworkAtPosition !== undefined,
          { timeout: 10000 }
        );

        // Check lock state and mode before proceeding
        const canCreate = await page.evaluate(() => {
          const dev = (window as any).__DEV__;
          if (typeof dev?.isLocked === "function" && dev.isLocked() === true) return false;
          if (typeof dev?.mode === "function" && dev.mode() !== "edit") return false;
          return true;
        });

        if (!canCreate) {
          return null;
        }

        // Create the network node
        const networkId = await page.evaluate(
          ({ pos, type }) => {
            const dev = (window as any).__DEV__;
            if (!dev?.createNetworkAtPosition) {
              throw new Error("createNetworkAtPosition not available");
            }
            return dev.createNetworkAtPosition(pos, type);
          },
          { pos: position, type: networkType }
        );

        if (!networkId) return null;

        // Wait for the network node to appear in React Flow
        await page.waitForFunction(
          (id) => {
            const dev = (window as any).__DEV__;
            const rf = dev?.rfInstance;
            if (!rf) return false;
            const nodes = rf.getNodes?.() ?? [];
            return nodes.some((n: any) => n.id === id);
          },
          networkId,
          { timeout: 5000 }
        );

        return networkId;
      },

      getNetworkNodeIds: async (): Promise<string[]> => {
        return await page.evaluate((cloudType) => {
          const dev = (window as any).__DEV__;
          const rf = dev?.rfInstance;
          if (!rf) return [];
          const nodes = rf.getNodes?.() ?? [];
          return nodes.filter((n: any) => n.type === cloudType).map((n: any) => n.id);
        }, CLOUD_NODE_TYPE);
      },

      dragNode: async (nodeId: string, delta: { x: number; y: number }) => {
        const box = await topoViewerPage.getNodeBoundingBox(nodeId);
        if (!box) throw new Error(`Node ${nodeId} not found`);

        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Move in steps for smooth drag
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const x = startX + (delta.x * i) / steps;
          const y = startY + (delta.y * i) / steps;
          await page.mouse.move(x, y);
        }

        await page.mouse.up();
        await page.waitForTimeout(300);
      },

      resetFiles: async () => {
        const response = await request.post(withSession("/api/reset"));
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "Failed to reset files");
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
            .filter(
              (n: { id: string; group?: string }) =>
                n.group === id || n.group?.startsWith(id.split("__")[0])
            )
            .map((n: { id: string; group?: string }) => n.id);
        }, groupId);
      },

      copy: async () => {
        await page.keyboard.down("Control");
        await page.keyboard.press("c");
        await page.keyboard.up("Control");
        await page.waitForTimeout(200);
      },

      paste: async () => {
        await page.keyboard.down("Control");
        await page.keyboard.press("v");
        await page.keyboard.up("Control");
        await page.waitForTimeout(300);
      },

      clearClipboard: async () => {
        await page.evaluate(async () => {
          try {
            await window.navigator.clipboard.writeText("");
          } catch {
            // Ignore clipboard write failures; tests will fall back to existing state.
          }
        });
        await page.waitForTimeout(100);
      },

      createGroup: async () => {
        // Use direct API call instead of keyboard events for reliability
        const result = await page.evaluate(browserCreateGroup);
        console.log(
          `[DEBUG] createGroup: method=${result.method}, hasRf=${result.hasRf}, selected=${result.selectedBefore} -> ${result.selectedAfter}, mode=${result.mode}, isLocked=${result.isLocked}, stateManager: ${result.groupsBefore} -> ${result.groupsAfter}, react: ${result.reactGroupsBefore} -> ${result.reactGroupsAfter}`
        );
        // Wait for debounced save (300ms) plus processing time
        await page.waitForTimeout(1000);
        // Check again after wait - both React state and stateManager
        const debugInfo = await page.evaluate(browserGetGroupDebugInfo);
        console.log(
          `[DEBUG] After 1000ms: React groups=${debugInfo.reactGroupCount} (direct: ${debugInfo.reactGroupsDirectCount}) (${debugInfo.reactGroupIds}), StateManager groups=${debugInfo.stateManagerGroupCount} (${debugInfo.stateManagerGroupIds})`
        );
      },

      resizeGroup: async (
        groupId: string,
        corner: "nw" | "ne" | "sw" | "se",
        delta: { x: number; y: number }
      ) => {
        // Click the group label to ensure resize handles are rendered (selection/hover-driven UI)
        const label = page.locator(`[data-testid="group-label-${groupId}"]`);
        await label.waitFor({ state: "visible", timeout: 5000 });
        await label.click();
        await page.waitForTimeout(200);

        const handle = page.locator(`[data-testid="resize-${corner}-${groupId}"]`);
        await handle.waitFor({ state: "visible", timeout: 5000 });
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
        const closePanelBtns = page.locator('[data-testid="panel-close-btn"]');
        const panelCount = await closePanelBtns.count();
        for (let i = 0; i < panelCount; i++) {
          const btn = closePanelBtns.nth(i);
          if (await btn.isVisible()) {
            await btn.click();
            await page.waitForTimeout(100);
          }
        }

        // Press Escape to deselect anything and ensure focus is on canvas
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);

        // Select the node programmatically via __DEV__.selectNode (React Flow)
        await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          if (dev?.selectNode) {
            dev.selectNode(id);
          }
        }, nodeId);

        // Wait for selection state to propagate
        await page.waitForTimeout(100);

        // Verify selection was set
        const selected = await page.evaluate((id) => {
          const dev = (window as any).__DEV__;
          return dev?.selectedNode?.() === id;
        }, nodeId);

        if (!selected) {
          throw new Error(`Failed to select node ${nodeId}`);
        }

        // Press Delete key
        await page.keyboard.press("Delete");
        await page.waitForTimeout(500);
      },

      deleteEdge: async (edgeId: string) => {
        // Close any open editor panel first to ensure Delete key goes to the canvas
        const nodeEditor = page.locator('[data-testid="node-editor"]');
        if (await nodeEditor.isVisible()) {
          const closeBtn = page.locator(
            '[data-testid="node-editor"] [data-testid="panel-close-btn"]'
          );
          await closeBtn.click();
          await page.waitForTimeout(200);
        }
        const edgeEditor = page.locator('[data-testid="edge-editor"]');
        if (await edgeEditor.isVisible()) {
          const closeBtn = page.locator(
            '[data-testid="edge-editor"] [data-testid="panel-close-btn"]'
          );
          await closeBtn.click();
          await page.waitForTimeout(200);
        }

        // Click on canvas background to clear any focus/selection state
        await page.mouse.click(50, 50);
        await page.waitForTimeout(100);

        await topoViewerPage.selectEdge(edgeId);
        await page.keyboard.press("Delete");
        await page.waitForTimeout(300);
      },

      writeYamlFile: async (filename: string, content: string) => {
        // Build full path to YAML file
        const yamlPath = path.join(TOPOLOGIES_DIR, filename);
        const response = await request.put(withSession(`/file/${encodeURIComponent(yamlPath)}`), {
          data: content,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
        if (!response.ok()) {
          throw new Error(`Failed to write YAML: ${response.statusText()}`);
        }
      },

      writeAnnotationsFile: async (filename: string, content: object) => {
        // Build full path to annotations file
        const annotationsPath = path.join(TOPOLOGIES_DIR, `${filename}.annotations.json`);
        const response = await request.put(
          withSession(`/file/${encodeURIComponent(annotationsPath)}`),
          {
            data: JSON.stringify(content, null, 2),
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
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
      const logsContent = consoleLogs.join("\n");

      // Write to file in test-results folder
      const logFilePath = testInfo.outputPath("browser-console-logs.txt");
      writeFileSync(logFilePath, logsContent);

      // Also attach to HTML report
      await testInfo.attach("browser-console-logs", {
        body: logsContent,
        contentType: "text/plain"
      });
    }
  }
});

export { expect } from "@playwright/test";
