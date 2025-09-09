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
  customNodes: Array<{ name: string; kind: string; type?: string; image?: string; setDefault?: boolean }>;
  defaultNode: string;
  topologyDefaults?: Record<string, any>;
  topologyKinds?: Record<string, any>;
  topologyGroups?: Record<string, any>;
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

function buildCacheKey(
  mode: TemplateMode,
  params: ViewerTemplateParams | EditorTemplateParams
): string {
  const baseKey = `${mode}_${params.topologyName}_${params.isDarkTheme}_${params.currentLabPath}`;
  if (mode === 'viewer') {
    return `${baseKey}_${(params as ViewerTemplateParams).deploymentState}`;
  }
  const editorParams = params as EditorTemplateParams;
  const customNodesKey = editorParams.customNodes
    .map(n => `${n.name}-${n.kind}-${n.type}-${n.image}-${n.setDefault}`)
    .join('|');
  return `${baseKey}_${customNodesKey}_${editorParams.defaultNode}`;
}

function ensurePartials(partials: Record<string, string>, mode: TemplateMode): void {
  const required = ['WIRESHARK_MODAL', 'CSS_EXTEND', 'SCRIPTS_EXTEND'];
  for (const key of required) {
    if (!partials[key]) {
      partials[key] = '';
    }
  }
  if (mode === 'viewer' && !partials.FLOATING_ACTION_PANEL) {
    partials.FLOATING_ACTION_PANEL = '';
  }
}

function buildReplacements(
  mode: TemplateMode,
  params: ViewerTemplateParams | EditorTemplateParams,
  base: Record<string, string>
): Record<string, string> {
  if (mode === 'viewer') {
    const viewerParams = params as ViewerTemplateParams;
    return {
      ...base,
      deploymentState: viewerParams.deploymentState,
      viewerMode: viewerParams.viewerMode,
      imageMapping: '{}',
      ifacePatternMapping: '{}',
      defaultKind: 'nokia_srlinux',
      defaultType: 'ixrd1',
      updateLinkEndpointsOnKindChange: 'true',
      customNodes: '[]',
      defaultNode: '',
      topologyDefaults: '{}',
      topologyKinds: '{}',
      topologyGroups: '{}'
    };
  }

  const editorParams = params as EditorTemplateParams;
  const repl: Record<string, string> = {
    ...base,
    imageMapping: JSON.stringify(editorParams.imageMapping),
    ifacePatternMapping: JSON.stringify(editorParams.ifacePatternMapping),
    defaultKind: editorParams.defaultKind,
    defaultType: editorParams.defaultType,
    updateLinkEndpointsOnKindChange: editorParams.updateLinkEndpointsOnKindChange.toString(),
    customNodes: JSON.stringify(editorParams.customNodes),
    defaultNode: editorParams.defaultNode,
    topologyDefaults: JSON.stringify(editorParams.topologyDefaults || {}),
    topologyKinds: JSON.stringify(editorParams.topologyKinds || {}),
    topologyGroups: JSON.stringify(editorParams.topologyGroups || {})
  };
  (repl as any).dockerImages = JSON.stringify(editorParams.dockerImages || []);
  return repl;
}

export function generateHtmlTemplate(
  mode: TemplateMode,
  params: ViewerTemplateParams | EditorTemplateParams
): string {
  const cacheKey = buildCacheKey(mode, params);
  const cachedBase = templateCache.get(cacheKey);
  if (cachedBase) {
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
  ensurePartials(partials, mode);
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
    cssBundle: 'topoViewerEditorStyles.css',
    topoViewerMode: mode,
    currentLabPath: params.currentLabPath || ''
  };

  const replacements = buildReplacements(mode, params, baseReplacements);

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  const baseTemplate = template
    .replace(params.jsonFileUrlDataCytoMarshall, '{{jsonFileUrlDataCytoMarshall}}')
    .replace(params.jsonFileUrlDataEnvironment, '{{jsonFileUrlDataEnvironment}}')
    .replace(params.schemaUri, '{{schemaUri}}')
    .replace(params.cssUri, '{{cssUri}}')
    .replace(params.jsUri, '{{jsUri}}')
    .replace(params.jsOutDir, '{{jsOutDir}}')
    .replace(params.imagesUri, '{{imagesUri}}');

  templateCache.set(cacheKey, baseTemplate);

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
