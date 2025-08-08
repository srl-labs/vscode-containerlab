import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../view/backend/logger';
declare const __dirname: string;

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
}

export type TemplateMode = 'viewer' | 'editor';

function loadPartials(partialsDir: string, sharedPartialsDir?: string): Record<string, string> {
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

function resolveTemplatePaths(mode: TemplateMode): { templatePath: string; partialsDir: string; sharedPartialsDir?: string } {
  // Try multiple possible locations for the template files
  const possiblePaths = [];

  if (mode === 'viewer') {
    // In production (dist folder)
    possiblePaths.push({
      templatePath: path.join(__dirname, 'vscodeHtmlTemplate.html'),
      partialsDir: path.join(__dirname, 'partials'),
      sharedPartialsDir: path.join(__dirname, 'partials') // Shared partials are already merged in dist
    });
    // In development (source folder)
    possiblePaths.push({
      templatePath: path.resolve(__dirname, '../view/webview-ui/html-static/template/vscodeHtmlTemplate.html'),
      partialsDir: path.resolve(__dirname, '../view/webview-ui/html-static/template/partials'),
      sharedPartialsDir: path.resolve(__dirname, '../common/template/partials')
    });
  } else {
    // Editor mode
    // In production (dist folder)
    possiblePaths.push({
      templatePath: path.join(__dirname, 'editorHtmlTemplate.html'),
      partialsDir: path.join(__dirname, 'editor-partials'),
      sharedPartialsDir: path.join(__dirname, 'editor-partials') // Shared partials are already merged in dist
    });
    // In development (source folder)
    possiblePaths.push({
      templatePath: path.resolve(__dirname, '../edit/webview-ui/template/vscodeHtmlTemplate.html'),
      partialsDir: path.resolve(__dirname, '../edit/webview-ui/template/partials'),
      sharedPartialsDir: path.resolve(__dirname, '../common/template/partials')
    });
  }

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
  const { templatePath, partialsDir, sharedPartialsDir } = resolveTemplatePaths(mode);

  log.info(`allowedHostname in htmlTemplateUtils: ${params.allowedHostname}`);
  if (mode === 'viewer') {
    const viewerParams = params as ViewerTemplateParams;
    log.info(`Smart detection - deploymentState: ${viewerParams.deploymentState}, viewerMode: ${viewerParams.viewerMode}`);
  }
  log.info(`Theme detection - isDarkTheme: ${params.isDarkTheme}`);

  let template = fs.readFileSync(templatePath, 'utf8');
  const partials = loadPartials(partialsDir, sharedPartialsDir);

  if (mode === 'editor' && !partials.WIRESHARK_MODAL) {
    partials.WIRESHARK_MODAL = '';
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
  };

  let replacements: Record<string, string>;

  if (mode === 'viewer') {
    const viewerParams = params as ViewerTemplateParams;
    replacements = {
      ...baseReplacements,
      deploymentState: viewerParams.deploymentState,
      viewerMode: viewerParams.viewerMode,
    };
  } else {
    const editorParams = params as EditorTemplateParams;
    replacements = {
      ...baseReplacements,
      imageMapping: JSON.stringify(editorParams.imageMapping),
      ifacePatternMapping: JSON.stringify(editorParams.ifacePatternMapping),
      defaultKind: editorParams.defaultKind,
      defaultType: editorParams.defaultType,
    };
  }

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

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