/**
 * Canvas handlers for annotation interactions in React Flow
 * Handles pane clicks, node double-clicks, and node drags for annotations
 */
import type { RefObject } from "react";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import type {
  AnnotationModeState,
  AnnotationHandlers
} from "../../components/react-flow-canvas/types";
import { log } from "../../utils/logger";
import { isLineHandleActive } from "../../components/react-flow-canvas/nodes/AnnotationHandles";

import { snapToGrid } from "./useCanvasHandlers";

/** Node type constants */
const FREE_TEXT_NODE_TYPE = "free-text-node";
const FREE_SHAPE_NODE_TYPE = "free-shape-node";
const GROUP_NODE_TYPE = "group-node";

interface UseAnnotationCanvasHandlersOptions {
  mode: "view" | "edit";
  isLocked: boolean;
  annotationMode?: AnnotationModeState;
  annotationHandlers?: AnnotationHandlers;
  reactFlowInstanceRef: RefObject<ReactFlowInstance | null>;
  baseOnPaneClick: (event: React.MouseEvent) => void;
  baseOnNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  baseOnNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  /** Callback for shift+click node creation */
  onShiftClickCreate?: (position: { x: number; y: number }) => void;
}

interface UseAnnotationCanvasHandlersReturn {
  wrappedOnPaneClick: (event: React.MouseEvent) => void;
  wrappedOnNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  wrappedOnNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  isInAddMode: boolean;
  addModeMessage: string | null;
}

/**
 * Hook for Escape key to cancel add modes
 */
function useEscapeToCancelAddMode(
  annotationMode?: AnnotationModeState,
  annotationHandlers?: AnnotationHandlers
) {
  useEffect(() => {
    if (!annotationMode?.isAddTextMode && !annotationMode?.isAddShapeMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (annotationMode.isAddTextMode) annotationHandlers?.disableAddTextMode();
      if (annotationMode.isAddShapeMode) annotationHandlers?.disableAddShapeMode();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotationMode?.isAddTextMode, annotationMode?.isAddShapeMode, annotationHandlers]);
}

/**
 * Hook for wrapping pane click handler for annotations
 */
function useWrappedPaneClick(
  mode: "view" | "edit",
  isLocked: boolean,
  annotationMode: AnnotationModeState | undefined,
  annotationHandlers: AnnotationHandlers | undefined,
  reactFlowInstanceRef: RefObject<ReactFlowInstance | null>,
  baseOnPaneClick: (event: React.MouseEvent) => void,
  onShiftClickCreate?: (position: { x: number; y: number }) => void
) {
  return useCallback(
    (event: React.MouseEvent) => {
      const rfInstance = reactFlowInstanceRef.current;
      if (!rfInstance) {
        baseOnPaneClick(event);
        return;
      }

      // Handle Shift+Click for node creation in edit mode
      if (event.shiftKey && mode === "edit" && !isLocked && onShiftClickCreate) {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        const position = rfInstance.screenToFlowPosition({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top
        });
        log.info(`[ReactFlowCanvas] Shift+Click: Creating node at (${position.x}, ${position.y})`);
        onShiftClickCreate(snapToGrid(position));
        return;
      }

      if (annotationMode?.isAddTextMode && annotationHandlers) {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        const position = rfInstance.screenToFlowPosition({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top
        });
        log.info(`[ReactFlowCanvas] Adding text at (${position.x}, ${position.y})`);
        annotationHandlers.onAddTextClick(snapToGrid(position));
        return;
      }

      if (annotationMode?.isAddShapeMode && annotationHandlers) {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        const position = rfInstance.screenToFlowPosition({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top
        });
        log.info(`[ReactFlowCanvas] Adding shape at (${position.x}, ${position.y})`);
        annotationHandlers.onAddShapeClick(snapToGrid(position));
        return;
      }

      // Explicitly deselect all nodes when clicking on the pane
      // This ensures annotation nodes are properly deselected
      const nodes = rfInstance.getNodes();
      const hasSelectedNodes = nodes.some((n) => n.selected);
      if (hasSelectedNodes) {
        rfInstance.setNodes(nodes.map((n) => ({ ...n, selected: false })));
      }

      baseOnPaneClick(event);
    },
    [
      mode,
      isLocked,
      annotationMode,
      annotationHandlers,
      reactFlowInstanceRef,
      baseOnPaneClick,
      onShiftClickCreate
    ]
  );
}

/**
 * Hook for wrapping node double-click handler for annotations
 */
function useWrappedNodeDoubleClick(
  mode: "view" | "edit",
  isLocked: boolean,
  annotationHandlers: AnnotationHandlers | undefined,
  baseOnNodeDoubleClick: (event: React.MouseEvent, node: Node) => void
) {
  return useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (mode !== "edit" || isLocked || !annotationHandlers) {
        baseOnNodeDoubleClick(event, node);
        return;
      }

      if (node.type === FREE_TEXT_NODE_TYPE) {
        log.info(`[ReactFlowCanvas] Editing free text: ${node.id}`);
        annotationHandlers.onEditFreeText(node.id);
        return;
      }

      if (node.type === FREE_SHAPE_NODE_TYPE) {
        log.info(`[ReactFlowCanvas] Editing free shape: ${node.id}`);
        annotationHandlers.onEditFreeShape(node.id);
        return;
      }

      if (node.type === GROUP_NODE_TYPE) {
        log.info(`[ReactFlowCanvas] Editing group: ${node.id}`);
        annotationHandlers.onEditGroup?.(node.id);
        return;
      }

      baseOnNodeDoubleClick(event, node);
    },
    [mode, isLocked, annotationHandlers, baseOnNodeDoubleClick]
  );
}

/**
 * Hook for wrapping node drag stop handler for annotations
 * Only updates the annotation state - React Flow handles the visual position
 */
function useWrappedNodeDragStop(
  mode: "view" | "edit",
  annotationHandlers: AnnotationHandlers | undefined,
  baseOnNodeDragStop: (event: React.MouseEvent, node: Node) => void
) {
  return useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (mode !== "edit") return;

      // For annotation nodes, update position and check for group membership
      if (node.type === FREE_TEXT_NODE_TYPE && annotationHandlers) {
        const snappedPosition = snapToGrid(node.position);
        log.info(`[ReactFlowCanvas] Updated free text position: ${node.id}`);
        annotationHandlers.onUpdateFreeTextPosition(node.id, snappedPosition);
        // Check for group membership changes
        annotationHandlers.onNodeDropped?.(node.id, snappedPosition);
        return;
      }

      if (node.type === FREE_SHAPE_NODE_TYPE && annotationHandlers) {
        // Skip position update if a line handle drag is in progress
        // The handle already updates the position directly
        if (isLineHandleActive()) {
          log.info(`[ReactFlowCanvas] Skipping position update (line handle active): ${node.id}`);
          return;
        }

        const snappedPosition = snapToGrid(node.position);
        log.info(`[ReactFlowCanvas] Updated free shape position: ${node.id}`);
        annotationHandlers.onUpdateFreeShapePosition(node.id, snappedPosition);
        // Check for group membership changes
        annotationHandlers.onNodeDropped?.(node.id, snappedPosition);
        return;
      }

      if (node.type === GROUP_NODE_TYPE && annotationHandlers) {
        // Groups should not snap; preserve exact drag position
        const position = node.position;
        log.info(`[ReactFlowCanvas] Updated group position: ${node.id}`);
        annotationHandlers.onUpdateGroupPosition?.(node.id, position);
        // Save member positions to file on drag end
        annotationHandlers.onGroupDragEnd?.(node.id);
        return;
      }

      // For regular topology nodes, check for group membership changes
      if (annotationHandlers?.onNodeDropped) {
        const snappedPosition = snapToGrid(node.position);
        annotationHandlers.onNodeDropped(node.id, snappedPosition);
      }

      baseOnNodeDragStop(event, node);
    },
    [mode, annotationHandlers, baseOnNodeDragStop]
  );
}

/**
 * Hook for computing add mode state and message
 */
function useAddModeState(annotationMode?: AnnotationModeState) {
  const isInAddMode = annotationMode?.isAddTextMode || annotationMode?.isAddShapeMode || false;

  const addModeMessage = useMemo(() => {
    if (annotationMode?.isAddTextMode) {
      return "Click on the canvas to add text — Press Escape to cancel";
    }
    if (annotationMode?.isAddShapeMode) {
      const shapeType = annotationMode.pendingShapeType || "shape";
      return `Click on the canvas to add ${shapeType} — Press Escape to cancel`;
    }
    return null;
  }, [
    annotationMode?.isAddTextMode,
    annotationMode?.isAddShapeMode,
    annotationMode?.pendingShapeType
  ]);

  return { isInAddMode, addModeMessage };
}

/**
 * Hook for annotation-related canvas handlers
 */
export function useAnnotationCanvasHandlers(
  options: UseAnnotationCanvasHandlersOptions
): UseAnnotationCanvasHandlersReturn {
  const {
    mode,
    isLocked,
    annotationMode,
    annotationHandlers,
    reactFlowInstanceRef,
    baseOnPaneClick,
    baseOnNodeDoubleClick,
    baseOnNodeDragStop,
    onShiftClickCreate
  } = options;

  // Escape key to cancel add modes
  useEscapeToCancelAddMode(annotationMode, annotationHandlers);

  // Wrapped handlers
  const wrappedOnPaneClick = useWrappedPaneClick(
    mode,
    isLocked,
    annotationMode,
    annotationHandlers,
    reactFlowInstanceRef,
    baseOnPaneClick,
    onShiftClickCreate
  );
  const wrappedOnNodeDoubleClick = useWrappedNodeDoubleClick(
    mode,
    isLocked,
    annotationHandlers,
    baseOnNodeDoubleClick
  );
  const wrappedOnNodeDragStop = useWrappedNodeDragStop(
    mode,
    annotationHandlers,
    baseOnNodeDragStop
  );

  // Add mode state
  const { isInAddMode, addModeMessage } = useAddModeState(annotationMode);

  return {
    wrappedOnPaneClick,
    wrappedOnNodeDoubleClick,
    wrappedOnNodeDragStop,
    isInAddMode,
    addModeMessage
  };
}
