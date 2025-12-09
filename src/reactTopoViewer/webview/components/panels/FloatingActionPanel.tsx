/**
 * Floating Action Panel Component for React TopoViewer
 * A draggable panel with deployment controls and editor tools
 */
import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTopoViewer } from '../../context/TopoViewerContext';

/** Network type definitions matching legacy topoViewer */
interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly isDefault?: boolean;
  readonly addDivider?: boolean;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: 'host', label: 'Host network', isDefault: true },
  { type: 'mgmt-net', label: 'Management network' },
  { type: 'macvlan', label: 'Macvlan network' },
  { type: 'vxlan', label: 'VXLAN network', addDivider: true },
  { type: 'vxlan-stitch', label: 'VXLAN Stitch network' },
  { type: 'dummy', label: 'Dummy network', addDivider: true },
  { type: 'bridge', label: 'Bridge', addDivider: true },
  { type: 'ovs-bridge', label: 'OVS bridge' }
];

/** Shape definitions for add shapes dropdown */
interface ShapeDefinition {
  readonly type: 'rectangle' | 'circle' | 'line';
  readonly label: string;
  readonly icon: string;
}

const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  { type: 'rectangle', label: 'Rectangle', icon: 'fa-square' },
  { type: 'circle', label: 'Circle', icon: 'fa-circle' },
  { type: 'line', label: 'Line', icon: 'fa-minus' }
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
}

/** Imperative handle for FloatingActionPanel */
export interface FloatingActionPanelHandle {
  triggerShake: () => void;
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

/** Build lock button CSS class */
function buildLockButtonClass(isLocked: boolean, isShaking: boolean): string {
  const classes = ['floating-panel-btn'];
  if (isLocked) classes.push('danger');
  if (isShaking) classes.push('lock-shake');
  return classes.join(' ');
}

/** Hook for shake animation state */
function useShakeAnimation() {
  const [isShaking, setIsShaking] = useState(false);
  const trigger = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  }, []);
  return { isShaking, trigger };
}

export const FloatingActionPanel = forwardRef<FloatingActionPanelHandle, FloatingActionPanelProps>(
  (props, ref) => {
    const { state, toggleLock } = useTopoViewer();
    const isViewerMode = state.mode === 'view';
    const { isLocked } = state;

    const [isCollapsed, setIsCollapsed] = useState(false);
    const { isShaking, trigger: triggerLockShake } = useShakeAnimation();
    const { panelRef, position, handleMouseDown } = usePanelDrag(isLocked);
    const drawerSide = useDrawerSide(panelRef, position);

    // Expose triggerShake to parent via ref
    useImperativeHandle(ref, () => ({
      triggerShake: triggerLockShake
    }), [triggerLockShake]);

    useEffect(() => { savePanelState(position, isCollapsed); }, [position, isCollapsed]);

    const handleLockClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      toggleLock();
    }, [toggleLock]);

    const handleCollapseClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setIsCollapsed(prev => !prev);
    }, []);

    const panelCursor = isLocked ? 'default' : 'grab';

    return (
      <div
        ref={panelRef}
        className="floating-action-panel"
        style={{ left: position.left, top: position.top, cursor: panelCursor }}
        onMouseDown={handleMouseDown}
      >
        <div className="floating-panel-drag-handle" style={{ cursor: panelCursor }} />

        <button
          className={buildLockButtonClass(isLocked, isShaking)}
          title={isLocked ? 'Unlock Lab' : 'Lock Lab'}
          onClick={handleLockClick}
        >
          <i className={`fas ${isLocked ? 'fa-lock' : 'fa-unlock'}`}></i>
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
          icon={isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}
          tooltip={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
          onClick={handleCollapseClick}
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
  drawerSide: 'left' | 'right';
  onLockedClick?: () => void;
}

/** Convert network definitions to dropdown menu items */
const networkMenuItems: DropdownMenuItem[] = NETWORK_TYPE_DEFINITIONS.map(def => ({
  id: def.type,
  label: `${def.label} (${def.type})`,
  isDefault: def.isDefault,
  addDivider: def.addDivider
}));

/** Convert shape definitions to dropdown menu items */
const shapeMenuItems: DropdownMenuItem[] = SHAPE_DEFINITIONS.map(def => ({
  id: def.type,
  label: def.label,
  icon: def.icon
}));

/** Hook for creating lock-aware click handlers */
function useLockAwareHandlers(
  isLocked: boolean,
  onLockedClick: (() => void) | undefined,
  handlers: { [key: string]: (() => void) | undefined }
) {
  return Object.fromEntries(
    Object.entries(handlers).map(([key, handler]) => [
      key,
      useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) { onLockedClick?.(); return; }
        handler?.();
      }, [isLocked, onLockedClick, handler])
    ])
  );
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
  onAddBulkLink
}) => {
  const handleDeployClick = useCallback(() => {
    if (isViewerMode) { onDestroy?.(); } else { onDeploy?.(); }
  }, [isViewerMode, onDeploy, onDestroy]);

  const lockAware = useLockAwareHandlers(isLocked, onLockedClick, {
    node: onAddNode,
    group: onAddGroup,
    text: onAddText,
    bulkLink: onAddBulkLink
  });

  const handleNetworkSelect = useCallback((t: string) => onAddNetwork?.(t), [onAddNetwork]);
  const handleShapeSelect = useCallback((t: string) => onAddShapes?.(t), [onAddShapes]);

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
        <PanelButton icon="fa-plus" tooltip="Add Node" onClick={lockAware.node} disabled={isLocked} />
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
        />
      )}
      <PanelButton icon="fa-layer-group" tooltip="Add Group" onClick={lockAware.group} disabled={isLocked} />
      <PanelButton icon="fa-font" tooltip="Add Text" onClick={lockAware.text} disabled={isLocked} />
      <PanelButtonWithDropdown
        icon="fa-shapes"
        tooltip="Add Shapes"
        disabled={isLocked}
        drawerSide={drawerSide}
        items={shapeMenuItems}
        filterPlaceholder="Filter shapes..."
        onSelect={handleShapeSelect}
        onLockedClick={onLockedClick}
      />
      {!isViewerMode && (
        <PanelButton icon="fa-link" tooltip="Bulk Link Devices" onClick={lockAware.bulkLink} disabled={isLocked} />
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
 * Dropdown menu item interface
 */
interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: string;
  isDefault?: boolean;
  addDivider?: boolean;
}

/**
 * Panel Button with Dropdown Component
 */
interface PanelButtonWithDropdownProps {
  icon: string;
  tooltip: string;
  disabled?: boolean;
  drawerSide: 'left' | 'right';
  items: DropdownMenuItem[];
  filterPlaceholder?: string;
  onSelect: (itemId: string) => void;
  onLockedClick?: () => void;
}

/** Hook for dropdown state management */
function useDropdownState(disabled: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setIsOpen(false);
    setFilter('');
    setFocusedIndex(-1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(resetState, 150);
  }, [resetState]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return {
    isOpen, filter, focusedIndex,
    setFilter, setFocusedIndex,
    resetState, handleMouseEnter, handleMouseLeave
  };
}

/** Filter items based on search text */
function filterDropdownItems(items: DropdownMenuItem[], filter: string): DropdownMenuItem[] {
  const search = filter.toLowerCase();
  return items.filter(item => item.label.toLowerCase().includes(search));
}

/** Build CSS class for menu positioning */
function buildMenuClass(isOpen: boolean, drawerSide: 'left' | 'right'): string {
  const classes = ['floating-panel-dropdown-menu'];
  if (isOpen) classes.push('visible');
  classes.push(drawerSide === 'left' ? 'position-left' : 'position-right');
  return classes.join(' ');
}

/** Build CSS class for dropdown item */
function buildItemClass(item: DropdownMenuItem, isFocused: boolean): string {
  const classes = ['floating-panel-dropdown-item'];
  if (item.isDefault) classes.push('default');
  if (isFocused) classes.push('focused');
  return classes.join(' ');
}

/** Dropdown menu item component */
interface DropdownItemProps {
  item: DropdownMenuItem;
  index: number;
  focusedIndex: number;
  onSelect: (id: string) => void;
}

const DropdownItem: React.FC<DropdownItemProps> = ({ item, index, focusedIndex, onSelect }) => (
  <React.Fragment>
    {item.addDivider && index > 0 && <div className="floating-panel-dropdown-divider" />}
    <button
      className={buildItemClass(item, focusedIndex === index)}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <i className={`fas ${item.icon}`}></i>}
      <span>{item.label}</span>
    </button>
  </React.Fragment>
);

/** Hook for keyboard navigation in dropdown */
interface KeyboardNavParams {
  isOpen: boolean;
  itemCount: number;
  focusedIndex: number;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelectFocused: () => void;
  onEscape: () => void;
}

function useDropdownKeyboard(params: KeyboardNavParams) {
  const { isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape } = params;

  return useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, itemCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < itemCount) onSelectFocused();
    } else if (e.key === 'Escape') {
      onEscape();
    }
  }, [isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape]);
}

/** Focus input when dropdown opens */
function useFocusOnOpen(isOpen: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, inputRef]);
}

const PanelButtonWithDropdown: React.FC<PanelButtonWithDropdownProps> = ({
  icon,
  tooltip,
  disabled = false,
  drawerSide,
  items,
  filterPlaceholder = 'Filter...',
  onSelect,
  onLockedClick
}) => {
  const {
    isOpen, filter, focusedIndex,
    setFilter, setFocusedIndex,
    resetState, handleMouseEnter, handleMouseLeave
  } = useDropdownState(disabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const filteredItems = filterDropdownItems(items, filter);

  const handleSelect = useCallback((itemId: string) => {
    onSelect(itemId);
    resetState();
  }, [onSelect, resetState]);

  const handleKeyDown = useDropdownKeyboard({
    isOpen,
    itemCount: filteredItems.length,
    focusedIndex,
    setFocusedIndex,
    onSelectFocused: () => handleSelect(filteredItems[focusedIndex].id),
    onEscape: resetState
  });

  const handleButtonClick = useCallback(() => {
    if (disabled && onLockedClick) {
      onLockedClick();
    }
  }, [disabled, onLockedClick]);

  useFocusOnOpen(isOpen, filterInputRef);

  return (
    <div
      ref={containerRef}
      className="floating-panel-dropdown"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`floating-panel-btn ${disabled ? 'disabled' : ''}`}
        title={tooltip}
        disabled={false}
        onClick={handleButtonClick}
      >
        <i className={`fas ${icon}`}></i>
      </button>

      <div className={buildMenuClass(isOpen, drawerSide)} onKeyDown={handleKeyDown}>
        <div className="floating-panel-dropdown-filter">
          <input
            ref={filterInputRef}
            type="text"
            placeholder={filterPlaceholder}
            value={filter}
            onChange={e => { setFilter(e.target.value); setFocusedIndex(-1); }}
          />
        </div>
        <div>
          {filteredItems.map((item, index) => (
            <DropdownItem
              key={item.id}
              item={item}
              index={index}
              focusedIndex={focusedIndex}
              onSelect={handleSelect}
            />
          ))}
          {filteredItems.length === 0 && (
            <div className="floating-panel-dropdown-item" style={{ opacity: 0.6, cursor: 'default' }}>
              No matches found
            </div>
          )}
        </div>
      </div>
    </div>
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
