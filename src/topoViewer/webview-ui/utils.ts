import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { generateEncodedSVG, NodeType } from './managerSvgGenerator';
import { loadExtension } from '../cytoscapeInstanceFactory';

/**
 * Replace PNG image elements with their original SVG versions for node icons.
 *
 * Cytoscape exports node backgrounds as <image> tags with PNG data even when
 * the original source was SVG. This causes blurry icons when scaled. This function
 * replaces those PNG images with the original SVG content.
 *
 * @param svg - SVG string containing <image> tags with PNG data URIs
 * @returns SVG string with PNG images replaced by inline SVG
 */
export function replacePngWithSvg(svg: string): string {
  // Find all image elements with PNG data URIs
  const imageRegex = /<image([^>]*?)(?:xlink:href|href)="data:image\/png[^"]*"[^>]*>(?:<\/image>)?/g;

  return svg.replace(imageRegex, (_match, attrPart) => {
    // Extract attributes from the image element
    const getAttr = (name: string): string => {
      const reg = new RegExp(`${name}="([^"]+)"`);
      const res = attrPart.match(reg);
      return res ? res[1] : '';
    };

    const transform = getAttr('transform') || '';
    const width = getAttr('width') || '14';
    const height = getAttr('height') || '14';

    // For node icons in containerlab topologies, we use 'pe' (Provider Edge) as default
    // This could be extended to detect different node types based on context
    const svgType = 'pe';
    const fillColor = '#005aff'; // Default blue color used in the styles

    // Generate the SVG content
    const svgDataUri = generateEncodedSVG(svgType as NodeType, fillColor);
    let svgContent = decodeURIComponent(svgDataUri.replace('data:image/svg+xml;utf8,', ''));

    // Remove width/height attributes ONLY from the root SVG element, not from child elements
    // First, replace the opening SVG tag's width/height
    svgContent = svgContent.replace(/<svg([^>]*?)width="[^"]*"([^>]*?)>/i, '<svg$1$2>');
    svgContent = svgContent.replace(/<svg([^>]*?)height="[^"]*"([^>]*?)>/i, '<svg$1$2>');
    // Add the new width/height to the SVG element
    svgContent = svgContent.replace('<svg', `<svg width="${width}" height="${height}"`);

    // Replace class-based styles with inline styles to avoid conflicts
    // For rect elements with class="st0", preserve their original width/height
    svgContent = svgContent.replace(/<rect([^>]*?)class="st0"([^>]*?)\/>/g, (_match, before, after) => {
      // Extract width and height from the rect if they exist
      const widthMatch = (before + after).match(/width="([^"]*)"/);
      const heightMatch = (before + after).match(/height="([^"]*)"/);
      const rectWidth = widthMatch ? widthMatch[1] : '120';
      const rectHeight = heightMatch ? heightMatch[1] : '120';
      return `<rect width="${rectWidth}" height="${rectHeight}" fill="${fillColor}" />`;
    });

    // Replace .st1 class with inline stroke styles
    svgContent = svgContent.replace(/class="st1"/g, 'fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"');

    // Remove the style tag since we're using inline styles
    svgContent = svgContent.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

    // Transform the SVG to be properly positioned as a nested SVG
    // We need to wrap it in a g element with the transform
    return `<g transform="${transform}">${svgContent}</g>`;
  });
}

/**
 * Options for exporting the Cytoscape viewport as SVG.
 */
export interface ExportSvgOptions {
  borderZoom?: number; // Percentage zoom for the bounding box (100 = default)
  borderPadding?: number; // Padding to the bounding box border in pixels
}

/**
 * Export the current Cytoscape viewport as an SVG file.
 *
 * @param cy - Cytoscape core instance
 * @param options - Export options
 */
export async function exportViewportAsSvg(
  cy: cytoscape.Core,
  options: ExportSvgOptions = {}
): Promise<void> {
  const {
    borderZoom = 100,
    borderPadding = 0
  } = options;

  try {
    // Ensure the cytoscape-svg extension is loaded (lazy-load path)
    await loadExtension('svg');

    const cyWithSvg = cy as any;
    if (typeof cyWithSvg.svg !== 'function') {
      log.error('SVG export not available - cytoscape-svg extension may not be loaded');
      return;
    }

    const scale = (borderZoom / 100) * 3;
    const exported = cyWithSvg.svg({ scale, full: true });
    let svgContent = replacePngWithSvg(exported);

    if (borderPadding > 0) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgEl = doc.documentElement;

      const width = parseFloat(svgEl.getAttribute('width') || '0');
      const height = parseFloat(svgEl.getAttribute('height') || '0');

      // Add padding to dimensions
      const newWidth = width + 2 * borderPadding;
      const newHeight = height + 2 * borderPadding;

      // Check if there's a viewBox, if not create one
      let viewBox = svgEl.getAttribute('viewBox');
      if (!viewBox) {
        // No viewBox, create one based on dimensions
        viewBox = `0 0 ${width} ${height}`;
      }

      const [x, y, vWidth, vHeight] = viewBox.split(' ').map(parseFloat);

      // Calculate padding in viewBox coordinate system
      const paddingX = borderPadding * (vWidth / width);
      const paddingY = borderPadding * (vHeight / height);

      // Expand viewBox to include padding
      const newViewBox = `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`;

      svgEl.setAttribute('viewBox', newViewBox);
      svgEl.setAttribute('width', newWidth.toString());
      svgEl.setAttribute('height', newHeight.toString());

      const serializer = new XMLSerializer();
      svgContent = serializer.serializeToString(svgEl);
    }

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'topology.svg';
    link.click();

    URL.revokeObjectURL(url);
    log.info('Topology exported as SVG');
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
  }
}
