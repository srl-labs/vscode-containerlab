/**
 * Hook for managing Lab Settings state
 */
import { useState, useCallback, useEffect } from 'react';
import * as YAML from 'yaml';

import type {
  LabSettings,
  PrefixType,
  IpType,
  DriverOption,
  BasicSettingsState,
  MgmtSettingsState
} from '../../components/panels/lab-settings/types';
import { isServicesInitialized, getTopologyIO } from '../../services';

/**
 * Helper to set a key in a YAMLMap at a specific position (after another key).
 * If the key already exists, it updates in place. If not, it inserts after `afterKey`.
 * If `afterKey` doesn't exist, falls back to appending at end.
 */
function setKeyAfter(
  map: YAML.YAMLMap,
  key: string,
  value: YAML.Node,
  afterKey: string
): void {
  // Check if key already exists - if so, just update it in place
  const existingIndex = map.items.findIndex(
    pair => YAML.isScalar(pair.key) && pair.key.value === key
  );
  if (existingIndex >= 0) {
    map.items[existingIndex].value = value;
    return;
  }

  // Key doesn't exist - find position to insert after afterKey
  const afterIndex = map.items.findIndex(
    pair => YAML.isScalar(pair.key) && pair.key.value === afterKey
  );

  const newPair = new YAML.Pair(new YAML.Scalar(key), value);

  if (afterIndex >= 0) {
    // Insert after the found key
    map.items.splice(afterIndex + 1, 0, newPair);
  } else {
    // Fallback: append at end
    map.items.push(newPair);
  }
}

/**
 * Helper to delete a key from a YAMLMap
 */
function deleteKey(map: YAML.YAMLMap, key: string): void {
  const index = map.items.findIndex(
    pair => YAML.isScalar(pair.key) && pair.key.value === key
  );
  if (index >= 0) {
    map.items.splice(index, 1);
  }
}

/**
 * Helper to set a key in a YAMLMap, updating in place if exists, appending if not
 */
function setKey(map: YAML.YAMLMap, key: string, value: YAML.Node): void {
  const existingIndex = map.items.findIndex(
    pair => YAML.isScalar(pair.key) && pair.key.value === key
  );
  if (existingIndex >= 0) {
    map.items[existingIndex].value = value;
  } else {
    map.items.push(new YAML.Pair(new YAML.Scalar(key), value));
  }
}

/**
 * Read lab settings directly from the YAML document via TopologyIO
 */
function readLabSettingsFromDocument(): LabSettings | undefined {
  if (!isServicesInitialized()) {
    return undefined;
  }

  const topologyIO = getTopologyIO();
  const doc = topologyIO.getDocument();
  if (!doc) {
    return undefined;
  }

  try {
    // Read name, prefix, and mgmt from root level (per clab schema)
    const name = doc.get('name') as string | undefined;
    const prefix = doc.get('prefix') as string | undefined;
    const mgmt = doc.get('mgmt') as Record<string, unknown> | undefined;

    const settings: LabSettings = {};
    if (name) settings.name = name;
    if (prefix !== undefined) settings.prefix = prefix;
    if (mgmt && typeof mgmt === 'object') {
      settings.mgmt = mgmt as LabSettings['mgmt'];
    }

    return settings;
  } catch (err) {
    console.error('[useLabSettings] Failed to read settings from document:', err);
    return undefined;
  }
}

export interface UseLabSettingsStateResult {
  basic: BasicSettingsState;
  mgmt: MgmtSettingsState;
  setBasic: {
    setLabName: (v: string) => void;
    setPrefixType: (v: PrefixType) => void;
    setCustomPrefix: (v: string) => void;
  };
  setMgmt: {
    setNetworkName: (v: string) => void;
    setIpv4Type: (v: IpType) => void;
    setIpv4Subnet: (v: string) => void;
    setIpv4Gateway: (v: string) => void;
    setIpv4Range: (v: string) => void;
    setIpv6Type: (v: IpType) => void;
    setIpv6Subnet: (v: string) => void;
    setIpv6Gateway: (v: string) => void;
    setMtu: (v: string) => void;
    setBridge: (v: string) => void;
    setExternalAccess: (v: boolean) => void;
  };
  driverOpts: {
    add: () => void;
    remove: (index: number) => void;
    update: (index: number, field: 'key' | 'value', value: string) => void;
  };
  handleSave: () => Promise<void>;
}

/** Parses prefix settings from lab settings */
function parsePrefixSettings(settings: LabSettings): Pick<BasicSettingsState, 'prefixType' | 'customPrefix'> {
  if (settings.prefix === undefined) {
    return { prefixType: 'default', customPrefix: '' };
  }
  if (settings.prefix === '') {
    return { prefixType: 'no-prefix', customPrefix: '' };
  }
  if (settings.prefix && settings.prefix !== 'clab') {
    return { prefixType: 'custom', customPrefix: settings.prefix };
  }
  return { prefixType: 'default', customPrefix: '' };
}

/** Parses IPv4 settings from mgmt settings */
function parseIpv4Settings(mgmt: LabSettings['mgmt']): Pick<MgmtSettingsState, 'ipv4Type' | 'ipv4Subnet' | 'ipv4Gateway' | 'ipv4Range'> {
  const result = { ipv4Type: 'default' as IpType, ipv4Subnet: '', ipv4Gateway: '', ipv4Range: '' };
  if (!mgmt?.['ipv4-subnet']) return result;

  if (mgmt['ipv4-subnet'] === 'auto') {
    return { ...result, ipv4Type: 'auto' };
  }
  return {
    ipv4Type: 'custom',
    ipv4Subnet: mgmt['ipv4-subnet'],
    ipv4Gateway: mgmt['ipv4-gw'] || '',
    ipv4Range: mgmt['ipv4-range'] || ''
  };
}

/** Parses IPv6 settings from mgmt settings */
function parseIpv6Settings(mgmt: LabSettings['mgmt']): Pick<MgmtSettingsState, 'ipv6Type' | 'ipv6Subnet' | 'ipv6Gateway'> {
  const result = { ipv6Type: 'default' as IpType, ipv6Subnet: '', ipv6Gateway: '' };
  if (!mgmt?.['ipv6-subnet']) return result;

  if (mgmt['ipv6-subnet'] === 'auto') {
    return { ...result, ipv6Type: 'auto' };
  }
  return {
    ipv6Type: 'custom',
    ipv6Subnet: mgmt['ipv6-subnet'],
    ipv6Gateway: mgmt['ipv6-gw'] || ''
  };
}

/** Gathers basic settings into LabSettings format */
function gatherBasicSettings(basic: BasicSettingsState): Partial<LabSettings> {
  const settings: Partial<LabSettings> = {};
  if (basic.labName) settings.name = basic.labName;

  if (basic.prefixType === 'custom') {
    settings.prefix = basic.customPrefix;
  } else if (basic.prefixType === 'no-prefix') {
    settings.prefix = '';
  } else {
    settings.prefix = null;
  }
  return settings;
}

/** Gathers IPv4 settings for mgmt */
function gatherIpv4Settings(mgmt: MgmtSettingsState): Record<string, string> {
  const result: Record<string, string> = {};
  if (mgmt.ipv4Type === 'auto') {
    result['ipv4-subnet'] = 'auto';
  } else if (mgmt.ipv4Type === 'custom' && mgmt.ipv4Subnet) {
    result['ipv4-subnet'] = mgmt.ipv4Subnet;
    if (mgmt.ipv4Gateway) result['ipv4-gw'] = mgmt.ipv4Gateway;
    if (mgmt.ipv4Range) result['ipv4-range'] = mgmt.ipv4Range;
  }
  return result;
}

/** Gathers IPv6 settings for mgmt */
function gatherIpv6Settings(mgmt: MgmtSettingsState): Record<string, string> {
  const result: Record<string, string> = {};
  if (mgmt.ipv6Type === 'auto') {
    result['ipv6-subnet'] = 'auto';
  } else if (mgmt.ipv6Type === 'custom' && mgmt.ipv6Subnet) {
    result['ipv6-subnet'] = mgmt.ipv6Subnet;
    if (mgmt.ipv6Gateway) result['ipv6-gw'] = mgmt.ipv6Gateway;
  }
  return result;
}

/** Hook for basic settings state */
function useBasicSettings(labSettings?: LabSettings) {
  const [labName, setLabName] = useState('');
  const [prefixType, setPrefixType] = useState<PrefixType>('default');
  const [customPrefix, setCustomPrefix] = useState('');

  useEffect(() => {
    // Try to read from YAML document first (source of truth), fallback to prop
    const settings = readLabSettingsFromDocument() || labSettings;
    if (!settings) return;
    setLabName(settings.name || '');
    const prefixParsed = parsePrefixSettings(settings);
    setPrefixType(prefixParsed.prefixType);
    setCustomPrefix(prefixParsed.customPrefix);
  }, [labSettings]);

  return {
    state: { labName, prefixType, customPrefix },
    setters: { setLabName, setPrefixType, setCustomPrefix }
  };
}

/** Hook for IP settings state */
function useIpSettings(labSettings?: LabSettings) {
  const [ipv4Type, setIpv4Type] = useState<IpType>('default');
  const [ipv4Subnet, setIpv4Subnet] = useState('');
  const [ipv4Gateway, setIpv4Gateway] = useState('');
  const [ipv4Range, setIpv4Range] = useState('');
  const [ipv6Type, setIpv6Type] = useState<IpType>('default');
  const [ipv6Subnet, setIpv6Subnet] = useState('');
  const [ipv6Gateway, setIpv6Gateway] = useState('');

  useEffect(() => {
    // Try to read from YAML document first (source of truth), fallback to prop
    const settings = readLabSettingsFromDocument() || labSettings;
    if (!settings?.mgmt) return;
    const ipv4 = parseIpv4Settings(settings.mgmt);
    setIpv4Type(ipv4.ipv4Type);
    setIpv4Subnet(ipv4.ipv4Subnet);
    setIpv4Gateway(ipv4.ipv4Gateway);
    setIpv4Range(ipv4.ipv4Range);
    const ipv6 = parseIpv6Settings(settings.mgmt);
    setIpv6Type(ipv6.ipv6Type);
    setIpv6Subnet(ipv6.ipv6Subnet);
    setIpv6Gateway(ipv6.ipv6Gateway);
  }, [labSettings]);

  return {
    state: { ipv4Type, ipv4Subnet, ipv4Gateway, ipv4Range, ipv6Type, ipv6Subnet, ipv6Gateway },
    setters: { setIpv4Type, setIpv4Subnet, setIpv4Gateway, setIpv4Range, setIpv6Type, setIpv6Subnet, setIpv6Gateway }
  };
}

/** Initialize other mgmt settings from labSettings */
function initOtherMgmtState(mgmt: LabSettings['mgmt']): {
  networkName: string; mtu: string; bridge: string; externalAccess: boolean; driverOptions: DriverOption[];
} {
  if (!mgmt) return { networkName: '', mtu: '', bridge: '', externalAccess: true, driverOptions: [] };
  const opts = mgmt['driver-opts'];
  return {
    networkName: mgmt.network || '',
    mtu: mgmt.mtu?.toString() || '',
    bridge: mgmt.bridge || '',
    externalAccess: mgmt['external-access'] !== false,
    driverOptions: opts ? Object.entries(opts).map(([key, value]) => ({ key, value })) : []
  };
}

/** Hook for network/mtu/bridge/external settings */
function useNetworkSettings(labSettings?: LabSettings) {
  const [networkName, setNetworkName] = useState('');
  const [mtu, setMtu] = useState('');
  const [bridge, setBridge] = useState('');
  const [externalAccess, setExternalAccess] = useState(true);

  useEffect(() => {
    // Try to read from YAML document first (source of truth), fallback to prop
    const settings = readLabSettingsFromDocument() || labSettings;
    const init = initOtherMgmtState(settings?.mgmt);
    setNetworkName(init.networkName);
    setMtu(init.mtu);
    setBridge(init.bridge);
    setExternalAccess(init.externalAccess);
  }, [labSettings]);

  return { state: { networkName, mtu, bridge, externalAccess }, setters: { setNetworkName, setMtu, setBridge, setExternalAccess } };
}

/** Hook for driver options */
function useDriverOptions(labSettings?: LabSettings) {
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);

  useEffect(() => {
    // Try to read from YAML document first (source of truth), fallback to prop
    const settings = readLabSettingsFromDocument() || labSettings;
    const init = initOtherMgmtState(settings?.mgmt);
    setDriverOptions(init.driverOptions);
  }, [labSettings]);

  const add = useCallback(() => setDriverOptions(prev => [...prev, { key: '', value: '' }]), []);
  const remove = useCallback((index: number) => setDriverOptions(prev => prev.filter((_, i) => i !== index)), []);
  const update = useCallback((index: number, field: 'key' | 'value', value: string) => {
    setDriverOptions(prev => prev.map((opt, i) => i === index ? { ...opt, [field]: value } : opt));
  }, []);

  return { driverOptions, driverOpts: { add, remove, update } };
}

/** Hook for other mgmt settings state (combined) */
function useOtherMgmtSettings(labSettings?: LabSettings) {
  const network = useNetworkSettings(labSettings);
  const driver = useDriverOptions(labSettings);

  return {
    state: { ...network.state, driverOptions: driver.driverOptions },
    setters: network.setters,
    driverOpts: driver.driverOpts
  };
}

/** Gather all mgmt settings into a single object */
function gatherMgmtSettings(mgmtState: MgmtSettingsState): Record<string, unknown> | null {
  const mgmt: Record<string, unknown> = {};
  let hasMgmtSettings = false;

  if (mgmtState.networkName) { mgmt.network = mgmtState.networkName; hasMgmtSettings = true; }

  const ipv4 = gatherIpv4Settings(mgmtState);
  if (Object.keys(ipv4).length > 0) { Object.assign(mgmt, ipv4); hasMgmtSettings = true; }

  const ipv6 = gatherIpv6Settings(mgmtState);
  if (Object.keys(ipv6).length > 0) { Object.assign(mgmt, ipv6); hasMgmtSettings = true; }

  if (mgmtState.mtu) { mgmt.mtu = parseInt(mgmtState.mtu); hasMgmtSettings = true; }
  if (mgmtState.bridge) { mgmt.bridge = mgmtState.bridge; hasMgmtSettings = true; }
  if (!mgmtState.externalAccess) { mgmt['external-access'] = false; hasMgmtSettings = true; }

  const driverOpts: Record<string, string> = {};
  mgmtState.driverOptions.forEach(opt => { if (opt.key && opt.value) driverOpts[opt.key] = opt.value; });
  if (Object.keys(driverOpts).length > 0) { mgmt['driver-opts'] = driverOpts; hasMgmtSettings = true; }

  return hasMgmtSettings ? mgmt : null;
}

export function useLabSettingsState(labSettings?: LabSettings): UseLabSettingsStateResult {
  const basic = useBasicSettings(labSettings);
  const ip = useIpSettings(labSettings);
  const other = useOtherMgmtSettings(labSettings);

  const handleSave = useCallback(async () => {
    if (!isServicesInitialized()) {
      console.warn('[useLabSettings] Services not initialized, cannot save settings');
      return;
    }

    const topologyIO = getTopologyIO();
    const doc = topologyIO.getDocument();
    if (!doc) {
      console.warn('[useLabSettings] No YAML document available, cannot save settings');
      return;
    }

    try {
      // Get the root map (doc.contents) for all settings (name, prefix, mgmt are all root-level per clab schema)
      const rootMap = doc.contents as YAML.YAMLMap | undefined;
      if (!rootMap || !YAML.isMap(rootMap)) {
        console.error('[useLabSettings] Document root is not a map');
        return;
      }

      // Gather all settings
      const settings = gatherBasicSettings(basic.state);
      const mgmtState: MgmtSettingsState = {
        ...other.state,
        ...ip.state
      };
      const mgmtSettings = gatherMgmtSettings(mgmtState);

      // Update lab name at ROOT level (in place if exists)
      if (settings.name !== undefined) {
        setKey(rootMap, 'name', doc.createNode(settings.name));
      }

      // Update prefix at ROOT level - insert after 'name' for proper ordering
      if (settings.prefix !== undefined) {
        if (settings.prefix === null) {
          // Remove prefix key to use default
          deleteKey(rootMap, 'prefix');
        } else {
          // Insert prefix after 'name' for proper YAML ordering
          setKeyAfter(rootMap, 'prefix', doc.createNode(settings.prefix), 'name');
        }
      }

      // Update mgmt settings at ROOT level (per clab schema: name, prefix, mgmt, topology)
      // Insert after 'prefix' if it exists, otherwise after 'name'
      if (mgmtSettings === null) {
        // Remove mgmt section if no settings
        deleteKey(rootMap, 'mgmt');
      } else {
        // Create a new mgmt map with all settings
        const mgmtMap = doc.createNode(mgmtSettings) as YAML.YAMLMap;
        // Determine where to insert: after 'prefix' if exists, otherwise after 'name'
        const hasPrefixKey = rootMap.items.some(
          pair => YAML.isScalar(pair.key) && pair.key.value === 'prefix'
        );
        const afterKey = hasPrefixKey ? 'prefix' : 'name';
        setKeyAfter(rootMap, 'mgmt', mgmtMap, afterKey);
      }

      // Save the document
      await topologyIO.save();
    } catch (err) {
      console.error('[useLabSettings] Failed to save lab settings:', err);
    }
  }, [basic.state, ip.state, other.state]);

  return {
    basic: basic.state,
    mgmt: { ...other.state, ...ip.state },
    setBasic: basic.setters,
    setMgmt: { ...other.setters, ...ip.setters },
    driverOpts: other.driverOpts,
    handleSave
  };
}
