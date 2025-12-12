/**
 * Hook for draggable panel behavior
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';

const DEFAULT_POSITION = { x: 20, y: 80 };
const DEFAULT_WIDTH = 400;
const MIN_VISIBLE_HEIGHT = 50;
const MIN_VISIBLE_WIDTH = 100;
const TOP_MARGIN = 40;

type Pos = { x: number; y: number };

function constrainPosition(pos: Pos, panelWidth: number): Pos {
  return {
    x: Math.max(-(panelWidth - MIN_VISIBLE_WIDTH), Math.min(pos.x, window.innerWidth - MIN_VISIBLE_WIDTH)),
    y: Math.max(TOP_MARGIN, Math.min(pos.y, window.innerHeight - MIN_VISIBLE_HEIGHT))
  };
}

function loadPosition(key: string | undefined, defaultPos: Pos, panelWidth: number) {
  if (!key) return constrainPosition(defaultPos, panelWidth);
  try {
    const saved = window.localStorage.getItem(`panel-pos-${key}`);
    if (saved) return constrainPosition(JSON.parse(saved), panelWidth);
  } catch { /* ignore */ }
  return constrainPosition(defaultPos, panelWidth);
}

function savePosition(key: string | undefined, pos: Pos): void {
  if (!key) return;
  try { window.localStorage.setItem(`panel-pos-${key}`, JSON.stringify(pos)); } catch { /* ignore */ }
}

export function usePanelDrag(storageKey?: string, initialPosition = DEFAULT_POSITION, panelWidth = DEFAULT_WIDTH) {
  const [position, setPosition] = useState(() => loadPosition(storageKey, initialPosition, panelWidth));
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-close-btn')) return;
    setIsDragging(true);
    startRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition(constrainPosition({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y }, widthRef.current));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) savePosition(storageKey, position);
    setIsDragging(false);
  }, [isDragging, position, storageKey]);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const h = () => setPosition(prev => constrainPosition(prev, widthRef.current));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  return { position, isDragging, handleMouseDown };
}
