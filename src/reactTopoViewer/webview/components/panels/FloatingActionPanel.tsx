/**
 * Floating Action Panel Component for React TopoViewer
 * A draggable panel with deployment controls and editor tools
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTopoViewer } from '../../context/TopoViewerContext';

interface FloatingActionPanelProps {
  onDeploy?: () => void;
  onDestroy?: () => void;
  onDeployCleanup?: () => void;
  onDestroyCleanup?: () => void;
  onRedeploy?: () => void;
  onRedeployCleanup?: () => void;
  onAddNode?: () => void;
  onAddNetwork?: () => void;
  onAddGroup?: () => void;
  onAddText?: () => void;
  onAddShapes?: () => void;
  onAddBulkLink?: () => void;
}

interface Position {
  left: number;
  top: number;
}

const PANEL_STORAGE_KEY = 'unifiedPanelState';
const DEFAULT_POSITION: Position = { left: 20, top: 100 };
const NAVBAR_HEIGHT = 72;

/**
 * Load initial panel position from localStorage
 */
function loadInitialPosition(): Position {
  try {
    const saved = window.localStorage.getItem(PANEL_STORAGE_KEY);
    if (saved) {
      const { left, top } = JSON.parse(saved);
      return { left, top };
    }
  } catch {
    // Ignore parsing errors
  }
  return DEFAULT_POSITION;
}

/**
 * Calculate clamped position within viewport bounds
 */
function clampPosition(
  deltaX: number,
  deltaY: number,
  initial: Position,
  panelWidth: number,
  panelHeight: number
): Position {
  const maxLeft = window.innerWidth - panelWidth;
  const maxTop = window.innerHeight - panelHeight;
  return {
    left: Math.max(0, Math.min(initial.left + deltaX, maxLeft)),
    top: Math.max(NAVBAR_HEIGHT, Math.min(initial.top + deltaY, maxTop))
  };
}

/**
 * Custom hook for panel position and dragging
 */
function usePanelDrag(isLocked: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>(loadInitialPosition);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPos = useRef<Position>({ left: 0, top: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'I') return;

    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPos.current = { ...position };
    e.preventDefault();
  }, [isLocked, position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || isLocked) return;
      const deltaX = e.clientX - dragStart.current.x;
      const deltaY = e.clientY - dragStart.current.y;
      const panelWidth = panelRef.current?.offsetWidth || 44;
      const panelHeight = panelRef.current?.offsetHeight || 200;
      setPosition(clampPosition(deltaX, deltaY, initialPos.current, panelWidth, panelHeight));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isLocked]);

  return { panelRef, position, handleMouseDown };
}

/**
 * Custom hook for drawer side calculation
 */
function useDrawerSide(panelRef: React.RefObject<HTMLDivElement | null>, position: Position) {
  const [drawerSide, setDrawerSide] = useState<'left' | 'right'>('right');

  useEffect(() => {
    const updateDrawerDirection = () => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const panelCenterX = rect.left + rect.width / 2;
      setDrawerSide(panelCenterX > window.innerWidth / 2 ? 'left' : 'right');
    };

    updateDrawerDirection();
    window.addEventListener('resize', updateDrawerDirection);
    return () => window.removeEventListener('resize', updateDrawerDirection);
  }, [panelRef, position]);

  return drawerSide;
}

/**
 * Save panel state to localStorage
 */
function savePanelState(position: Position, collapsed: boolean): void {
  window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ ...position, collapsed }));
}

export const FloatingActionPanel: React.FC<FloatingActionPanelProps> = (props) => {
  const { state, toggleLock } = useTopoViewer();
  const isViewerMode = state.mode === 'view';
  const { isLocked } = state;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const { panelRef, position, handleMouseDown } = usePanelDrag(isLocked);
  const drawerSide = useDrawerSide(panelRef, position);

  // Save state when position or collapse changes
  useEffect(() => {
    savePanelState(position, isCollapsed);
  }, [position, isCollapsed]);

  const handleLockClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLock();
  }, [toggleLock]);

  const handleCollapseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCollapsed(prev => !prev);
  }, []);

  return (
    <div
      ref={panelRef}
      className="floating-action-panel"
      style={{ left: position.left, top: position.top, cursor: isLocked ? 'default' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <div className="floating-panel-drag-handle" style={{ cursor: isLocked ? 'default' : 'grab' }} />

      <PanelButton
        icon={isLocked ? 'fa-lock' : 'fa-unlock'}
        tooltip={isLocked ? 'Unlock Lab' : 'Lock Lab'}
        onClick={handleLockClick}
        variant={isLocked ? 'danger' : 'secondary'}
      />

      {!isCollapsed && (
        <PanelContent
          isViewerMode={isViewerMode}
          isLocked={isLocked}
          drawerSide={drawerSide}
          {...props}
        />
      )}

      <div className="floating-panel-divider" />

      <PanelButton
        icon={isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}
        tooltip={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
        onClick={handleCollapseClick}
      />
    </div>
  );
};

/**
 * Panel Content - Editor tools and deploy buttons
 */
interface PanelContentProps extends FloatingActionPanelProps {
  isViewerMode: boolean;
  isLocked: boolean;
  drawerSide: 'left' | 'right';
}

const PanelContent: React.FC<PanelContentProps> = ({
  isViewerMode,
  isLocked,
  drawerSide,
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
  onAddBulkLink
}) => {
  const handleDeployClick = useCallback(() => {
    if (isViewerMode) {
      onDestroy?.();
    } else {
      onDeploy?.();
    }
  }, [isViewerMode, onDeploy, onDestroy]);

  return (
    <div className="floating-panel-content">
      <DeployButtonGroup
        isViewerMode={isViewerMode}
        drawerSide={drawerSide}
        onDeployClick={handleDeployClick}
        onDeployCleanup={onDeployCleanup}
        onDestroyCleanup={onDestroyCleanup}
        onRedeploy={onRedeploy}
        onRedeployCleanup={onRedeployCleanup}
      />

      {!isViewerMode && <div className="floating-panel-divider" />}

      {!isViewerMode && (
        <PanelButton icon="fa-plus" tooltip="Add Node" onClick={onAddNode} disabled={isLocked} />
      )}
      {!isViewerMode && (
        <PanelButton icon="fa-cloud" tooltip="Add Network" onClick={onAddNetwork} disabled={isLocked} />
      )}
      <PanelButton icon="fa-layer-group" tooltip="Add Group" onClick={onAddGroup} disabled={isLocked} />
      <PanelButton icon="fa-font" tooltip="Add Text" onClick={onAddText} disabled={isLocked} />
      <PanelButton icon="fa-shapes" tooltip="Add Shapes" onClick={onAddShapes} disabled={isLocked} />
      {!isViewerMode && (
        <PanelButton icon="fa-link" tooltip="Bulk Link Devices" onClick={onAddBulkLink} disabled={isLocked} />
      )}
    </div>
  );
};

/**
 * Panel Button Component
 */
interface PanelButtonProps {
  icon: string;
  tooltip: string;
  /* eslint-disable-next-line no-unused-vars */
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

const PanelButton: React.FC<PanelButtonProps> = ({ icon, tooltip, onClick, disabled = false, variant = 'secondary' }) => {
  const getClass = () => {
    if (disabled) return 'floating-panel-btn disabled';
    if (variant === 'primary') return 'floating-panel-btn primary';
    if (variant === 'danger') return 'floating-panel-btn danger';
    return 'floating-panel-btn';
  };

  return (
    <button className={getClass()} title={tooltip} onClick={onClick} disabled={disabled}>
      <i className={`fas ${icon}`}></i>
    </button>
  );
};

/**
 * Deploy Button Group with hover drawer
 */
interface DeployButtonGroupProps {
  isViewerMode: boolean;
  drawerSide: 'left' | 'right';
  onDeployClick: () => void;
  onDeployCleanup?: () => void;
  onDestroyCleanup?: () => void;
  onRedeploy?: () => void;
  onRedeployCleanup?: () => void;
}

const DeployButtonGroup: React.FC<DeployButtonGroupProps> = ({
  isViewerMode,
  drawerSide,
  onDeployClick,
  onDeployCleanup,
  onDestroyCleanup,
  onRedeploy,
  onRedeployCleanup
}) => {
  return (
    <div className={`deploy-button-group drawer-${drawerSide}`}>
      <button
        className="floating-panel-btn primary"
        title={isViewerMode ? 'Destroy Lab' : 'Deploy Lab'}
        onClick={onDeployClick}
      >
        <i className={`fas ${isViewerMode ? 'fa-stop' : 'fa-play'}`}></i>
      </button>

      <div className="deploy-drawer">
        {!isViewerMode && (
          <DrawerButton icon="fa-broom" tooltip="Deploy (cleanup)" onClick={onDeployCleanup} variant="danger" />
        )}
        {isViewerMode && (
          <>
            <DrawerButton icon="fa-broom" tooltip="Destroy (cleanup)" onClick={onDestroyCleanup} variant="danger" />
            <DrawerButton icon="fa-redo" tooltip="Redeploy" onClick={onRedeploy} />
            <DrawerButton icon="fa-redo" tooltip="Redeploy (cleanup)" onClick={onRedeployCleanup} variant="danger" />
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Drawer Button Component
 */
interface DrawerButtonProps {
  icon: string;
  tooltip: string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}

const DrawerButton: React.FC<DrawerButtonProps> = ({ icon, tooltip, onClick, variant = 'default' }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <button
      className={`floating-panel-btn ${variant === 'danger' ? 'danger' : ''}`}
      title={tooltip}
      onClick={handleClick}
    >
      <i className={`fas ${icon}`}></i>
    </button>
  );
};
