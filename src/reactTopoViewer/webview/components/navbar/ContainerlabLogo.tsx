/**
 * ContainerlabLogo - Small logo component for the navbar.
 * Uses the shared Containerlab SVG asset.
 */
import React from 'react';
import containerlabLogoUrl from '../../../../topoViewer/webview/assets/images/containerlab.svg';

export const ContainerlabLogo: React.FC<{ className?: string }> = ({ className }) => (
  <img src={containerlabLogoUrl} className={className} alt="Containerlab Logo" />
);

