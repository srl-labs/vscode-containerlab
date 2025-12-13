// file: managerNodeDataUtils.ts

import { resolveNodeConfig } from "../../core/nodeConfig";
import type { ClabTopology } from "../../../shared/types/topoViewerType";
import type { NodeProperties } from "./TabContentManager";

// Property name constants (duplicated for now - could be shared later)
const PROP_STARTUP_CONFIG = "startup-config" as const;
const PROP_ENFORCE_STARTUP_CONFIG = "enforce-startup-config" as const;
const PROP_SUPPRESS_STARTUP_CONFIG = "suppress-startup-config" as const;
const PROP_RESTART_POLICY = "restart-policy" as const;
const PROP_AUTO_REMOVE = "auto-remove" as const;
const PROP_STARTUP_DELAY = "startup-delay" as const;
const PROP_MGMT_IPV4 = "mgmt-ipv4" as const;
const PROP_MGMT_IPV6 = "mgmt-ipv6" as const;
const PROP_NETWORK_MODE = "network-mode" as const;
const PROP_PORTS = "ports" as const;
const PROP_DNS = "dns" as const;
const PROP_ALIASES = "aliases" as const;
const PROP_MEMORY = "memory" as const;
const PROP_CPU = "cpu" as const;
const PROP_CPU_SET = "cpu-set" as const;
const PROP_SHM_SIZE = "shm-size" as const;
const PROP_CAP_ADD = "cap-add" as const;
const PROP_SYSCTLS = "sysctls" as const;
const PROP_DEVICES = "devices" as const;
const PROP_CERTIFICATE = "certificate" as const;
const PROP_IMAGE_PULL_POLICY = "image-pull-policy" as const;
const PROP_RUNTIME = "runtime" as const;

// Container name constants
const CN_BINDS = "binds" as const;
const CN_ENV = "env" as const;
const CN_ENV_FILES = "env-files" as const;
const CN_LABELS = "labels" as const;

// Properties that should never be marked as inherited
const NEVER_INHERITED = ["kind", "name", "group"] as const;

// Properties managed by the form
const FORM_MANAGED_PROPERTIES = [
  "name",
  "kind",
  "type",
  "image",
  PROP_STARTUP_CONFIG,
  PROP_ENFORCE_STARTUP_CONFIG,
  PROP_SUPPRESS_STARTUP_CONFIG,
  "license",
  CN_BINDS,
  CN_ENV,
  CN_ENV_FILES,
  CN_LABELS,
  "user",
  "entrypoint",
  "cmd",
  "exec",
  PROP_RESTART_POLICY,
  PROP_AUTO_REMOVE,
  PROP_STARTUP_DELAY,
  PROP_MGMT_IPV4,
  PROP_MGMT_IPV6,
  PROP_NETWORK_MODE,
  PROP_PORTS,
  PROP_DNS,
  PROP_ALIASES,
  PROP_MEMORY,
  PROP_CPU,
  PROP_CPU_SET,
  PROP_SHM_SIZE,
  PROP_CAP_ADD,
  PROP_SYSCTLS,
  PROP_DEVICES,
  PROP_CERTIFICATE,
  "healthcheck",
  PROP_IMAGE_PULL_POLICY,
  PROP_RUNTIME,
  "components",
  "inherited"
] as const;

/**
 * NodeDataUtilsManager handles node data manipulation utilities:
 * - Deep equality checking
 * - Object normalization
 * - Inherited property calculation
 * - Data merging and preparation
 */
export class NodeDataUtilsManager {
  /**
   * Check if a value should be persisted (is meaningful)
   */
  public shouldPersistValue(val: any): boolean {
    if (val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (val && typeof val === "object") return Object.keys(val).length > 0;
    return true;
  }

  /**
   * Normalize an object for comparison (sort keys recursively)
   */
  public normalizeObject(obj: any): any {
    if (Array.isArray(obj)) return obj.map((o) => this.normalizeObject(o));
    if (obj && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((acc, k) => {
          acc[k] = this.normalizeObject(obj[k]);
          return acc;
        }, {} as any);
    }
    return obj;
  }

  /**
   * Deep equality check with normalized objects
   */
  public deepEqualNormalized(a: any, b: any): boolean {
    return JSON.stringify(this.normalizeObject(a)) === JSON.stringify(this.normalizeObject(b));
  }

  /**
   * Determine which properties should actually be shown as inherited
   */
  public computeActualInheritedProps(nodeProps: any, topology?: ClabTopology): string[] {
    // If we have the pre-calculated inherited list from the topology loader, use it
    if (nodeProps.inherited && Array.isArray(nodeProps.inherited)) {
      return nodeProps.inherited.filter((prop: string) => !NEVER_INHERITED.includes(prop as any));
    }

    // Fallback: calculate inherited properties if not provided
    if (!topology) {
      topology = {
        topology: {
          defaults: (window as any).topologyDefaults || {},
          kinds: (window as any).topologyKinds || {},
          groups: (window as any).topologyGroups || {}
        }
      };
    }

    const kindName = nodeProps.kind;
    const groupName = nodeProps.group;
    const inheritBase = resolveNodeConfig(topology, { group: groupName, kind: kindName });

    const actualInherited: string[] = [];

    Object.keys(nodeProps).forEach((prop) => {
      if (NEVER_INHERITED.includes(prop as any)) {
        return;
      }

      const val = nodeProps[prop];
      const inheritedVal = (inheritBase as any)[prop];

      const hasValue = this.shouldPersistValue(val);
      const hasInheritedValue = this.shouldPersistValue(inheritedVal);

      if (hasInheritedValue) {
        if (!hasValue || this.deepEqualNormalized(val, inheritedVal)) {
          actualInherited.push(prop);
        }
      }
    });

    return actualInherited;
  }

  /**
   * Compute which properties are inherited after a merge
   */
  public computeInheritedProps(
    mergedNode: any,
    nodeProps: NodeProperties,
    inheritBase: any
  ): string[] {
    const inheritedProps: string[] = [];

    Object.keys(mergedNode).forEach((prop) => {
      if (NEVER_INHERITED.includes(prop as any)) {
        return;
      }
      const val = (nodeProps as any)[prop];
      const inheritedVal = (inheritBase as any)[prop];
      const hasValue = this.shouldPersistValue(val);
      const hasInheritedValue = this.shouldPersistValue(inheritedVal);
      if ((hasValue && this.deepEqualNormalized(val, inheritedVal)) || (!hasValue && hasInheritedValue)) {
        inheritedProps.push(prop);
      }
    });
    return inheritedProps;
  }

  /**
   * Prepare extra data by removing form-managed properties and merging new values
   */
  public prepareExtraData(nodeProps: NodeProperties, currentExtraData: any): any {
    const updatedExtraData: any = { ...currentExtraData };
    FORM_MANAGED_PROPERTIES.forEach((prop) => {
      delete updatedExtraData[prop];
    });
    Object.assign(updatedExtraData, nodeProps);
    return updatedExtraData;
  }

  /**
   * Merge node properties with current data and compute inheritance
   */
  public mergeNodeData(
    nodeProps: NodeProperties,
    currentData: any
  ): { updatedExtraData: any; inheritedProps: string[] } {
    const updatedExtraData = this.prepareExtraData(nodeProps, currentData.extraData || {});

    const topology: ClabTopology = {
      topology: {
        defaults: (window as any).topologyDefaults || {},
        kinds: (window as any).topologyKinds || {},
        groups: (window as any).topologyGroups || {}
      }
    };
    const kindName = nodeProps.kind ?? currentData.extraData?.kind;
    const groupName = currentData.extraData?.group;
    const inheritBase = resolveNodeConfig(topology, { group: groupName, kind: kindName });
    const mergedNode = resolveNodeConfig(topology, {
      ...nodeProps,
      group: groupName,
      kind: kindName
    });
    const inheritedProps = this.computeInheritedProps(mergedNode, nodeProps, inheritBase);

    Object.assign(updatedExtraData, mergedNode);
    updatedExtraData.inherited = inheritedProps;
    updatedExtraData.kind = kindName;
    if (groupName !== undefined) {
      updatedExtraData.group = groupName;
    }
    return { updatedExtraData, inheritedProps };
  }
}
