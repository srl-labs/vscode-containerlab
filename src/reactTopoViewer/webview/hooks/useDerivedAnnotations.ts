/**
 * useDerivedAnnotations - Derive annotation data from GraphContext nodes
 *
 * This hook bridges AnnotationContext with GraphContext by:
 * 1. Deriving annotation arrays (groups, text, shapes) from GraphContext nodes
 * 2. Providing mutation functions that update GraphContext nodes
 * 3. Managing membership via node.data.groupId (derived from GraphContext)
 *
 * This is the key to making GraphContext the single source of truth for all nodes.
 */
import { useMemo, useCallback } from "react";
import type { Node } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";
import type { TopoNode } from "../../shared/types/graph";
import type {
  FreeTextNodeData,
  FreeShapeNodeData,
  GroupNodeData
} from "../components/canvas/types";
import type { GraphContextValue } from "../context/GraphContext";
import {
  nodeToFreeText,
  nodeToFreeShape,
  nodeToGroup,
  freeTextToNode,
  freeShapeToNode,
  groupToNode
} from "../utils/annotationNodeConverters";

/**
 * Return type for useDerivedAnnotations
 */
export interface UseDerivedAnnotationsReturn {
  // Derived annotation data (read-only views of GraphContext nodes)
  groups: GroupStyleAnnotation[];
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];

  // Group mutations
  addGroup: (group: GroupStyleAnnotation) => void;
  updateGroup: (id: string, updates: Partial<GroupStyleAnnotation>) => void;
  deleteGroup: (id: string) => void;

  // Text annotation mutations
  addTextAnnotation: (annotation: FreeTextAnnotation) => void;
  updateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  deleteTextAnnotation: (id: string) => void;

  // Shape annotation mutations
  addShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  updateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  deleteShapeAnnotation: (id: string) => void;

  // Membership management
  membershipMap: Map<string, string>; // nodeId -> groupId
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
  getNodeMembership: (nodeId: string) => string | null;
  getGroupMembers: (groupId: string) => string[];
}

/**
 * Hook to derive annotation data from GraphContext and provide mutation functions
 */
export function useDerivedAnnotations(graph: GraphContextValue): UseDerivedAnnotationsReturn {
  const { nodes, addNode, removeNode, updateNode, replaceNode } = graph;

  // Derive groups from group-node type nodes
  const groups = useMemo(() => {
    return nodes.filter((n): n is Node<GroupNodeData> => n.type === "group-node").map(nodeToGroup);
  }, [nodes]);

  // Derive text annotations from free-text-node type nodes
  const textAnnotations = useMemo(() => {
    return nodes
      .filter((n): n is Node<FreeTextNodeData> => n.type === "free-text-node")
      .map(nodeToFreeText);
  }, [nodes]);

  // Derive shape annotations from free-shape-node type nodes
  const shapeAnnotations = useMemo(() => {
    return nodes
      .filter((n): n is Node<FreeShapeNodeData> => n.type === "free-shape-node")
      .map(nodeToFreeShape);
  }, [nodes]);

  // Membership map: nodeId -> groupId (derived from node data)
  const membershipMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      const data = node.data as Record<string, unknown> | undefined;
      const groupId = data?.groupId as string | undefined;
      if (groupId) {
        map.set(node.id, groupId);
      }
    }
    return map;
  }, [nodes]);

  // ============================================================================
  // Group mutations
  // ============================================================================

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const node = groupToNode(group);
      addNode(node as TopoNode);
    },
    [addNode]
  );

  const updateGroup = useCallback(
    (id: string, updates: Partial<GroupStyleAnnotation>) => {
      // Find current group node
      const currentNode = nodes.find((n) => n.id === id && n.type === "group-node");
      if (!currentNode) return;

      // Convert to annotation, apply updates, convert back to node
      const currentGroup = nodeToGroup(currentNode as Node<GroupNodeData>);
      const updatedGroup = { ...currentGroup, ...updates };
      const newNode = groupToNode(updatedGroup);
      replaceNode(id, newNode);
    },
    [nodes, replaceNode]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      removeNode(id);
    },
    [removeNode]
  );

  // ============================================================================
  // Text annotation mutations
  // ============================================================================

  const addTextAnnotation = useCallback(
    (annotation: FreeTextAnnotation) => {
      const node = freeTextToNode(annotation);
      addNode(node as TopoNode);
    },
    [addNode]
  );

  const updateTextAnnotation = useCallback(
    (id: string, updates: Partial<FreeTextAnnotation>) => {
      const currentNode = nodes.find((n) => n.id === id && n.type === "free-text-node");
      if (!currentNode) return;

      const currentAnnotation = nodeToFreeText(currentNode as Node<FreeTextNodeData>);
      const updatedAnnotation = { ...currentAnnotation, ...updates };
      const newNode = freeTextToNode(updatedAnnotation);
      replaceNode(id, newNode);
    },
    [nodes, replaceNode]
  );

  const deleteTextAnnotation = useCallback(
    (id: string) => {
      removeNode(id);
    },
    [removeNode]
  );

  // ============================================================================
  // Shape annotation mutations
  // ============================================================================

  const addShapeAnnotation = useCallback(
    (annotation: FreeShapeAnnotation) => {
      const node = freeShapeToNode(annotation);
      addNode(node as TopoNode);
    },
    [addNode]
  );

  const updateShapeAnnotation = useCallback(
    (id: string, updates: Partial<FreeShapeAnnotation>) => {
      const currentNode = nodes.find((n) => n.id === id && n.type === "free-shape-node");
      if (!currentNode) return;

      const currentAnnotation = nodeToFreeShape(currentNode as Node<FreeShapeNodeData>);
      const updatedAnnotation = { ...currentAnnotation, ...updates };
      const newNode = freeShapeToNode(updatedAnnotation);
      replaceNode(id, newNode);
    },
    [nodes, replaceNode]
  );

  const deleteShapeAnnotation = useCallback(
    (id: string) => {
      removeNode(id);
    },
    [removeNode]
  );

  // ============================================================================
  // Membership management
  // ============================================================================

  const addNodeToGroup = useCallback(
    (nodeId: string, groupId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, {
        data: { ...(node.data as Record<string, unknown>), groupId }
      });
    },
    [nodes, updateNode]
  );

  const removeNodeFromGroup = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const nodeData = node.data as Record<string, unknown>;
      const newData = Object.fromEntries(
        Object.entries(nodeData).filter(([key]) => key !== "groupId")
      );
      updateNode(nodeId, { data: newData });
    },
    [nodes, updateNode]
  );

  const getNodeMembership = useCallback(
    (nodeId: string): string | null => {
      return membershipMap.get(nodeId) ?? null;
    },
    [membershipMap]
  );

  const getGroupMembers = useCallback(
    (groupId: string): string[] => {
      const members: string[] = [];
      for (const [nodeId, gId] of membershipMap) {
        if (gId === groupId) {
          members.push(nodeId);
        }
      }
      // Also include text/shape annotations with this groupId (from node data)
      for (const text of textAnnotations) {
        if (text.groupId === groupId && !members.includes(text.id)) {
          members.push(text.id);
        }
      }
      for (const shape of shapeAnnotations) {
        if (shape.groupId === groupId && !members.includes(shape.id)) {
          members.push(shape.id);
        }
      }
      return members;
    },
    [membershipMap, textAnnotations, shapeAnnotations]
  );

  return {
    groups,
    textAnnotations,
    shapeAnnotations,
    addGroup,
    updateGroup,
    deleteGroup,
    addTextAnnotation,
    updateTextAnnotation,
    deleteTextAnnotation,
    addShapeAnnotation,
    updateShapeAnnotation,
    deleteShapeAnnotation,
    membershipMap,
    addNodeToGroup,
    removeNodeFromGroup,
    getNodeMembership,
    getGroupMembers
  };
}
