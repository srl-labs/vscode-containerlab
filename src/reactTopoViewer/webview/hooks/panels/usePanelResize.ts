/**
 * Hook for resizable panel behavior
 */
import type React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';

const DEFAULT_POSITION = { x: 20, y: 80 };
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

interface Size { width: number; height: number | undefined }
interface Pos { x: number; y: number }

function constrainSize(w: number, h: number, pos: Pos, minW: number, minH: number): { width: number; height: number } {
  return {
    width: Math.max(minW, Math.min(w, window.innerWidth - pos.x - 20)),
    height: Math.max(minH, Math.min(h, window.innerHeight - pos.y - 20))
  };
}

function loadSize(key: string | undefined, defaultSize: Size, pos: Pos, minW: number, minH: number): Size {
  if (!key) return defaultSize;
  try {
    const saved = window.localStorage.getItem(`panel-size-${key}`);
    if (saved) {
      const p = JSON.parse(saved) as { width?: number; height?: number };
      if (typeof p.width === 'number' && typeof p.height === 'number') {
        return constrainSize(p.width, p.height, pos, minW, minH);
      }
    }
  } catch { /* ignore */ }
  return defaultSize;
}

function saveSize(key: string | undefined, size: { width: number; height: number }): void {
  if (key) try { window.localStorage.setItem(`panel-size-${key}`, JSON.stringify(size)); } catch { /* ignore */ }
}

function useResizeEvents(isResizing: boolean, onMove: (e: MouseEvent) => void, onEnd: () => void) {
  useEffect(() => {
    if (!isResizing) return;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd); };
  }, [isResizing, onMove, onEnd]);
}

function useWindowResize(minW: number, minH: number, posRef: React.RefObject<Pos>, setSize: React.Dispatch<React.SetStateAction<Size>>) {
  useEffect(() => {
    const fn = () => setSize(prev => prev.height === undefined ? prev : constrainSize(prev.width, prev.height, posRef.current!, minW, minH));
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [minW, minH, posRef, setSize]);
}

export function usePanelResize(
  storageKey?: string,
  initialWidth = DEFAULT_WIDTH,
  initialHeight: number | undefined = undefined,
  position = DEFAULT_POSITION,
  minW = MIN_WIDTH,
  minH = MIN_HEIGHT
) {
  const [size, setSize] = useState<Size>(() => loadSize(storageKey, { width: initialWidth, height: initialHeight }, position, minW, minH));
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const posRef = useRef(position);
  posRef.current = position;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startRef.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height ?? 300 };
  }, [size]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    setSize(constrainSize(startRef.current.w + e.clientX - startRef.current.x, startRef.current.h + e.clientY - startRef.current.y, posRef.current, minW, minH));
  }, [isResizing, minW, minH]);

  const handleResizeEnd = useCallback(() => {
    if (isResizing && size.height !== undefined) saveSize(storageKey, { width: size.width, height: size.height });
    setIsResizing(false);
  }, [isResizing, size, storageKey]);

  useResizeEvents(isResizing, handleResizeMove, handleResizeEnd);
  useWindowResize(minW, minH, posRef, setSize);

  return { size, isResizing, handleResizeStart, setSize };
}
