/**
 * Section - Bordered section with title and optional inheritance badge
 */
import React from 'react';
import { InheritanceBadge } from './Badge';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  hasBorder?: boolean;
  /** When true, shows an "inherited" badge indicating the values come from defaults/kinds/groups */
  inherited?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  children,
  className = '',
  hasBorder = true,
  inherited
}) => (
  <div
    className={`${hasBorder ? 'border-b pb-3 mb-3' : ''} ${className}`}
    style={hasBorder ? { borderColor: 'var(--vscode-panel-border)' } : undefined}
  >
    <h3 className="vscode-section-header mb-2">
      {title}
      {inherited && <InheritanceBadge />}
    </h3>
    {children}
  </div>
);
