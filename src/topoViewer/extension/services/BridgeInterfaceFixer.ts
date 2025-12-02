import { log } from '../../webview/platform/logging/logger';
import { KIND_BRIDGE, KIND_OVS_BRIDGE } from './NodeAnnotationUtils';

/**
 * Reference to an edge and which side (source or target) is relevant
 */
export type EdgeRef = { edge: any; side: 'source' | 'target' };

/**
 * Map from YAML node id -> interface name -> array of edge references using that interface
 */
export type UsageMap = Map<string, Map<string, EdgeRef[]>>;

/**
 * Builds a map from visual node id to YAML node id override
 */
export function buildNodeIdOverrideMap(payloadParsed: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const data = el.data || {};
    const extra = data.extraData || {};
    // Only consider explicit YAML node mappings
    if (typeof extra.extYamlNodeId === 'string' && extra.extYamlNodeId.trim()) {
      map.set(data.id, extra.extYamlNodeId.trim());
    }
  }
  return map;
}

/**
 * Applies the id override map to edge data, returning new data if changed
 */
export function applyIdOverrideToEdgeData(data: any, idOverride: Map<string, string>): any {
  if (!data) return data;
  const src = data.source;
  const tgt = data.target;
  const newSrc = idOverride.get(src) || src;
  const newTgt = idOverride.get(tgt) || tgt;
  if (newSrc === src && newTgt === tgt) return data;
  return { ...data, source: newSrc, target: newTgt };
}

/**
 * Collects the set of YAML node ids that are bridges (including alias-mapped bridges)
 */
function collectBridgeYamlIds(payloadParsed: any[]): Set<string> {
  const set = new Set<string>();
  const aliasContrib = new Set<string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const data = el.data || {};
    const extra = data.extraData || {};
    const kind = String(extra.kind || '');
    const yamlRef = typeof extra.extYamlNodeId === 'string' ? extra.extYamlNodeId.trim() : '';
    const isAlias = yamlRef && yamlRef !== data.id;
    const isBridgeKind = kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE;
    if (!isBridgeKind) continue;

    if (isAlias && yamlRef) {
      // Alias node contributes its referenced YAML id
      set.add(yamlRef);
      aliasContrib.add(yamlRef);
    } else {
      // Base bridge node contributes its own id
      set.add(String(data.id));
    }
  }
  if (aliasContrib.size > 0) {
    log.info(
      `Auto-fix duplicate bridge interfaces: included alias-mapped YAML ids: ${Array.from(aliasContrib).join(', ')}`,
    );
  }
  return set;
}

/**
 * Adds a usage entry to the usage map
 */
function addUsage(usage: UsageMap, yamlId: string, iface: string, ref: EdgeRef): void {
  let byIface = usage.get(yamlId);
  if (!byIface) { byIface = new Map(); usage.set(yamlId, byIface); }
  let arr = byIface.get(iface);
  if (!arr) { arr = []; byIface.set(iface, arr); }
  arr.push(ref);
}

/**
 * Collects bridge interface usage from edges
 */
function collectBridgeInterfaceUsage(
  payloadParsed: any[],
  idOverride: Map<string, string>,
  bridgeYamlIds: Set<string>,
): UsageMap {
  const usage: UsageMap = new Map();
  for (const el of payloadParsed) {
    if (el.group !== 'edges') continue;
    const d = el.data || {};
    const src = idOverride.get(d.source) || d.source;
    const tgt = idOverride.get(d.target) || d.target;
    const srcEp = d.sourceEndpoint || '';
    const tgtEp = d.targetEndpoint || '';
    if (bridgeYamlIds.has(src) && srcEp) addUsage(usage, src, srcEp, { edge: el, side: 'source' });
    if (bridgeYamlIds.has(tgt) && tgtEp) addUsage(usage, tgt, tgtEp, { edge: el, side: 'target' });
  }
  return usage;
}

/**
 * Finds the next free ethN interface name
 */
function nextFreeEth(used: Set<string>): string {
  // Find the next ethN not in used
  let n = 1;
  // Try to start from the current max if available
  const max = Array.from(used)
    .map(v => (v.startsWith('eth') ? parseInt(v.slice(3), 10) : NaN))
    .filter(v => Number.isFinite(v)) as number[];
  if (max.length > 0) n = Math.max(...max) + 1;
  while (used.has(`eth${n}`)) n++;
  return `eth${n}`;
}

/**
 * Applies a new interface name to an edge reference
 */
function applyNewIface(ref: EdgeRef, newIface: string): void {
  const d = ref.edge?.data || {};
  if (ref.side === 'source') d.sourceEndpoint = newIface;
  else d.targetEndpoint = newIface;
  ref.edge.data = d;
}

/**
 * Rewrites duplicate interfaces to unique names
 */
function rewriteDuplicateInterfaces(usage: UsageMap): void {
  for (const [yamlId, byIface] of usage) {
    const used = new Set<string>(Array.from(byIface.keys()));
    for (const [iface, refs] of byIface) {
      if (!refs || refs.length <= 1) continue;
      const reassign: string[] = [];
      // Keep first as-is; reassign the rest
      for (let i = 1; i < refs.length; i++) {
        const newName = nextFreeEth(used);
        applyNewIface(refs[i], newName);
        used.add(newName);
        reassign.push(newName);
      }
      if (reassign.length > 0) {
        log.warn(`Duplicate bridge interfaces detected on ${yamlId}:${iface} -> reassigned to ${reassign.join(', ')}`);
      }
    }
  }
}

/**
 * Auto-fixes duplicate bridge interfaces in the payload by assigning unique interface names.
 * This ensures that each interface on a bridge node is unique, allowing aliases to persist per-interface.
 */
export function autoFixDuplicateBridgeInterfaces(payloadParsed: any[]): void {
  const idOverride = buildNodeIdOverrideMap(payloadParsed);
  const bridgeYamlIds = collectBridgeYamlIds(payloadParsed);
  if (bridgeYamlIds.size === 0) return;

  const usage = collectBridgeInterfaceUsage(payloadParsed, idOverride, bridgeYamlIds);
  rewriteDuplicateInterfaces(usage);
}
