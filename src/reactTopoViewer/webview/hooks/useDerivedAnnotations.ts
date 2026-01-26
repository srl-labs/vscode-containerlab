/**
 * useDerivedAnnotations - Derive annotation data from GraphContext nodes
 *
 * This hook bridges AnnotationContext with GraphContext by:
 * 1. Deriving annotation arrays (groups, text, shapes) from GraphContext nodes
 * 2. Providing mutation functions that update GraphContext nodes
 * 3. Managing membership via membershipMap (loaded from nodeAnnotations JSON)
 *
 * This is the key to making GraphContext the single source of truth for all nodes.
 */
import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import type { Node } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";
import type {
  FreeTextNodeData,
  FreeShapeNodeData,
  GroupNodeData
} from "../components/react-flow-canvas/types";
import { useGraph } from "../context/GraphContext";
import {
  nodeToFreeText,
  nodeToFreeShape,
  nodeToGroup,
  freeTextToNode,
  freeShapeToNode,
  groupToNode
} from "../utils/annotationNodeConverters";
import { saveAllNodeGroupMemberships } from "../services";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../utils/webviewMessageBus";

/** Node annotation from JSON file */
interface NodeAnnotation {
  id: string;
  group?: string;
  groupId?: string;
}

/** Initial data structure from window */
interface InitialData {
  nodeAnnotations?: NodeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
}

function buildMembershipMap(
  groups: GroupStyleAnnotation[],
  nodeAnnotations?: NodeAnnotation[]
): Map<string, string> {
  const map = new Map<string, string>();
  const groupNameToId = new Map<string, string>();
  const groupIds = new Set<string>();

  for (const group of groups) {
    groupNameToId.set(group.name, group.id);
    groupIds.add(group.id);
  }

  for (const annotation of nodeAnnotations ?? []) {
    if (annotation.groupId) {
      map.set(annotation.id, annotation.groupId);
      continue;
    }
    if (annotation.group) {
      const legacy = annotation.group;
      const groupId = groupIds.has(legacy) ? legacy : (groupNameToId.get(legacy) ?? null);
      if (groupId) {
        map.set(annotation.id, groupId);
      }
    }
  }

  return map;
}

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
export function useDerivedAnnotations(): UseDerivedAnnotationsReturn {
  const { nodes, addNode, removeNode, updateNode, replaceNode } = useGraph();

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

  // Membership map: nodeId -> groupId
  // This is maintained separately from node data and loaded from nodeAnnotations JSON
  const [membershipMap, setMembershipMap] = useState<Map<string, string>>(() => {
    // Load initial membership from window.__INITIAL_DATA__.nodeAnnotations
    const initialData = (window as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    return buildMembershipMap(
      initialData?.groupStyleAnnotations ?? [],
      initialData?.nodeAnnotations
    );
  });

  // Sync membership map on topology-data refreshes (external file edits)
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as { type?: string; data?: InitialData } | undefined;
      if (message?.type !== "topology-data") return;
      const data = message.data;
      if (!data) return;
      setMembershipMap(buildMembershipMap(data.groupStyleAnnotations ?? [], data.nodeAnnotations));
    };

    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === "topology-data");
  }, []);

  // Track if membership has changed for persistence
  const membershipChangedRef = useRef(false);

  // ============================================================================
  // Group mutations
  // ============================================================================

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const node = groupToNode(group);
      addNode(node as import("../../shared/types/graph").TopoNode);
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
      addNode(node as import("../../shared/types/graph").TopoNode);
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
      addNode(node as import("../../shared/types/graph").TopoNode);
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
      // For annotation nodes (text/shape), update groupId in node data
      // Node lookup may fail if called right after node creation (React state not yet updated)
      const node = nodes.find((n) => n.id === nodeId);
      if (node && (node.type === "free-text-node" || node.type === "free-shape-node")) {
        updateNode(nodeId, {
          data: { ...node.data, groupId }
        });
      }

      // Update membership map (for all node types including topology nodes)
      // This must happen even if node isn't found yet (e.g., called during paste before React re-renders)
      setMembershipMap((prev) => {
        const next = new Map(prev);
        next.set(nodeId, groupId);
        return next;
      });

      // Mark as changed for persistence
      membershipChangedRef.current = true;
    },
    [nodes, updateNode]
  );

  const removeNodeFromGroup = useCallback(
    (nodeId: string) => {
      // For annotation nodes (text/shape), remove groupId from node data
      // Node lookup may fail if called before React re-renders
      const node = nodes.find((n) => n.id === nodeId);
      if (node && (node.type === "free-text-node" || node.type === "free-shape-node")) {
        const { groupId: _removed, ...restData } = node.data as { groupId?: string };
        updateNode(nodeId, { data: restData });
      }

      // Update membership map (for all node types)
      // This must happen even if node isn't found
      setMembershipMap((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });

      // Mark as changed for persistence
      membershipChangedRef.current = true;
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

  // Persist membership changes to nodeAnnotations JSON
  useEffect(() => {
    if (!membershipChangedRef.current) return;
    membershipChangedRef.current = false;

    // Convert membership map to nodeAnnotations array (store groupId)
    const nodeAnnotations: Array<{ id: string; groupId?: string }> = [];

    for (const [nodeId, groupId] of membershipMap) {
      nodeAnnotations.push({ id: nodeId, groupId });
    }

    // Save to JSON file
    void saveAllNodeGroupMemberships(nodeAnnotations);
  }, [membershipMap, groups]);

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
