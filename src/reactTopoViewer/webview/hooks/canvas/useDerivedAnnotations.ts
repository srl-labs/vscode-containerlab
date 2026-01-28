/**
 * useDerivedAnnotations - Derive annotation data from graph store nodes
 *
 * This hook bridges annotation UI and graph state by:
 * 1. Deriving annotation arrays (groups, text, shapes) from graph nodes
 * 2. Providing mutation functions that update graph nodes
 * 3. Managing membership via node.data.groupId (derived from graph nodes)
 *
 * This is the key to keeping graph state as the single source of truth for all nodes.
 */
import { useMemo, useCallback } from "react";
import type { Node } from "@xyflow/react";
import { shallow } from "zustand/shallow";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import type { TopoNode } from "../../../shared/types/graph";
import type {
  FreeTextNodeData,
  FreeShapeNodeData,
  GroupNodeData
} from "../../components/canvas/types";
import { useGraphStore } from "../../stores/graphStore";
import {
  nodeToFreeText,
  nodeToFreeShape,
  nodeToGroup,
  freeTextToNode,
  freeShapeToNode,
  groupToNode,
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";

/**
 * Return type for useDerivedAnnotations
 */
export interface UseDerivedAnnotationsReturn {
  // Derived annotation data (read-only views of graph nodes)
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
  getGroupMembers: (groupId: string, options?: { includeNested?: boolean }) => string[];
}

const isGroupNode = (node: Node): node is Node<GroupNodeData> => node.type === GROUP_NODE_TYPE;
const isFreeTextNode = (node: Node): node is Node<FreeTextNodeData> =>
  node.type === FREE_TEXT_NODE_TYPE;
const isFreeShapeNode = (node: Node): node is Node<FreeShapeNodeData> =>
  node.type === FREE_SHAPE_NODE_TYPE;

const hasGroupMembership = (node: Node): boolean => {
  const data = node.data as Record<string, unknown> | undefined;
  const groupId = data?.groupId;
  return typeof groupId === "string" && groupId.length > 0;
};

/**
 * Hook to derive annotation data from graph state and provide mutation functions
 */
export function useDerivedAnnotations(): UseDerivedAnnotationsReturn {
  const groupNodes = useGraphStore((state) => state.nodes.filter(isGroupNode), shallow);
  const textNodes = useGraphStore((state) => state.nodes.filter(isFreeTextNode), shallow);
  const shapeNodes = useGraphStore((state) => state.nodes.filter(isFreeShapeNode), shallow);
  const membershipNodes = useGraphStore((state) => state.nodes.filter(hasGroupMembership), shallow);

  const addNode = useGraphStore((state) => state.addNode);
  const removeNode = useGraphStore((state) => state.removeNode);
  const updateNode = useGraphStore((state) => state.updateNode);
  const replaceNode = useGraphStore((state) => state.replaceNode);

  // Derive groups from group-node type nodes
  const groups = useMemo(() => {
    return groupNodes.map(nodeToGroup);
  }, [groupNodes]);

  // Derive text annotations from free-text-node type nodes
  const textAnnotations = useMemo(() => {
    return textNodes.map(nodeToFreeText);
  }, [textNodes]);

  // Derive shape annotations from free-shape-node type nodes
  const shapeAnnotations = useMemo(() => {
    return shapeNodes.map(nodeToFreeShape);
  }, [shapeNodes]);

  // Membership map: nodeId -> groupId (derived from node data)
  const membershipMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of membershipNodes) {
      const data = node.data as Record<string, unknown> | undefined;
      const groupId = data?.groupId as string | undefined;
      if (groupId) {
        map.set(node.id, groupId);
      }
    }
    return map;
  }, [membershipNodes]);

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
      const currentNode = useGraphStore
        .getState()
        .nodes.find((n) => n.id === id && n.type === GROUP_NODE_TYPE);
      if (!currentNode) return;

      // Convert to annotation, apply updates, convert back to node
      const currentGroup = nodeToGroup(currentNode as Node<GroupNodeData>);
      const updatedGroup = { ...currentGroup, ...updates };
      const newNode = groupToNode(updatedGroup);
      replaceNode(id, newNode);
    },
    [replaceNode]
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
      const currentNode = useGraphStore
        .getState()
        .nodes.find((n) => n.id === id && n.type === FREE_TEXT_NODE_TYPE);
      if (!currentNode) return;

      const currentAnnotation = nodeToFreeText(currentNode as Node<FreeTextNodeData>);
      const updatedAnnotation = { ...currentAnnotation, ...updates };
      const newNode = freeTextToNode(updatedAnnotation);
      replaceNode(id, newNode);
    },
    [replaceNode]
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
      const currentNode = useGraphStore
        .getState()
        .nodes.find((n) => n.id === id && n.type === FREE_SHAPE_NODE_TYPE);
      if (!currentNode) return;

      const currentAnnotation = nodeToFreeShape(currentNode as Node<FreeShapeNodeData>);
      const updatedAnnotation = { ...currentAnnotation, ...updates };
      const newNode = freeShapeToNode(updatedAnnotation);
      replaceNode(id, newNode);
    },
    [replaceNode]
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
      const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNode(nodeId, {
        data: { ...(node.data as Record<string, unknown>), groupId }
      });
    },
    [updateNode]
  );

  const removeNodeFromGroup = useCallback(
    (nodeId: string) => {
      const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const nodeData = node.data as Record<string, unknown>;
      // Force groupId to undefined so updateNode's merge clears membership.
      updateNode(nodeId, { data: { ...nodeData, groupId: undefined } });
    },
    [updateNode]
  );

  const getNodeMembership = useCallback(
    (nodeId: string): string | null => {
      return membershipMap.get(nodeId) ?? null;
    },
    [membershipMap]
  );

  const getGroupMembers = useCallback(
    (groupId: string, options?: { includeNested?: boolean }): string[] => {
      const members = new Set<string>();
      const includeNested = options?.includeNested ?? false;

      const addDirectMembers = (id: string) => {
        for (const [nodeId, gId] of membershipMap) {
          if (gId === id) {
            members.add(nodeId);
          }
        }
        // Also include text/shape annotations with this groupId (from node data)
        for (const text of textAnnotations) {
          if (text.groupId === id) members.add(text.id);
        }
        for (const shape of shapeAnnotations) {
          if (shape.groupId === id) members.add(shape.id);
        }
      };

      if (!includeNested) {
        addDirectMembers(groupId);
        return Array.from(members);
      }

      const childMap = new Map<string, string[]>();
      for (const group of groups) {
        const parentId =
          typeof group.parentId === "string"
            ? group.parentId
            : typeof group.groupId === "string"
              ? group.groupId
              : undefined;
        if (!parentId) continue;
        const list = childMap.get(parentId) ?? [];
        list.push(group.id);
        childMap.set(parentId, list);
      }

      const visited = new Set<string>();
      const stack = [groupId];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        addDirectMembers(current);
        const children = childMap.get(current) ?? [];
        for (const child of children) {
          members.add(child);
          stack.push(child);
        }
      }

      members.delete(groupId);
      return Array.from(members);
    },
    [membershipMap, textAnnotations, shapeAnnotations, groups]
  );

  return useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
}
