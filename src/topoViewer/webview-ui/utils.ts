import cytoscape from 'cytoscape';
import { log } from '../logging/webviewLogger';

/**
 * Export the current Cytoscape viewport as an SVG file.
 *
 * @param cy - Cytoscape core instance
 */
export function exportViewportAsSvg(cy: cytoscape.Core): void {
  try {
    const cyWithSvg = cy as any;
    if (typeof cyWithSvg.svg === 'function') {
      const svgContent = cyWithSvg.svg({ scale: 1, full: true });
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'topology.svg';
      link.click();

      URL.revokeObjectURL(url);
      log.info('Topology exported as SVG');
    } else {
      log.error('SVG export not available - cytoscape-svg extension may not be loaded');
    }
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
  }
}

