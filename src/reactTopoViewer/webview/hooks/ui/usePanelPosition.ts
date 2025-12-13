/**
 * Panel position and drag management hooks for FloatingActionPanel
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface Position {
  left: number;
  top: number;
}

const PANEL_STORAGE_KEY = 'unifiedPanelState';
const DEFAULT_POSITION: Position = { left: 20, top: 100 };
const NAVBAR_HEIGHT = 72;

/**
 * Load initial panel position from localStorage
 */
export function loadInitialPosition(): Position {
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
 * Save panel state to localStorage
 */
export function savePanelState(position: Position, collapsed: boolean): void {
  window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ ...position, collapsed }));
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
 * Custom hook for floating panel position and dragging
 * Note: Renamed from usePanelDrag to useFloatingPanelDrag to avoid collision with shared/editor/usePanelDrag
 */
export function useFloatingPanelDrag(isLocked: boolean) {
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
export function useDrawerSide(
  panelRef: React.RefObject<HTMLDivElement | null>,
  position: Position
) {
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
 * Hook for shake animation state
 */
export function useShakeAnimation() {
  const [isShaking, setIsShaking] = useState(false);
  const trigger = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  }, []);
  return { isShaking, trigger };
}

/**
 * Build lock button CSS class
 */
export function buildLockButtonClass(isLocked: boolean, isShaking: boolean): string {
  const classes = ['floating-panel-btn'];
  if (isLocked) classes.push('danger');
  if (isShaking) classes.push('lock-shake');
  return classes.join(' ');
}
