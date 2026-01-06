/**
 * SvgExportPanel - Configure and export topology as SVG
 * Modern, sleek design matching other annotation editors
 */
import React, { useState, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { BasePanel } from '../shared/editor/BasePanel';
import { log } from '../../utils/logger';
import type { NodeType } from '../../utils/SvgGenerator';
import { generateEncodedSVG } from '../../utils/SvgGenerator';
import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import { compositeAnnotationsIntoSvg, addBackgroundRect } from '../../utils/annotationsToSvg';
import { Toggle, ColorSwatch, NumberInput, PREVIEW_GRID_BG } from '../shared/form';

export interface SvgExportPanelProps {
  isVisible: boolean;
  onClose: () => void;
  cy: CyCore | null;
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
  groups?: GroupStyleAnnotation[];
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
function downloadSvg(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
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

type BackgroundOption = 'transparent' | 'white' | 'custom';

// Section header component
const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="section-header">{children}</h4>
);

// Quality section
const QualitySection: React.FC<{
  zoom: number;
  setZoom: (v: number) => void;
  padding: number;
  setPadding: (v: number) => void;
}> = ({ zoom, setZoom, padding, setPadding }) => (
  <div className="flex flex-col gap-3">
    <SectionHeader>Quality & Size</SectionHeader>
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        label="Zoom"
        value={zoom}
        onChange={(v) => setZoom(Math.max(10, Math.min(300, v)))}
        min={10}
        max={300}
        unit="%"
      />
      <NumberInput
        label="Padding"
        value={padding}
        onChange={(v) => setPadding(Math.max(0, v))}
        min={0}
        max={500}
        unit="px"
      />
    </div>
  </div>
);

// Background section
const BackgroundSection: React.FC<{
  option: BackgroundOption;
  setOption: (v: BackgroundOption) => void;
  customColor: string;
  setCustomColor: (v: string) => void;
}> = ({ option, setOption, customColor, setCustomColor }) => (
  <div className="flex flex-col gap-3">
    <SectionHeader>Background</SectionHeader>
    <div className="flex items-start gap-3 flex-wrap">
      <div className="flex gap-2 pt-4">
        <Toggle active={option === 'transparent'} onClick={() => setOption('transparent')}>
          <i className="fas fa-chess-board mr-1.5 text-[10px]" />Transparent
        </Toggle>
        <Toggle active={option === 'white'} onClick={() => setOption('white')}>
          <span className="inline-block w-3 h-3 bg-white rounded-sm mr-1.5 border border-white/30" />White
        </Toggle>
        <Toggle active={option === 'custom'} onClick={() => setOption('custom')}>
          <i className="fas fa-palette mr-1.5 text-[10px]" />Custom
        </Toggle>
      </div>
      {option === 'custom' && (
        <ColorSwatch
          label="Color"
          value={customColor}
          onChange={setCustomColor}
        />
      )}
    </div>
  </div>
);

// Annotations section
const AnnotationsSection: React.FC<{
  include: boolean;
  setInclude: (v: boolean) => void;
  counts: { groups: number; text: number; shapes: number };
}> = ({ include, setInclude, counts }) => {
  const total = counts.groups + counts.text + counts.shapes;
  const hasAny = total > 0;
  const pluralSuffix = total !== 1 ? 's' : '';
  const annotationLabel = hasAny ? `${total} annotation${pluralSuffix}` : 'No annotations';

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Annotations</SectionHeader>
      <div className="flex items-center justify-between p-3 bg-black/20 rounded-sm border border-white/5">
        <div className="flex flex-col">
          <span className="text-sm text-[var(--vscode-foreground)]">
            {annotationLabel}
          </span>
          {hasAny && (
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {[
                counts.groups > 0 && `${counts.groups} group${counts.groups !== 1 ? 's' : ''}`,
                counts.text > 0 && `${counts.text} text`,
                counts.shapes > 0 && `${counts.shapes} shape${counts.shapes !== 1 ? 's' : ''}`
              ].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
        <Toggle active={include} onClick={() => setInclude(!include)}>
          {include ? 'Included' : 'Excluded'}
        </Toggle>
      </div>
    </div>
  );
};

// Filename section
const FilenameSection: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-1">
    <SectionHeader>Filename</SectionHeader>
    <div className="flex items-center gap-1">
      <input
        type="text"
        className="flex-1 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs hover:border-white/20 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="topology"
      />
      <span className="text-xs text-[var(--vscode-descriptionForeground)] px-2">.svg</span>
    </div>
  </div>
);

// Preview section
const PreviewSection: React.FC<{
  zoom: number;
  padding: number;
  background: BackgroundOption;
  customColor: string;
  includeAnnotations: boolean;
  annotationCount: number;
}> = ({ zoom, padding, background, customColor, includeAnnotations, annotationCount }) => {
  const bgStyle = background === 'transparent'
    ? { backgroundImage: 'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px' }
    : { backgroundColor: background === 'white' ? '#ffffff' : customColor };

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader>Preview</SectionHeader>
      <div className="relative p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-sm border border-white/5 overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-30`} />
        <div className="relative z-10 flex items-center justify-center">
          <div
            className="w-24 h-16 rounded-sm shadow-lg border border-white/10 flex items-center justify-center transition-all duration-200"
            style={{
              ...bgStyle,
              padding: `${Math.min(padding / 20, 8)}px`,
              transform: `scale(${0.8 + (zoom / 500)})`
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <i className="fas fa-project-diagram text-lg text-[var(--accent)] opacity-80" />
              {includeAnnotations && annotationCount > 0 && (
                <span className="text-[8px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded-sm">
                  +{annotationCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tips section
const TipsSection: React.FC = () => (
  <div className="flex flex-col gap-1.5 p-3 bg-black/10 rounded-sm border border-white/5">
    <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)]">
      <i className="fas fa-lightbulb text-yellow-400/70 text-xs" />
      <span className="field-label">Tips</span>
    </div>
    <ul className="helper-text space-y-1 ml-5">
      <li>Higher zoom = better quality, larger file</li>
      <li>SVG files scale without quality loss</li>
      <li>Transparent background for layering</li>
    </ul>
  </div>
);

export const SvgExportPanel: React.FC<SvgExportPanelProps> = ({
  isVisible,
  onClose,
  cy,
  textAnnotations = [],
  shapeAnnotations = [],
  groups = []
}) => {
  const [borderZoom, setBorderZoom] = useState(100);
  const [borderPadding, setBorderPadding] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>('transparent');
  const [customBackgroundColor, setCustomBackgroundColor] = useState('#1e1e1e');
  const [filename, setFilename] = useState('topology');

  const annotationCounts = {
    groups: groups.length,
    text: textAnnotations.length,
    shapes: shapeAnnotations.length
  };
  const totalAnnotations = annotationCounts.groups + annotationCounts.text + annotationCounts.shapes;

  const handleExport = useCallback(async () => {
    if (!cy) {
      setExportStatus({ type: 'error', message: 'Cytoscape not available' });
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const extensionLoaded = await ensureSvgExtension(cy);
      if (!extensionLoaded) {
        setExportStatus({ type: 'error', message: 'SVG extension not available' });
        setIsExporting(false);
        return;
      }

      const scale = (borderZoom / 100) * 3;
      const cyWithSvg = cy as unknown as { svg: (opts: { scale: number; full: boolean }) => string };
      const exported = cyWithSvg.svg({ scale, full: true });
      let svgContent = replacePngWithSvg(exported);

      if (includeAnnotations && totalAnnotations > 0) {
        svgContent = compositeAnnotationsIntoSvg(
          svgContent,
          { groups, textAnnotations, shapeAnnotations },
          scale
        );
      }

      if (backgroundOption !== 'transparent') {
        const bgColor = backgroundOption === 'white' ? '#ffffff' : customBackgroundColor;
        svgContent = addBackgroundRect(svgContent, bgColor);
      }

      if (borderPadding > 0) {
        svgContent = applyPadding(svgContent, borderPadding);
      }

      const exportFilename = `${filename.trim() || 'topology'}.svg`;
      downloadSvg(svgContent, exportFilename);
      setExportStatus({ type: 'success', message: `Exported ${exportFilename}` });
      log.info(`Topology exported as SVG: ${exportFilename}`);
    } catch (error) {
      log.error(`Error exporting topology: ${error}`);
      setExportStatus({ type: 'error', message: error instanceof Error ? error.message : 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  }, [cy, borderZoom, borderPadding, includeAnnotations, totalAnnotations, groups, textAnnotations, shapeAnnotations, backgroundOption, customBackgroundColor, filename]);

  return (
    <BasePanel
      title="Export SVG"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 360, y: 72 }}
      width={340}
      storageKey="svgExport"
      zIndex={90}
      footer={false}
      minWidth={300}
      minHeight={200}
      testId="svg-export-panel"
    >
      <div className="flex flex-col gap-4">
        <QualitySection
          zoom={borderZoom}
          setZoom={setBorderZoom}
          padding={borderPadding}
          setPadding={setBorderPadding}
        />

        <BackgroundSection
          option={backgroundOption}
          setOption={setBackgroundOption}
          customColor={customBackgroundColor}
          setCustomColor={setCustomBackgroundColor}
        />

        <AnnotationsSection
          include={includeAnnotations}
          setInclude={setIncludeAnnotations}
          counts={annotationCounts}
        />

        <FilenameSection
          value={filename}
          onChange={setFilename}
        />

        <PreviewSection
          zoom={borderZoom}
          padding={borderPadding}
          background={backgroundOption}
          customColor={customBackgroundColor}
          includeAnnotations={includeAnnotations}
          annotationCount={totalAnnotations}
        />

        {/* Export button */}
        <button
          type="button"
          className={`w-full py-3 px-4 rounded-sm font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
            isExporting || !cy
              ? 'bg-white/5 text-[var(--vscode-descriptionForeground)] cursor-not-allowed'
              : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 shadow-lg shadow-[var(--accent)]/20 hover:shadow-[var(--accent)]/30'
          }`}
          onClick={() => void handleExport()}
          disabled={isExporting || !cy}
        >
          {isExporting ? (
            <>
              <i className="fas fa-circle-notch fa-spin" />
              Exporting...
            </>
          ) : (
            <>
              <i className="fas fa-download" />
              Export SVG
            </>
          )}
        </button>

        {/* Status message */}
        {exportStatus && (
          <div className={`flex items-center gap-2 p-3 rounded-sm text-sm ${
            exportStatus.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <i className={`fas ${exportStatus.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
            {exportStatus.message}
          </div>
        )}

        <TipsSection />
      </div>
    </BasePanel>
  );
};
