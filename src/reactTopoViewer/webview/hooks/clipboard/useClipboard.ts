/**
 * React Flow Clipboard Hook
 *
 * Provides copy/paste functionality using the browser's clipboard API
 * and React Flow's node/edge state.
 */
import { useCallback, useRef } from "react";

import { useTopoViewerState, useTopoViewerActions } from "../../context/TopoViewerContext";
import { useViewport } from "../../context/ViewportContext";
import { useUndoRedoContext } from "../../context/UndoRedoContext";
import { log } from "../../utils/logger";
import { getUniqueId } from "../../../shared/utilities/idUtils";
import type {
  TopoNode,
  TopoEdge,
  TopologyNodeData,
  TopologyEdgeData
} from "../../../shared/types/graph";

/** Version string for clipboard format compatibility */
const CLIPBOARD_VERSION = "1.0";

/** Serialized node data for clipboard */
interface SerializedNode {
  id: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  relativePosition: { x: number; y: number };
  type?: string;
}

/** Serialized edge data for clipboard */
interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown>;
}

/** Clipboard data structure */
interface ClipboardData {
  version: string;
  origin: { x: number; y: number };
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  timestamp: number;
}

/** Return type for useClipboard hook */
export interface UseClipboardReturn {
  /** Copy selected nodes and edges to clipboard */
  copy: () => Promise<boolean>;
  /** Paste clipboard contents at position */
  paste: (position?: { x: number; y: number }) => Promise<boolean>;
  /** Check if browser clipboard has compatible data */
  hasClipboardData: () => Promise<boolean>;
}

/** Calculate center of positions */
function calculateCenter(positions: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), {
    x: 0,
    y: 0
  });
  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length
  };
}

/** Counter for generating unique IDs */
let pasteCounter = 0;

/**
 * Hook that provides clipboard operations for nodes and edges.
 * Uses the browser's clipboard API for persistence.
 */
export function useClipboard(): UseClipboardReturn {
  const { state } = useTopoViewerState();
  const actions = useTopoViewerActions();
  const { rfInstance } = useViewport();
  const { undoRedo } = useUndoRedoContext();

  const lastPasteTimeRef = useRef(0);

  /**
   * Copy selected nodes and connected edges to the browser clipboard.
   */
  const copy = useCallback(async (): Promise<boolean> => {
    if (!rfInstance) {
      log.warn("[Clipboard] ReactFlow instance not available");
      return false;
    }

    // Get selected nodes - type assertion since we've checked rfInstance exists
    const instance = rfInstance;
    const allNodes = instance.getNodes();
    const selectedNodes = allNodes.filter((n: { selected?: boolean }) => n.selected);

    if (selectedNodes.length === 0) {
      log.info("[Clipboard] No nodes selected to copy");
      return false;
    }

    const selectedNodeIds = new Set(selectedNodes.map((n: { id: string }) => n.id));

    // Get edges where both source and target are in selection
    const allEdges = instance.getEdges();
    const selectedEdges = allEdges.filter(
      (e: { source: string; target: string }) =>
        selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
    );

    // Calculate origin (center of selection)
    const positions = selectedNodes.map((n: { position: { x: number; y: number } }) => n.position);
    const origin = calculateCenter(positions);

    // Serialize nodes
    const serializedNodes: SerializedNode[] = selectedNodes.map(
      (node: { id: string; data: unknown; position: { x: number; y: number }; type?: string }) => ({
        id: node.id,
        data: { ...(node.data as Record<string, unknown>) },
        position: { ...node.position },
        relativePosition: {
          x: node.position.x - origin.x,
          y: node.position.y - origin.y
        },
        type: node.type
      })
    );

    // Serialize edges
    const serializedEdges: SerializedEdge[] = selectedEdges.map(
      (edge: { id: string; source: string; target: string; data?: unknown }) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { ...((edge.data as Record<string, unknown>) ?? {}) }
      })
    );

    const clipboardData: ClipboardData = {
      version: CLIPBOARD_VERSION,
      origin,
      nodes: serializedNodes,
      edges: serializedEdges,
      timestamp: Date.now()
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
      log.info(
        `[Clipboard] Copied ${serializedNodes.length} nodes, ${serializedEdges.length} edges`
      );
      return true;
    } catch (err) {
      log.error(`[Clipboard] Failed to write to clipboard: ${String(err)}`);
      return false;
    }
  }, [rfInstance]);

  /**
   * Paste clipboard contents at the given position (or viewport center).
   */
  const paste = useCallback(
    async (position?: { x: number; y: number }): Promise<boolean> => {
      // Debounce rapid paste calls
      const now = Date.now();
      if (now - lastPasteTimeRef.current < 100) return false;
      lastPasteTimeRef.current = now;

      let clipboardData: ClipboardData;

      try {
        const text = await navigator.clipboard.readText();
        clipboardData = JSON.parse(text) as ClipboardData;

        if (!clipboardData.version || !clipboardData.nodes) {
          log.warn("[Clipboard] Invalid clipboard data format");
          return false;
        }
      } catch (err) {
        log.warn(`[Clipboard] Failed to read clipboard: ${err}`);
        return false;
      }

      if (clipboardData.nodes.length === 0) {
        log.info("[Clipboard] No nodes to paste");
        return false;
      }

      // Determine paste position
      let pastePosition = position;
      if (!pastePosition && rfInstance) {
        const viewport = rfInstance.getViewport();
        const container = document.querySelector(".react-flow");
        if (container) {
          const rect = container.getBoundingClientRect();
          // Calculate center of viewport in graph coordinates
          pastePosition = {
            x: (rect.width / 2 - viewport.x) / viewport.zoom,
            y: (rect.height / 2 - viewport.y) / viewport.zoom
          };
        }
      }
      pastePosition = pastePosition ?? { x: 0, y: 0 };

      // Offset for multiple pastes at same location
      pasteCounter++;
      const offset = pasteCounter * 20;

      // Build ID mapping (old ID -> new ID)
      const usedNames = new Set<string>((state.nodes as TopoNode[]).map((n) => n.id));
      const idMapping = new Map<string, string>();

      for (const node of clipboardData.nodes) {
        const originalName = (node.data.name as string) || node.id;
        const newId = getUniqueId(originalName, usedNames);
        usedNames.add(newId);
        idMapping.set(node.id, newId);
      }

      // Begin undo batch
      undoRedo.beginBatch();

      try {
        // Create new nodes
        for (const node of clipboardData.nodes) {
          const newId = idMapping.get(node.id)!;
          const newPosition = {
            x: pastePosition!.x + node.relativePosition.x + offset,
            y: pastePosition!.y + node.relativePosition.y + offset
          };

          const newNode: TopoNode = {
            id: newId,
            type: (node.type ?? "topology-node") as "topology-node",
            position: newPosition,
            data: {
              ...node.data,
              id: newId,
              name: newId,
              label: (node.data.label as string) || newId,
              role: (node.data.role as string) || "node"
            } as TopologyNodeData
          };
          actions.addNode(newNode);
        }

        // Create new edges with remapped IDs
        let edgeCount = 0;
        for (const edge of clipboardData.edges) {
          const newSource = idMapping.get(edge.source);
          const newTarget = idMapping.get(edge.target);

          if (!newSource || !newTarget) continue;

          const sourceEndpoint = (edge.data.sourceEndpoint as string) || "eth1";
          const targetEndpoint = (edge.data.targetEndpoint as string) || "eth1";
          const newId = `${newSource}:${sourceEndpoint}--${newTarget}:${targetEndpoint}`;

          const newEdge: TopoEdge = {
            id: newId,
            source: newSource,
            target: newTarget,
            data: {
              ...edge.data,
              sourceEndpoint,
              targetEndpoint
            } as TopologyEdgeData
          };
          actions.addEdge(newEdge);
          edgeCount++;
        }

        log.info(`[Clipboard] Pasted ${clipboardData.nodes.length} nodes, ${edgeCount} edges`);
      } finally {
        undoRedo.endBatch();
      }

      return true;
    },
    [rfInstance, state.nodes, actions, undoRedo]
  );

  /**
   * Check if the browser clipboard has compatible data.
   */
  const hasClipboardData = useCallback(async (): Promise<boolean> => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text) as ClipboardData;
      return Boolean(data.version && data.nodes);
    } catch {
      return false;
    }
  }, []);

  return { copy, paste, hasClipboardData };
}
