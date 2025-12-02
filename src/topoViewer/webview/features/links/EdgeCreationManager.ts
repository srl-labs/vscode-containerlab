// file: EdgeCreationManager.ts
// Manages edge/link creation via edgehandles extension

import type cytoscape from "cytoscape";
import { loadExtension } from "../canvas/CytoscapeFactory";
import { log } from "../../platform/logging/logger";
import { isSpecialNodeOrBridge, isSpecialEndpoint } from "../../../shared/utilities/SpecialNodes";
import {
  DEFAULT_INTERFACE_PATTERN,
  generateInterfaceName,
  getInterfaceIndex,
  parseInterfacePattern
} from "../../ui/InterfacePatternUtils";
import type { EdgeData } from "../../../shared/types/topoViewerGraph";

export interface EdgeCreationDependencies {
  cy: cytoscape.Core;
}

export class EdgeCreationManager {
  private static readonly KIND_BRIDGE = "bridge" as const;
  private static readonly KIND_OVS_BRIDGE = "ovs-bridge" as const;

  private cy: cytoscape.Core;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private interfaceCounters: Record<string, number> = {};
  private interfacePatternCache: Map<string, ReturnType<typeof parseInterfacePattern>> = new Map();
  private loggedBridgeAliasGroups: Set<string> = new Set();

  constructor(deps: EdgeCreationDependencies) {
    this.cy = deps.cy;
  }

  public isActive(): boolean {
    return this.isEdgeHandlerActive;
  }

  public setActive(active: boolean): void {
    this.isEdgeHandlerActive = active;
  }

  public async initialize(): Promise<void> {
    this.interfaceCounters = {};
    await loadExtension("edgehandles");
    const edgehandlesOptions = {
      hoverDelay: 50,
      snap: false,
      snapThreshold: 10,
      snapFrequency: 150,
      noEdgeEventsInDraw: false,
      disableBrowserGestures: false,
      handleNodes: 'node[topoViewerRole != "freeText"]',
      canConnect: (
        sourceNode: cytoscape.NodeSingular,
        targetNode: cytoscape.NodeSingular
      ): boolean => {
        const sourceRole = sourceNode.data("topoViewerRole");
        const targetRole = targetNode.data("topoViewerRole");
        return (
          sourceRole !== "freeText" &&
          targetRole !== "freeText" &&
          !sourceNode.same(targetNode) &&
          !sourceNode.isParent() &&
          !targetNode.isParent() &&
          targetRole !== "group"
        );
      },
      edgeParams: (
        sourceNode: cytoscape.NodeSingular,
        targetNode: cytoscape.NodeSingular
      ): EdgeData => {
        const ifaceMap = window.ifacePatternMapping || {};
        const srcPattern = this.resolveInterfacePattern(sourceNode, ifaceMap);
        const dstPattern = this.resolveInterfacePattern(targetNode, ifaceMap);
        const srcParsed = this.getParsedInterfacePattern(srcPattern);
        const dstParsed = this.getParsedInterfacePattern(dstPattern);

        const srcIndex = this.interfaceCounters[sourceNode.id()] ?? 0;
        const dstIndex = this.interfaceCounters[targetNode.id()] ?? 0;

        const sourceEndpoint = generateInterfaceName(srcParsed, srcIndex);
        const targetEndpoint = generateInterfaceName(dstParsed, dstIndex);

        this.interfaceCounters[sourceNode.id()] = srcIndex + 1;
        this.interfaceCounters[targetNode.id()] = dstIndex + 1;

        return {
          id: `${sourceNode.id()}-${targetNode.id()}`,
          source: sourceNode.id(),
          target: targetNode.id(),
          sourceEndpoint,
          targetEndpoint
        };
      }
    };

    this.eh = (this.cy as any).edgehandles(edgehandlesOptions);
    this.eh.enable();
    this.isEdgeHandlerActive = false;
  }

  public toggle(enable: boolean): void {
    if (!this.eh) {
      if (enable) {
        void this.initialize();
      }
      return;
    }
    if (enable) {
      this.eh.enable();
    } else {
      this.eh.disable();
      this.isEdgeHandlerActive = false;
    }
  }

  public async ensureReady(): Promise<void> {
    if (!this.eh) {
      await this.initialize();
      return;
    }
    if (typeof this.eh.enable === "function") {
      this.eh.enable();
    }
  }

  public async startFromNode(node: cytoscape.NodeSingular): Promise<void> {
    await this.ensureReady();
    if (!this.eh) {
      log.error("Edgehandles is not available; unable to start edge creation.");
      return;
    }
    this.isEdgeHandlerActive = true;
    this.eh.start(node);
  }

  public registerLifecycleEvents(): void {
    this.cy.on("ehstart", () => {
      this.isEdgeHandlerActive = true;
    });
    this.cy.on("ehstop ehcancel", () => {
      this.isEdgeHandlerActive = false;
    });
  }

  public handleEdgeCreation(
    sourceNode: cytoscape.NodeSingular,
    targetNode: cytoscape.NodeSingular,
    addedEdge: cytoscape.EdgeSingular
  ): void {
    log.debug(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
    log.debug(`Added edge: ${addedEdge.id()}`);
    setTimeout(() => {
      this.isEdgeHandlerActive = false;
    }, 100);
    const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
    const targetEndpoint = this.getNextEndpoint(targetNode.id());
    const edgeData: any = { sourceEndpoint, targetEndpoint, editor: "true" };
    this.addNetworkEdgeProperties(sourceNode, targetNode, addedEdge, edgeData);
    addedEdge.data(edgeData);
  }

  public getNextEndpoint(nodeId: string): string {
    if (isSpecialEndpoint(nodeId)) {
      return "";
    }

    const ifaceMap = window.ifacePatternMapping || {};
    const node = this.cy.getElementById(nodeId);
    const pattern = this.resolveInterfacePattern(node, ifaceMap);
    const parsedPattern = this.getParsedInterfacePattern(pattern);

    const usedIndices = new Set<number>();
    const isBridgeNode = this.isBridgeNode(node);
    const memberIds = isBridgeNode ? this.getBridgeGroupMemberIds(nodeId) : [nodeId];
    this.collectUsedIndices(memberIds, parsedPattern, usedIndices);

    let nextIndex = 0;
    while (usedIndices.has(nextIndex)) {
      nextIndex++;
    }

    return generateInterfaceName(parsedPattern, nextIndex);
  }

  public isNetworkNode(nodeId: string): boolean {
    if (isSpecialNodeOrBridge(nodeId, this.cy)) {
      return true;
    }
    const node = this.cy.getElementById(nodeId);
    const kind = node.data("extraData")?.kind;
    return (
      kind === EdgeCreationManager.KIND_BRIDGE || kind === EdgeCreationManager.KIND_OVS_BRIDGE
    );
  }

  private getParsedInterfacePattern(
    pattern: string
  ): ReturnType<typeof parseInterfacePattern> {
    const key = (pattern || DEFAULT_INTERFACE_PATTERN).trim() || DEFAULT_INTERFACE_PATTERN;
    let parsed = this.interfacePatternCache.get(key);
    if (!parsed) {
      parsed = parseInterfacePattern(key);
      this.interfacePatternCache.set(key, parsed);
    }
    return parsed;
  }

  private resolveInterfacePattern(
    node: cytoscape.NodeSingular | undefined,
    ifaceMap: Record<string, string>
  ): string {
    const hasNode = node && !node.empty();
    const extraData = hasNode
      ? (node!.data("extraData") as { interfacePattern?: unknown; kind?: unknown } | undefined)
      : undefined;
    const customPattern =
      typeof extraData?.interfacePattern === "string" ? extraData.interfacePattern.trim() : "";
    if (customPattern) {
      return customPattern;
    }
    const kind =
      typeof extraData?.kind === "string" && extraData.kind
        ? (extraData.kind as string)
        : "default";
    return ifaceMap[kind] || DEFAULT_INTERFACE_PATTERN;
  }

  private addNetworkEdgeProperties(
    sourceNode: cytoscape.NodeSingular,
    targetNode: cytoscape.NodeSingular,
    addedEdge: cytoscape.EdgeSingular,
    edgeData: any
  ): void {
    const sourceIsNetwork = this.isNetworkNode(sourceNode.id());
    const targetIsNetwork = this.isNetworkNode(targetNode.id());
    if (!(sourceIsNetwork || targetIsNetwork)) {
      return;
    }
    addedEdge.addClass("stub-link");
    const networkNode = sourceIsNetwork ? sourceNode : targetNode;
    const networkData = networkNode.data();
    const networkType = networkData.extraData?.kind || networkNode.id().split(":")[0];
    const extra = networkData.extraData || {};
    const extData = this.collectNetworkExtraData(networkType, extra, sourceIsNetwork);
    if (Object.keys(extData).length > 0) {
      edgeData.extraData = extData;
    }
  }

  private collectNetworkExtraData(
    networkType: string,
    extra: any,
    sourceIsNetwork: boolean
  ): Record<string, any> {
    const extData: Record<string, any> = {};
    const assignIf = (key: string, value: any) => {
      if (value !== undefined) {
        extData[key] = value;
      }
    };
    if (
      networkType !== EdgeCreationManager.KIND_BRIDGE &&
      networkType !== EdgeCreationManager.KIND_OVS_BRIDGE
    ) {
      extData.extType = networkType;
    }
    assignIf(sourceIsNetwork ? "extSourceMac" : "extTargetMac", extra.extMac);
    assignIf("extMtu", extra.extMtu);
    assignIf("extVars", extra.extVars);
    assignIf("extLabels", extra.extLabels);
    if (["host", "mgmt-net", "macvlan"].includes(networkType)) {
      assignIf("extHostInterface", extra.extHostInterface);
    }
    if (networkType === "macvlan") {
      assignIf("extMode", extra.extMode);
    }
    if (["vxlan", "vxlan-stitch"].includes(networkType)) {
      assignIf("extRemote", extra.extRemote);
      assignIf("extVni", extra.extVni);
      assignIf("extUdpPort", extra.extUdpPort);
    }
    return extData;
  }

  private getBridgeGroupMemberIds(nodeId: string): string[] {
    const node = this.cy.getElementById(nodeId);
    if (!node || (node as any).empty?.()) return [nodeId];
    if (!this.isBridgeNode(node)) return [nodeId];

    const baseYamlId = this.getBaseYamlIdForNode(node) || nodeId;
    const members = this.listBridgeMembersForYaml(baseYamlId);
    if (members.length > 1 && !this.loggedBridgeAliasGroups.has(baseYamlId)) {
      this.loggedBridgeAliasGroups.add(baseYamlId);
      try {
        log.info(
          `Bridge alias group detected for YAML node '${baseYamlId}': members [${members.join(", ")}]`
        );
      } catch {
        // no-op if logger throws unexpectedly in webview
      }
    }
    return members.length > 0 ? members : [nodeId];
  }

  private isBridgeNode(node: cytoscape.NodeSingular): boolean {
    const kind = node.data("extraData")?.kind as string | undefined;
    return (
      kind === EdgeCreationManager.KIND_BRIDGE || kind === EdgeCreationManager.KIND_OVS_BRIDGE
    );
  }

  private getBaseYamlIdForNode(node: cytoscape.NodeSingular): string | null {
    const extra = node.data("extraData") || {};
    const ref = typeof extra.extYamlNodeId === "string" ? extra.extYamlNodeId.trim() : "";
    return ref || node.id() || null;
  }

  private listBridgeMembersForYaml(baseYamlId: string): string[] {
    const out: string[] = [];
    this.cy.nodes().forEach((n) => {
      if (!this.isBridgeNode(n)) return;
      const id = n.id();
      const ref =
        typeof n.data("extraData")?.extYamlNodeId === "string"
          ? n.data("extraData").extYamlNodeId.trim()
          : "";
      if (id === baseYamlId || (ref && ref === baseYamlId)) out.push(id);
    });
    return out;
  }

  private collectUsedIndices(
    memberIds: string[],
    parsedPattern: ReturnType<typeof parseInterfacePattern>,
    sink: Set<number>
  ): void {
    memberIds.forEach((memberId) => {
      const edges = this.cy.edges(`[source = "${memberId}"], [target = "${memberId}"]`);
      edges.forEach((edge) => {
        const src = edge.data("source");
        const tgt = edge.data("target");
        const epSrc = edge.data("sourceEndpoint");
        const epTgt = edge.data("targetEndpoint");
        if (src === memberId && epSrc) {
          const idx = getInterfaceIndex(parsedPattern, epSrc);
          if (idx !== null) sink.add(idx);
        }
        if (tgt === memberId && epTgt) {
          const idx = getInterfaceIndex(parsedPattern, epTgt);
          if (idx !== null) sink.add(idx);
        }
      });
    });
  }
}
