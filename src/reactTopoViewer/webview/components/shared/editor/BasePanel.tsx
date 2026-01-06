/**
 * BasePanel - Core draggable and resizable panel component
 */
import type { ReactNode } from 'react';
import React, { useState, useRef, useCallback, useEffect } from 'react';

import { usePanelDrag } from '../../../hooks/ui/usePanelDrag';

import { PanelHeader, PanelFooter, ResizeHandle, Backdrop } from './BasePanelComponents';

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

function usePanelResize(
  storageKey?: string,
  initialWidth = DEFAULT_WIDTH,
  initialHeight: number | undefined = undefined,
  position = DEFAULT_POSITION,
  minW = MIN_WIDTH,
  minH = MIN_HEIGHT,
  panelRef?: React.RefObject<HTMLDivElement | null>
) {
  const [size, setSize] = useState<Size>(() => loadSize(storageKey, { width: initialWidth, height: initialHeight }, position, minW, minH));
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const posRef = useRef(position);
  posRef.current = position;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Measure actual height if not yet set (first resize)
    let startH = size.height;
    if (startH === undefined) {
      startH = panelRef?.current?.getBoundingClientRect().height ?? 300;
      setSize(prev => ({ ...prev, height: startH }));
    }

    setIsResizing(true);
    startRef.current = { x: e.clientX, y: e.clientY, w: size.width, h: startH };
  }, [size, panelRef]);

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

export interface BasePanelProps {
  readonly title: string;
  readonly isVisible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly onPrimaryClick?: () => void;
  readonly onSecondaryClick?: () => void;
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
  readonly hasChanges?: boolean;
  readonly footer?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly initialPosition?: { x: number; y: number };
  readonly storageKey?: string;
  readonly backdrop?: boolean;
  readonly zIndex?: number;
  readonly resizable?: boolean;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly testId?: string;
}

const noop = () => {};

function getButtonDefaults(p: BasePanelProps) {
  return {
    onPrimaryClick: p.onPrimaryClick ?? noop,
    onSecondaryClick: p.onSecondaryClick ?? noop,
    primaryLabel: p.primaryLabel ?? 'OK',
    secondaryLabel: p.secondaryLabel ?? 'Apply',
    hasChanges: p.hasChanges ?? false,
    footer: p.footer ?? true
  };
}

function getSizeDefaults(p: BasePanelProps) {
  return {
    width: p.width ?? DEFAULT_WIDTH,
    initialPosition: p.initialPosition, // undefined = center the panel
    backdrop: p.backdrop ?? false,
    zIndex: p.zIndex ?? 21,
    resizable: p.resizable ?? true,
    minWidth: p.minWidth ?? MIN_WIDTH,
    minHeight: p.minHeight ?? MIN_HEIGHT
  };
}

export function BasePanel(props: Readonly<BasePanelProps>): React.ReactElement | null {
  const { title, isVisible, onClose, children, storageKey, height, testId } = props;
  const btn = getButtonDefaults(props);
  const sz = getSizeDefaults(props);
  const panelRef = useRef<HTMLDivElement>(null);

  const { position, isDragging, handleMouseDown } = usePanelDrag({ storageKey, initialPosition: sz.initialPosition, panelWidth: sz.width });
  const { size, isResizing, handleResizeStart } = usePanelResize(storageKey, sz.width, height, position, sz.minWidth, sz.minHeight, panelRef);

  if (!isVisible) return null;

  const maxH = size.height ? undefined : `calc(100vh - ${position.y}px - 20px)`;
  const style = { left: position.x, top: position.y, width: size.width, height: size.height, maxHeight: maxH, zIndex: sz.zIndex };
  const cls = `panel panel-overlay panel-editor fixed overflow-hidden flex flex-col${isResizing ? ' panel-resizing' : ''}`;

  return (
    <>
      {sz.backdrop && <Backdrop zIndex={sz.zIndex} onClick={onClose} />}
      <div ref={panelRef} className={cls} style={style} data-testid={testId}>
        <PanelHeader title={title} isDragging={isDragging} onMouseDown={handleMouseDown} onClose={onClose} />
        <div className="panel-block p-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {btn.footer && <PanelFooter hasChanges={btn.hasChanges} onPrimary={btn.onPrimaryClick} onSecondary={btn.onSecondaryClick} primary={btn.primaryLabel} secondary={btn.secondaryLabel} />}
        {sz.resizable && <ResizeHandle onMouseDown={handleResizeStart} />}
      </div>
    </>
  );
}
