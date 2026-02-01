/**
 * Hook for managing Lab Settings state (host-authoritative).
 */
import { useState, useCallback, useEffect } from "react";

import type {
  LabSettings,
  PrefixType,
  IpType,
  DriverOption,
  BasicSettingsState,
  MgmtSettingsState
} from "../../components/panels/lab-settings/types";
import { executeTopologyCommand } from "../../services";

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
    update: (index: number, field: "key" | "value", value: string) => void;
  };
  handleSave: () => Promise<void>;
}

/** Parses prefix settings from lab settings */
function parsePrefixSettings(
  settings?: LabSettings
): Pick<BasicSettingsState, "prefixType" | "customPrefix"> {
  if (!settings || settings.prefix === undefined) {
    return { prefixType: "default", customPrefix: "" };
  }
  if (settings.prefix === "") {
    return { prefixType: "no-prefix", customPrefix: "" };
  }
  if (settings.prefix && settings.prefix !== "clab") {
    return { prefixType: "custom", customPrefix: settings.prefix };
  }
  return { prefixType: "default", customPrefix: "" };
}

function parseIpv4Settings(
  mgmt?: LabSettings["mgmt"]
): Pick<MgmtSettingsState, "ipv4Type" | "ipv4Subnet" | "ipv4Gateway" | "ipv4Range"> {
  const result = { ipv4Type: "default" as IpType, ipv4Subnet: "", ipv4Gateway: "", ipv4Range: "" };
  if (!mgmt?.["ipv4-subnet"]) return result;

  if (mgmt["ipv4-subnet"] === "auto") {
    return { ...result, ipv4Type: "auto" };
  }
  return {
    ipv4Type: "custom",
    ipv4Subnet: mgmt["ipv4-subnet"],
    ipv4Gateway: mgmt["ipv4-gw"] || "",
    ipv4Range: mgmt["ipv4-range"] || ""
  };
}

function parseIpv6Settings(
  mgmt?: LabSettings["mgmt"]
): Pick<MgmtSettingsState, "ipv6Type" | "ipv6Subnet" | "ipv6Gateway"> {
  const result = { ipv6Type: "default" as IpType, ipv6Subnet: "", ipv6Gateway: "" };
  if (!mgmt?.["ipv6-subnet"]) return result;

  if (mgmt["ipv6-subnet"] === "auto") {
    return { ...result, ipv6Type: "auto" };
  }
  return {
    ipv6Type: "custom",
    ipv6Subnet: mgmt["ipv6-subnet"],
    ipv6Gateway: mgmt["ipv6-gw"] || ""
  };
}

function parseDriverOptions(mgmt?: LabSettings["mgmt"]): DriverOption[] {
  const opts = mgmt?.["driver-opts"];
  if (!opts) return [];
  return Object.entries(opts).map(([key, value]) => ({ key, value }));
}

function buildBasicSettings(basic: BasicSettingsState): Partial<LabSettings> {
  const settings: Partial<LabSettings> = {};
  if (basic.labName) settings.name = basic.labName;

  if (basic.prefixType === "custom") {
    settings.prefix = basic.customPrefix;
  } else if (basic.prefixType === "no-prefix") {
    settings.prefix = "";
  } else {
    settings.prefix = null;
  }
  return settings;
}

function gatherIpv4Settings(mgmtState: MgmtSettingsState): Record<string, unknown> {
  const ipv4: Record<string, unknown> = {};
  if (mgmtState.ipv4Type === "auto") {
    ipv4["ipv4-subnet"] = "auto";
    return ipv4;
  }
  if (mgmtState.ipv4Type === "custom") {
    if (mgmtState.ipv4Subnet) ipv4["ipv4-subnet"] = mgmtState.ipv4Subnet;
    if (mgmtState.ipv4Gateway) ipv4["ipv4-gw"] = mgmtState.ipv4Gateway;
    if (mgmtState.ipv4Range) ipv4["ipv4-range"] = mgmtState.ipv4Range;
  }
  return ipv4;
}

function gatherIpv6Settings(mgmtState: MgmtSettingsState): Record<string, unknown> {
  const ipv6: Record<string, unknown> = {};
  if (mgmtState.ipv6Type === "auto") {
    ipv6["ipv6-subnet"] = "auto";
    return ipv6;
  }
  if (mgmtState.ipv6Type === "custom") {
    if (mgmtState.ipv6Subnet) ipv6["ipv6-subnet"] = mgmtState.ipv6Subnet;
    if (mgmtState.ipv6Gateway) ipv6["ipv6-gw"] = mgmtState.ipv6Gateway;
  }
  return ipv6;
}

function gatherMgmtSettings(mgmtState: MgmtSettingsState): Record<string, unknown> | null {
  const mgmt: Record<string, unknown> = {};
  let hasMgmtSettings = false;

  if (mgmtState.networkName) {
    mgmt.network = mgmtState.networkName;
    hasMgmtSettings = true;
  }

  const ipv4 = gatherIpv4Settings(mgmtState);
  if (Object.keys(ipv4).length > 0) {
    Object.assign(mgmt, ipv4);
    hasMgmtSettings = true;
  }

  const ipv6 = gatherIpv6Settings(mgmtState);
  if (Object.keys(ipv6).length > 0) {
    Object.assign(mgmt, ipv6);
    hasMgmtSettings = true;
  }

  if (mgmtState.mtu) {
    mgmt.mtu = parseInt(mgmtState.mtu, 10);
    hasMgmtSettings = true;
  }
  if (mgmtState.bridge) {
    mgmt.bridge = mgmtState.bridge;
    hasMgmtSettings = true;
  }
  if (!mgmtState.externalAccess) {
    mgmt["external-access"] = false;
    hasMgmtSettings = true;
  }

  const driverOpts: Record<string, string> = {};
  mgmtState.driverOptions.forEach((opt) => {
    if (opt.key && opt.value) driverOpts[opt.key] = opt.value;
  });
  if (Object.keys(driverOpts).length > 0) {
    mgmt["driver-opts"] = driverOpts;
    hasMgmtSettings = true;
  }

  return hasMgmtSettings ? mgmt : null;
}

function buildInitialBasic(settings?: LabSettings): BasicSettingsState {
  const prefix = parsePrefixSettings(settings);
  return {
    labName: settings?.name ?? "",
    prefixType: prefix.prefixType,
    customPrefix: prefix.customPrefix
  };
}

function buildInitialMgmt(settings?: LabSettings): MgmtSettingsState {
  const mgmt = settings?.mgmt ?? undefined;
  const ipv4 = parseIpv4Settings(mgmt ?? undefined);
  const ipv6 = parseIpv6Settings(mgmt ?? undefined);

  return {
    networkName: mgmt?.network ?? "",
    ipv4Type: ipv4.ipv4Type,
    ipv4Subnet: ipv4.ipv4Subnet,
    ipv4Gateway: ipv4.ipv4Gateway,
    ipv4Range: ipv4.ipv4Range,
    ipv6Type: ipv6.ipv6Type,
    ipv6Subnet: ipv6.ipv6Subnet,
    ipv6Gateway: ipv6.ipv6Gateway,
    mtu: mgmt?.mtu ? String(mgmt.mtu) : "",
    bridge: mgmt?.bridge ?? "",
    externalAccess: mgmt?.["external-access"] !== false,
    driverOptions: parseDriverOptions(mgmt ?? undefined)
  };
}

export function useLabSettingsState(labSettings?: LabSettings): UseLabSettingsStateResult {
  const [basic, setBasicState] = useState<BasicSettingsState>(() => buildInitialBasic(labSettings));
  const [mgmt, setMgmtState] = useState<MgmtSettingsState>(() => buildInitialMgmt(labSettings));

  useEffect(() => {
    setBasicState(buildInitialBasic(labSettings));
    setMgmtState(buildInitialMgmt(labSettings));
  }, [labSettings]);

  const setBasic = {
    setLabName: (v: string) => setBasicState((prev) => ({ ...prev, labName: v })),
    setPrefixType: (v: PrefixType) => setBasicState((prev) => ({ ...prev, prefixType: v })),
    setCustomPrefix: (v: string) => setBasicState((prev) => ({ ...prev, customPrefix: v }))
  };

  const setMgmt = {
    setNetworkName: (v: string) => setMgmtState((prev) => ({ ...prev, networkName: v })),
    setIpv4Type: (v: IpType) => setMgmtState((prev) => ({ ...prev, ipv4Type: v })),
    setIpv4Subnet: (v: string) => setMgmtState((prev) => ({ ...prev, ipv4Subnet: v })),
    setIpv4Gateway: (v: string) => setMgmtState((prev) => ({ ...prev, ipv4Gateway: v })),
    setIpv4Range: (v: string) => setMgmtState((prev) => ({ ...prev, ipv4Range: v })),
    setIpv6Type: (v: IpType) => setMgmtState((prev) => ({ ...prev, ipv6Type: v })),
    setIpv6Subnet: (v: string) => setMgmtState((prev) => ({ ...prev, ipv6Subnet: v })),
    setIpv6Gateway: (v: string) => setMgmtState((prev) => ({ ...prev, ipv6Gateway: v })),
    setMtu: (v: string) => setMgmtState((prev) => ({ ...prev, mtu: v })),
    setBridge: (v: string) => setMgmtState((prev) => ({ ...prev, bridge: v })),
    setExternalAccess: (v: boolean) => setMgmtState((prev) => ({ ...prev, externalAccess: v }))
  };

  const driverOpts = {
    add: () =>
      setMgmtState((prev) => ({
        ...prev,
        driverOptions: [...prev.driverOptions, { key: "", value: "" }]
      })),
    remove: (index: number) =>
      setMgmtState((prev) => ({
        ...prev,
        driverOptions: prev.driverOptions.filter((_, i) => i !== index)
      })),
    update: (index: number, field: "key" | "value", value: string) =>
      setMgmtState((prev) => ({
        ...prev,
        driverOptions: prev.driverOptions.map((opt, i) =>
          i === index ? { ...opt, [field]: value } : opt
        )
      }))
  };

  const handleSave = useCallback(async () => {
    const settings = buildBasicSettings(basic);
    const mgmtSettings = gatherMgmtSettings(mgmt);

    const payload: LabSettings = {
      ...settings,
      ...(mgmtSettings === null ? { mgmt: null } : { mgmt: mgmtSettings as LabSettings["mgmt"] })
    };

    await executeTopologyCommand({ command: "setLabSettings", payload });
  }, [basic, mgmt]);

  return {
    basic,
    mgmt,
    setBasic,
    setMgmt,
    driverOpts,
    handleSave
  };
}
