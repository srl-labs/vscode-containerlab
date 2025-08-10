// file: src/topoViewer/backend/topoViewerAdaptorClab.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { log } from '../logging/extensionLogger';
import * as YAML from 'yaml'; // github.com/eemeli/yaml
import * as os from 'os';

import { ClabNode, CyElement, ClabTopology, EnvironmentJson, CytoTopology } from '../types/topoViewerType';
import { resolveNodeConfig } from './nodeConfig';

import { version as topoViewerVersion } from '../../../../package.json';

import { ClabLabTreeNode, ClabContainerTreeNode } from "../../../treeView/common";
import { findContainerNode, findInterfaceNode } from '../../view/utilities/treeUtils';
// log.info(ClabTreeDataProvider.)

log.info(`TopoViewer Version: ${topoViewerVersion}`);

/**
 * TopoViewerAdaptorClab is responsible for adapting Containerlab YAML configurations
 * into a format compatible with TopoViewer's Cytoscape model. This class performs the following tasks:
 *
 * 1. **Parsing and Validation**: Converts Containerlab YAML data into internal TypeScript interfaces.
 *    Future enhancements include validating the YAML against a predefined JSON schema.
 *
 * 2. **Data Transformation**: Transforms Containerlab node and link definitions into Cytoscape elements,
 *    ensuring proper formatting and linkage to prevent inconsistencies like nonexistent sources.
 *
 * 3. **JSON Serialization**: Creates necessary directories and writes the transformed data into JSON files,
 *    including `dataCytoMarshall.json` and `environment.json`, which are utilized by TopoViewer.
 *
 * 4. **Static Asset Management**: Generates URIs for static assets (CSS, JS, Images) required by the TopoViewer webview.
 *
 * **Key Functionalities:**
 * - Extracts node names and assigns extended fields such as `data.weight` and `data.lat`.
 * - Processes links to associate source and target nodes accurately.
 * - Provides mechanisms to adjust placeholder values with real data as available.
 *
 * **Note:** The class is designed to be extensible, allowing future integration of YAML validation based on
 * the Containerlab schema: https://github.com/srl-labs/containerlab/blob/e3a324a45032792258d92b8d3625fd108bdaeb9c/schemas/clab.schema.json
 */
export class TopoViewerAdaptorClab {

  public currentClabTopo: ClabTopology | undefined;
  public currentClabDoc: YAML.Document.Parsed | undefined;
  public currentIsPresetLayout: boolean = false;
  public currentClabName: string | undefined;
  public currentClabPrefix: string | undefined;
  public allowedhostname: string | undefined;


  /**
   * Creates the target directory and writes the JSON data files required by TopoViewer.
   *
   * @param context - The VS Code extension context.
   * @param folderName - The name of the folder to create inside 'topoViewerData'.
   * @param cytoTopology - The Cytoscape topology data to write into the JSON files.
   * @returns A promise that resolves to an array of VS Code URIs pointing to the created files.
   */
  public async createFolderAndWriteJson(
    context: vscode.ExtensionContext,
    folderName: string,
    cytoTopology: CytoTopology,
    yamlContent: string,
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
      this.currentClabTopo = parsed;
      this.currentClabDoc = YAML.parseDocument(yamlContent); // <-- store the raw Document

      var clabName = parsed.name;
      var clabPrefix = parsed.prefix;
      this.currentClabName = clabName;
      this.currentClabPrefix = clabPrefix;
      // if (clabPrefix == "") {
      //   clabPrefix = ""
      // }


      // Define the EnvironmentJson object

      const hostname = os.hostname();
      this.allowedhostname = hostname;

      const environmentJson: EnvironmentJson = {
        workingDirectory: ".",
        clabPrefix: `${clabPrefix}`,
        clabName: `${clabName}`,
        clabServerAddress: "",
        clabAllowedHostname: hostname,
        clabAllowedHostname01: hostname, // used for edgeshark's packetflix
        clabServerPort: "8082",
        deploymentType: "vs-code",
        topoviewerVersion: `${topoViewerVersion}`,
        topviewerPresetLayout: `${this.currentIsPresetLayout.toString()}`,
        envCyTopoJsonBytes: cytoTopology
      };

      // Serialize EnvironmentJson with hyphenated keys
      const serializedEnvironmentJson = this.mapEnvironmentJsonToHyphenated(environmentJson);

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
   *
   * @param context - The VS Code extension context.
   * @param webview - The Webview instance where the URIs will be used.
   * @returns An object containing URIs for CSS, JS, and Images assets.
   */
  public generateStaticAssetUris(
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

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements compatible with TopoViewer.
   *
   * This method performs the following operations:
   * - Parses the YAML content into Containerlab topology interfaces.
   * - Converts each Containerlab node into a Cytoscape node element, extracting and assigning necessary fields.
   * - Processes each Containerlab link into a Cytoscape edge element, ensuring accurate source and target references.
   * - Assigns placeholder values for fields like `weight` and `clabServerUsername` which can be replaced with real data.
   *
   * @param yamlContent - The Containerlab YAML content as a string.
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public clabYamlToCytoscapeElements(yamlContent: string, clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined): CyElement[] {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    return this.buildCytoscapeElements(parsed, { includeContainerData: true, clabTreeData: clabTreeDataToTopoviewer });
  }


  /**
   * Transforms a Containerlab YAML string into Cytoscape elements compatible with TopoViewer EDITOR.
   *
   * This method performs the following operations:
   * - Parses the YAML content into Containerlab topology interfaces.
   * - Converts each Containerlab node into a Cytoscape node element, extracting and assigning necessary fields.
   * - Processes each Containerlab link into a Cytoscape edge element, ensuring accurate source and target references.
   * - Assigns placeholder values for fields like `weight` and `clabServerUsername` which can be replaced with real data.
   *
   * @param yamlContent - The Containerlab YAML content as a string.
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public clabYamlToCytoscapeElementsEditor(yamlContent: string): CyElement[] {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    return this.buildCytoscapeElements(parsed, { includeContainerData: false });
  }


  /**
   * Splits an endpoint string into node and interface components.
   *
   * Example:
   * - "Spine-01:e1-1" => { node: "Spine-01", iface: "e1-1" }
   * - "Spine-01" => { node: "Spine-01", iface: "" }
   *
   * @param endpoint - The endpoint string from Containerlab YAML.
   * @returns An object containing the node and interface.
   */
  private splitEndpoint(
    endpoint: string | { node: string; interface?: string }
  ): { node: string; iface: string } {
    if (typeof endpoint === 'string') {
      const parts = endpoint.split(':');
      if (parts.length === 2) {
        return { node: parts[0], iface: parts[1] };
      }
      return { node: endpoint, iface: '' };
    }

    if (endpoint && typeof endpoint === 'object') {
      return { node: endpoint.node, iface: endpoint.interface ?? '' };
    }

    return { node: '', iface: '' };
  }

  /**
   * Constructs a parent identifier for a node based on its group and label information.
   *
   * Example:
   * - Group: "Leaf", Label: { "topoViewer-groupLevel": "2" } => "Leaf:2"
   * - Missing group or label => ""
   *
   * @param nodeObj - The Containerlab node object.
   * @returns A string representing the parent identifier.
   */
  private buildParent(nodeObj: ClabNode): string {
    // const grp = nodeObj.group ?? '';

    const grp = nodeObj.labels?.['topoViewer-group'] || nodeObj.labels?.['graph-group'] || '';
    const lvl = nodeObj.labels?.['topoViewer-groupLevel'] || nodeObj.labels?.['graph-level'] || '1';

    if (grp && lvl) {
      return `${grp}:${lvl}`;
    }
    return '';
  }


  /**
   * Maps the EnvironmentJson object from camelCase to hyphenated keys for JSON serialization.
   *
   * @param envJson - The EnvironmentJson object with camelCase properties.
   * @returns A JSON string with hyphenated property names.
   */
  private mapEnvironmentJsonToHyphenated(envJson: EnvironmentJson): string {
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

  private buildCytoscapeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> }
  ): CyElement[] {
    const elements: CyElement[] = [];

    if (!parsed.topology) {
      log.warn('Parsed YAML does not contain \x27topology\x27 object.');
      return elements;
    }

    if (parsed.topology.nodes) {
      this.currentIsPresetLayout = Object.entries(parsed.topology.nodes)
        .every(([, nodeObj]) => {
          const merged = resolveNodeConfig(parsed, nodeObj);
          return (
            !!merged.labels?.['graph-posX'] &&
            !!merged.labels?.['graph-posY']
          );
        });
    }
    log.info(`######### status preset layout: ${this.currentIsPresetLayout}`);

    const clabName = parsed.name;
    const prefixName = parsed.prefix && parsed.prefix.trim() !== '' ? parsed.prefix.trim() : 'clab';
    const labPrefix = `${prefixName}-${clabName}`;

    const parentMap = new Map<string, string | undefined>();
    let nodeIndex = 0;

    if (parsed.topology.nodes) {
      for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
        const mergedNode = resolveNodeConfig(parsed, nodeObj);
        const parentId = this.buildParent(mergedNode);
        if (parentId) {
          if (!parentMap.has(parentId)) {
            parentMap.set(parentId, mergedNode.labels?.['graph-groupLabelPos']);
          }
        }

        log.info(`nodeName: ${nodeName}`);
        let containerData: ClabContainerTreeNode | null = null;
        if (opts.includeContainerData) {
          const containerName = `${labPrefix}-${nodeName}`;
          containerData = findContainerNode(
            opts.clabTreeData ?? {},
            containerName,
            clabName
          ) ?? null;
        }

        const nodeEl: CyElement = {
          group: 'nodes',
          data: {
            id: nodeName,
            weight: '30',
            name: nodeName,
            parent: parentId || undefined,
            topoViewerRole: mergedNode.labels?.['topoViewer-role'] || mergedNode.labels?.['graph-icon'] || 'router',
            lat: mergedNode.labels?.['graph-geoCoordinateLat'] ?? '',
            lng: mergedNode.labels?.['graph-geoCoordinateLng'] ?? '',
            extraData: {
              clabServerUsername: 'asad',
              fqdn: `${nodeName}.${clabName}.io`,
              group: mergedNode.group ?? '',
              id: nodeName,
              image: mergedNode.image ?? '',
              index: nodeIndex.toString(),
              kind: mergedNode.kind ?? '',
              type: mergedNode.type ?? '',
              labdir: `${labPrefix}/`,
              labels: mergedNode.labels ?? {},
              longname: containerData?.name ?? `${labPrefix}-${nodeName}`,
              macAddress: '',
              mgmtIntf: '',
              mgmtIpv4AddressLength: 0,
              mgmtIpv4Address: opts.includeContainerData ? `${containerData?.IPv4Address}` : '',
              mgmtIpv6Address: opts.includeContainerData ? `${containerData?.IPv6Address}` : '',
              mgmtIpv6AddressLength: 0,
              mgmtNet: '',
              name: nodeName,
              shortname: nodeName,
              state: opts.includeContainerData ? `${containerData?.state}` : '',
              weight: '3',
            },
          },
          position: {
            x: parseFloat(mergedNode.labels?.['graph-posX'] ?? 0),
            y: parseFloat(mergedNode.labels?.['graph-posY'] ?? 0),
          },
          removed: false,
          selected: false,
          selectable: true,
          locked: false,
          grabbed: false,
          grabbable: true,
          classes: '',
        };
        elements.push(nodeEl);
        nodeIndex++;
      }
    }

    for (const [parentId, groupLabelPos] of parentMap) {
      const [groupName, groupLevel] = parentId.split(':');
      const groupNodeEl: CyElement = {
        group: 'nodes',
        data: {
          id: parentId,
          name: groupName || 'UnnamedGroup',
          topoViewerRole: 'group',
          weight: '1000',
          parent: '',
          lat: '',
          lng: '',
          extraData: {
            clabServerUsername: 'asad',
            weight: '2',
            name: '',
            topoViewerGroup: groupName ?? '',
            topoViewerGroupLevel: groupLevel ?? '',
          },
        },
        position: { x: 0, y: 0 },
        removed: false,
        selected: false,
        selectable: true,
        locked: false,
        grabbed: false,
        grabbable: true,
        classes: groupLabelPos,
      };
      elements.push(groupNodeEl);
    }

    let linkIndex = 0;
    if (parsed.topology.links) {
      for (const linkObj of parsed.topology.links) {
        const endA = linkObj.endpoints?.[0] ?? '';
        const endB = linkObj.endpoints?.[1] ?? '';
        if (!endA || !endB) {
          log.warn('Link does not have both endpoints. Skipping.');
          continue;
        }

        const { node: sourceNode, iface: sourceIface } = this.splitEndpoint(endA);
        const { node: targetNode, iface: targetIface } = this.splitEndpoint(endB);

        const sourceContainerName = `${labPrefix}-${sourceNode}`;
        const targetContainerName = `${labPrefix}-${targetNode}`;
        const sourceIfaceData = findInterfaceNode(
          opts.clabTreeData ?? {},
          sourceContainerName,
          sourceIface,
          clabName
        );
        const targetIfaceData = findInterfaceNode(
          opts.clabTreeData ?? {},
          targetContainerName,
          targetIface,
          clabName
        );
        const edgeId = `Clab-Link${linkIndex}`;
        let edgeClass = '';
        if (sourceIfaceData?.state && targetIfaceData?.state) {
          edgeClass =
            sourceIfaceData.state === 'up' && targetIfaceData.state === 'up'
              ? 'link-up'
              : 'link-down';
        }
        const edgeEl: CyElement = {
          group: 'edges',
          data: {
            id: edgeId,
            weight: '3',
            name: edgeId,
            parent: '',
            topoViewerRole: 'link',
            sourceEndpoint: sourceIface,
            targetEndpoint: targetIface,
            lat: '',
            lng: '',
            source: sourceNode,
            target: targetNode,
            extraData: {
              clabServerUsername: 'asad',
              clabSourceLongName: sourceContainerName,
              clabTargetLongName: targetContainerName,
              clabSourcePort: sourceIface,
              clabTargetPort: targetIface,
              clabSourceMacAddress: sourceIfaceData?.mac ?? '',
              clabTargetMacAddress: targetIfaceData?.mac ?? '',
              clabSourceInterfaceState: sourceIfaceData?.state ?? '',
              clabTargetInterfaceState: targetIfaceData?.state ?? '',
              clabSourceMtu: sourceIfaceData?.mtu ?? '',
              clabTargetMtu: targetIfaceData?.mtu ?? '',
              clabSourceType: sourceIfaceData?.type ?? '',
              clabTargetType: targetIfaceData?.type ?? '',
            },
          },
          position: { x: 0, y: 0 },
          removed: false,
          selected: false,
          selectable: true,
          locked: false,
          grabbed: false,
          grabbable: true,
          classes: edgeClass,
        };
        elements.push(edgeEl);
        linkIndex++;
      }
    }

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);
    return elements;
  }

}
