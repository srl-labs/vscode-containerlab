/**
 * Consolidated hook for panel position and dragging
 * Combines features from both floating panel and editor panel drag implementations
 */
import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';

import { addMouseMoveUpListeners } from '../shared/dragHelpers';

export interface Position {
  x: number;
  y: number;
}

const MIN_VISIBLE_HEIGHT = 50;
const MIN_VISIBLE_WIDTH = 100;
const DEFAULT_TOP_MARGIN = 72; // Navbar height
const DEFAULT_PANEL_HEIGHT = 400; // Estimated panel height for centering

/**
 * Calculate centered position for a panel
 */
function getCenteredPosition(panelWidth: number): Position {
  const x = Math.max(20, (window.innerWidth - panelWidth) / 2);
  const y = Math.max(DEFAULT_TOP_MARGIN, (window.innerHeight - DEFAULT_PANEL_HEIGHT) / 2);
  return { x, y };
}

export interface UsePanelDragOptions {
  storageKey?: string;
  initialPosition?: Position;
  panelWidth?: number;
  isLocked?: boolean;
  topMargin?: number;
  minVisibleWidth?: number;
  minVisibleHeight?: number;
}

export interface UsePanelDragReturn {
  panelRef: React.RefObject<HTMLDivElement | null>;
  position: Position;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

interface ConstraintOptions {
  panelWidth: number;
  topMargin: number;
  minVisibleWidth: number;
  minVisibleHeight: number;
}

/**
 * Constrain position within viewport bounds
 */
function constrainPosition(pos: Position, opts: ConstraintOptions): Position {
  const { panelWidth, topMargin, minVisibleWidth, minVisibleHeight } = opts;
  return {
    x: Math.max(-(panelWidth - minVisibleWidth), Math.min(pos.x, window.innerWidth - minVisibleWidth)),
    y: Math.max(topMargin, Math.min(pos.y, window.innerHeight - minVisibleHeight))
  };
}

/**
 * Saved position format - supports both { x, y } and legacy { left, top } formats
 */
interface SavedPosition {
  x?: number;
  y?: number;
  left?: number;
  top?: number;
}

/**
 * Parse saved position supporting both { x, y } and { left, top } formats
 */
function parseSavedPosition(saved: string, defaultPos: Position): Position {
  const parsed = JSON.parse(saved) as SavedPosition;
  return {
    x: parsed.x ?? parsed.left ?? defaultPos.x,
    y: parsed.y ?? parsed.top ?? defaultPos.y
  };
}

/**
 * Load position from localStorage, or calculate centered position if not cached
 */
function loadPosition(storageKey: string | undefined, defaultPos: Position | undefined, opts: ConstraintOptions): Position {
  // If a specific initial position was provided, use it
  const fallbackPos = defaultPos ?? getCenteredPosition(opts.panelWidth);

  if (!storageKey) return constrainPosition(fallbackPos, opts);
  try {
    const saved = window.localStorage.getItem(`panel-pos-${storageKey}`);
    if (saved) {
      return constrainPosition(parseSavedPosition(saved, fallbackPos), opts);
    }
  } catch { /* ignore */ }
  // No cached position - use fallback (provided initialPosition or centered)
  return constrainPosition(fallbackPos, opts);
}

/**
 * Save position to localStorage
 */
function savePosition(storageKey: string | undefined, pos: Position): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(`panel-pos-${storageKey}`, JSON.stringify(pos));
  } catch { /* ignore */ }
}

/**
 * Check if target should prevent drag start
 */
function shouldPreventDrag(target: HTMLElement): boolean {
  return (
    target.tagName === 'BUTTON' ||
    target.tagName === 'I' ||
    target.closest('.panel-close-btn') !== null ||
    target.closest('button') !== null
  );
}

/**
 * Hook for mouse move/up event handling during drag
 */
function useDragEvents(
  isDragging: boolean,
  startRef: React.RefObject<{ x: number; y: number }>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  widthRef: React.RefObject<number>,
  storageKey: string | undefined,
  opts: ConstraintOptions,
  setPosition: React.Dispatch<React.SetStateAction<Position>>,
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>
): void {
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = { x: e.clientX - startRef.current!.x, y: e.clientY - startRef.current!.y };
      const actualWidth = panelRef.current?.offsetWidth || widthRef.current!;
      setPosition(constrainPosition(newPos, { ...opts, panelWidth: actualWidth }));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setPosition(prev => { savePosition(storageKey, prev); return prev; });
    };

    return addMouseMoveUpListeners(handleMouseMove, handleMouseUp);
  }, [isDragging, startRef, panelRef, widthRef, storageKey, opts, setPosition, setIsDragging]);
}

/**
 * Hook for window resize handling
 */
function useResizeHandler(
  panelRef: React.RefObject<HTMLDivElement | null>,
  widthRef: React.RefObject<number>,
  opts: ConstraintOptions,
  setPosition: React.Dispatch<React.SetStateAction<Position>>
): void {
  useEffect(() => {
    const handleResize = () => {
      const actualWidth = panelRef.current?.offsetWidth || widthRef.current!;
      setPosition(prev => constrainPosition(prev, { ...opts, panelWidth: actualWidth }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelRef, widthRef, opts, setPosition]);
}

/**
 * Custom hook for panel position and dragging
 */
export function usePanelDrag(options: UsePanelDragOptions = {}): UsePanelDragReturn {
  const {
    storageKey,
    initialPosition, // undefined means center the panel
    panelWidth = 400,
    isLocked = false,
    topMargin = DEFAULT_TOP_MARGIN,
    minVisibleWidth = MIN_VISIBLE_WIDTH,
    minVisibleHeight = MIN_VISIBLE_HEIGHT
  } = options;

  const opts: ConstraintOptions = { panelWidth, topMargin, minVisibleWidth, minVisibleHeight };

  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>(() => loadPosition(storageKey, initialPosition, opts));
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || shouldPreventDrag(e.target as HTMLElement)) return;
    setIsDragging(true);
    startRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  }, [isLocked, position]);

  useDragEvents(isDragging, startRef, panelRef, widthRef, storageKey, opts, setPosition, setIsDragging);
  useResizeHandler(panelRef, widthRef, opts, setPosition);

  return { panelRef, position, isDragging, handleMouseDown };
}

/**
 * Custom hook for drawer side calculation
 */
export function useDrawerSide(
  panelRef: React.RefObject<HTMLDivElement | null>,
  position: Position
): 'left' | 'right' {
  const [drawerSide, setDrawerSide] = useState<'left' | 'right'>('right');

  useEffect(() => {
    const updateDrawerDirection = () => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      setDrawerSide(rect.left + rect.width / 2 > window.innerWidth / 2 ? 'left' : 'right');
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

// Legacy exports for backwards compatibility
export const PANEL_STORAGE_KEY = 'unifiedPanelState';

/**
 * Save panel state to localStorage including collapsed state
 * Position is saved automatically by usePanelDrag, this saves additional UI state
 */
export function savePanelState(position: Position, collapsed: boolean): void {
  window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ ...position, collapsed }));
}
