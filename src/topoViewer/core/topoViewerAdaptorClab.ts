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

import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from "../../treeView/common";
import { findContainerNode, findInterfaceNode } from '../utilities/treeUtils';
// log.info(ClabTreeDataProvider.)

log.info(`TopoViewer Version: ${topoViewerVersion}`);

type DummyContext = { dummyCounter: number; dummyLinkMap: Map<any, string> };
const TYPES = {
  HOST: 'host',
  MGMT_NET: 'mgmt-net',
  MACVLAN: 'macvlan',
  VXLAN: 'vxlan',
  VXLAN_STITCH: 'vxlan-stitch',
  BRIDGE: 'bridge',
  OVS_BRIDGE: 'ovs-bridge',
  DUMMY: 'dummy',
} as const;
type SpecialNodeType = typeof TYPES[keyof typeof TYPES];

// Common string literals used across this adaptor
const PREFIX_MACVLAN = 'macvlan:';
const PREFIX_VXLAN = 'vxlan:';
const PREFIX_VXLAN_STITCH = 'vxlan-stitch:';
const PREFIX_DUMMY = 'dummy';
const STR_HOST = 'host';
const STR_MGMT_NET = 'mgmt-net';
const NODE_KIND_BRIDGE = TYPES.BRIDGE;
const NODE_KIND_OVS_BRIDGE = TYPES.OVS_BRIDGE;
const SINGLE_ENDPOINT_TYPES = [STR_HOST, STR_MGMT_NET, TYPES.MACVLAN, TYPES.DUMMY, TYPES.VXLAN, TYPES.VXLAN_STITCH];

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
      this.currentClabDoc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any); // <-- store the raw Document

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

    const localAnnotations = annotations ?? { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
    localAnnotations.nodeAnnotations = localAnnotations.nodeAnnotations ?? [];

    let needsSave = false;
    for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
      const existingAnnotation = localAnnotations.nodeAnnotations.find((na: any) => na.id === nodeName);
      if (existingAnnotation || !nodeObj?.labels) continue;

      const labels = nodeObj.labels as Record<string, unknown>;
      if (!this.nodeHasGraphLabels(labels)) continue;

      const newAnnotation = this.buildAnnotationFromLabels(nodeName, labels);
      if (newAnnotation) {
        localAnnotations.nodeAnnotations.push(newAnnotation);
        needsSave = true;
        log.info(`Migrated graph-* labels for node ${nodeName} to annotations.json`);
      }
    }

    if (needsSave) {
      await annotationsManager.saveAnnotations(yamlFilePath, localAnnotations);
      log.info('Saved migrated graph-* labels to annotations.json');
    }

    return localAnnotations;
  }

  private nodeHasGraphLabels(labels: Record<string, unknown>): boolean {
    return Boolean(
      labels['graph-posX'] ||
      labels['graph-posY'] ||
      labels['graph-icon'] ||
      labels['graph-group'] ||
      labels['graph-level'] ||
      labels['graph-groupLabelPos'] ||
      labels['graph-geoCoordinateLat'] ||
      labels['graph-geoCoordinateLng']
    );
  }

  private buildAnnotationFromLabels(nodeName: string, labels: Record<string, unknown>): any | null {
    const annotation: any = { id: nodeName };

    if (labels['graph-posX'] && labels['graph-posY']) {
      annotation.position = {
        x: parseInt(labels['graph-posX'] as string, 10) || 0,
        y: parseInt(labels['graph-posY'] as string, 10) || 0,
      };
    }

    if (labels['graph-icon']) {
      annotation.icon = labels['graph-icon'] as string;
    }
    if (labels['graph-group']) {
      annotation.group = labels['graph-group'] as string;
    }
    if (labels['graph-level']) {
      annotation.level = labels['graph-level'] as string;
    }
    if (labels['graph-groupLabelPos']) {
      annotation.groupLabelPos = labels['graph-groupLabelPos'] as string;
    }

    if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
      annotation.geoCoordinates = {
        lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
        lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0,
      };
    }

    return annotation;
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
        endpoint.startsWith(PREFIX_MACVLAN) ||
        endpoint.startsWith(PREFIX_VXLAN) ||
        endpoint.startsWith(PREFIX_VXLAN_STITCH) ||
        endpoint.startsWith(PREFIX_DUMMY)
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
    if (['host', 'mgmt-net', 'macvlan'].includes(t)) {
      return `${t}:${linkObj?.['host-interface'] ?? ''}`;
    }

    if (t === 'vxlan' || t === 'vxlan-stitch') {
      const remote = linkObj?.remote ?? '';
      const vni = linkObj?.vni ?? '';
      const udp = linkObj?.['udp-port'] ?? '';
      return `${t}:${remote}/${vni}/${udp}`;
    }

    if (t === 'dummy') {
      const cached = ctx.dummyLinkMap.get(linkObj);
      if (cached) return cached;
      ctx.dummyCounter += 1;
      const dummyId = `dummy${ctx.dummyCounter}`;
      ctx.dummyLinkMap.set(linkObj, dummyId);
      return dummyId;
    }

    return '';
  }

  private normalizeLinkToTwoEndpoints(linkObj: any, ctx: DummyContext): { endA: any; endB: any; type?: string } | null {
    const t = linkObj?.type as string | undefined;
    if (t === 'veth') {
      const [a, b] = linkObj?.endpoints ?? [];
      if (!a || !b) return null;
      return { endA: a, endB: b, type: t };
    }

    if (SINGLE_ENDPOINT_TYPES.includes(t ?? '')) {
      const a = linkObj?.endpoint;
      if (!a) return null;
      const special = this.normalizeSingleTypeToSpecialId(t!, linkObj, ctx);
      return { endA: a, endB: special, type: t };
    }

    const [a, b] = linkObj?.endpoints ?? [];
    if (!a || !b) return null;
    return { endA: a, endB: b, type: t };
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
      const nodeAnn = opts.annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
      const { element, parentId } = this.buildNodeElement({
        parsed,
        nodeName,
        nodeObj,
        opts,
        fullPrefix,
        clabName,
        nodeAnn,
        nodeIndex,
      });
      if (parentId && !parentMap.has(parentId)) {
        parentMap.set(parentId, nodeAnn?.groupLabelPos);
      }
      elements.push(element);
      nodeIndex++;
    }
  }

  private buildNodeElement(params: {
    parsed: ClabTopology;
    nodeName: string;
    nodeObj: ClabNode;
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> };
    fullPrefix: string;
    clabName: string;
    nodeAnn: any;
    nodeIndex: number;
  }): { element: CyElement; parentId: string | undefined } {
    const { parsed, nodeName, nodeObj, opts, fullPrefix, clabName, nodeAnn, nodeIndex } = params;
    const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
    const nodePropKeys = new Set(Object.keys(nodeObj || {}));
    const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
    const parentId = this.buildParent(mergedNode, nodeAnn);
    const containerData = this.getContainerData(opts, fullPrefix, nodeName, clabName, mergedNode);
    const cleanedLabels = this.sanitizeLabels(mergedNode.labels);
    const position = nodeAnn?.position ? { x: nodeAnn.position.x, y: nodeAnn.position.y } : { x: 0, y: 0 };
    const { lat, lng } = this.getNodeLatLng(nodeAnn);
    const extraData = this.createNodeExtraData({
      mergedNode,
      inheritedProps,
      nodeName,
      clabName,
      nodeIndex,
      fullPrefix,
      containerData,
      cleanedLabels,
      includeContainerData: opts.includeContainerData,
    });

    const topoViewerRole =
      nodeAnn?.icon ||
      mergedNode.labels?.['topoViewer-role'] ||
      (mergedNode.kind === NODE_KIND_BRIDGE || mergedNode.kind === NODE_KIND_OVS_BRIDGE ? NODE_KIND_BRIDGE : 'router');

    const element: CyElement = {
      group: 'nodes',
      data: {
        id: nodeName,
        weight: '30',
        name: nodeName,
        parent: parentId || undefined,
        topoViewerRole,
        lat,
        lng,
        extraData,
      },
      position,
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbed: false,
      grabbable: true,
      classes: '',
    };

    return { element, parentId };
  }

  private getContainerData(
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> },
    fullPrefix: string,
    nodeName: string,
    clabName: string,
    resolvedNode: ClabNode
  ): ClabContainerTreeNode | null {
    if (!opts.includeContainerData) return null;
    const containerName = fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
    const direct = findContainerNode(opts.clabTreeData ?? {}, containerName, clabName);
    if (direct) {
      return direct;
    }

    if (!this.isDistributedSrosNode(resolvedNode)) {
      return null;
    }

    const distributed = this.findDistributedSrosContainer({
      baseNodeName: nodeName,
      fullPrefix,
      clabTreeData: opts.clabTreeData,
      clabName,
      components: (resolvedNode as any).components ?? [],
    });

    return distributed ?? null;
  }

  private sanitizeLabels(labels: Record<string, any> | undefined): Record<string, any> {
    const cleaned = { ...(labels ?? {}) } as Record<string, any>;
    delete cleaned['graph-posX'];
    delete cleaned['graph-posY'];
    delete cleaned['graph-icon'];
    delete cleaned['graph-geoCoordinateLat'];
    delete cleaned['graph-geoCoordinateLng'];
    delete cleaned['graph-groupLabelPos'];
    delete cleaned['graph-group'];
    delete cleaned['graph-level'];
    return cleaned;
  }

  private getNodeLatLng(nodeAnn: any): { lat: string; lng: string } {
    const lat = nodeAnn?.geoCoordinates?.lat !== undefined ? String(nodeAnn.geoCoordinates.lat) : '';
    const lng = nodeAnn?.geoCoordinates?.lng !== undefined ? String(nodeAnn.geoCoordinates.lng) : '';
    return { lat, lng };
  }

  private createNodeExtraData(params: {
    mergedNode: any;
    inheritedProps: string[];
    nodeName: string;
    clabName: string;
    nodeIndex: number;
    fullPrefix: string;
    containerData: ClabContainerTreeNode | null;
    cleanedLabels: Record<string, any>;
    includeContainerData: boolean;
  }): any {
    const { mergedNode, inheritedProps, nodeName, clabName, nodeIndex, fullPrefix, containerData, cleanedLabels, includeContainerData } = params;
    return {
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
      mgmtIpv4Address: includeContainerData ? `${containerData?.IPv4Address}` : '',
      mgmtIpv6Address: includeContainerData ? `${containerData?.IPv6Address}` : '',
      mgmtIpv6AddressLength: 0,
      mgmtNet: '',
      name: nodeName,
      shortname: nodeName,
      state: includeContainerData ? `${containerData?.state}` : '',
      weight: '3',
    };
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
    specialNodes: Map<string, { type: SpecialNodeType; label: string }>;
    specialNodeProps: Map<string, any>;
  } {
    const specialNodes = this.initSpecialNodes(parsed.topology?.nodes);
    const specialNodeProps: Map<string, any> = new Map();
    const links = parsed.topology?.links;
    if (!links) return { specialNodes, specialNodeProps };

    for (const linkObj of links) {
      const norm = this.normalizeLinkToTwoEndpoints(linkObj, ctx);
      if (!norm) continue;
      const { endA, endB } = norm;
      this.registerEndpoint(specialNodes, endA);
      this.registerEndpoint(specialNodes, endB);
      this.mergeSpecialNodeProps(linkObj, endA, endB, specialNodeProps);
    }

    return { specialNodes, specialNodeProps };
  }

  private initSpecialNodes(nodes?: Record<string, ClabNode>): Map<string, { type: SpecialNodeType; label: string }> {
    const specialNodes = new Map<string, { type: SpecialNodeType; label: string }>();
    if (!nodes) return specialNodes;
    for (const [nodeName, nodeData] of Object.entries(nodes)) {
      if (nodeData.kind === NODE_KIND_BRIDGE || nodeData.kind === NODE_KIND_OVS_BRIDGE) {
        specialNodes.set(nodeName, { type: nodeData.kind as any, label: nodeName });
      }
    }
    return specialNodes;
  }

  private registerEndpoint(
    specialNodes: Map<string, { type: string; label: string }>,
    end: any
  ): void {
    const { node, iface } = this.splitEndpoint(end);
    const info = this.determineSpecialNode(node, iface);
    if (info) specialNodes.set(info.id, { type: info.type, label: info.label });
  }

  private determineSpecialNode(node: string, iface: string): { id: string; type: string; label: string } | null {
    if (node === 'host') return { id: `host:${iface}`, type: 'host', label: `host:${iface || 'host'}` };
    if (node === 'mgmt-net') return { id: `mgmt-net:${iface}`, type: 'mgmt-net', label: `mgmt-net:${iface || 'mgmt-net'}` };
    if (node.startsWith(PREFIX_MACVLAN)) return { id: node, type: 'macvlan', label: node };
    if (node.startsWith(PREFIX_VXLAN_STITCH)) return { id: node, type: TYPES.VXLAN_STITCH, label: node };
    if (node.startsWith('vxlan:')) return { id: node, type: 'vxlan', label: node };
    if (node.startsWith('dummy')) return { id: node, type: 'dummy', label: 'dummy' };
    return null;
  }

  private mergeSpecialNodeProps(
    linkObj: any,
    endA: any,
    endB: any,
    specialNodeProps: Map<string, any>
  ): void {
    const linkType = typeof linkObj?.type === 'string' ? String(linkObj.type) : '';
    if (!linkType || linkType === 'veth') return;

    const ids = [this.getSpecialId(endA), this.getSpecialId(endB)];
    const baseProps: any = this.buildBaseProps(linkObj, linkType);
    ids.forEach(id => {
      if (!id) return;
      const prev = specialNodeProps.get(id) || {};
      specialNodeProps.set(id, { ...prev, ...baseProps });
    });
  }

  private getSpecialId(end: any): string | null {
    const { node, iface } = this.splitEndpoint(end);
    if (node === 'host') return `host:${iface}`;
    if (node === 'mgmt-net') return `mgmt-net:${iface}`;
    if (node.startsWith(PREFIX_MACVLAN)) return node;
    if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
    if (node.startsWith('vxlan:')) return node;
    if (node.startsWith('dummy')) return node;
    return null;
  }

  private buildBaseProps(linkObj: any, linkType: string): any {
    const baseProps: any = { extType: linkType };
    this.assignCommonLinkProps(linkObj, baseProps);
    this.assignHostMgmtProps(linkType, linkObj, baseProps);
    this.assignVxlanProps(linkType, linkObj, baseProps);
    const epMac = linkObj?.endpoint?.mac;
    if (epMac !== undefined) baseProps.extMac = epMac;
    return baseProps;
  }

  private assignCommonLinkProps(linkObj: any, baseProps: any): void {
    if (linkObj?.mtu !== undefined) baseProps.extMtu = linkObj.mtu;
    if (linkObj?.vars !== undefined) baseProps.extVars = linkObj.vars;
    if (linkObj?.labels !== undefined) baseProps.extLabels = linkObj.labels;
  }

  private assignHostMgmtProps(linkType: string, linkObj: any, baseProps: any): void {
    if (!['host', 'mgmt-net', 'macvlan'].includes(linkType)) return;
    if (linkObj?.['host-interface'] !== undefined) baseProps.extHostInterface = linkObj['host-interface'];
    if (linkType === 'macvlan' && linkObj?.mode !== undefined) baseProps.extMode = linkObj.mode;
  }

  private assignVxlanProps(linkType: string, linkObj: any, baseProps: any): void {
    if (![TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as any)) return;
    if (linkObj?.remote !== undefined) baseProps.extRemote = linkObj.remote;
    if (linkObj?.vni !== undefined) baseProps.extVni = linkObj.vni;
    if (linkObj?.['udp-port'] !== undefined) baseProps.extUdpPort = linkObj['udp-port'];
  }

  private addCloudNodes(
    specialNodes: Map<string, { type: SpecialNodeType; label: string }>,
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
    if (node.startsWith(PREFIX_MACVLAN)) return node;
    if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
    if (node.startsWith('vxlan:')) return node;
    if (node.startsWith('dummy')) return node;
    return node;
  }

  private buildContainerName(node: string, actualNode: string, fullPrefix: string): string {
    if (
      node === 'host' ||
      node === 'mgmt-net' ||
      node.startsWith(PREFIX_MACVLAN) ||
      node.startsWith('vxlan:') ||
      node.startsWith(PREFIX_VXLAN_STITCH) ||
      node.startsWith('dummy')
    ) {
      return actualNode;
    }
    return fullPrefix ? `${fullPrefix}-${node}` : node;
  }

  private resolveContainerAndInterface(params: {
    parsed: ClabTopology;
    nodeName: string;
    actualNodeName: string;
    ifaceName: string;
    fullPrefix: string;
    clabName: string;
    includeContainerData: boolean;
    clabTreeData?: Record<string, ClabLabTreeNode>;
  }): { containerName: string; ifaceData?: ClabInterfaceTreeNode } {
    const {
      parsed,
      nodeName,
      actualNodeName,
      ifaceName,
      fullPrefix,
      clabName,
      includeContainerData,
      clabTreeData,
    } = params;

    const containerName = this.buildContainerName(nodeName, actualNodeName, fullPrefix);

    if (!includeContainerData) {
      return { containerName };
    }

    const directIface = findInterfaceNode(clabTreeData ?? {}, containerName, ifaceName, clabName);
    if (directIface) {
      return { containerName, ifaceData: directIface };
    }

    const topologyNode = parsed.topology?.nodes?.[nodeName] ?? {};
    const resolvedNode = resolveNodeConfig(parsed, topologyNode || {});

    if (this.isDistributedSrosNode(resolvedNode)) {
      const distributedMatch = this.findDistributedSrosInterface({
        baseNodeName: nodeName,
        ifaceName,
        fullPrefix,
        clabName,
        clabTreeData,
        components: resolvedNode.components ?? [],
      });
      if (distributedMatch) {
        return distributedMatch;
      }
    }

    return { containerName };
  }

  private isDistributedSrosNode(node: ClabNode | undefined): boolean {
    if (!node) return false;
    if (node.kind !== 'nokia_srsim') return false;
    return Array.isArray((node as any).components) && (node as any).components.length > 0;
  }

  private findDistributedSrosInterface(params: {
    baseNodeName: string;
    ifaceName: string;
    fullPrefix: string;
    clabName: string;
    clabTreeData?: Record<string, ClabLabTreeNode>;
    components: any[];
  }): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
    const { baseNodeName, ifaceName, fullPrefix, clabName, clabTreeData, components } = params;
    if (!clabTreeData || !Array.isArray(components) || components.length === 0) {
      return undefined;
    }

    const candidateNames = this.buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
    const directMatch = this.findInterfaceByCandidateNames({
      candidateNames,
      ifaceName,
      clabTreeData,
      clabName,
    });
    if (directMatch) {
      return directMatch;
    }

    return this.scanAllDistributedContainers({
      baseNodeName,
      ifaceName,
      fullPrefix,
      clabTreeData,
      clabName,
    });
  }

  private findDistributedSrosContainer(params: {
    baseNodeName: string;
    fullPrefix: string;
    clabTreeData?: Record<string, ClabLabTreeNode>;
    clabName: string;
    components: any[];
  }): ClabContainerTreeNode | undefined {
    const { baseNodeName, fullPrefix, clabTreeData, clabName, components } = params;
    if (!clabTreeData) {
      return undefined;
    }

    const candidateNames = this.buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
    const candidateSet = new Set(candidateNames.map(name => name.toLowerCase()));

    const labs = clabName
      ? Object.values(clabTreeData).filter(l => l.name === clabName)
      : Object.values(clabTreeData);

    const candidateContainers = labs.flatMap(lab =>
      this.collectDistributedSrosContainers(lab, candidateSet, baseNodeName, fullPrefix)
    );

    if (!candidateContainers.length) {
      return undefined;
    }

    candidateContainers.sort((a, b) => {
      const slotOrder = this.srosSlotPriority(a.slot) - this.srosSlotPriority(b.slot);
      if (slotOrder !== 0) {
        return slotOrder;
      }
      return a.slot.localeCompare(b.slot, undefined, { sensitivity: 'base' });
    });

    return candidateContainers[0].container;
  }

  private collectDistributedSrosContainers(
    lab: ClabLabTreeNode,
    candidateSet: Set<string>,
    baseNodeName: string,
    fullPrefix: string
  ): { container: ClabContainerTreeNode; slot: string }[] {
    const results: { container: ClabContainerTreeNode; slot: string }[] = [];
    for (const container of lab.containers ?? []) {
      if (container.kind !== 'nokia_srsim') {
        continue;
      }

      const info = this.extractSrosComponentInfo(container);
      if (!info) {
        continue;
      }

      const normalizedBase = info.base.toLowerCase();
      if (
        !candidateSet.has(normalizedBase) &&
        !this.containerBelongsToDistributedNode(container, baseNodeName, fullPrefix)
      ) {
        continue;
      }

      results.push({ container, slot: info.slot });
    }
    return results;
  }

  private extractSrosComponentInfo(
    container: ClabContainerTreeNode
  ): { base: string; slot: string } | undefined {
    const candidateNames = [container.name_short, container.name].filter(Boolean) as string[];
    for (const raw of candidateNames) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }

      const lastDash = trimmed.lastIndexOf('-');
      if (lastDash === -1) {
        continue;
      }

      const base = trimmed.slice(0, lastDash);
      const slot = trimmed.slice(lastDash + 1);
      if (!base || !slot) {
        continue;
      }

      return { base, slot };
    }

    return undefined;
  }

  private srosSlotPriority(slot: string): number {
    const normalized = slot.toLowerCase();
    if (normalized === 'a') {
      return 0;
    }
    if (normalized === 'b') {
      return 1;
    }
    return 2;
  }

  private buildDistributedCandidateNames(
    baseNodeName: string,
    fullPrefix: string,
    components: any[]
  ): string[] {
    const names: string[] = [];
    for (const comp of components) {
      const slotRaw = typeof comp?.slot === 'string' ? comp.slot.trim() : '';
      if (!slotRaw) continue;
      const suffix = slotRaw.toLowerCase();
      const longName = fullPrefix ? `${fullPrefix}-${baseNodeName}-${suffix}` : `${baseNodeName}-${suffix}`;
      names.push(longName, `${baseNodeName}-${suffix}`);
    }
    return names;
  }

  private findInterfaceByCandidateNames(params: {
    candidateNames: string[];
    ifaceName: string;
    clabTreeData: Record<string, ClabLabTreeNode>;
    clabName: string;
  }): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
    const { candidateNames, ifaceName, clabTreeData, clabName } = params;
    for (const candidate of candidateNames) {
      const container = findContainerNode(clabTreeData, candidate, clabName);
      if (!container) continue;
      const ifaceData = this.matchInterfaceInContainer(container, ifaceName);
      if (ifaceData) {
        return { containerName: container.name, ifaceData };
      }
    }
    return undefined;
  }

  private scanAllDistributedContainers(params: {
    baseNodeName: string;
    ifaceName: string;
    fullPrefix: string;
    clabTreeData: Record<string, ClabLabTreeNode>;
    clabName: string;
  }): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
    const { baseNodeName, ifaceName, fullPrefix, clabTreeData, clabName } = params;
    for (const lab of Object.values(clabTreeData)) {
      if (clabName && lab.name !== clabName) continue;
      for (const container of lab.containers ?? []) {
        if (!this.containerBelongsToDistributedNode(container, baseNodeName, fullPrefix)) continue;
        const ifaceData = this.matchInterfaceInContainer(container, ifaceName);
        if (ifaceData) {
          return { containerName: container.name, ifaceData };
        }
      }
    }
    return undefined;
  }

  private containerBelongsToDistributedNode(
    container: ClabContainerTreeNode,
    baseNodeName: string,
    fullPrefix: string
  ): boolean {
    const prefix = fullPrefix ? `${fullPrefix}-${baseNodeName}` : baseNodeName;
    const shortPrefix = `${baseNodeName}`;
    return (
      container.name.startsWith(`${prefix}-`) ||
      container.name_short.startsWith(`${shortPrefix}-`) ||
      (typeof container.label === 'string' && container.label.startsWith(`${shortPrefix}-`))
    );
  }

  private matchInterfaceInContainer(
    container: ClabContainerTreeNode,
    ifaceName: string
  ): ClabInterfaceTreeNode | undefined {
    if (!container.interfaces) return undefined;
    const candidates = this.getCandidateInterfaceNames(ifaceName);
    for (const iface of container.interfaces) {
      const labelStr = this.treeItemLabelToString(iface.label);
      if (candidates.includes(iface.name) || candidates.includes(iface.alias) || (labelStr && candidates.includes(labelStr))) {
        return iface;
      }
    }
    return undefined;
  }

  private getCandidateInterfaceNames(ifaceName: string): string[] {
    const unique = new Set<string>();
    if (ifaceName) {
      unique.add(ifaceName);
    }
    const mapped = this.mapSrosInterfaceName(ifaceName);
    if (mapped) {
      unique.add(mapped);
    }
    return Array.from(unique);
  }

  private mapSrosInterfaceName(ifaceName: string): string | undefined {
    if (!ifaceName) return undefined;
    const trimmed = ifaceName.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('eth')) {
      return trimmed;
    }
    const regex = /^(\d+)\/(?:x(\d+)\/)?(\d+)(?:\/c(\d+))?\/(\d+)$/;
    const res = regex.exec(trimmed);
    if (!res) {
      return undefined;
    }
    const [, card, xiom, mda, connector, port] = res;
    if (!card || !mda || !port) {
      return undefined;
    }
    if (xiom && connector) {
      return `e${card}-x${xiom}-${mda}-c${connector}-${port}`;
    }
    if (xiom) {
      return `e${card}-x${xiom}-${mda}-${port}`;
    }
    if (connector) {
      return `e${card}-${mda}-c${connector}-${port}`;
    }
    return `e${card}-${mda}-${port}`;
  }

  private treeItemLabelToString(label: string | vscode.TreeItemLabel | undefined): string {
    if (!label) {
      return '';
    }
    if (typeof label === 'string') {
      return label;
    }
    return label.label ?? '';
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
    const sourceIsSpecial = this.isSpecialNode(sourceNodeData, sourceNode);
    const targetIsSpecial = this.isSpecialNode(targetNodeData, targetNode);
    if (sourceIsSpecial || targetIsSpecial) {
      return this.edgeClassForSpecial(sourceIsSpecial, targetIsSpecial, sourceIfaceData, targetIfaceData);
    }
    if (sourceIfaceData?.state && targetIfaceData?.state) {
      return sourceIfaceData.state === 'up' && targetIfaceData.state === 'up' ? 'link-up' : 'link-down';
    }
    return '';
  }

  private isSpecialNode(nodeData: ClabNode | undefined, nodeName: string): boolean {
    return (
      nodeData?.kind === 'bridge' ||
      nodeData?.kind === 'ovs-bridge' ||
      nodeName === 'host' ||
      nodeName === 'mgmt-net' ||
      nodeName.startsWith('macvlan:') ||
      nodeName.startsWith('vxlan:') ||
      nodeName.startsWith(PREFIX_VXLAN_STITCH) ||
      nodeName.startsWith('dummy')
    );
  }

  private edgeClassForSpecial(
    sourceIsSpecial: boolean,
    targetIsSpecial: boolean,
    sourceIfaceData: any | undefined,
    targetIfaceData: any | undefined
  ): string {
    if (sourceIsSpecial && !targetIsSpecial) {
      return this.classFromState(targetIfaceData);
    }
    if (!sourceIsSpecial && targetIsSpecial) {
      return this.classFromState(sourceIfaceData);
    }
    return 'link-up';
  }

  private classFromState(ifaceData: any | undefined): string {
    if (!ifaceData?.state) return '';
    return ifaceData.state === 'up' ? 'link-up' : 'link-down';
  }

  private validateExtendedLink(linkObj: any): string[] {
    const linkType = typeof linkObj?.type === 'string' ? linkObj.type : '';
    if (!linkType) return [];

    if (linkType === 'veth') {
      return this.validateVethLink(linkObj);
    }

    if (SINGLE_ENDPOINT_TYPES.includes(linkType)) {
      return this.validateSpecialLink(linkType, linkObj);
    }

    return [];
  }

  private validateVethLink(linkObj: any): string[] {
    const eps = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
    const ok =
      eps.length >= 2 &&
      typeof eps[0] === 'object' &&
      typeof eps[1] === 'object' &&
      eps[0]?.node &&
      eps[0]?.interface !== undefined &&
      eps[1]?.node &&
      eps[1]?.interface !== undefined;
    return ok ? [] : ['invalid-veth-endpoints'];
  }

  private validateSpecialLink(linkType: string, linkObj: any): string[] {
    const errors: string[] = [];
    const ep = linkObj.endpoint;
    if (!(ep && ep.node && ep.interface !== undefined)) errors.push('invalid-endpoint');
    if (['mgmt-net', 'host', 'macvlan'].includes(linkType) && !linkObj['host-interface']) {
      errors.push('missing-host-interface');
    }
    if ([TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as any)) {
      if (!linkObj.remote) errors.push('missing-remote');
      if (linkObj.vni === undefined || linkObj.vni === '') errors.push('missing-vni');
      if (linkObj['udp-port'] === undefined || linkObj['udp-port'] === '') errors.push('missing-udp-port');
    }
    return errors;
  }

  private addEdgeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> },
    fullPrefix: string,
    clabName: string,
    specialNodes: Map<string, { type: SpecialNodeType; label: string }>,
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
      const sourceInfo = this.resolveContainerAndInterface({
        parsed,
        nodeName: sourceNode,
        actualNodeName: actualSourceNode,
        ifaceName: sourceIface,
        fullPrefix,
        clabName,
        includeContainerData: opts.includeContainerData,
        clabTreeData: opts.clabTreeData,
      });
      const targetInfo = this.resolveContainerAndInterface({
        parsed,
        nodeName: targetNode,
        actualNodeName: actualTargetNode,
        ifaceName: targetIface,
        fullPrefix,
        clabName,
        includeContainerData: opts.includeContainerData,
        clabTreeData: opts.clabTreeData,
      });
      const { containerName: sourceContainerName, ifaceData: sourceIfaceData } = sourceInfo;
      const { containerName: targetContainerName, ifaceData: targetIfaceData } = targetInfo;
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
      node.startsWith(PREFIX_MACVLAN) ||
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

    const sourceEndpoint = this.shouldOmitEndpoint(sourceNode) ? '' : sourceIface;
    const targetEndpoint = this.shouldOmitEndpoint(targetNode) ? '' : targetIface;
    const classes = this.buildEdgeClasses(edgeClass, specialNodes, actualSourceNode, actualTargetNode);
    const extValidationErrors = this.validateExtendedLink(linkObj);
    const extraData = this.buildEdgeExtraData({
      linkObj,
      endA,
      endB,
      sourceContainerName,
      targetContainerName,
      sourceIface,
      targetIface,
      sourceIfaceData,
      targetIfaceData,
      extValidationErrors,
    });

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
        extraData,
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

  private buildEdgeClasses(
    edgeClass: string,
    specialNodes: Map<string, { type: string; label: string }>,
    actualSourceNode: string,
    actualTargetNode: string
  ): string {
    const stub =
      specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode)
        ? ' stub-link'
        : '';
    return edgeClass + stub;
  }

  private buildEdgeExtraData(params: {
    linkObj: any;
    endA: any;
    endB: any;
    sourceContainerName: string;
    targetContainerName: string;
    sourceIface: string;
    targetIface: string;
    sourceIfaceData: any;
    targetIfaceData: any;
    extValidationErrors: string[];
  }): any {
    const {
      linkObj,
      endA,
      endB,
      sourceContainerName,
      targetContainerName,
      sourceIface,
      targetIface,
      sourceIfaceData,
      targetIfaceData,
      extValidationErrors,
    } = params;

    const yamlFormat = typeof linkObj?.type === 'string' && linkObj.type ? 'extended' : 'short';
    const extErrors = extValidationErrors.length ? extValidationErrors : undefined;

    const clabInfo = this.createClabInfo({
      sourceContainerName,
      targetContainerName,
      sourceIface,
      targetIface,
      sourceIfaceData,
      targetIfaceData,
    });

    const extInfo = this.createExtInfo({ linkObj, endA, endB });

    return { ...clabInfo, ...extInfo, yamlFormat, extValidationErrors: extErrors };
  }

  private createClabInfo(params: {
    sourceContainerName: string;
    targetContainerName: string;
    sourceIface: string;
    targetIface: string;
    sourceIfaceData?: any;
    targetIfaceData?: any;
  }): any {
    const {
      sourceContainerName,
      targetContainerName,
      sourceIface,
      targetIface,
      sourceIfaceData = {},
      targetIfaceData = {},
    } = params;

    const {
      mac: srcMac = '',
      state: srcState = '',
      mtu: srcMtu = '',
      type: srcType = '',
    } = sourceIfaceData;

    const {
      mac: tgtMac = '',
      state: tgtState = '',
      mtu: tgtMtu = '',
      type: tgtType = '',
    } = targetIfaceData;

    return {
      clabServerUsername: 'asad',
      clabSourceLongName: sourceContainerName,
      clabTargetLongName: targetContainerName,
      clabSourcePort: sourceIface,
      clabTargetPort: targetIface,
      clabSourceMacAddress: srcMac,
      clabTargetMacAddress: tgtMac,
      clabSourceInterfaceState: srcState,
      clabTargetInterfaceState: tgtState,
      clabSourceMtu: srcMtu,
      clabTargetMtu: tgtMtu,
      clabSourceType: srcType,
      clabTargetType: tgtType,
    };
  }

  private createExtInfo(params: { linkObj: any; endA: any; endB: any }): any {
    const { linkObj, endA, endB } = params;
    const base = this.extractExtLinkProps(linkObj);
    const macs = this.extractExtMacs(linkObj, endA, endB);
    return { ...base, ...macs };
  }

  private extractExtLinkProps(linkObj: any): any {
    const {
      type: extType = '',
      mtu: extMtu = '',
      vars: extVars,
      labels: extLabels,
      ['host-interface']: extHostInterface = '',
      mode: extMode = '',
      remote: extRemote = '',
      vni: extVni = '',
      ['udp-port']: extUdpPort = '',
    } = linkObj ?? {};

    return { extType, extMtu, extVars, extLabels, extHostInterface, extMode, extRemote, extVni, extUdpPort };
  }

  private extractExtMacs(linkObj: any, endA: any, endB: any): any {
    return {
      extSourceMac: this.extractEndpointMac(endA),
      extTargetMac: this.extractEndpointMac(endB),
      extMac: (linkObj as any)?.endpoint?.mac ?? '',
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
