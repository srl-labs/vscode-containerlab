// IconSelectionManager.ts - Handles icon selection, upload, and deletion

import { log } from "../../platform/logging/logger";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";
import { extractNodeIcons } from "../canvas/BaseStyles";
import { createNodeIconOptionElement } from "../../ui/IconDropdownRenderer";
import { VscodeMessageSender } from "../../platform/messaging/VscodeMessaging";
import {
  DEFAULT_ICON_COLOR,
  DEFAULT_ICON_CORNER_RADIUS,
  ID_NODE_ICON_COLOR,
  ID_PANEL_NODE_TOPOROLE_CONTAINER,
  ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
} from "./NodeEditorConstants";

export interface IconSelectionUtilities {
  getMessageSender: () => VscodeMessageSender;
}

export class IconSelectionManager {
  private cachedNodeIcons: string[] = [];
  private cachedCustomIconSignature: string = "";
  private currentIconColor: string | null = null;
  private currentIconCornerRadius: number = DEFAULT_ICON_CORNER_RADIUS;
  private utilities: IconSelectionUtilities;

  private readonly renderIconOption = (role: string): HTMLElement =>
    createNodeIconOptionElement(role, {
      onDelete: (iconName) => {
        void this.handleIconDelete(iconName);
      }
    });

  constructor(utilities: IconSelectionUtilities) {
    this.utilities = utilities;
  }

  public getCurrentIconColor(): string | null {
    return this.currentIconColor;
  }

  public getCurrentIconCornerRadius(): number {
    return this.currentIconCornerRadius;
  }

  public getNodeIconOptions(): string[] {
    const signature = this.computeCustomIconSignature();
    if (!this.cachedNodeIcons.length || this.cachedCustomIconSignature !== signature) {
      this.cachedNodeIcons = extractNodeIcons();
      this.cachedCustomIconSignature = signature;
    }
    return this.cachedNodeIcons;
  }

  private computeCustomIconSignature(): string {
    const customIcons = (window as any)?.customIcons;
    if (!customIcons || typeof customIcons !== "object") {
      return "";
    }
    return Object.keys(customIcons)
      .sort()
      .map((key) => `${key}-${(customIcons[key] as string)?.length ?? 0}`)
      .join("|");
  }

  public setupIconField(nodeData: Record<string, any>): void {
    const nodeIcons = this.getNodeIconOptions();
    let iconInitial = "pe";
    if (nodeData.topoViewerRole && typeof nodeData.topoViewerRole === "string") {
      iconInitial = nodeData.topoViewerRole;
    } else if (nodeData.extraData?.icon && typeof nodeData.extraData.icon === "string") {
      iconInitial = nodeData.extraData.icon;
    }
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      nodeIcons,
      iconInitial,
      () => {},
      "Search for icon...",
      false,
      {
        menuClassName: "max-h-96",
        dropdownWidth: 320,
        renderOption: this.renderIconOption
      }
    );
    this.initializeIconColorState(nodeData);
  }

  private initializeIconColorState(nodeData: Record<string, any>): void {
    const fromNode = typeof nodeData.iconColor === "string" ? nodeData.iconColor : "";
    const fromExtra =
      typeof nodeData.extraData?.iconColor === "string"
        ? (nodeData.extraData.iconColor as string)
        : "";
    const normalized = this.normalizeIconColor(fromNode || fromExtra, null);
    this.setIconColor(normalized);
    const radiusSource = this.resolveNumericIconValue(
      nodeData.iconCornerRadius,
      nodeData.extraData?.iconCornerRadius
    );
    this.setIconCornerRadius(radiusSource);
  }

  public setIconColor(color: string | null): void {
    this.currentIconColor = color;
    const hidden = document.getElementById(ID_NODE_ICON_COLOR) as HTMLInputElement | null;
    if (hidden) {
      hidden.value = color ?? "";
    }
  }

  public setIconCornerRadius(radius: number | null): void {
    if (typeof radius === "number" && Number.isFinite(radius)) {
      this.currentIconCornerRadius = Math.max(0, Math.min(40, radius));
      return;
    }
    this.currentIconCornerRadius = DEFAULT_ICON_CORNER_RADIUS;
  }

  private resolveNumericIconValue(primary: unknown, fallback: unknown): number | null {
    if (typeof primary === "number" && Number.isFinite(primary)) {
      return primary;
    }
    if (typeof fallback === "number" && Number.isFinite(fallback)) {
      return fallback;
    }
    return null;
  }

  public normalizeIconColor(
    color: string | undefined,
    fallback: string | null = DEFAULT_ICON_COLOR
  ): string | null {
    if (!color) {
      return fallback;
    }
    let candidate = color.trim();
    if (!candidate) {
      return fallback;
    }
    if (!candidate.startsWith("#")) {
      candidate = `#${candidate}`;
    }
    const hexRegex = /^#([0-9a-fA-F]{6})$/;
    if (!hexRegex.test(candidate)) {
      return fallback;
    }
    return `#${candidate.slice(1).toLowerCase()}`;
  }

  public getCurrentIconValue(): string {
    const input = document.getElementById(
      ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
    ) as HTMLInputElement | null;
    return input?.value?.trim() || "pe";
  }

  public async handleIconUpload(): Promise<void> {
    const messageSender = this.utilities.getMessageSender();
    if (!messageSender) {
      return;
    }
    try {
      const response = await messageSender.sendMessageToVscodeEndpointPost(
        "topo-editor-upload-icon",
        {}
      );
      if (!response || response.cancelled || response.success !== true) {
        return;
      }
      if (response.customIcons && typeof response.customIcons === "object") {
        (window as any).customIcons = response.customIcons;
        this.cachedNodeIcons = [];
        this.cachedCustomIconSignature = "";
        this.refreshIconDropdownAfterIconChange(response.lastAddedIcon);
      }
    } catch (error) {
      log.error(
        `Failed to upload custom icon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private shouldUseBrowserConfirm(): boolean {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return false;
    }
    // VS Code webviews expose acquireVsCodeApi/vscode but do not support blocking dialogs
    const hasVscodeApi =
      typeof (window as any).acquireVsCodeApi === "function" || Boolean((window as any).vscode);
    return !hasVscodeApi;
  }

  private async handleIconDelete(iconName: string): Promise<void> {
    const messageSender = this.utilities.getMessageSender();
    if (!messageSender || !iconName) {
      return;
    }
    const confirmationMessage = `Delete custom icon "${iconName}"? This action cannot be undone.`;
    if (this.shouldUseBrowserConfirm() && window.confirm(confirmationMessage) === false) {
      return;
    }
    this.teardownIconDropdownMenu();
    try {
      const response = await messageSender.sendMessageToVscodeEndpointPost(
        "topo-editor-delete-icon",
        { iconName }
      );
      if (!response || response.success !== true) {
        return;
      }
      if (response.customIcons && typeof response.customIcons === "object") {
        (window as any).customIcons = response.customIcons;
      }
      this.cachedNodeIcons = [];
      this.cachedCustomIconSignature = "";
      this.refreshIconDropdownAfterIconChange();
    } catch (error) {
      log.error(
        `Failed to delete custom icon "${iconName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private teardownIconDropdownMenu(): void {
    const dropdownMenu = document.getElementById(
      `${ID_PANEL_NODE_TOPOROLE_CONTAINER}-dropdown-menu`
    ) as HTMLElement | null;
    if (dropdownMenu) {
      dropdownMenu.remove();
    }
  }

  private resolveIconSelectionAfterChange(
    preferredIcon: string | undefined,
    previousSelection: string,
    availableIcons: string[]
  ): string {
    const candidates = [preferredIcon, previousSelection, "pe"];
    for (const candidate of candidates) {
      if (candidate && availableIcons.includes(candidate)) {
        return candidate;
      }
    }
    if (availableIcons.length > 0) {
      return availableIcons[0];
    }
    return "pe";
  }

  private refreshIconDropdownAfterIconChange(preferredIcon?: string): void {
    const previousSelection = this.getCurrentIconValue();
    const availableIcons = this.getNodeIconOptions();
    const selectedIcon = this.resolveIconSelectionAfterChange(
      preferredIcon,
      previousSelection,
      availableIcons
    );
    this.teardownIconDropdownMenu();
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      availableIcons,
      selectedIcon,
      () => {},
      "Search for icon...",
      false,
      {
        menuClassName: "max-h-96",
        dropdownWidth: 320,
        renderOption: this.renderIconOption
      }
    );
    const filterInput = document.getElementById(
      ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
    ) as HTMLInputElement | null;
    if (filterInput) {
      filterInput.value = selectedIcon;
    }
  }
}
