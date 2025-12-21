/**
 * SvgExportPanel - Configure and export topology as SVG
 * Migrated from legacy TopoViewer viewport-drawer-capture-sceenshoot.html
 */
import React, { useState, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { BasePanel } from '../shared/editor/BasePanel';
import { log } from '../../utils/logger';
import type { NodeType } from '../../utils/SvgGenerator';
import { generateEncodedSVG } from '../../utils/SvgGenerator';

interface SvgExportPanelProps {
  isVisible: boolean;
  onClose: () => void;
  cy: CyCore | null;
}

/** Extract attribute from image element attributes string */
function getImageAttr(attrPart: string, name: string): string {
  const reg = new RegExp(`${name}="([^"]+)"`);
  const res = reg.exec(attrPart);
  return res ? res[1] : '';
}

/** Transform SVG content for proper sizing */
function transformSvgContent(svgContent: string, width: string, height: string, fillColor: string): string {
  let result = svgContent;
  result = result.replace(/<svg([^>]*?)width="[^"]*"([^>]*?)>/i, '<svg$1$2>');
  result = result.replace(/<svg([^>]*?)height="[^"]*"([^>]*?)>/i, '<svg$1$2>');
  result = result.replace('<svg', `<svg width="${width}" height="${height}"`);

  result = result.replace(/<rect([^>]*?)class="st0"([^>]*?)\/>/g, (_m: string, before: string, after: string) => {
    const combined = before + after;
    const widthMatch = /width="([^"]*)"/.exec(combined);
    const heightMatch = /height="([^"]*)"/.exec(combined);
    return `<rect width="${widthMatch?.[1] ?? '120'}" height="${heightMatch?.[1] ?? '120'}" fill="${fillColor}" />`;
  });

  result = result.replace(/class="st1"/g, 'fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"');
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  return result;
}

/** Replace PNG image elements with SVG versions */
function replacePngWithSvg(svg: string): string {
  const imageRegex = /<image([^>]*?)(?:xlink:href|href)="data:image\/png[^"]*"[^>]*>(?:<\/image>)?/g;
  const fillColor = '#005aff';

  return svg.replace(imageRegex, (_match, attrPart) => {
    const transform = getImageAttr(attrPart, 'transform') || '';
    const width = getImageAttr(attrPart, 'width') || '14';
    const height = getImageAttr(attrPart, 'height') || '14';

    const svgDataUri = generateEncodedSVG('pe' as NodeType, fillColor);
    const svgContent = decodeURIComponent(svgDataUri.replace('data:image/svg+xml;utf8,', ''));
    const transformed = transformSvgContent(svgContent, width, height, fillColor);

    return `<g transform="${transform}">${transformed}</g>`;
  });
}

/** Apply padding to SVG content */
function applyPadding(svgContent: string, padding: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const width = parseFloat(svgEl.getAttribute('width') || '0');
  const height = parseFloat(svgEl.getAttribute('height') || '0');
  const newWidth = width + 2 * padding;
  const newHeight = height + 2 * padding;

  let viewBox = svgEl.getAttribute('viewBox') || `0 0 ${width} ${height}`;
  const [x, y, vWidth, vHeight] = viewBox.split(' ').map(parseFloat);
  const paddingX = padding * (vWidth / width);
  const paddingY = padding * (vHeight / height);
  const newViewBox = `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`;

  svgEl.setAttribute('viewBox', newViewBox);
  svgEl.setAttribute('width', newWidth.toString());
  svgEl.setAttribute('height', newHeight.toString());

  return new XMLSerializer().serializeToString(svgEl);
}

/** Trigger file download */
function downloadSvg(content: string): void {
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'topology.svg';
  link.click();
  URL.revokeObjectURL(url);
}

/** Load cytoscape-svg extension if needed */
async function ensureSvgExtension(cy: CyCore): Promise<boolean> {
  const cyWithSvg = cy as unknown as { svg?: () => string };
  if (typeof cyWithSvg.svg === 'function') return true;

  try {
    const cytoscapeSvg = await import('cytoscape-svg') as { default: (cytoscape: unknown) => void };
    const cytoscape = await import('cytoscape') as { default: { use: (ext: (cy: unknown) => void) => void } };
    cytoscape.default.use(cytoscapeSvg.default);
    return true;
  } catch {
    return false;
  }
}

export const SvgExportPanel: React.FC<SvgExportPanelProps> = ({ isVisible, onClose, cy }) => {
  const [borderZoom, setBorderZoom] = useState(100);
  const [borderPadding, setBorderPadding] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!cy) {
      setExportStatus('Error: Cytoscape not available');
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const extensionLoaded = await ensureSvgExtension(cy);
      if (!extensionLoaded) {
        setExportStatus('Error: SVG export extension not available');
        setIsExporting(false);
        return;
      }

      const scale = (borderZoom / 100) * 3;
      const cyWithSvg = cy as unknown as { svg: (opts: { scale: number; full: boolean }) => string };
      const exported = cyWithSvg.svg({ scale, full: true });
      let svgContent = replacePngWithSvg(exported);

      if (borderPadding > 0) {
        svgContent = applyPadding(svgContent, borderPadding);
      }

      downloadSvg(svgContent);
      setExportStatus('Export successful');
      log.info('Topology exported as SVG');
    } catch (error) {
      log.error(`Error exporting topology: ${error}`);
      setExportStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }, [cy, borderZoom, borderPadding]);

  return (
    <BasePanel
      title="Export SVG"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 340, y: 72 }}
      width={300}
      storageKey="svgExport"
      zIndex={90}
      footer={false}
      minWidth={250}
      minHeight={200}
    >
      <div className="space-y-3">
        <div>
          <p className="text-secondary text-sm mb-2">
            Configure options for exporting the topology as an SVG file.
          </p>
        </div>

        <div className="flex items-center">
          <label className="vscode-label w-32 text-right pr-3">Border Zoom (%)</label>
          <input
            type="number"
            className="input-field text-sm w-24"
            value={borderZoom}
            onChange={(e) => setBorderZoom(Math.max(10, Math.min(300, parseInt(e.target.value) || 100)))}
            min={10}
            max={300}
          />
        </div>

        <div className="flex items-center">
          <label className="vscode-label w-32 text-right pr-3">Border Padding (px)</label>
          <input
            type="number"
            className="input-field text-sm w-24"
            value={borderPadding}
            onChange={(e) => setBorderPadding(Math.max(0, parseInt(e.target.value) || 0))}
            min={0}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => void handleExport()}
            disabled={isExporting || !cy}
          >
            {isExporting ? (
              <>
                <i className="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i>
                Exporting...
              </>
            ) : (
              'Export'
            )}
          </button>
        </div>

        {exportStatus && (
          <div className={`text-sm ${exportStatus.startsWith('Error') ? 'text-red-500' : 'text-green-500'}`}>
            {exportStatus}
          </div>
        )}

        <div className="text-xs text-secondary mt-2">
          <p className="font-semibold mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Higher zoom = higher quality but larger file</li>
            <li>Padding adds whitespace around the topology</li>
            <li>SVG files can be scaled without quality loss</li>
          </ul>
        </div>
      </div>
    </BasePanel>
  );
};
