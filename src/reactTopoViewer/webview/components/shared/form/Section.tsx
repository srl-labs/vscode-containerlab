/**
 * Section - Bordered section with title
 */
import React from 'react';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  hasBorder?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  children,
  className = '',
  hasBorder = true
}) => (
  <div
    className={`${hasBorder ? 'border-b pb-3 mb-3' : ''} ${className}`}
    style={hasBorder ? { borderColor: 'var(--vscode-panel-border)' } : undefined}
  >
    <h3 className="vscode-section-header mb-2">{title}</h3>
    {children}
  </div>
);
