/**
 * EditorPanel - Base draggable panel with header and optional tabs
 */
import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { TabNavigation, TabDefinition } from './TabNavigation';
import { EditorFooter } from './EditorFooter';

interface EditorPanelProps {
  title: string;
  isVisible: boolean;
  onClose: () => void;
  onApply: () => void;
  onSave: () => void;
  children: ReactNode;
  width?: number;
  initialPosition?: { x: number; y: number };
  tabs?: TabDefinition[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  storageKey?: string;
}

const DEFAULT_POSITION = { x: 20, y: 80 };
const DEFAULT_WIDTH = 400;
const MIN_VISIBLE_HEIGHT = 50; // Minimum height of panel that must be visible
const MIN_VISIBLE_WIDTH = 100; // Minimum width of panel that must be visible
const TOP_MARGIN = 40; // Space for navbar

/**
 * Constrain position to keep panel visible within viewport
 */
function constrainPosition(
  pos: { x: number; y: number },
  panelWidth: number
): { x: number; y: number } {
  const maxX = window.innerWidth - MIN_VISIBLE_WIDTH;
  const maxY = window.innerHeight - MIN_VISIBLE_HEIGHT;

  return {
    x: Math.max(-(panelWidth - MIN_VISIBLE_WIDTH), Math.min(pos.x, maxX)),
    y: Math.max(TOP_MARGIN, Math.min(pos.y, maxY))
  };
}

/**
 * Load position from storage
 */
function loadPosition(
  storageKey: string | undefined,
  defaultPos: { x: number; y: number },
  panelWidth: number
) {
  if (!storageKey) return constrainPosition(defaultPos, panelWidth);
  try {
    const saved = window.localStorage.getItem(`editor-panel-pos-${storageKey}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate and constrain the loaded position
      return constrainPosition(parsed, panelWidth);
    }
  } catch {
    // Ignore parse errors
  }
  return constrainPosition(defaultPos, panelWidth);
}

/**
 * Save position to storage
 */
function savePosition(storageKey: string | undefined, position: { x: number; y: number }) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(`editor-panel-pos-${storageKey}`, JSON.stringify(position));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for draggable panel behavior
 */
function useDraggable(
  storageKey?: string,
  initialPosition = DEFAULT_POSITION,
  panelWidth = DEFAULT_WIDTH
) {
  const [position, setPosition] = useState(() =>
    loadPosition(storageKey, initialPosition, panelWidth)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-close-btn')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newPos = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    };
    // Constrain to keep panel visible
    setPosition(constrainPosition(newPos, panelWidthRef.current));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      savePosition(storageKey, position);
    }
    setIsDragging(false);
  }, [isDragging, position, storageKey]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Re-constrain position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => constrainPosition(prev, panelWidthRef.current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { position, isDragging, handleMouseDown };
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  title,
  isVisible,
  onClose,
  onApply,
  onSave,
  children,
  width = DEFAULT_WIDTH,
  initialPosition = DEFAULT_POSITION,
  tabs,
  activeTab,
  onTabChange,
  storageKey
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { position, isDragging, handleMouseDown } = useDraggable(storageKey, initialPosition, width);

  if (!isVisible) return null;

  return (
    <div
      ref={panelRef}
      className="panel panel-overlay panel-editor fixed overflow-hidden z-21 flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width,
        maxHeight: 'calc(100vh - 100px)'
      }}
    >
      {/* Header */}
      <div
        className="panel-heading panel-title-bar"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <span className="panel-title">{title}</span>
        <button
          className="panel-close-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* Tab Navigation (optional) */}
      {tabs && activeTab && onTabChange && (
        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      )}

      {/* Content */}
      <div className="panel-block p-2 overflow-y-auto flex-1">
        {children}
      </div>

      {/* Footer */}
      <EditorFooter onApply={onApply} onSave={onSave} />
    </div>
  );
};
