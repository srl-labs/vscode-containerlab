/**
 * Floating Action Panel Component for React TopoViewer
 * A draggable panel with deployment controls and editor tools
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo
} from "react";

import type { CustomNodeTemplate } from "../../../../shared/types/editors";
import { useTopoViewerActions, useTopoViewerState } from "../../../context/TopoViewerContext";
import {
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  savePanelState,
  buildLockButtonClass,
  PANEL_STORAGE_KEY
} from "../../../hooks/ui/usePanelDrag";

import { PanelButton, DeployButtonGroup } from "./DeployControls";
import type { DropdownMenuItem, CustomNodeActions } from "./DropdownMenu";
import { PanelButtonWithDropdown } from "./DropdownMenu";

/** Network type definitions matching legacy topoViewer */
interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly isDefault?: boolean;
  readonly addDivider?: boolean;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: "host", label: "Host network", isDefault: true },
  { type: "mgmt-net", label: "Management network" },
  { type: "macvlan", label: "Macvlan network" },
  { type: "vxlan", label: "VXLAN network", addDivider: true },
  { type: "vxlan-stitch", label: "VXLAN Stitch network" },
  { type: "dummy", label: "Dummy network", addDivider: true },
  { type: "bridge", label: "Bridge", addDivider: true },
  { type: "ovs-bridge", label: "OVS bridge" }
];

/** Shape definitions for add shapes dropdown */
interface ShapeDefinition {
  readonly type: "rectangle" | "circle" | "line";
  readonly label: string;
  readonly icon: string;
}

const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  { type: "rectangle", label: "Rectangle", icon: "fa-square" },
  { type: "circle", label: "Circle", icon: "fa-circle" },
  { type: "line", label: "Line", icon: "fa-minus" }
];

interface FloatingActionPanelProps {
  onDeploy?: () => void;
  onDestroy?: () => void;
  onDeployCleanup?: () => void;
  onDestroyCleanup?: () => void;
  onRedeploy?: () => void;
  onRedeployCleanup?: () => void;
  onAddNode?: (kind?: string) => void;
  onAddNetwork?: (networkType?: string) => void;
  onAddGroup?: () => void;
  onAddText?: () => void;
  onAddShapes?: (shapeType?: string) => void;
  onAddBulkLink?: () => void;
  /** Custom node template actions */
  onEditCustomNode?: (nodeName: string) => void;
  onDeleteCustomNode?: (nodeName: string) => void;
  onSetDefaultCustomNode?: (nodeName: string) => void;
  /** Whether Add Text mode is active (button should be highlighted) */
  isAddTextMode?: boolean;
  /** Whether Add Shape mode is active (button should be highlighted) */
  isAddShapeMode?: boolean;
}

/** Imperative handle for FloatingActionPanel */
export interface FloatingActionPanelHandle {
  triggerShake: () => void;
}

/** Convert network definitions to dropdown menu items */
const networkMenuItems: DropdownMenuItem[] = NETWORK_TYPE_DEFINITIONS.map((def) => ({
  id: def.type,
  label: `${def.label} (${def.type})`,
  isDefault: def.isDefault,
  addDivider: def.addDivider
}));

/** Convert shape definitions to dropdown menu items */
const shapeMenuItems: DropdownMenuItem[] = SHAPE_DEFINITIONS.map((def) => ({
  id: def.type,
  label: def.label,
  icon: def.icon
}));

/** Hook for creating lock-aware click handler factory */
function useLockAwareHandler(
  isLocked: boolean,
  onLockedClick: (() => void) | undefined
): (handler: (() => void) | undefined) => (e: React.MouseEvent) => void {
  return useCallback(
    (handler: (() => void) | undefined) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLocked) {
        onLockedClick?.();
        return;
      }
      handler?.();
    },
    [isLocked, onLockedClick]
  );
}

/** Convert custom node templates to dropdown menu items */
function buildNodeMenuItems(customNodes: CustomNodeTemplate[]): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = customNodes.map((node) => ({
    id: node.name,
    label: node.name,
    isDefault: node.setDefault,
    isCustomNode: true
  }));
  if (items.length > 0) {
    items.push({ id: "__new_custom_node__", label: "New custom node...", addDivider: true });
  } else {
    items.push({ id: "__new_custom_node__", label: "New custom node..." });
  }
  return items;
}

export const FloatingActionPanel = forwardRef<FloatingActionPanelHandle, FloatingActionPanelProps>(
  (props, ref) => {
    const { state } = useTopoViewerState();
    const { toggleLock } = useTopoViewerActions();
    const isViewerMode = state.mode === "view";
    const { isLocked } = state;

    const [isCollapsed, setIsCollapsed] = useState(false);
    const { isShaking, trigger: triggerLockShake } = useShakeAnimation();
    // Use default position on left side when no cached position exists
    const { panelRef, position, handleMouseDown } = usePanelDrag({
      isLocked,
      storageKey: PANEL_STORAGE_KEY,
      initialPosition: { x: 20, y: 80 }
    });
    const drawerSide = useDrawerSide(panelRef, position);

    useImperativeHandle(
      ref,
      () => ({
        triggerShake: triggerLockShake
      }),
      [triggerLockShake]
    );

    // Save collapsed state separately since the hook handles position
    useEffect(() => {
      savePanelState(position, isCollapsed);
    }, [position, isCollapsed]);

    const handleLockClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleLock();
      },
      [toggleLock]
    );

    const handleCollapseClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCollapsed((prev) => !prev);
    }, []);

    const panelCursor = isLocked ? "default" : "grab";

    return (
      <div
        ref={panelRef}
        className="floating-action-panel"
        style={{ left: position.x, top: position.y, cursor: panelCursor }}
        onMouseDown={handleMouseDown}
      >
        <div className="floating-panel-drag-handle" style={{ cursor: panelCursor }} />

        <button
          className={buildLockButtonClass(isLocked, isShaking)}
          title={isLocked ? "Unlock Lab" : "Lock Lab"}
          onClick={handleLockClick}
          data-testid="floating-panel-lock-btn"
        >
          <i className={`fas ${isLocked ? "fa-lock" : "fa-unlock"}`}></i>
        </button>

        {!isCollapsed && (
          <PanelContent
            isViewerMode={isViewerMode}
            isLocked={isLocked}
            drawerSide={drawerSide}
            onLockedClick={triggerLockShake}
            {...props}
          />
        )}

        <div className="floating-panel-divider" />

        <PanelButton
          icon={isCollapsed ? "fa-chevron-down" : "fa-chevron-up"}
          tooltip={isCollapsed ? "Expand Panel" : "Collapse Panel"}
          onClick={handleCollapseClick}
          testId="floating-panel-collapse-btn"
        />
      </div>
    );
  }
);

/**
 * Panel Content - Editor tools and deploy buttons
 */
interface PanelContentProps extends FloatingActionPanelProps {
  isViewerMode: boolean;
  isLocked: boolean;
  drawerSide: "left" | "right";
  onLockedClick?: () => void;
}

/** Build custom node action callbacks */
function buildCustomNodeActions(
  onEdit?: (nodeName: string) => void,
  onDelete?: (nodeName: string) => void,
  onSetDefault?: (nodeName: string) => void
): CustomNodeActions | undefined {
  if (!onEdit && !onDelete && !onSetDefault) return undefined;
  return {
    onEdit,
    onDelete,
    onSetDefault
  };
}

const PanelContent: React.FC<PanelContentProps> = ({
  isViewerMode,
  isLocked,
  drawerSide,
  onLockedClick,
  onDeploy,
  onDestroy,
  onDeployCleanup,
  onDestroyCleanup,
  onRedeploy,
  onRedeployCleanup,
  onAddNode,
  onAddNetwork,
  onAddGroup,
  onAddText,
  onAddShapes,
  onAddBulkLink,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode,
  isAddTextMode = false,
  isAddShapeMode = false
}) => {
  const { state } = useTopoViewerState();
  const { setProcessing } = useTopoViewerActions();
  const { isProcessing, processingMode } = state;

  const handleDeployClick = useCallback(() => {
    const mode = isViewerMode ? "destroy" : "deploy";
    setProcessing(true, mode);
    if (isViewerMode) {
      onDestroy?.();
    } else {
      onDeploy?.();
    }
  }, [isViewerMode, onDeploy, onDestroy, setProcessing]);

  // Wrap cleanup/redeploy handlers to set processing state
  const handleDeployCleanup = useCallback(() => {
    setProcessing(true, "deploy");
    onDeployCleanup?.();
  }, [onDeployCleanup, setProcessing]);

  const handleDestroyCleanup = useCallback(() => {
    setProcessing(true, "destroy");
    onDestroyCleanup?.();
  }, [onDestroyCleanup, setProcessing]);

  const handleRedeploy = useCallback(() => {
    setProcessing(true, "deploy");
    onRedeploy?.();
  }, [onRedeploy, setProcessing]);

  const handleRedeployCleanup = useCallback(() => {
    setProcessing(true, "deploy");
    onRedeployCleanup?.();
  }, [onRedeployCleanup, setProcessing]);

  const createLockAwareHandler = useLockAwareHandler(isLocked, onLockedClick);

  const nodeMenuItems = useMemo(() => buildNodeMenuItems(state.customNodes), [state.customNodes]);
  const customNodeActions = useMemo(
    () => buildCustomNodeActions(onEditCustomNode, onDeleteCustomNode, onSetDefaultCustomNode),
    [onEditCustomNode, onDeleteCustomNode, onSetDefaultCustomNode]
  );
  const handleNodeSelect = useCallback(
    (id: string) => {
      if (id === "__new_custom_node__") {
        onAddNode?.("__new__");
      } else {
        onAddNode?.(id);
      }
    },
    [onAddNode]
  );
  const handleNetworkSelect = useCallback((t: string) => onAddNetwork?.(t), [onAddNetwork]);
  const handleShapeSelect = useCallback((t: string) => onAddShapes?.(t), [onAddShapes]);

  return (
    <div className="floating-panel-content">
      <DeployButtonGroup
        isViewerMode={isViewerMode}
        drawerSide={drawerSide}
        onDeployClick={handleDeployClick}
        onDeployCleanup={handleDeployCleanup}
        onDestroyCleanup={handleDestroyCleanup}
        onRedeploy={handleRedeploy}
        onRedeployCleanup={handleRedeployCleanup}
        isProcessing={isProcessing}
        processingMode={processingMode}
      />

      {!isViewerMode && <div className="floating-panel-divider" />}

      {!isViewerMode && (
        <PanelButtonWithDropdown
          icon="fa-plus"
          tooltip="Add Node"
          disabled={isLocked}
          drawerSide={drawerSide}
          items={nodeMenuItems}
          filterPlaceholder="Filter templates..."
          onSelect={handleNodeSelect}
          onLockedClick={onLockedClick}
          customNodeActions={customNodeActions}
          testId="floating-panel-add-node-btn"
          clickAddsDefault
        />
      )}
      {!isViewerMode && (
        <PanelButtonWithDropdown
          icon="fa-cloud"
          tooltip="Add Network"
          disabled={isLocked}
          drawerSide={drawerSide}
          items={networkMenuItems}
          filterPlaceholder="Filter networks..."
          onSelect={handleNetworkSelect}
          onLockedClick={onLockedClick}
          testId="floating-panel-add-network-btn"
          clickAddsDefault
        />
      )}
      <PanelButton
        icon="fa-layer-group"
        tooltip="Add Group"
        onClick={createLockAwareHandler(onAddGroup)}
        disabled={isLocked}
        testId="floating-panel-add-group-btn"
      />
      <PanelButton
        icon="fa-font"
        tooltip="Add Text"
        onClick={createLockAwareHandler(onAddText)}
        disabled={isLocked}
        active={isAddTextMode}
        testId="floating-panel-add-text-btn"
      />
      <PanelButtonWithDropdown
        icon="fa-shapes"
        tooltip="Add Shapes"
        disabled={isLocked}
        active={isAddShapeMode}
        drawerSide={drawerSide}
        items={shapeMenuItems}
        filterPlaceholder="Filter shapes..."
        onSelect={handleShapeSelect}
        onLockedClick={onLockedClick}
        testId="floating-panel-add-shapes-btn"
      />
      {!isViewerMode && (
        <PanelButton
          icon="fa-link"
          tooltip="Bulk Link Devices"
          onClick={createLockAwareHandler(onAddBulkLink)}
          disabled={isLocked}
          testId="floating-panel-bulk-link-btn"
        />
      )}
    </div>
  );
};

FloatingActionPanel.displayName = "FloatingActionPanel";
