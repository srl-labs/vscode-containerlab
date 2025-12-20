/**
 * BasePanel - Core draggable and resizable panel component
 */
import type { ReactNode } from 'react';
import React from 'react';

import { usePanelDrag } from '../../../hooks/ui/usePanelDrag';
import { usePanelResize } from '../../../hooks/panels/usePanelResize';

import { PanelHeader, PanelFooter, ResizeHandle, Backdrop } from './BasePanelComponents';

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

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

  const { position, isDragging, handleMouseDown } = usePanelDrag({ storageKey, initialPosition: sz.initialPosition, panelWidth: sz.width });
  const { size, isResizing, handleResizeStart } = usePanelResize(storageKey, sz.width, height, position, sz.minWidth, sz.minHeight);

  if (!isVisible) return null;

  const maxH = size.height ? undefined : `calc(100vh - ${position.y}px - 20px)`;
  const style = { left: position.x, top: position.y, width: size.width, height: size.height, maxHeight: maxH, zIndex: sz.zIndex };
  const cls = `panel panel-overlay panel-editor fixed overflow-hidden flex flex-col${isResizing ? ' panel-resizing' : ''}`;

  return (
    <>
      {sz.backdrop && <Backdrop zIndex={sz.zIndex} onClick={onClose} />}
      <div className={cls} style={style} data-testid={testId}>
        <PanelHeader title={title} isDragging={isDragging} onMouseDown={handleMouseDown} onClose={onClose} />
        <div className="panel-block p-2 overflow-y-auto flex-1 min-h-0">{children}</div>
        {btn.footer && <PanelFooter hasChanges={btn.hasChanges} onPrimary={btn.onPrimaryClick} onSecondary={btn.onSecondaryClick} primary={btn.primaryLabel} secondary={btn.secondaryLabel} />}
        {sz.resizable && <ResizeHandle onMouseDown={handleResizeStart} />}
      </div>
    </>
  );
}
