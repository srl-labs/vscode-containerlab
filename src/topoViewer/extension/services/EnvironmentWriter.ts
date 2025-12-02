// file: src/topoViewer/extension/services/EnvironmentWriter.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as YAML from 'yaml';
import { log } from '../../webview/platform/logging/logger';
import { ClabTopology, EnvironmentJson, CytoTopology } from '../../shared/types/topoViewerType';
import { version as topoViewerVersion } from '../../../../package.json';

export interface EnvironmentWriterState {
  currentClabTopo: ClabTopology | undefined;
  currentClabDoc: YAML.Document.Parsed | undefined;
  currentIsPresetLayout: boolean;
  currentClabName: string | undefined;
  currentClabPrefix: string | undefined;
  allowedhostname: string | undefined;
}

/**
 * Maps the EnvironmentJson object from camelCase to hyphenated keys for JSON serialization.
 */
export function mapEnvironmentJsonToHyphenated(envJson: EnvironmentJson): string {
  const hyphenatedJson = {
    "working-directory": envJson.workingDirectory,
    "clab-prefix": envJson.clabPrefix,
    "clab-name": envJson.clabName,
    "clab-server-address": envJson.clabServerAddress,
    "clab-allowed-hostname": envJson.clabAllowedHostname,
    "clab-allowed-hostname01": envJson.clabAllowedHostname01,
    "clab-server-port": envJson.clabServerPort,
    "deployment-type": envJson.deploymentType,
    "topoviewer-version": envJson.topoviewerVersion,
    "topoviewer-layout-preset": envJson.topviewerPresetLayout,
    "EnvCyTopoJsonBytes": envJson.envCyTopoJsonBytes
  };

  return JSON.stringify(hyphenatedJson, null, 2);
}

/**
 * Creates the target directory and writes the JSON data files required by TopoViewer.
 */
export async function createFolderAndWriteJson(
  context: vscode.ExtensionContext,
  folderName: string,
  cytoTopology: CytoTopology,
  yamlContent: string,
  state: EnvironmentWriterState
): Promise<vscode.Uri[]> {
  log.info(`createFolderAndWriteJson called with folderName: ${folderName}`);

  try {
    // Define the target directory URI and path
    const targetDirUri = vscode.Uri.joinPath(
      context.extensionUri,
      'topoViewerData',
      folderName
    );
    const targetDirPath = targetDirUri.fsPath;

    log.debug(`Ensuring directory: ${targetDirPath}`);
    await fs.mkdir(targetDirPath, { recursive: true });

    // Path for dataCytoMarshall.json
    const dataCytoMarshallPath = path.join(targetDirPath, 'dataCytoMarshall.json');
    log.debug(`Writing file: ${dataCytoMarshallPath}`);

    // Serialize and write dataCytoMarshall.json
    const dataCytoMarshallContent = JSON.stringify(cytoTopology, null, 2);
    await fs.writeFile(dataCytoMarshallPath, dataCytoMarshallContent, 'utf8');

    const parsed = YAML.parse(yamlContent) as ClabTopology;
    state.currentClabTopo = parsed;
    state.currentClabDoc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any);

    const clabName = parsed.name;
    let clabPrefix = parsed.prefix ?? 'clab';
    state.currentClabName = clabName;
    state.currentClabPrefix = clabPrefix;

    // Define the EnvironmentJson object
    const hostname = os.hostname();
    state.allowedhostname = hostname;

    const environmentJson: EnvironmentJson = {
      workingDirectory: ".",
      clabPrefix: clabPrefix,
      clabName: `${clabName}`,
      clabServerAddress: "",
      clabAllowedHostname: hostname,
      clabAllowedHostname01: hostname, // used for edgeshark's packetflix
      clabServerPort: "8082",
      deploymentType: "vs-code",
      topoviewerVersion: `${topoViewerVersion}`,
      topviewerPresetLayout: `${state.currentIsPresetLayout.toString()}`,
      envCyTopoJsonBytes: cytoTopology
    };

    // Serialize EnvironmentJson with hyphenated keys
    const serializedEnvironmentJson = mapEnvironmentJsonToHyphenated(environmentJson);

    // Path for environment.json
    const environmentJsonPath = path.join(targetDirPath, 'environment.json');
    log.debug(`Writing file: ${environmentJsonPath}`);

    // Write environment.json
    await fs.writeFile(environmentJsonPath, serializedEnvironmentJson, 'utf8');

    log.info(`Successfully wrote dataCytoMarshall.json and environment.json to ${targetDirPath}`);

    return [
      vscode.Uri.file(dataCytoMarshallPath),
      vscode.Uri.file(environmentJsonPath)
    ];
  } catch (err) {
    log.error(`Error in createFolderAndWriteJson: ${String(err)}`);
    throw err;
  }
}

/**
 * Generates Webview URIs for CSS, JS, and Images directories required by TopoViewer.
 */
export function generateStaticAssetUris(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): { css: string; js: string; images: string } {
  const cssPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'css');
  const jsPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'js');
  const imagesPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'images');

  const cssUri = webview.asWebviewUri(cssPath).toString();
  const jsUri = webview.asWebviewUri(jsPath).toString();
  const imagesUri = webview.asWebviewUri(imagesPath).toString();

  log.debug(`Generated static asset URIs: CSS=${cssUri}, JS=${jsUri}, Images=${imagesUri}`);

  return { css: cssUri, js: jsUri, images: imagesUri };
}
