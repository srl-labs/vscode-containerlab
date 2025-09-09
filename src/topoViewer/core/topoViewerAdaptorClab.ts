// file: src/topoViewer/backend/topoViewerAdaptorClab.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { log } from '../logging/logger';
import * as YAML from 'yaml'; // github.com/eemeli/yaml
import * as os from 'os';

import { ClabNode, CyElement, ClabTopology, EnvironmentJson, CytoTopology } from '../types/topoViewerType';
import { resolveNodeConfig } from './nodeConfig';

import { version as topoViewerVersion } from '../../../package.json';

import { ClabLabTreeNode, ClabContainerTreeNode } from "../../treeView/common";
import { findContainerNode, findInterfaceNode } from '../utilities/treeUtils';
// log.info(ClabTreeDataProvider.)

log.info(`TopoViewer Version: ${topoViewerVersion}`);

type DummyContext = { dummyCounter: number; dummyLinkMap: Map<any, string> };

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

      const clabName = parsed.name;
      let clabPrefix = parsed.prefix ?? 'clab';
      this.currentClabName = clabName;
      this.currentClabPrefix = clabPrefix;


      // Define the EnvironmentJson object

      const hostname = os.hostname();
      this.allowedhostname = hostname;

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
   * @param clabTreeDataToTopoviewer - Tree data for the topology viewer.
   * @param yamlFilePath - The path to the YAML file (for loading annotations).
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public async clabYamlToCytoscapeElements(yamlContent: string, clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined, yamlFilePath?: string): Promise<CyElement[]> {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    const annotationsManager = await import('./../../topoViewer/utilities/annotationsManager').then(m => m.annotationsManager);
    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath, annotationsManager);

    return this.buildCytoscapeElements(parsed, { includeContainerData: true, clabTreeData: clabTreeDataToTopoviewer, annotations });
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
   * @param yamlFilePath - The path to the YAML file (for loading annotations).
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public async clabYamlToCytoscapeElementsEditor(yamlContent: string, yamlFilePath?: string): Promise<CyElement[]> {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    const annotationsManager = await import('./../../topoViewer/utilities/annotationsManager').then(m => m.annotationsManager);
    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath, annotationsManager);

    return this.buildCytoscapeElements(parsed, { includeContainerData: false, annotations });
  }

  private async migrateGraphLabelsToAnnotations(
    parsed: ClabTopology,
    annotations: any | undefined,
    yamlFilePath: string | undefined,
    annotationsManager: any
  ): Promise<any | undefined> {
    if (!(yamlFilePath && parsed.topology?.nodes)) {
      return annotations;
    }

    let localAnnotations = annotations ?? { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };

    if (!localAnnotations.nodeAnnotations) {
      localAnnotations.nodeAnnotations = [];
    }

    let needsSave = false;

    for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
      const existingAnnotation = localAnnotations.nodeAnnotations.find((na: any) => na.id === nodeName);
      if (!existingAnnotation && nodeObj?.labels) {
        const labels = nodeObj.labels as Record<string, unknown>;
        if (
          labels['graph-posX'] || labels['graph-posY'] || labels['graph-icon'] ||
          labels['graph-group'] || labels['graph-level'] || labels['graph-groupLabelPos'] ||
          labels['graph-geoCoordinateLat'] || labels['graph-geoCoordinateLng']
        ) {
          const newAnnotation: any = { id: nodeName };

          if (labels['graph-posX'] && labels['graph-posY']) {
            newAnnotation.position = {
              x: parseInt(labels['graph-posX'] as string, 10) || 0,
              y: parseInt(labels['graph-posY'] as string, 10) || 0
            };
          }

          if (labels['graph-icon']) {
            newAnnotation.icon = labels['graph-icon'] as string;
          }

          if (labels['graph-group']) {
            newAnnotation.group = labels['graph-group'] as string;
          }
          if (labels['graph-level']) {
            newAnnotation.level = labels['graph-level'] as string;
          }

          if (labels['graph-groupLabelPos']) {
            newAnnotation.groupLabelPos = labels['graph-groupLabelPos'] as string;
          }

          if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
            newAnnotation.geoCoordinates = {
              lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
              lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0
            };
          }

          localAnnotations.nodeAnnotations.push(newAnnotation);
          needsSave = true;
          log.info(`Migrated graph-* labels for node ${nodeName} to annotations.json`);
        }
      }
    }

    if (needsSave) {
      await annotationsManager.saveAnnotations(yamlFilePath, localAnnotations);
      log.info('Saved migrated graph-* labels to annotations.json');
    }

    return localAnnotations;
  }


  /**
   * Splits an endpoint string into node and interface components.
   *
   * Example:
   * - "Spine-01:e1-1" => { node: "Spine-01", iface: "e1-1" }
   * - "Spine-01" => { node: "Spine-01", iface: "" }
   * - "macvlan:enp0s3" => { node: "macvlan:enp0s3", iface: "" } (special case)
   *
   * @param endpoint - The endpoint string from Containerlab YAML.
   * @returns An object containing the node and interface.
   */
  private splitEndpoint(
    endpoint: string | { node: string; interface?: string }
  ): { node: string; iface: string } {
    if (typeof endpoint === 'string') {
      // Special handling for macvlan endpoints
      if (
        endpoint.startsWith('macvlan:') ||
        endpoint.startsWith('vxlan:') ||
        endpoint.startsWith('vxlan-stitch:') ||
        endpoint.startsWith('dummy')
      ) {
        return { node: endpoint, iface: '' };
      }

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
  private buildParent(nodeObj: ClabNode, nodeAnnotation?: any): string {
    // const grp = nodeObj.group ?? '';

    const grp = nodeAnnotation?.group || nodeObj.labels?.['topoViewer-group'] || nodeObj.labels?.['graph-group'] || '';
    const lvl = nodeAnnotation?.level || nodeObj.labels?.['topoViewer-groupLevel'] || nodeObj.labels?.['graph-level'] || '1';

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

  private normalizeSingleTypeToSpecialId(t: string, linkObj: any, ctx: DummyContext): string {
    if (t === 'host' || t === 'mgmt-net' || t === 'macvlan') {
      const hi = linkObj?.['host-interface'] ?? '';
      return `${t}:${hi}`;
    }
    if (t === 'vxlan' || t === 'vxlan-stitch') {
      const remote = linkObj?.remote ?? '';
      const vni = linkObj?.vni ?? '';
      const udp = linkObj?.['udp-port'] ?? '';
      return `${t}:${remote}/${vni}/${udp}`;
    }
    if (t === 'dummy') {
      if (ctx.dummyLinkMap.has(linkObj)) {
        return ctx.dummyLinkMap.get(linkObj)!;
      }
      ctx.dummyCounter += 1;
      const dummyId = `dummy${ctx.dummyCounter}`;
      ctx.dummyLinkMap.set(linkObj, dummyId);
      return dummyId;
    }
    return '';
  }

  private normalizeLinkToTwoEndpoints(linkObj: any, ctx: DummyContext): { endA: any; endB: any; type?: string } | null {
    const t = linkObj?.type as string | undefined;
    if (t) {
      if (t === 'veth') {
        const a = linkObj?.endpoints?.[0];
        const b = linkObj?.endpoints?.[1];
        if (!a || !b) return null;
        return { endA: a, endB: b, type: t };
      }
      if (['host', 'mgmt-net', 'macvlan', 'dummy', 'vxlan', 'vxlan-stitch'].includes(t)) {
        const a = linkObj?.endpoint;
        if (!a) return null;
        const special = this.normalizeSingleTypeToSpecialId(t, linkObj, ctx);
        return { endA: a, endB: special, type: t };
      }
    }
    const a = linkObj?.endpoints?.[0];
    const b = linkObj?.endpoints?.[1];
    if (!a || !b) return null;
    return { endA: a, endB: b };
  }

  private isPresetLayout(parsed: ClabTopology, annotations?: any): boolean {
    const topology = parsed.topology;
    if (!topology || !topology.nodes) return false;
    return Object.keys(topology.nodes).every(nodeName => {
      const ann = annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
      return ann?.position !== undefined;
    });
  }

  private computeFullPrefix(parsed: ClabTopology, clabName: string): string {
    if (parsed.prefix === undefined) {
      return `clab-${clabName}`;
    }
    if (parsed.prefix === '' || parsed.prefix.trim() === '') {
      return '';
    }
    return `${parsed.prefix.trim()}-${clabName}`;
  }

  private addNodeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode>; annotations?: any },
    fullPrefix: string,
    clabName: string,
    parentMap: Map<string, string | undefined>,
    elements: CyElement[]
  ): void {
    const topology = parsed.topology!;
    if (!topology.nodes) return;
    let nodeIndex = 0;
    for (const [nodeName, nodeObj] of Object.entries(topology.nodes)) {
      const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
      const nodePropKeys = new Set(Object.keys(nodeObj || {}));
      const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
      const nodeAnn = opts.annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
      const parentId = this.buildParent(mergedNode, nodeAnn);
      if (parentId && !parentMap.has(parentId)) {
        parentMap.set(parentId, nodeAnn?.groupLabelPos);
      }

      let containerData: ClabContainerTreeNode | null = null;
      if (opts.includeContainerData) {
        const containerName = fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
        containerData = findContainerNode(opts.clabTreeData ?? {}, containerName, clabName) ?? null;
      }

      const cleanedLabels = { ...(mergedNode.labels ?? {}) } as Record<string, any>;
      delete cleanedLabels['graph-posX'];
      delete cleanedLabels['graph-posY'];
      delete cleanedLabels['graph-icon'];
      delete cleanedLabels['graph-geoCoordinateLat'];
      delete cleanedLabels['graph-geoCoordinateLng'];
      delete cleanedLabels['graph-groupLabelPos'];
      delete cleanedLabels['graph-group'];
      delete cleanedLabels['graph-level'];

      const nodeEl: CyElement = {
        group: 'nodes',
        data: {
          id: nodeName,
          weight: '30',
          name: nodeName,
          parent: parentId || undefined,
          topoViewerRole:
            nodeAnn?.icon ||
            mergedNode.labels?.['topoViewer-role'] ||
            (mergedNode.kind === 'bridge' || mergedNode.kind === 'ovs-bridge' ? 'bridge' : 'router'),
          lat: nodeAnn?.geoCoordinates?.lat !== undefined ? String(nodeAnn.geoCoordinates.lat) : '',
          lng: nodeAnn?.geoCoordinates?.lng !== undefined ? String(nodeAnn.geoCoordinates.lng) : '',
          extraData: {
            ...mergedNode,
            inherited: inheritedProps,
            clabServerUsername: 'asad',
            fqdn: `${nodeName}.${clabName}.io`,
            group: mergedNode.group ?? '',
            id: nodeName,
            image: mergedNode.image ?? '',
            index: nodeIndex.toString(),
            kind: mergedNode.kind ?? '',
            type: mergedNode.type ?? '',
            labdir: fullPrefix ? `${fullPrefix}/` : '',
            labels: cleanedLabels,
            longname: containerData?.name ?? (fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName),
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
        position: nodeAnn?.position ? { x: nodeAnn.position.x, y: nodeAnn.position.y } : { x: 0, y: 0 },
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

  private addGroupNodes(parentMap: Map<string, string | undefined>, elements: CyElement[]): void {
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
  }

  private collectSpecialNodes(
    parsed: ClabTopology,
    ctx: DummyContext
  ): {
    specialNodes: Map<string, { type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'bridge' | 'ovs-bridge' | 'dummy'; label: string }>;
    specialNodeProps: Map<string, any>;
  } {
    const specialNodes = new Map<string, { type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'bridge' | 'ovs-bridge' | 'dummy'; label: string }>();
    const specialNodeProps: Map<string, any> = new Map();

    const topology = parsed.topology!;
    if (topology.nodes) {
      for (const [nodeName, nodeData] of Object.entries(topology.nodes)) {
        if (nodeData.kind === 'bridge' || nodeData.kind === 'ovs-bridge') {
          specialNodes.set(nodeName, { type: nodeData.kind as any, label: nodeName });
        }
      }
    }

    if (!topology.links) {
      return { specialNodes, specialNodeProps };
    }

    const register = (node: string, end: any) => {
      if (node === 'host') {
        const { iface } = this.splitEndpoint(end);
        specialNodes.set(`host:${iface}`, { type: 'host', label: `host:${iface || 'host'}` });
      } else if (node === 'mgmt-net') {
        const { iface } = this.splitEndpoint(end);
        specialNodes.set(`mgmt-net:${iface}`, { type: 'mgmt-net', label: `mgmt-net:${iface || 'mgmt-net'}` });
      } else if (node.startsWith('macvlan:')) {
        const macvlanIface = node.substring(8);
        specialNodes.set(node, { type: 'macvlan', label: `macvlan:${macvlanIface}` });
      } else if (node.startsWith('vxlan-stitch:')) {
        const name = node.substring('vxlan-stitch:'.length);
        specialNodes.set(node, { type: 'vxlan-stitch', label: `vxlan-stitch:${name}` });
      } else if (node.startsWith('vxlan:')) {
        const name = node.substring('vxlan:'.length);
        specialNodes.set(node, { type: 'vxlan', label: `vxlan:${name}` });
      } else if (node.startsWith('dummy')) {
        specialNodes.set(node, { type: 'dummy', label: 'dummy' });
      }
    };

    const computeSpecialId = (end: any) => {
      const { node, iface } = this.splitEndpoint(end);
      if (node === 'host') return `host:${iface}`;
      if (node === 'mgmt-net') return `mgmt-net:${iface}`;
      if (node.startsWith('macvlan:')) return node;
      if (node.startsWith('vxlan-stitch:')) return node;
      if (node.startsWith('vxlan:')) return node;
      if (node.startsWith('dummy')) return node;
      return null;
    };

    for (const linkObj of topology.links) {
      const norm = this.normalizeLinkToTwoEndpoints(linkObj, ctx);
      if (!norm) continue;
      const { endA, endB } = norm;
      const { node: nodeA } = this.splitEndpoint(endA);
      const { node: nodeB } = this.splitEndpoint(endB);
      register(nodeA, endA);
      register(nodeB, endB);

      const linkType = (linkObj && typeof (linkObj as any).type === 'string') ? String((linkObj as any).type) : '';
      if (linkType && linkType !== 'veth') {
        const idA = computeSpecialId(endA);
        const idB = computeSpecialId(endB);
        const baseProps: any = { extType: linkType };
        if ((linkObj as any).mtu !== undefined) baseProps.extMtu = (linkObj as any).mtu;
        if ((linkObj as any).vars !== undefined) baseProps.extVars = (linkObj as any).vars;
        if ((linkObj as any).labels !== undefined) baseProps.extLabels = (linkObj as any).labels;
        if (linkType === 'host' || linkType === 'mgmt-net' || linkType === 'macvlan') {
          if ((linkObj as any)['host-interface'] !== undefined) baseProps.extHostInterface = (linkObj as any)['host-interface'];
          if (linkType === 'macvlan' && (linkObj as any).mode !== undefined) baseProps.extMode = (linkObj as any).mode;
        }
        const epMac = (linkObj as any)?.endpoint?.mac;
        if (epMac !== undefined) baseProps.extMac = epMac;
        if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
          if ((linkObj as any).remote !== undefined) baseProps.extRemote = (linkObj as any).remote;
          if ((linkObj as any).vni !== undefined) baseProps.extVni = (linkObj as any).vni;
          if ((linkObj as any)['udp-port'] !== undefined) baseProps.extUdpPort = (linkObj as any)['udp-port'];
        }
        [idA, idB].forEach(id => {
          if (!id) return;
          const prev = specialNodeProps.get(id) || {};
          const merged: any = { ...baseProps };
          for (const k of Object.keys(prev)) {
            if (prev[k] !== undefined) merged[k] = prev[k];
          }
          specialNodeProps.set(id, { ...prev, ...merged });
        });
      }
    }

    return { specialNodes, specialNodeProps };
  }

  private addCloudNodes(
    specialNodes: Map<string, { type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'bridge' | 'ovs-bridge' | 'dummy'; label: string }>,
    specialNodeProps: Map<string, any>,
    opts: { annotations?: any },
    elements: CyElement[]
  ): void {
    for (const [nodeId, nodeInfo] of specialNodes) {
      let position = { x: 0, y: 0 };
      let parent: string | undefined;
      if (opts.annotations?.cloudNodeAnnotations) {
        const savedCloudNode = opts.annotations.cloudNodeAnnotations.find((cn: any) => cn.id === nodeId);
        if (savedCloudNode) {
          if (savedCloudNode.position) position = savedCloudNode.position;
          if (savedCloudNode.group && savedCloudNode.level) parent = `${savedCloudNode.group}:${savedCloudNode.level}`;
        }
      }
      const cloudNodeEl: CyElement = {
        group: 'nodes',
        data: {
          id: nodeId,
          weight: '30',
          name: nodeInfo.label,
          parent,
          topoViewerRole: 'cloud',
          lat: '',
          lng: '',
          extraData: {
            clabServerUsername: '',
            fqdn: '',
            group: '',
            id: nodeId,
            image: '',
            index: '999',
            kind: nodeInfo.type,
            type: nodeInfo.type,
            labdir: '',
            labels: {},
            longname: nodeId,
            macAddress: '',
            mgmtIntf: '',
            mgmtIpv4AddressLength: 0,
            mgmtIpv4Address: '',
            mgmtIpv6Address: '',
            mgmtIpv6AddressLength: 0,
            mgmtNet: '',
            name: nodeInfo.label,
            shortname: nodeInfo.label,
            state: '',
            weight: '3',
            ...(specialNodeProps.get(nodeId) || {}),
          },
        },
        position,
        removed: false,
        selected: false,
        selectable: true,
        locked: false,
        grabbed: false,
        grabbable: true,
        classes: 'special-endpoint',
      };
      elements.push(cloudNodeEl);
    }
  }

  private resolveActualNode(node: string, iface: string): string {
    if (node === 'host') return `host:${iface}`;
    if (node === 'mgmt-net') return `mgmt-net:${iface}`;
    if (node.startsWith('macvlan:')) return node;
    if (node.startsWith('vxlan-stitch:')) return node;
    if (node.startsWith('vxlan:')) return node;
    if (node.startsWith('dummy')) return node;
    return node;
  }

  private buildContainerName(node: string, actualNode: string, fullPrefix: string): string {
    if (
      node === 'host' ||
      node === 'mgmt-net' ||
      node.startsWith('macvlan:') ||
      node.startsWith('vxlan:') ||
      node.startsWith('vxlan-stitch:') ||
      node.startsWith('dummy')
    ) {
      return actualNode;
    }
    return fullPrefix ? `${fullPrefix}-${node}` : node;
  }

  private computeEdgeClass(
    sourceNode: string,
    targetNode: string,
    sourceIfaceData: any | undefined,
    targetIfaceData: any | undefined,
    topology: NonNullable<ClabTopology['topology']>
  ): string {
    const sourceNodeData = topology.nodes?.[sourceNode];
    const targetNodeData = topology.nodes?.[targetNode];
    const sourceIsSpecial =
      sourceNodeData?.kind === 'bridge' ||
      sourceNodeData?.kind === 'ovs-bridge' ||
      sourceNode === 'host' ||
      sourceNode === 'mgmt-net' ||
      sourceNode.startsWith('macvlan:') ||
      sourceNode.startsWith('vxlan:') ||
      sourceNode.startsWith('vxlan-stitch:') ||
      sourceNode.startsWith('dummy');
    const targetIsSpecial =
      targetNodeData?.kind === 'bridge' ||
      targetNodeData?.kind === 'ovs-bridge' ||
      targetNode === 'host' ||
      targetNode === 'mgmt-net' ||
      targetNode.startsWith('macvlan:') ||
      targetNode.startsWith('vxlan:') ||
      targetNode.startsWith('vxlan-stitch:') ||
      targetNode.startsWith('dummy');
    if (sourceIsSpecial || targetIsSpecial) {
      if (sourceIsSpecial && !targetIsSpecial) {
        if (targetIfaceData?.state) {
          return targetIfaceData.state === 'up' ? 'link-up' : 'link-down';
        }
      } else if (!sourceIsSpecial && targetIsSpecial) {
        if (sourceIfaceData?.state) {
          return sourceIfaceData.state === 'up' ? 'link-up' : 'link-down';
        }
      } else {
        return 'link-up';
      }
    } else if (sourceIfaceData?.state && targetIfaceData?.state) {
      return sourceIfaceData.state === 'up' && targetIfaceData.state === 'up' ? 'link-up' : 'link-down';
    }
    return '';
  }

  private validateExtendedLink(linkObj: any): string[] {
    const errors: string[] = [];
    const linkType = (linkObj && typeof linkObj.type === 'string') ? (linkObj.type as string) : '';
    if (linkType) {
      if (linkType === 'veth') {
        const eps = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
        const ok =
          eps.length >= 2 &&
          typeof eps[0] === 'object' &&
          typeof eps[1] === 'object' &&
          eps[0]?.node &&
          (eps[0]?.interface !== undefined) &&
          eps[1]?.node &&
          (eps[1]?.interface !== undefined);
        if (!ok) errors.push('invalid-veth-endpoints');
      } else if (['mgmt-net', 'host', 'macvlan', 'dummy', 'vxlan', 'vxlan-stitch'].includes(linkType)) {
        const ep = linkObj.endpoint;
        const okEp = ep && ep.node && (ep.interface !== undefined);
        if (!okEp) errors.push('invalid-endpoint');
        if (linkType === 'mgmt-net' || linkType === 'host' || linkType === 'macvlan') {
          if (!linkObj['host-interface']) errors.push('missing-host-interface');
        }
        if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
          if (!linkObj.remote) errors.push('missing-remote');
          if (linkObj.vni === undefined || linkObj.vni === '') errors.push('missing-vni');
          if (linkObj['udp-port'] === undefined || linkObj['udp-port'] === '') errors.push('missing-udp-port');
        }
      }
    }
    return errors;
  }

  private addEdgeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> },
    fullPrefix: string,
    clabName: string,
    specialNodes: Map<string, { type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'bridge' | 'ovs-bridge' | 'dummy'; label: string }>,
    ctx: DummyContext,
    elements: CyElement[]
  ): void {
    const topology = parsed.topology!;
    if (!topology.links) return;
    let linkIndex = 0;
    for (const linkObj of topology.links) {
      const norm = this.normalizeLinkToTwoEndpoints(linkObj, ctx);
      if (!norm) {
        log.warn('Link does not have both endpoints. Skipping.');
        continue;
      }
      const { endA, endB } = norm;
      const { node: sourceNode, iface: sourceIface } = this.splitEndpoint(endA);
      const { node: targetNode, iface: targetIface } = this.splitEndpoint(endB);
      const actualSourceNode = this.resolveActualNode(sourceNode, sourceIface);
      const actualTargetNode = this.resolveActualNode(targetNode, targetIface);
      const sourceContainerName = this.buildContainerName(sourceNode, actualSourceNode, fullPrefix);
      const targetContainerName = this.buildContainerName(targetNode, actualTargetNode, fullPrefix);
      const sourceIfaceData = opts.includeContainerData
        ? findInterfaceNode(opts.clabTreeData ?? {}, sourceContainerName, sourceIface, clabName)
        : undefined;
      const targetIfaceData = opts.includeContainerData
        ? findInterfaceNode(opts.clabTreeData ?? {}, targetContainerName, targetIface, clabName)
        : undefined;
      const edgeId = `Clab-Link${linkIndex}`;
      const edgeClass = opts.includeContainerData
        ? this.computeEdgeClass(sourceNode, targetNode, sourceIfaceData, targetIfaceData, topology)
        : '';
      const edgeEl = this.buildEdgeElement({
        linkObj,
        endA,
        endB,
        sourceNode,
        targetNode,
        sourceIface,
        targetIface,
        actualSourceNode,
        actualTargetNode,
        sourceContainerName,
        targetContainerName,
        sourceIfaceData,
        targetIfaceData,
        edgeId,
        edgeClass,
        specialNodes,
      });
      elements.push(edgeEl);
      linkIndex++;
    }
  }

  private shouldOmitEndpoint(node: string): boolean {
    return (
      node === 'host' ||
      node === 'mgmt-net' ||
      node.startsWith('macvlan:') ||
      node.startsWith('dummy')
    );
  }

  private extractEndpointMac(endpoint: unknown): string {
    return typeof endpoint === 'object' && endpoint !== null
      ? (endpoint as any)?.mac ?? ''
      : '';
  }

  private buildEdgeElement(params: {
    linkObj: any;
    endA: any;
    endB: any;
    sourceNode: string;
    targetNode: string;
    sourceIface: string;
    targetIface: string;
    actualSourceNode: string;
    actualTargetNode: string;
    sourceContainerName: string;
    targetContainerName: string;
    sourceIfaceData: any;
    targetIfaceData: any;
    edgeId: string;
    edgeClass: string;
    specialNodes: Map<string, { type: string; label: string }>;
  }): CyElement {
    const {
      linkObj,
      endA,
      endB,
      sourceNode,
      targetNode,
      sourceIface,
      targetIface,
      actualSourceNode,
      actualTargetNode,
      sourceContainerName,
      targetContainerName,
      sourceIfaceData,
      targetIfaceData,
      edgeId,
      edgeClass,
      specialNodes,
    } = params;

    const extValidationErrors = this.validateExtendedLink(linkObj);
    const sourceEndpoint = this.shouldOmitEndpoint(sourceNode) ? '' : sourceIface;
    const targetEndpoint = this.shouldOmitEndpoint(targetNode) ? '' : targetIface;
    const classes =
      edgeClass +
      (specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode)
        ? ' stub-link'
        : '');
    return {
      group: 'edges',
      data: {
        id: edgeId,
        weight: '3',
        name: edgeId,
        parent: '',
        topoViewerRole: 'link',
        sourceEndpoint,
        targetEndpoint,
        lat: '',
        lng: '',
        source: actualSourceNode,
        target: actualTargetNode,
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
          extType: linkObj?.type ?? '',
          extMtu: linkObj?.mtu ?? '',
          extVars: linkObj?.vars ?? undefined,
          extLabels: linkObj?.labels ?? undefined,
          extHostInterface: linkObj?.['host-interface'] ?? '',
          extMode: linkObj?.mode ?? '',
          extRemote: linkObj?.remote ?? '',
          extVni: linkObj?.vni ?? '',
          extUdpPort: linkObj?.['udp-port'] ?? '',
          extSourceMac: this.extractEndpointMac(endA),
          extTargetMac: this.extractEndpointMac(endB),
          extMac: (linkObj as any)?.endpoint?.mac ?? '',
          yamlFormat:
            typeof (linkObj as any)?.type === 'string' && (linkObj as any).type
              ? 'extended'
              : 'short',
          extValidationErrors: extValidationErrors.length
            ? extValidationErrors
            : undefined,
        },
      },
      position: { x: 0, y: 0 },
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbed: false,
      grabbable: true,
      classes,
    };
  }

  private buildCytoscapeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode>; annotations?: any }
  ): CyElement[] {
    const elements: CyElement[] = [];
    if (!parsed.topology) {
      log.warn("Parsed YAML does not contain 'topology' object.");
      return elements;
    }

    this.currentIsPresetLayout = this.isPresetLayout(parsed, opts.annotations);
    log.info(`######### status preset layout: ${this.currentIsPresetLayout}`);

    const clabName = parsed.name ?? '';
    const fullPrefix = this.computeFullPrefix(parsed, clabName);
    const parentMap = new Map<string, string | undefined>();
    this.addNodeElements(parsed, opts, fullPrefix, clabName, parentMap, elements);
    this.addGroupNodes(parentMap, elements);

    const ctx: DummyContext = { dummyCounter: 0, dummyLinkMap: new Map<any, string>() };
    const { specialNodes, specialNodeProps } = this.collectSpecialNodes(parsed, ctx);
    this.addCloudNodes(specialNodes, specialNodeProps, opts, elements);
    this.addEdgeElements(parsed, opts, fullPrefix, clabName, specialNodes, ctx, elements);

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);
    return elements;
  }


}
