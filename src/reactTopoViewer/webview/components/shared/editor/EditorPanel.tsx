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

/**
 * Load position from storage
 */
function loadPosition(storageKey: string | undefined, defaultPos: { x: number; y: number }) {
  if (!storageKey) return defaultPos;
  try {
    const saved = window.localStorage.getItem(`editor-panel-pos-${storageKey}`);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore parse errors
  }
  return defaultPos;
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
function useDraggable(storageKey?: string, initialPosition = DEFAULT_POSITION) {
  const [position, setPosition] = useState(() => loadPosition(storageKey, initialPosition));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

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
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
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
  const { position, isDragging, handleMouseDown } = useDraggable(storageKey, initialPosition);

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
