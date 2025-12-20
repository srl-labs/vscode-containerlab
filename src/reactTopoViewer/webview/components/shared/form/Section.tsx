/**
 * Section - Bordered section with title and optional inheritance badge
 */
import React from 'react';

/**
 * Inheritance badge - shown when a section's values come from defaults, kinds, or groups
 */
const InheritanceBadge: React.FC = () => (
  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
    inherited
  </span>
);

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
