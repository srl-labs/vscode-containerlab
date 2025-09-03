import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logging/logger';
declare const __dirname: string;

// Template cache for faster regeneration
const templateCache = new Map<string, string>();
const partialsCache = new Map<string, Record<string, string>>();

export interface BaseTemplateParams {
  cssUri: string;
  jsUri: string;
  schemaUri: string;
  imagesUri: string;
  jsonFileUrlDataCytoMarshall: string;
  jsonFileUrlDataEnvironment: string;
  isVscodeDeployment: boolean;
  jsOutDir: string;
  allowedHostname: string;
  topologyName?: string;
  isDarkTheme?: boolean;
  currentLabPath?: string;
}

export interface ViewerTemplateParams extends BaseTemplateParams {
  deploymentState: 'deployed' | 'undeployed' | 'unknown';
  viewerMode: 'viewer' | 'editor' | 'unified';
}

export interface EditorTemplateParams extends BaseTemplateParams {
  imageMapping: Record<string, string>;
  ifacePatternMapping: Record<string, string>;
  defaultKind: string;
  defaultType: string;
  updateLinkEndpointsOnKindChange: boolean;
  dockerImages?: string[];
  customNodes: Array<{ name: string; kind: string; type?: string; image?: string }>;
  defaultNode: string;
}

export type TemplateMode = 'viewer' | 'editor';

function loadPartials(partialsDir: string, sharedPartialsDir?: string): Record<string, string> {
  const cacheKey = `${partialsDir}_${sharedPartialsDir}`;

  // Return cached partials if available
  if (partialsCache.has(cacheKey)) {
    return partialsCache.get(cacheKey)!;
  }

  const partials: Record<string, string> = {};

  // Load shared partials first
  if (sharedPartialsDir && fs.existsSync(sharedPartialsDir)) {
    for (const file of fs.readdirSync(sharedPartialsDir)) {
      if (file.endsWith('.html')) {
        const key = path.basename(file, '.html').replace(/-/g, '_').toUpperCase();
        const content = fs.readFileSync(path.join(sharedPartialsDir, file), 'utf8');
        partials[key] = content;
      }
    }
  }

  // Load mode-specific partials (these will override shared ones if they exist)
  if (fs.existsSync(partialsDir)) {
    for (const file of fs.readdirSync(partialsDir)) {
      if (file.endsWith('.html')) {
        const key = path.basename(file, '.html').replace(/-/g, '_').toUpperCase();
        const content = fs.readFileSync(path.join(partialsDir, file), 'utf8');
        partials[key] = content;
      }
    }
  }

  // Cache the loaded partials
  partialsCache.set(cacheKey, partials);
  return partials;
}

function resolvePartials(content: string, partials: Record<string, string>): string {
  return content.replace(/{{([A-Z0-9_]+)}}/g, (_, key) => {
    const replacement = partials[key];
    if (replacement !== undefined) {
      return resolvePartials(replacement, partials);
    }
    return '';
  });
}

function resolveTemplatePaths(): { templatePath: string; partialsDir: string; sharedPartialsDir?: string } {
  // Try multiple possible locations for the template files
  const possiblePaths = [
    {
      // Production (dist) paths - now unified
      templatePath: path.join(__dirname, 'main.html'),
      partialsDir: path.join(__dirname, 'partials'),
      sharedPartialsDir: undefined // All partials are in one directory now
    },
    {
      // Development (source) paths
      templatePath: path.resolve(__dirname, './templates/main.html'),
      partialsDir: path.resolve(__dirname, './templates/partials'),
      sharedPartialsDir: undefined // All partials are in one directory now
    }
  ];

  // Find the first existing path
  for (const paths of possiblePaths) {
    if (fs.existsSync(paths.templatePath)) {
      return paths;
    }
  }

  // If no path found, throw error with all attempted paths
  const attemptedPaths = possiblePaths.map(p => p.templatePath).join(', ');
  throw new Error(`Template file not found. Attempted paths: ${attemptedPaths}`);
}

export function generateHtmlTemplate(
  mode: TemplateMode,
  params: ViewerTemplateParams | EditorTemplateParams
): string {
  // Try to use cached template for similar params
  const cacheKey = `${mode}_${params.topologyName}_${params.isDarkTheme}_${params.currentLabPath}`;

  // For viewer mode, also include deployment state in cache key
  const finalCacheKey = mode === 'viewer'
    ? `${cacheKey}_${(params as ViewerTemplateParams).deploymentState}`
    : cacheKey;

  // Check if we have a cached version with matching dynamic params
  const cachedBase = templateCache.get(finalCacheKey);
  if (cachedBase) {
    // Just update the dynamic URLs that change per session
    return cachedBase
      .replace(/{{jsonFileUrlDataCytoMarshall}}/g, params.jsonFileUrlDataCytoMarshall)
      .replace(/{{jsonFileUrlDataEnvironment}}/g, params.jsonFileUrlDataEnvironment)
      .replace(/{{schemaUri}}/g, params.schemaUri)
      .replace(/{{cssUri}}/g, params.cssUri)
      .replace(/{{jsUri}}/g, params.jsUri)
      .replace(/{{jsOutDir}}/g, params.jsOutDir)
      .replace(/{{imagesUri}}/g, params.imagesUri);
  }

  const { templatePath, partialsDir, sharedPartialsDir } = resolveTemplatePaths();

  log.info(`allowedHostname in htmlTemplateUtils: ${params.allowedHostname}`);
  if (mode === 'viewer') {
    const viewerParams = params as ViewerTemplateParams;
    log.info(`Smart detection - deploymentState: ${viewerParams.deploymentState}, viewerMode: ${viewerParams.viewerMode}`);
  }
  log.info(`Theme detection - isDarkTheme: ${params.isDarkTheme}`);

  let template = fs.readFileSync(templatePath, 'utf8');
  const partials = loadPartials(partialsDir, sharedPartialsDir);

  // Ensure all unresolved placeholders are replaced with empty strings
  if (!partials.WIRESHARK_MODAL) {
    partials.WIRESHARK_MODAL = '';
  }
  if (!partials.CSS_EXTEND) {
    partials.CSS_EXTEND = '';
  }
  if (!partials.SCRIPTS_EXTEND) {
    partials.SCRIPTS_EXTEND = '';
  }

  // Mode-specific handling
  if (mode === 'viewer' && !partials.FLOATING_ACTION_PANEL) {
    partials.FLOATING_ACTION_PANEL = '';
  }

  template = resolvePartials(template, partials);

  const logoFile = params.isDarkTheme ? 'containerlab.svg' : 'containerlab-dark.svg';

  const baseReplacements: Record<string, string> = {
    cssUri: params.cssUri,
    jsUri: params.jsUri,
    schemaUri: params.schemaUri,
    imagesUri: params.imagesUri,
    jsonFileUrlDataCytoMarshall: params.jsonFileUrlDataCytoMarshall,
    jsonFileUrlDataEnvironment: params.jsonFileUrlDataEnvironment,
    isVscodeDeployment: String(params.isVscodeDeployment),
    jsOutDir: params.jsOutDir,
    allowedHostname: params.allowedHostname,
    topologyName: params.topologyName || 'Unknown Topology',
    logoFile,
    navSubtitle: mode === 'viewer' ? 'TopoViewer' : 'TopoEditor',
    pageTitle: mode === 'viewer' ? 'TopoViewer' : 'TopoViewer Editor',
    cssBundle: 'topoViewerEditorStyles.css', // Use the same CSS for both modes
    topoViewerMode: mode, // Add the mode so JS can access it
    currentLabPath: params.currentLabPath || '',
  };

  let replacements: Record<string, string>;

  if (mode === 'viewer') {
    const viewerParams = params as ViewerTemplateParams;
    replacements = {
      ...baseReplacements,
      deploymentState: viewerParams.deploymentState,
      viewerMode: viewerParams.viewerMode,
      // Provide default values for editor-specific settings in viewer mode
      imageMapping: '{}',
      ifacePatternMapping: '{}',
      defaultKind: 'nokia_srlinux',
      defaultType: 'ixrd1',
      updateLinkEndpointsOnKindChange: 'true',
      customNodes: '[]',
      defaultNode: ''
    };
  } else {
    const editorParams = params as EditorTemplateParams;
    replacements = {
      ...baseReplacements,
      imageMapping: JSON.stringify(editorParams.imageMapping),
      ifacePatternMapping: JSON.stringify(editorParams.ifacePatternMapping),
      defaultKind: editorParams.defaultKind,
      defaultType: editorParams.defaultType,
      updateLinkEndpointsOnKindChange: editorParams.updateLinkEndpointsOnKindChange.toString(),
      customNodes: JSON.stringify(editorParams.customNodes),
      defaultNode: editorParams.defaultNode
    };
    // Inject docker images if provided
    (replacements as any).dockerImages = JSON.stringify(editorParams.dockerImages || []);
  }

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Cache the generated template (before URL replacements for reusability)
  const baseTemplate = template
    .replace(params.jsonFileUrlDataCytoMarshall, '{{jsonFileUrlDataCytoMarshall}}')
    .replace(params.jsonFileUrlDataEnvironment, '{{jsonFileUrlDataEnvironment}}')
    .replace(params.schemaUri, '{{schemaUri}}')
    .replace(params.cssUri, '{{cssUri}}')
    .replace(params.jsUri, '{{jsUri}}')
    .replace(params.jsOutDir, '{{jsOutDir}}')
    .replace(params.imagesUri, '{{imagesUri}}');

  templateCache.set(finalCacheKey, baseTemplate);

  return template;
}

export function generateWebviewHtml(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  mode: TemplateMode,
  folderName: string,
  adaptor: any,
  extraParams: Partial<ViewerTemplateParams | EditorTemplateParams> = {}
): string {
  const { css, js, images } = adaptor.generateStaticAssetUris(context, panel.webview);

  const jsOutDir = panel.webview
    .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist'))
    .toString();

  const mediaPath = vscode.Uri.joinPath(context.extensionUri, 'topoViewerData', folderName);
  const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
  const jsonFileUrlDataCytoMarshall = panel.webview
    .asWebviewUri(jsonFileUriDataCytoMarshall)
    .toString();

  const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
  const jsonFileUrlDataEnvironment = panel.webview
    .asWebviewUri(jsonFileUriDataEnvironment)
    .toString();

  const schemaUri = panel.webview
    .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'schema', 'clab.schema.json'))
    .toString();

  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  const baseParams = {
    cssUri: css,
    jsUri: js,
    schemaUri,
    imagesUri: images,
    jsonFileUrlDataCytoMarshall,
    jsonFileUrlDataEnvironment,
    isVscodeDeployment: true,
    jsOutDir,
    allowedHostname: adaptor.allowedhostname as string,
    topologyName: adaptor.currentClabTopo?.name || 'Unknown Topology',
    isDarkTheme,
  };

  const fullParams = { ...baseParams, ...extraParams };

  return generateHtmlTemplate(mode, fullParams as ViewerTemplateParams | EditorTemplateParams);
}
