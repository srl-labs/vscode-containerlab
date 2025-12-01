// file: ValidationManager.ts

import { log } from "../../logging/logger";

// Field IDs
const ID_NODE_MGMT_IPV4 = "node-mgmt-ipv4" as const;
const ID_NODE_MGMT_IPV6 = "node-mgmt-ipv6" as const;
const ID_NODE_MEMORY = "node-memory" as const;
const ID_NODE_CPU = "node-cpu" as const;
const ID_NODE_CPU_SET = "node-cpu-set" as const;
const ID_NODE_PORTS_CONTAINER = "node-ports-container" as const;
const ID_NODE_BINDS_CONTAINER = "node-binds-container" as const;
const ID_NODE_NAME = "node-name" as const;

// Container names
const CN_PORTS = "node-ports-container" as const;
const CN_BINDS = "node-binds-container" as const;

/**
 * Interface for validation utilities needed from the parent manager
 */
/* eslint-disable no-unused-vars */
export interface ValidationUtilities {
  getInputValue: (id: string) => string;
  collectDynamicEntries: (containerName: string) => string[];
  getPanel: () => HTMLElement | null;
}
/* eslint-enable no-unused-vars */

/**
 * ValidationManager handles all form validation:
 * - IPv4/IPv6 address validation
 * - Port mapping validation
 * - Memory format validation
 * - CPU set validation
 * - Bind mount validation
 * - Node name validation
 */
export class ValidationManager {
  private utilities: ValidationUtilities;

  constructor(utilities: ValidationUtilities) {
    this.utilities = utilities;
  }

  /**
   * Validate IPv4 address format
   */
  public validateIPv4(ip: string): boolean {
    if (!ip) return true; // Empty is valid
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    for (const p of parts) {
      if (p.length === 0 || p.length > 3) return false;
      if (!/^\d+$/.test(p)) return false;
      const n = parseInt(p, 10);
      if (n < 0 || n > 255) return false;
      // Disallow leading zeros like 01 unless the value is exactly '0'
      if (p.length > 1 && p.startsWith("0")) return false;
    }
    return true;
  }

  /**
   * Validate IPv6 address format
   */
  public validateIPv6(ip: string): boolean {
    if (!ip) return true; // Empty is valid
    // Handle IPv4-mapped addresses
    const lastColon = ip.lastIndexOf(":");
    if (lastColon !== -1 && ip.indexOf(".") > lastColon) {
      const v6 = ip.slice(0, lastColon);
      const v4 = ip.slice(lastColon + 1);
      return this.validateIPv6(v6 + "::") && this.validateIPv4(v4);
    }

    const hasDoubleColon = ip.includes("::");
    if (hasDoubleColon && ip.indexOf("::") !== ip.lastIndexOf("::")) return false;

    const parts = ip.split(":").filter((s) => s.length > 0);
    if (!hasDoubleColon && parts.length !== 8) return false;
    if (hasDoubleColon && parts.length > 7) return false;

    const hexRe = /^[0-9a-fA-F]{1,4}$/;
    for (const part of parts) {
      if (!hexRe.test(part)) return false;
    }
    return true;
  }

  /**
   * Validate port mapping format (host:container or host:container/protocol)
   */
  public validatePortMapping(port: string): boolean {
    if (!port) return true; // Empty is valid
    const portRegex = /^(\d+):(\d+)(\/(?:tcp|udp))?$/;
    const match = portRegex.exec(port);
    if (!match) return false;

    const hostPort = parseInt(match[1]);
    const containerPort = parseInt(match[2]);

    return hostPort > 0 && hostPort <= 65535 && containerPort > 0 && containerPort <= 65535;
  }

  /**
   * Validate memory format (e.g., 1Gb, 512Mb, 1024Kib)
   */
  public validateMemory(memory: string): boolean {
    if (!memory) return true; // Empty is valid
    const memoryRegex = /^\d+(\.\d+)?\s*(b|kib|kb|mib|mb|gib|gb)$/i;
    return memoryRegex.test(memory);
  }

  /**
   * Validate CPU set format (e.g., 0-3, 0,3, 0-1,4-5)
   */
  public validateCpuSet(cpuSet: string): boolean {
    if (!cpuSet) return true; // Empty is valid
    const cpuSetRegex = /^(\d+(-\d+)?)(,\d+(-\d+)?)*$/;
    return cpuSetRegex.test(cpuSet);
  }

  /**
   * Validate bind mount format (host:container or host:container:mode)
   */
  public validateBindMount(bind: string): boolean {
    if (!bind) return true; // Empty is valid
    // Basic validation - check for at least host:container format
    const parts = bind.split(":");
    return parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  /**
   * Show validation error
   */
  public showValidationError(field: string, message: string): void {
    // Find the input element and add error styling
    const element = document.getElementById(field);
    if (element) {
      element.classList.add("border-red-500");

      // Create or update error message
      let errorElement = document.getElementById(`${field}-error`);
      if (!errorElement) {
        errorElement = document.createElement("div");
        errorElement.id = `${field}-error`;
        errorElement.className = "text-red-500 text-xs mt-1";
        element.parentElement?.appendChild(errorElement);
      }
      errorElement.textContent = message;
    }

    log.warn(`Validation error for ${field}: ${message}`);
  }

  /**
   * Clear all validation errors
   */
  public clearAllValidationErrors(): void {
    const panel = this.utilities.getPanel();
    // Clear all error styling and messages
    panel?.querySelectorAll(".border-red-500").forEach((element) => {
      element.classList.remove("border-red-500");
    });
    panel?.querySelectorAll('[id$="-error"]').forEach((element) => {
      element.remove();
    });
  }

  /**
   * Validate all form inputs
   */
  public validateForm(): boolean {
    this.clearAllValidationErrors();
    const validators = [
      () => this.validateMgmtIpv4(),
      () => this.validateMgmtIpv6(),
      () => this.validateMemoryField(),
      () => this.validateCpuField(),
      () => this.validateCpuSetField(),
      () => this.validatePortsField(),
      () => this.validateBindsField(),
      () => this.validateNodeNameField()
    ];
    return validators.every((validate) => validate());
  }

  private validateMgmtIpv4(): boolean {
    const value = this.utilities.getInputValue(ID_NODE_MGMT_IPV4);
    if (value && !this.validateIPv4(value)) {
      this.showValidationError(ID_NODE_MGMT_IPV4, "Invalid IPv4 address format");
      return false;
    }
    return true;
  }

  private validateMgmtIpv6(): boolean {
    const value = this.utilities.getInputValue(ID_NODE_MGMT_IPV6);
    if (value && !this.validateIPv6(value)) {
      this.showValidationError(ID_NODE_MGMT_IPV6, "Invalid IPv6 address format");
      return false;
    }
    return true;
  }

  private validateMemoryField(): boolean {
    const value = this.utilities.getInputValue(ID_NODE_MEMORY);
    if (value && !this.validateMemory(value)) {
      this.showValidationError(ID_NODE_MEMORY, "Invalid memory format (e.g., 1Gb, 512Mb)");
      return false;
    }
    return true;
  }

  private validateCpuField(): boolean {
    const value = this.utilities.getInputValue(ID_NODE_CPU);
    if (!value) return true;
    const cpuValue = parseFloat(value);
    if (isNaN(cpuValue) || cpuValue <= 0) {
      this.showValidationError(ID_NODE_CPU, "CPU must be a positive number");
      return false;
    }
    return true;
  }

  private validateCpuSetField(): boolean {
    const value = this.utilities.getInputValue(ID_NODE_CPU_SET);
    if (value && !this.validateCpuSet(value)) {
      this.showValidationError(ID_NODE_CPU_SET, "Invalid CPU set format (e.g., 0-3, 0,3)");
      return false;
    }
    return true;
  }

  private validatePortsField(): boolean {
    const ports = this.utilities.collectDynamicEntries(CN_PORTS);
    for (const port of ports) {
      if (!this.validatePortMapping(port)) {
        this.showValidationError(
          ID_NODE_PORTS_CONTAINER,
          "Invalid port format (e.g., 8080:80 or 8080:80/tcp)"
        );
        return false;
      }
    }
    return true;
  }

  private validateBindsField(): boolean {
    const binds = this.utilities.collectDynamicEntries(CN_BINDS);
    for (const bind of binds) {
      if (!this.validateBindMount(bind)) {
        this.showValidationError(
          ID_NODE_BINDS_CONTAINER,
          "Invalid bind mount format (e.g., /host/path:/container/path)"
        );
        return false;
      }
    }
    return true;
  }

  private validateNodeNameField(): boolean {
    const nodeName = this.utilities.getInputValue(ID_NODE_NAME);
    if (!nodeName || nodeName.trim() === "") {
      this.showValidationError(ID_NODE_NAME, "Node name is required");
      return false;
    }
    return true;
  }
}
