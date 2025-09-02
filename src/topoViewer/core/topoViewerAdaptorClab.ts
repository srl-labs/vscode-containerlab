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

    // Migrate graph-* labels to annotations if not already present
    if (yamlFilePath && parsed.topology?.nodes) {
      let needsSave = false;

      if (!annotations) {
        annotations = { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
      }

      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
        // Check if this node already has annotations
        const existingAnnotation = annotations.nodeAnnotations.find(na => na.id === nodeName);

        if (!existingAnnotation && nodeObj?.labels) {
          const labels = nodeObj.labels;

          // Check if any graph-* labels exist
          if (labels['graph-posX'] || labels['graph-posY'] || labels['graph-icon'] ||
              labels['graph-group'] || labels['graph-level'] || labels['graph-groupLabelPos'] ||
              labels['graph-geoCoordinateLat'] || labels['graph-geoCoordinateLng']) {

            // Create new annotation from graph-* labels
            const newAnnotation: any = {
              id: nodeName
            };

            // Migrate position
            if (labels['graph-posX'] && labels['graph-posY']) {
              newAnnotation.position = {
                x: parseInt(labels['graph-posX'] as string, 10) || 0,
                y: parseInt(labels['graph-posY'] as string, 10) || 0
              };
            }

            // Migrate icon
            if (labels['graph-icon']) {
              newAnnotation.icon = labels['graph-icon'] as string;
            }

            // Migrate group and level
            if (labels['graph-group']) {
              newAnnotation.group = labels['graph-group'] as string;
            }
            if (labels['graph-level']) {
              newAnnotation.level = labels['graph-level'] as string;
            }

            // Migrate group label position
            if (labels['graph-groupLabelPos']) {
              newAnnotation.groupLabelPos = labels['graph-groupLabelPos'] as string;
            }

            // Migrate geo coordinates
            if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
              newAnnotation.geoCoordinates = {
                lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
                lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0
              };
            }

            annotations.nodeAnnotations.push(newAnnotation);
            needsSave = true;
            log.info(`Migrated graph-* labels for node ${nodeName} to annotations.json`);
          }
        }
      }

      // Save annotations if we migrated any labels
      if (needsSave) {
        await annotationsManager.saveAnnotations(yamlFilePath, annotations);
        log.info('Saved migrated graph-* labels to annotations.json');
      }
    }

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

    // Migrate graph-* labels to annotations if not already present (same as viewer mode)
    if (yamlFilePath && parsed.topology?.nodes) {
      let needsSave = false;

      if (!annotations) {
        annotations = { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
      }

      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
        // Check if this node already has annotations
        const existingAnnotation = annotations.nodeAnnotations.find(na => na.id === nodeName);

        if (!existingAnnotation && nodeObj?.labels) {
          const labels = nodeObj.labels;

          // Check if any graph-* labels exist
          if (labels['graph-posX'] || labels['graph-posY'] || labels['graph-icon'] ||
              labels['graph-group'] || labels['graph-level'] || labels['graph-groupLabelPos'] ||
              labels['graph-geoCoordinateLat'] || labels['graph-geoCoordinateLng']) {

            // Create new annotation from graph-* labels
            const newAnnotation: any = {
              id: nodeName
            };

            // Migrate position
            if (labels['graph-posX'] && labels['graph-posY']) {
              newAnnotation.position = {
                x: parseInt(labels['graph-posX'] as string, 10) || 0,
                y: parseInt(labels['graph-posY'] as string, 10) || 0
              };
            }

            // Migrate icon
            if (labels['graph-icon']) {
              newAnnotation.icon = labels['graph-icon'] as string;
            }

            // Migrate group and level
            if (labels['graph-group']) {
              newAnnotation.group = labels['graph-group'] as string;
            }
            if (labels['graph-level']) {
              newAnnotation.level = labels['graph-level'] as string;
            }

            // Migrate group label position
            if (labels['graph-groupLabelPos']) {
              newAnnotation.groupLabelPos = labels['graph-groupLabelPos'] as string;
            }

            // Migrate geo coordinates
            if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
              newAnnotation.geoCoordinates = {
                lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
                lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0
              };
            }

            annotations.nodeAnnotations.push(newAnnotation);
            needsSave = true;
            log.info(`Migrated graph-* labels for node ${nodeName} to annotations.json`);
          }
        }
      }

      // Save annotations if we migrated any labels
      if (needsSave) {
        await annotationsManager.saveAnnotations(yamlFilePath, annotations);
        log.info('Saved migrated graph-* labels to annotations.json');
      }
    }

    return this.buildCytoscapeElements(parsed, { includeContainerData: false, annotations });
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

  private buildCytoscapeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode>; annotations?: any }
  ): CyElement[] {
    const elements: CyElement[] = [];
    const specialNodes = new Map<string, { type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'bridge' | 'ovs-bridge' | 'dummy'; label: string }>();
    let dummyCounter = 0;
    const dummyLinkMap = new Map<any, string>(); // Map from link object to dummy ID

    function normalizeSingleTypeToSpecialId(t: string, linkObj: any): string {
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
        // Check if we've already assigned an ID to this link
        if (dummyLinkMap.has(linkObj)) {
          return dummyLinkMap.get(linkObj)!;
        }
        // Assign a new ID and remember it
        dummyCounter += 1;
        const dummyId = `dummy${dummyCounter}`;
        dummyLinkMap.set(linkObj, dummyId);
        return dummyId;
      }
      return '';
    }

    function normalizeLinkToTwoEndpoints(linkObj: any): { endA: any; endB: any; type?: string } | null {
      const t = linkObj?.type as string | undefined;
      if (t) {
        if (t === 'veth') {
          const a = linkObj?.endpoints?.[0];
          const b = linkObj?.endpoints?.[1];
          if (!a || !b) return null;
          return { endA: a, endB: b, type: t };
        }
        if ([ 'host', 'mgmt-net', 'macvlan', 'dummy', 'vxlan', 'vxlan-stitch' ].includes(t)) {
          const a = linkObj?.endpoint;
          if (!a) return null;
          const special = normalizeSingleTypeToSpecialId(t, linkObj);
          return { endA: a, endB: special, type: t };
        }
      }
      // Short format
      const a = linkObj?.endpoints?.[0];
      const b = linkObj?.endpoints?.[1];
      if (!a || !b) return null;
      return { endA: a, endB: b };
    }

    if (!parsed.topology) {
      log.warn('Parsed YAML does not contain \x27topology\x27 object.');
      return elements;
    }

    if (parsed.topology.nodes) {
      this.currentIsPresetLayout = Object.keys(parsed.topology.nodes)
        .every(nodeName => {
          const ann = opts.annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
          return ann?.position !== undefined;
        });
    }
    log.info(`######### status preset layout: ${this.currentIsPresetLayout}`);

    const clabName = parsed.name;
    let fullPrefix: string;

    if (parsed.prefix === undefined) {
      // When prefix key is not present, containerlab uses 'clab-<labName>'
      fullPrefix = `clab-${clabName}`;
    } else if (parsed.prefix === '' || parsed.prefix.trim() === '') {
      // When prefix is explicitly empty, container names are just the node names
      fullPrefix = '';
    } else {
      // When prefix has a value, container names use '<prefix>-<labName>'
      fullPrefix = `${parsed.prefix.trim()}-${clabName}`;
    }

    const parentMap = new Map<string, string | undefined>();
    let nodeIndex = 0;

    if (parsed.topology.nodes) {
      for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
        const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
        const nodeAnn = opts.annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
        const parentId = this.buildParent(mergedNode, nodeAnn);
        if (parentId) {
          if (!parentMap.has(parentId)) {
            parentMap.set(parentId, nodeAnn?.groupLabelPos);
          }
        }

        log.info(`nodeName: ${nodeName}`);
        let containerData: ClabContainerTreeNode | null = null;
        if (opts.includeContainerData) {
          const containerName = fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
          containerData = findContainerNode(
            opts.clabTreeData ?? {},
            containerName,
            clabName
          ) ?? null;
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
              // First, include all properties from the node definition
              ...mergedNode,
              // Then override with specific values we want to ensure
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

    // Add bridge nodes to specialNodes
    if (parsed.topology.nodes) {
      for (const [nodeName, nodeData] of Object.entries(parsed.topology.nodes)) {
        if (nodeData.kind === 'bridge' || nodeData.kind === 'ovs-bridge') {
          specialNodes.set(nodeName, {
            type: nodeData.kind as 'bridge' | 'ovs-bridge',
            label: nodeName
          });
        }
      }
    }

    let linkIndex = 0;
    if (parsed.topology.links) {
      // First pass: identify special endpoints
      // Additionally, collect extended properties per special network node so the Network Editor can prefill from YAML
      const specialNodeProps: Map<string, any> = new Map();
      for (const linkObj of parsed.topology.links) {
        const norm = normalizeLinkToTwoEndpoints(linkObj);
        if (!norm) continue;
        const { endA, endB } = norm;

        const { node: nodeA } = this.splitEndpoint(endA);
        const { node: nodeB } = this.splitEndpoint(endB);

        // Check for special nodes
        if (nodeA === 'host') {
          const { iface: ifaceA } = this.splitEndpoint(endA);
          specialNodes.set(`host:${ifaceA}`, { type: 'host', label: `host:${ifaceA || 'host'}` });
        } else if (nodeA === 'mgmt-net') {
          const { iface: ifaceA } = this.splitEndpoint(endA);
          specialNodes.set(`mgmt-net:${ifaceA}`, { type: 'mgmt-net', label: `mgmt-net:${ifaceA || 'mgmt-net'}` });
        } else if (nodeA.startsWith('macvlan:')) {
          const macvlanIface = nodeA.substring(8);
          specialNodes.set(nodeA, { type: 'macvlan', label: `macvlan:${macvlanIface}` });
        } else if (nodeA.startsWith('vxlan-stitch:')) {
          const name = nodeA.substring('vxlan-stitch:'.length);
          specialNodes.set(nodeA, { type: 'vxlan-stitch', label: `vxlan-stitch:${name}` });
        } else if (nodeA.startsWith('vxlan:')) {
          const name = nodeA.substring('vxlan:'.length);
          specialNodes.set(nodeA, { type: 'vxlan', label: `vxlan:${name}` });
        } else if (nodeA.startsWith('dummy')) {
          specialNodes.set(nodeA, { type: 'dummy', label: 'dummy' });
        }

        if (nodeB === 'host') {
          const { iface: ifaceB } = this.splitEndpoint(endB);
          specialNodes.set(`host:${ifaceB}`, { type: 'host', label: `host:${ifaceB || 'host'}` });
        } else if (nodeB === 'mgmt-net') {
          const { iface: ifaceB } = this.splitEndpoint(endB);
          specialNodes.set(`mgmt-net:${ifaceB}`, { type: 'mgmt-net', label: `mgmt-net:${ifaceB || 'mgmt-net'}` });
        } else if (nodeB.startsWith('macvlan:')) {
          const macvlanIface = nodeB.substring(8);
          specialNodes.set(nodeB, { type: 'macvlan', label: `macvlan:${macvlanIface}` });
        } else if (nodeB.startsWith('vxlan-stitch:')) {
          const name = nodeB.substring('vxlan-stitch:'.length);
          specialNodes.set(nodeB, { type: 'vxlan-stitch', label: `vxlan-stitch:${name}` });
        } else if (nodeB.startsWith('vxlan:')) {
          const name = nodeB.substring('vxlan:'.length);
          specialNodes.set(nodeB, { type: 'vxlan', label: `vxlan:${name}` });
        } else if (nodeB.startsWith('dummy')) {
          specialNodes.set(nodeB, { type: 'dummy', label: 'dummy' });
        }

        // Collect extended properties for special endpoints so Network Editor can load them from node.extraData
        // Determine link type (only apply for non-veth)
        const linkType = (linkObj && typeof (linkObj as any).type === 'string') ? String((linkObj as any).type) : '';
        if (linkType && linkType !== 'veth') {
          // Helper to compute the special node id used in the graph for an endpoint
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

          const idA = computeSpecialId(endA);
          const idB = computeSpecialId(endB);

          const baseProps: any = { extType: linkType };
          // Common
          if ((linkObj as any).mtu !== undefined) baseProps.extMtu = (linkObj as any).mtu;
          if ((linkObj as any).vars !== undefined) baseProps.extVars = (linkObj as any).vars;
          if ((linkObj as any).labels !== undefined) baseProps.extLabels = (linkObj as any).labels;
          // Host/mgmt-net/macvlan specifics
          if (linkType === 'host' || linkType === 'mgmt-net' || linkType === 'macvlan') {
            if ((linkObj as any)['host-interface'] !== undefined) baseProps.extHostInterface = (linkObj as any)['host-interface'];
            if (linkType === 'macvlan' && (linkObj as any).mode !== undefined) baseProps.extMode = (linkObj as any).mode;
          }
          // If endpoint has a MAC in single-endpoint schema, expose it as extMac for any non-veth type
          const epMac = (linkObj as any)?.endpoint?.mac;
          if (epMac !== undefined) baseProps.extMac = epMac;
          // VXLAN specifics
          if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
            if ((linkObj as any).remote !== undefined) baseProps.extRemote = (linkObj as any).remote;
            if ((linkObj as any).vni !== undefined) baseProps.extVni = (linkObj as any).vni;
            if ((linkObj as any)['udp-port'] !== undefined) baseProps.extUdpPort = (linkObj as any)['udp-port'];
          }

          // Merge props into both sides if they are special endpoints
          [idA, idB].forEach(id => {
            if (!id) return;
            const prev = specialNodeProps.get(id) || {};
            // Shallow merge without overwriting already defined keys
            const merged: any = { ...baseProps };
            for (const k of Object.keys(prev)) {
              if (prev[k] !== undefined) merged[k] = prev[k];
            }
            specialNodeProps.set(id, { ...prev, ...merged });
          });
        }
      }

      // Add cloud nodes for special endpoints
      for (const [nodeId, nodeInfo] of specialNodes) {
        // Look for saved position in annotations
        let position = { x: 0, y: 0 };
        let parent: string | undefined;
        if (opts.annotations?.cloudNodeAnnotations) {
          const savedCloudNode = opts.annotations.cloudNodeAnnotations.find((cn: any) => cn.id === nodeId);
          if (savedCloudNode) {
            if (savedCloudNode.position) {
              position = savedCloudNode.position;
            }
            if (savedCloudNode.group && savedCloudNode.level) {
              parent = `${savedCloudNode.group}:${savedCloudNode.level}`;
            }
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
              // Merge in extended properties derived from YAML links for this special endpoint
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

      // Second pass: create edges
      for (const linkObj of parsed.topology.links) {
        const norm = normalizeLinkToTwoEndpoints(linkObj);
        if (!norm) {
          log.warn('Link does not have both endpoints. Skipping.');
          continue;
        }
        const { endA, endB } = norm;

        const { node: sourceNode, iface: sourceIface } = this.splitEndpoint(endA);
        const { node: targetNode, iface: targetIface } = this.splitEndpoint(endB);

        // Handle special endpoints
        let actualSourceNode = sourceNode;
        let actualTargetNode = targetNode;

        if (sourceNode === 'host') {
          actualSourceNode = `host:${sourceIface}`;
        } else if (sourceNode === 'mgmt-net') {
          actualSourceNode = `mgmt-net:${sourceIface}`;
        } else if (sourceNode.startsWith('macvlan:')) {
          actualSourceNode = sourceNode;
        } else if (sourceNode.startsWith('vxlan-stitch:')) {
          actualSourceNode = sourceNode;
        } else if (sourceNode.startsWith('vxlan:')) {
          actualSourceNode = sourceNode;
        } else if (sourceNode.startsWith('dummy')) {
          actualSourceNode = sourceNode;
        }

        if (targetNode === 'host') {
          actualTargetNode = `host:${targetIface}`;
        } else if (targetNode === 'mgmt-net') {
          actualTargetNode = `mgmt-net:${targetIface}`;
        } else if (targetNode.startsWith('macvlan:')) {
          actualTargetNode = targetNode;
        } else if (targetNode.startsWith('vxlan-stitch:')) {
          actualTargetNode = targetNode;
        } else if (targetNode.startsWith('vxlan:')) {
          actualTargetNode = targetNode;
        } else if (targetNode.startsWith('dummy')) {
          actualTargetNode = targetNode;
        }

        const sourceContainerName = (sourceNode === 'host' || sourceNode === 'mgmt-net' || sourceNode.startsWith('macvlan:') || sourceNode.startsWith('vxlan:') || sourceNode.startsWith('vxlan-stitch:') || sourceNode.startsWith('dummy'))
          ? actualSourceNode
          : (fullPrefix ? `${fullPrefix}-${sourceNode}` : sourceNode);
        const targetContainerName = (targetNode === 'host' || targetNode === 'mgmt-net' || targetNode.startsWith('macvlan:') || targetNode.startsWith('vxlan:') || targetNode.startsWith('vxlan-stitch:') || targetNode.startsWith('dummy'))
          ? actualTargetNode
          : (fullPrefix ? `${fullPrefix}-${targetNode}` : targetNode);
        // Get interface data (might be undefined in editor mode)
        const sourceIfaceData = opts.includeContainerData ? findInterfaceNode(
          opts.clabTreeData ?? {},
          sourceContainerName,
          sourceIface,
          clabName
        ) : undefined;
        const targetIfaceData = opts.includeContainerData ? findInterfaceNode(
          opts.clabTreeData ?? {},
          targetContainerName,
          targetIface,
          clabName
        ) : undefined;

        const edgeId = `Clab-Link${linkIndex}`;
        let edgeClass = '';

        // Only apply link state colors in viewer mode (when includeContainerData is true)
        if (opts.includeContainerData) {
          // Check if either node is a special network endpoint (bridge, host, mgmt-net, macvlan)
          const sourceNodeData = parsed.topology.nodes?.[sourceNode];
          const targetNodeData = parsed.topology.nodes?.[targetNode];

          // Check for all types of special endpoints
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
            // For special network connections, only check the non-special side
            if (sourceIsSpecial && !targetIsSpecial) {
              // Source is special network, check target state only
              // Only set link state if we have actual interface data
              if (targetIfaceData?.state) {
                edgeClass = targetIfaceData.state === 'up' ? 'link-up' : 'link-down';
              }
            } else if (!sourceIsSpecial && targetIsSpecial) {
              // Target is special network, check source state only
              // Only set link state if we have actual interface data
              if (sourceIfaceData?.state) {
                edgeClass = sourceIfaceData.state === 'up' ? 'link-up' : 'link-down';
              }
            } else if (sourceIsSpecial && targetIsSpecial) {
              // Both are special networks, assume up
              edgeClass = 'link-up';
            }
          } else if (sourceIfaceData?.state && targetIfaceData?.state) {
            // Normal link - both sides must be up
            edgeClass =
              sourceIfaceData.state === 'up' && targetIfaceData.state === 'up'
                ? 'link-up'
                : 'link-down';
          }
        }
        // In editor mode (includeContainerData = false), edgeClass remains empty string, resulting in gray links
        // Per-type validation for extended links
        const extValidationErrors: string[] = [];
        const linkType = (linkObj && typeof linkObj.type === 'string') ? (linkObj.type as string) : '';
        if (linkType) {
          if (linkType === 'veth') {
            const eps = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
            const ok = eps.length >= 2 && typeof eps[0] === 'object' && typeof eps[1] === 'object' &&
              eps[0]?.node && (eps[0]?.interface !== undefined) && eps[1]?.node && (eps[1]?.interface !== undefined);
            if (!ok) extValidationErrors.push('invalid-veth-endpoints');
          } else if (['mgmt-net','host','macvlan','dummy','vxlan','vxlan-stitch'].includes(linkType)) {
            const ep = linkObj.endpoint;
            const okEp = ep && ep.node && (ep.interface !== undefined);
            if (!okEp) extValidationErrors.push('invalid-endpoint');
            if (linkType === 'mgmt-net' || linkType === 'host' || linkType === 'macvlan') {
              if (!linkObj['host-interface']) extValidationErrors.push('missing-host-interface');
            }
            if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
              if (!linkObj.remote) extValidationErrors.push('missing-remote');
              if (linkObj.vni === undefined || linkObj.vni === '') extValidationErrors.push('missing-vni');
              if (linkObj['udp-port'] === undefined || linkObj['udp-port'] === '') extValidationErrors.push('missing-udp-port');
            }
          }
        }

        const edgeEl: CyElement = {
          group: 'edges',
          data: {
            id: edgeId,
            weight: '3',
            name: edgeId,
            parent: '',
            topoViewerRole: 'link',
            sourceEndpoint: (sourceNode === 'host' || sourceNode === 'mgmt-net' || sourceNode.startsWith('macvlan:') || sourceNode.startsWith('dummy')) ? '' : sourceIface,
            targetEndpoint: (targetNode === 'host' || targetNode === 'mgmt-net' || targetNode.startsWith('macvlan:') || targetNode.startsWith('dummy')) ? '' : targetIface,
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
            // Extended link fields (when present in YAML)
            extType: linkObj?.type ?? '',
            extMtu: linkObj?.mtu ?? '',
            extVars: linkObj?.vars ?? undefined,
            extLabels: linkObj?.labels ?? undefined,
            extHostInterface: linkObj?.['host-interface'] ?? '',
            extMode: linkObj?.mode ?? '',
            extRemote: linkObj?.remote ?? '',
            extVni: linkObj?.vni ?? '',
            extUdpPort: linkObj?.['udp-port'] ?? '',
            extSourceMac: (typeof endA === 'object' && endA !== null) ? (endA as any)?.mac ?? '' : '',
            extTargetMac: (typeof endB === 'object' && endB !== null) ? (endB as any)?.mac ?? '' : '',
            // Single-endpoint extended schema MAC
            extMac: (linkObj as any)?.endpoint?.mac ?? '',
            yamlFormat: (typeof (linkObj as any)?.type === 'string' && (linkObj as any).type) ? 'extended' : 'short',
            extValidationErrors: extValidationErrors.length ? extValidationErrors : undefined,
          },
          },
          position: { x: 0, y: 0 },
          removed: false,
          selected: false,
          selectable: true,
          locked: false,
          grabbed: false,
          grabbable: true,
          classes: edgeClass + (specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode) ? ' stub-link' : ''),
        };
        elements.push(edgeEl);
        linkIndex++;
      }
    }

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);
    return elements;
  }

}
