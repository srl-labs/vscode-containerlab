/**
 * Hook for managing Lab Settings state
 */
import { useState, useCallback, useEffect } from 'react';
import type {
  LabSettings,
  PrefixType,
  IpType,
  DriverOption,
  BasicSettingsState,
  MgmtSettingsState
} from '../../components/panels/lab-settings/types';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

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
  handleSave: () => void;
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
    if (!labSettings) return;
    setLabName(labSettings.name || '');
    const prefixParsed = parsePrefixSettings(labSettings);
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
    if (!labSettings?.mgmt) return;
    const ipv4 = parseIpv4Settings(labSettings.mgmt);
    setIpv4Type(ipv4.ipv4Type);
    setIpv4Subnet(ipv4.ipv4Subnet);
    setIpv4Gateway(ipv4.ipv4Gateway);
    setIpv4Range(ipv4.ipv4Range);
    const ipv6 = parseIpv6Settings(labSettings.mgmt);
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
    const init = initOtherMgmtState(labSettings?.mgmt);
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
    const init = initOtherMgmtState(labSettings?.mgmt);
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

  const handleSave = useCallback(() => {
    const settings = gatherBasicSettings(basic.state);
    const mgmtState: MgmtSettingsState = {
      ...other.state,
      ...ip.state
    };
    settings.mgmt = gatherMgmtSettings(mgmtState);
    sendCommandToExtension('save-lab-settings', { settings });
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
