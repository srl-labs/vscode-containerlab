/**
 * useAnnotationPersistence - Watch GraphContext for annotation node changes and persist to JSON
 *
 * This hook bridges the gap between React Flow nodes (GraphContext) and the annotation
 * persistence layer (annotations.json file). It watches for changes to annotation nodes
 * and converts them back to annotation format for saving.
 */
import { useEffect, useRef, useCallback } from "react";
import { type Node } from "@xyflow/react";

import { useGraph } from "../context/GraphContext";
import {
  nodesToAnnotations,
  filterAnnotationNodes,
  ANNOTATION_NODE_TYPES
} from "../utils/annotationNodeConverters";
import {
  saveFreeTextAnnotations,
  saveFreeShapeAnnotations,
  saveGroupStyleAnnotations
} from "../services";
import { log } from "../utils/logger";

/** Debounce delay for persistence in milliseconds */
const SAVE_DEBOUNCE_MS = 500;

/**
 * Hook that watches GraphContext for annotation node changes and persists them.
 *
 * This is the bridge that keeps annotations.json in sync with React Flow nodes.
 * When annotation nodes change (position, data, add, delete), this hook converts
 * them back to annotation format and saves to the JSON file.
 */
export function useAnnotationPersistence(): void {
  const { nodes } = useGraph();

  // Track previous annotation nodes to detect changes
  const prevAnnotationNodesRef = useRef<Node[]>([]);

  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save function
  const saveAnnotations = useCallback((annotationNodes: Node[]) => {
    const { freeTextAnnotations, freeShapeAnnotations, groups } =
      nodesToAnnotations(annotationNodes);

    // Save all annotation types
    // Note: These are fire-and-forget async saves
    if (freeTextAnnotations.length > 0) {
      void saveFreeTextAnnotations(freeTextAnnotations);
    }
    if (freeShapeAnnotations.length > 0) {
      void saveFreeShapeAnnotations(freeShapeAnnotations);
    }
    if (groups.length > 0) {
      void saveGroupStyleAnnotations(groups);
    }

    log.info(
      `[useAnnotationPersistence] Saved ${freeTextAnnotations.length} text, ${freeShapeAnnotations.length} shape, ${groups.length} group annotations`
    );
  }, []);

  // Check if annotation nodes have changed
  const hasAnnotationNodesChanged = useCallback(
    (currentNodes: Node[], prevNodes: Node[]): boolean => {
      // Quick check: different counts
      if (currentNodes.length !== prevNodes.length) {
        return true;
      }

      // Build a map of previous nodes for efficient lookup
      const prevMap = new Map(prevNodes.map((n) => [n.id, n]));

      // Check each current node
      for (const node of currentNodes) {
        const prev = prevMap.get(node.id);
        if (!prev) {
          // New node
          return true;
        }

        // Check position
        if (node.position.x !== prev.position.x || node.position.y !== prev.position.y) {
          return true;
        }

        // Check dimensions
        if (node.width !== prev.width || node.height !== prev.height) {
          return true;
        }

        // Check data - shallow comparison (for simple changes)
        // For complex data changes, this may need to be deeper
        if (node.data !== prev.data) {
          return true;
        }
      }

      // Check if any nodes were removed
      const currentIds = new Set(currentNodes.map((n) => n.id));
      for (const prev of prevNodes) {
        if (!currentIds.has(prev.id)) {
          return true;
        }
      }

      return false;
    },
    []
  );

  // Watch for annotation node changes
  useEffect(() => {
    // Filter annotation nodes from all nodes
    const annotationNodes = filterAnnotationNodes(nodes);

    // Check if anything changed
    const hasChanged = hasAnnotationNodesChanged(annotationNodes, prevAnnotationNodesRef.current);

    if (hasChanged) {
      // Cancel previous timer if any
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Debounce save to avoid excessive writes during drag operations
      saveTimerRef.current = setTimeout(() => {
        saveAnnotations(annotationNodes);
        saveTimerRef.current = null;
      }, SAVE_DEBOUNCE_MS);

      // Update ref with current nodes
      prevAnnotationNodesRef.current = annotationNodes;
    }
  }, [nodes, hasAnnotationNodesChanged, saveAnnotations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);
}

/**
 * Check if a node is an annotation node
 */
export function isAnnotationNode(node: Node): boolean {
  return node.type !== undefined && ANNOTATION_NODE_TYPES.has(node.type);
}
