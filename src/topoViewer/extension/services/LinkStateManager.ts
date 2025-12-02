import { ClabLabTreeNode, ClabInterfaceTreeNode } from '../../../treeView/common';
import { ClabTopology, CyElement } from '../../shared/types/topoViewerType';
import type { ClabInterfaceStats } from '../../../types/containerlab';
import { findInterfaceNode } from './TreeUtils';
import { TopoViewerAdaptorClab } from './TopologyAdapter';

/**
 * Cache structure for view mode topology data
 */
export interface ViewModeCache {
  elements: CyElement[];
  parsedTopology?: ClabTopology;
  yamlMtimeMs?: number;
}

/**
 * Manages link state updates by processing container lab inspection data
 * and generating edge updates for the webview.
 */
export class LinkStateManager {
  private adaptor: TopoViewerAdaptorClab;
  private currentLabName: string = '';

  constructor(adaptor: TopoViewerAdaptorClab) {
    this.adaptor = adaptor;
  }

  /**
   * Sets the current lab name for link state lookups
   */
  setCurrentLabName(name: string): void {
    this.currentLabName = name;
  }

  /**
   * Builds edge updates from cached topology data and fresh lab inspection data
   */
  buildEdgeUpdatesFromCache(
    cache: ViewModeCache,
    labs: Record<string, ClabLabTreeNode>
  ): CyElement[] {
    if (!cache || cache.elements.length === 0) {
      return [];
    }

    const updates: CyElement[] = [];
    const topology = cache.parsedTopology?.topology;

    for (const el of cache.elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const updated = this.refreshEdgeWithLatestData(el, labs, topology);
      if (updated) {
        updates.push(updated);
      }
    }

    return updates;
  }

  /**
   * Refreshes a single edge element with the latest data from labs inspection
   */
  private refreshEdgeWithLatestData(
    edge: CyElement,
    labs: Record<string, ClabLabTreeNode>,
    topology?: ClabTopology['topology']
  ): CyElement | null {
    if (edge.group !== 'edges') {
      return null;
    }

    const data = { ...edge.data };
    const extraData = { ...(data.extraData || {}) };

    const sourceIfaceName = this.normalizeInterfaceName(extraData.clabSourcePort, data.sourceEndpoint);
    const targetIfaceName = this.normalizeInterfaceName(extraData.clabTargetPort, data.targetEndpoint);

    const sourceIface = findInterfaceNode(
      labs,
      extraData.clabSourceLongName ?? '',
      sourceIfaceName,
      this.currentLabName
    );
    const targetIface = findInterfaceNode(
      labs,
      extraData.clabTargetLongName ?? '',
      targetIfaceName,
      this.currentLabName
    );

    const sourceState = this.applyInterfaceDetails(extraData, 'Source', sourceIface);
    const targetState = this.applyInterfaceDetails(extraData, 'Target', targetIface);

    data.extraData = extraData;

    const sourceNodeForClass = this.pickNodeId(extraData.yamlSourceNodeId, data.source);
    const targetNodeForClass = this.pickNodeId(extraData.yamlTargetNodeId, data.target);

    const stateClass =
      topology && sourceNodeForClass && targetNodeForClass
        ? this.adaptor.computeEdgeClassFromStates(
          topology,
          sourceNodeForClass,
          targetNodeForClass,
          sourceState,
          targetState
        )
        : undefined;

    const mergedClasses = this.mergeLinkStateClasses(edge.classes, stateClass);

    edge.data = data;
    if (mergedClasses !== undefined) {
      edge.classes = mergedClasses;
    }

    return edge;
  }

  /**
   * Applies interface details from inspection data to the edge's extra data
   */
  private applyInterfaceDetails(
    extraData: Record<string, any>,
    prefix: 'Source' | 'Target',
    iface: ClabInterfaceTreeNode | undefined
  ): string | undefined {
    const stateKey = prefix === 'Source' ? 'clabSourceInterfaceState' : 'clabTargetInterfaceState';
    const macKey = prefix === 'Source' ? 'clabSourceMacAddress' : 'clabTargetMacAddress';
    const mtuKey = prefix === 'Source' ? 'clabSourceMtu' : 'clabTargetMtu';
    const typeKey = prefix === 'Source' ? 'clabSourceType' : 'clabTargetType';
    const statsKey = prefix === 'Source' ? 'clabSourceStats' : 'clabTargetStats';

    if (!iface) {
      delete extraData[statsKey];
      return typeof extraData[stateKey] === 'string' ? extraData[stateKey] : undefined;
    }

    extraData[stateKey] = iface.state || '';
    extraData[macKey] = iface.mac ?? '';
    extraData[mtuKey] = iface.mtu ?? '';
    extraData[typeKey] = iface.type ?? '';

    const stats = this.extractInterfaceStatsForEdge(iface.stats);
    if (stats) {
      extraData[statsKey] = stats;
    } else {
      delete extraData[statsKey];
    }

    return iface.state;
  }

  /**
   * Extracts relevant interface statistics for edge display
   */
  private extractInterfaceStatsForEdge(stats?: ClabInterfaceStats): Record<string, number> | undefined {
    if (!stats) {
      return undefined;
    }

    const result: Record<string, number> = {};
    const keys: Array<keyof ClabInterfaceStats> = [
      'rxBps',
      'rxPps',
      'rxBytes',
      'rxPackets',
      'txBps',
      'txPps',
      'txBytes',
      'txPackets',
      'statsIntervalSeconds',
    ];

    for (const key of keys) {
      const value = stats[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Normalizes interface name, using fallback if primary is empty
   */
  private normalizeInterfaceName(value: unknown, fallback: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
    return '';
  }

  /**
   * Picks a node ID, preferring primary over fallback
   */
  private pickNodeId(primary: unknown, fallback: unknown): string {
    if (typeof primary === 'string' && primary.trim()) {
      return primary;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
    return '';
  }

  /**
   * Merges link state classes, replacing existing up/down state with new state
   */
  mergeLinkStateClasses(existing: string | undefined, stateClass: string | undefined): string | undefined {
    if (!stateClass) {
      return existing;
    }

    const tokens = (existing ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .filter(token => token !== 'link-up' && token !== 'link-down');

    tokens.unshift(stateClass);

    return tokens.join(' ');
  }
}
