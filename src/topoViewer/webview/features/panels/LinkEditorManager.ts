import cytoscape from "cytoscape";
import { SaveManager } from "../../core/SaveManager";
import { log } from "../../platform/logging/logger";
import { isSpecialNodeOrBridge } from "../../../shared/utilities/LinkTypes";

/* eslint-disable no-unused-vars */
type BooleanSetter = (flag: boolean) => void;
type RenderErrors = (errors: string[]) => void;
/* eslint-enable no-unused-vars */

export class LinkEditorManager {
  private saveManager: SaveManager;
  private cy: cytoscape.Core;
  private setEdgeClicked: BooleanSetter;

  private linkDynamicEntryCounters = new Map<string, number>();
  private linkEditorInitialValues: Record<string, string> | null = null;

  private static readonly CLASS_DYNAMIC_ENTRY = "dynamic-entry" as const;
  private static readonly CLASS_INPUT_FIELD = "input-field" as const;
  private static readonly CLASS_DYNAMIC_DELETE_BTN = "dynamic-delete-btn" as const;
  private static readonly CLASS_OPACITY_50 = "opacity-50" as const;
  private static readonly CLASS_CURSOR_NOT_ALLOWED = "cursor-not-allowed" as const;

  private static readonly DISPLAY_BLOCK = "block" as const;
  private static readonly DISPLAY_NONE = "none" as const;

  private static readonly HTML_ICON_TRASH = '<i class="fas fa-trash"></i>' as const;
  private static readonly CLASS_HAS_CHANGES = "btn-has-changes" as const;
  private static readonly LINK_CONTAINER_PREFIX = "panel-link-ext-" as const;
  private static readonly LINK_ENTRY_PREFIX = "link-" as const;
  private static readonly DATA_FIELD = "data-field" as const;

  private static readonly ID_LINK_EDITOR_SAVE_BUTTON = "panel-link-editor-save-button" as const;
  private static readonly ID_LINK_EXT_MTU = "panel-link-ext-mtu" as const;
  private static readonly ID_LINK_EDITOR_SOURCE_ENDPOINT =
    "panel-link-editor-source-endpoint" as const;
  private static readonly ID_LINK_EDITOR_TARGET_ENDPOINT =
    "panel-link-editor-target-endpoint" as const;
  private static readonly ID_LINK_EDITOR_APPLY_BUTTON = "panel-link-editor-apply-button" as const;

  private static readonly TYPE_HOST = "host" as const;
  private static readonly TYPE_MGMT = "mgmt-net" as const;
  private static readonly TYPE_VXLAN = "vxlan" as const;
  private static readonly TYPE_VXLAN_STITCH = "vxlan-stitch" as const;
  private static readonly TYPE_DUMMY = "dummy" as const;
  private static readonly TYPE_BRIDGE = "bridge" as const;
  private static readonly TYPE_OVS_BRIDGE = "ovs-bridge" as const;
  private static readonly BRIDGE_TYPES = [
    LinkEditorManager.TYPE_BRIDGE,
    LinkEditorManager.TYPE_OVS_BRIDGE
  ] as const;

  constructor(
    saveManager: SaveManager,
    cy: cytoscape.Core,
    setEdgeClicked: BooleanSetter
  ) {
    this.saveManager = saveManager;
    this.cy = cy;
    this.setEdgeClicked = setEdgeClicked;
    this.initializeDynamicEntryHandlers();
  }

  public async panelEdgeEditor(edge: cytoscape.EdgeSingular): Promise<void> {
    try {
      this.setEdgeClicked(true);
      const elems = this.getEdgeEditorElements();
      if (!elems) {
        this.setEdgeClicked(false);
        return;
      }

      const ctx = this.getEdgeContext(edge);
      this.showEdgePanel(elems.panel, ctx.isVethLink, elems.btnExt);
      this.setupEdgeTabs(elems, ctx.isVethLink);
      this.populateEdgePreviews(edge);
      this.setupBasicTab(edge, ctx, elems.panel);

      await this.panelEdgeEditorExtended(edge);

      setTimeout(() => {
        this.linkEditorInitialValues = this.captureLinkEditorValues();
        this.updateLinkApplyButtonState();
      }, 0);

      setTimeout(() => {
        this.setEdgeClicked(false);
      }, 100);
    } catch (err) {
      log.error(
        `panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`
      );
      this.setEdgeClicked(false);
    }
  }

  private initializeDynamicEntryHandlers(): void {
    (window as any).addLinkVarEntry = () => this.addLinkKeyValueEntry("vars", "key", "value");
    (window as any).addLinkLabelEntry = () =>
      this.addLinkKeyValueEntry("labels", "label-key", "label-value");
    (window as any).removeLinkEntry = (containerName: string, entryId: number) => {
      this.removeLinkEntry(containerName, entryId);
      return false;
    };
  }

  private addLinkKeyValueEntry(
    containerName: string,
    keyPlaceholder: string,
    valuePlaceholder: string
  ): void {
    const container = document.getElementById(
      `${LinkEditorManager.LINK_CONTAINER_PREFIX}${containerName}-container`
    );
    if (!container) return;

    const count = (this.linkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.linkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = LinkEditorManager.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = LinkEditorManager.CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(
      LinkEditorManager.DATA_FIELD,
      `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-key`
    );

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = LinkEditorManager.CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(
      LinkEditorManager.DATA_FIELD,
      `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-value`
    );

    const button = document.createElement("button");
    button.type = "button";
    button.className = LinkEditorManager.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = LinkEditorManager.HTML_ICON_TRASH;
    button.onclick = () => this.removeLinkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  private addLinkKeyValueEntryWithValue(containerName: string, key: string, value: string): void {
    const container = document.getElementById(
      `${LinkEditorManager.LINK_CONTAINER_PREFIX}${containerName}-container`
    );
    if (!container) return;

    const count = (this.linkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.linkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = LinkEditorManager.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = LinkEditorManager.CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(
      LinkEditorManager.DATA_FIELD,
      `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-key`
    );

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = LinkEditorManager.CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(
      LinkEditorManager.DATA_FIELD,
      `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-value`
    );

    const button = document.createElement("button");
    button.type = "button";
    button.className = LinkEditorManager.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = LinkEditorManager.HTML_ICON_TRASH;
    button.onclick = () => this.removeLinkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  private removeLinkEntry(containerName: string, entryId: number): void {
    const entry = document.getElementById(
      `${LinkEditorManager.LINK_ENTRY_PREFIX}${containerName}-entry-${entryId}`
    );
    if (entry) {
      entry.remove();
    }
  }

  private captureLinkEditorValues(): Record<string, string> {
    const sourceInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_SOURCE_ENDPOINT
    ) as HTMLInputElement | null;
    const targetInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_TARGET_ENDPOINT
    ) as HTMLInputElement | null;
    const mtuInput = document.getElementById(LinkEditorManager.ID_LINK_EXT_MTU) as
      | HTMLInputElement
      | null;

    return {
      sourceEndpoint: sourceInput?.value || "",
      targetEndpoint: targetInput?.value || "",
      mtu: mtuInput?.value || ""
    };
  }

  private hasLinkEditorChanges(): boolean {
    if (!this.linkEditorInitialValues) return false;
    const current = this.captureLinkEditorValues();
    return Object.keys(this.linkEditorInitialValues).some(
      (key) => this.linkEditorInitialValues![key] !== current[key]
    );
  }

  private updateLinkApplyButtonState(): void {
    const applyBtn = document.getElementById(LinkEditorManager.ID_LINK_EDITOR_APPLY_BUTTON);
    if (!applyBtn) return;
    const hasChanges = this.hasLinkEditorChanges();
    applyBtn.classList.toggle(LinkEditorManager.CLASS_HAS_CHANGES, hasChanges);
  }

  private resetLinkEditorInitialValues(): void {
    this.linkEditorInitialValues = this.captureLinkEditorValues();
    this.updateLinkApplyButtonState();
  }

  private getEdgeEditorElements(): {
    panel: HTMLElement;
    basicTab: HTMLElement;
    extTab: HTMLElement;
    btnBasic: HTMLElement;
    btnExt: HTMLElement;
  } | null {
    const panel = document.getElementById("panel-link-editor") as HTMLElement | null;
    const basicTab = document.getElementById("panel-link-tab-basic") as HTMLElement | null;
    const extTab = document.getElementById("panel-link-tab-extended") as HTMLElement | null;
    const btnBasic = document.getElementById("panel-link-tab-btn-basic") as HTMLElement | null;
    const btnExt = document.getElementById("panel-link-tab-btn-extended") as HTMLElement | null;
    if (!panel || !basicTab || !extTab || !btnBasic || !btnExt) {
      log.error("panelEdgeEditor: missing unified tabbed panel elements");
      return null;
    }
    return { panel, basicTab, extTab, btnBasic, btnExt };
  }

  private getEdgeContext(edge: cytoscape.EdgeSingular) {
    const source = edge.data("source") as string;
    const target = edge.data("target") as string;
    const sourceEP = (edge.data("sourceEndpoint") as string) || "";
    const targetEP = (edge.data("targetEndpoint") as string) || "";
    const sourceIsNetwork = isSpecialNodeOrBridge(source, this.cy);
    const targetIsNetwork = isSpecialNodeOrBridge(target, this.cy);
    const isVethLink = !sourceIsNetwork && !targetIsNetwork;
    const sourceNode = this.cy.getElementById(source);
    const targetNode = this.cy.getElementById(target);
    const sourceIsBridge =
      sourceNode.length > 0 &&
      LinkEditorManager.BRIDGE_TYPES.includes(sourceNode.data("extraData")?.kind as any);
    const targetIsBridge =
      targetNode.length > 0 &&
      LinkEditorManager.BRIDGE_TYPES.includes(targetNode.data("extraData")?.kind as any);
    return {
      source,
      target,
      sourceEP,
      targetEP,
      sourceIsNetwork,
      targetIsNetwork,
      isVethLink,
      sourceIsBridge,
      targetIsBridge
    };
  }

  private showEdgePanel(panel: HTMLElement, isVethLink: boolean, btnExt: HTMLElement): void {
    panel.style.display = "block";
    btnExt.style.display = isVethLink ? "" : "none";
  }

  private setupEdgeTabs(
    elems: {
      panel: HTMLElement;
      basicTab: HTMLElement;
      extTab: HTMLElement;
      btnBasic: HTMLElement;
      btnExt: HTMLElement;
    },
    isVethLink: boolean
  ): void {
    const { basicTab, extTab, btnBasic, btnExt } = elems;
    const setTab = (which: "basic" | "extended") => {
      if (which === "extended" && !isVethLink) which = "basic";
      basicTab.style.display = which === "basic" ? "block" : "none";
      extTab.style.display = which === "extended" ? "block" : "none";
      btnBasic.classList.toggle("tab-active", which === "basic");
      btnExt.classList.toggle("tab-active", which === "extended");
    };
    setTab("basic");
    btnBasic.addEventListener("click", () => setTab("basic"));
    if (isVethLink) btnExt.addEventListener("click", () => setTab("extended"));
  }

  private populateEdgePreviews(edge: cytoscape.EdgeSingular): void {
    const source = edge.data("source") as string;
    const target = edge.data("target") as string;
    const sourceEP = (edge.data("sourceEndpoint") as string) || "";
    const targetEP = (edge.data("targetEndpoint") as string) || "";
    const updatePreview = (el: HTMLElement | null) => {
      if (el) el.innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`;
    };
    updatePreview(document.getElementById("panel-link-editor-id"));
    updatePreview(document.getElementById("panel-link-extended-editor-id"));
  }

  private setupBasicTab(edge: cytoscape.EdgeSingular, ctx: any, panel: HTMLElement): void {
    const srcInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_SOURCE_ENDPOINT
    ) as HTMLInputElement | null;
    const tgtInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_TARGET_ENDPOINT
    ) as HTMLInputElement | null;
    this.configureEndpointInput(
      srcInput,
      ctx.sourceIsNetwork,
      ctx.sourceIsBridge,
      ctx.sourceEP,
      ctx.source
    );
    this.configureEndpointInput(
      tgtInput,
      ctx.targetIsNetwork,
      ctx.targetIsBridge,
      ctx.targetEP,
      ctx.target
    );
    this.setupBasicTabButtons(panel, edge, ctx, srcInput, tgtInput);
  }

  private configureEndpointInput(
    input: HTMLInputElement | null,
    isNetwork: boolean,
    isBridge: boolean,
    endpoint: string,
    networkName: string
  ): void {
    if (!input) return;
    if (isNetwork && !isBridge) {
      input.value = networkName;
      input.readOnly = true;
      input.style.backgroundColor = "var(--vscode-input-background)";
      input.style.opacity = "0.7";
    } else {
      input.value = endpoint;
      input.readOnly = false;
      input.style.backgroundColor = "";
      input.style.opacity = "";
    }
  }

  private getEndpointValues(
    ctx: any,
    srcInput: HTMLInputElement | null,
    tgtInput: HTMLInputElement | null
  ): { sourceEP: string; targetEP: string } {
    const sourceEP =
      ctx.sourceIsNetwork && !ctx.sourceIsBridge ? "" : srcInput?.value?.trim() || "";
    const targetEP =
      ctx.targetIsNetwork && !ctx.targetIsBridge ? "" : tgtInput?.value?.trim() || "";
    return { sourceEP, targetEP };
  }

  private async saveEdgeEndpoints(
    edge: cytoscape.EdgeSingular,
    ctx: any,
    srcInput: HTMLInputElement | null,
    tgtInput: HTMLInputElement | null
  ): Promise<void> {
    const { sourceEP, targetEP } = this.getEndpointValues(ctx, srcInput, tgtInput);
    edge.data({ sourceEndpoint: sourceEP, targetEndpoint: targetEP });
    await this.saveManager.saveTopo(this.cy, false);
  }

  private setupBasicTabButtons(
    panel: HTMLElement,
    edge: cytoscape.EdgeSingular,
    ctx: any,
    srcInput: HTMLInputElement | null,
    tgtInput: HTMLInputElement | null
  ): void {
    const titleBarClose = document.getElementById("panel-link-editor-close");
    if (titleBarClose) {
      const freshClose = titleBarClose.cloneNode(true) as HTMLElement;
      titleBarClose.parentNode?.replaceChild(freshClose, titleBarClose);
      freshClose.addEventListener(
        "click",
        () => {
          panel.style.display = "none";
          this.setEdgeClicked(false);
        },
        { once: true }
      );
    }

    const basicSave = document.getElementById(LinkEditorManager.ID_LINK_EDITOR_SAVE_BUTTON);
    if (basicSave) {
      const freshSave = basicSave.cloneNode(true) as HTMLElement;
      basicSave.parentNode?.replaceChild(freshSave, basicSave);
      freshSave.addEventListener("click", async () => {
        try {
          await this.saveEdgeEndpoints(edge, ctx, srcInput, tgtInput);
          panel.style.display = "none";
          this.setEdgeClicked(false);
        } catch (err) {
          log.error(
            `panelEdgeEditor basic save error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      });
    }

    const basicApply = document.getElementById(LinkEditorManager.ID_LINK_EDITOR_APPLY_BUTTON);
    if (basicApply) {
      const freshApply = basicApply.cloneNode(true) as HTMLElement;
      basicApply.parentNode?.replaceChild(freshApply, basicApply);
      freshApply.addEventListener("click", async () => {
        try {
          await this.saveEdgeEndpoints(edge, ctx, srcInput, tgtInput);
          this.resetLinkEditorInitialValues();
        } catch (err) {
          log.error(
            `panelEdgeEditor basic apply error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      });
    }

    [srcInput, tgtInput].forEach((input) => {
      if (input) {
        input.addEventListener("input", () => this.updateLinkApplyButtonState());
      }
    });
  }

  private async panelEdgeEditorExtended(edge: cytoscape.EdgeSingular): Promise<void> {
    this.setEdgeClicked(true);

    const elements = this.getExtendedEditorElements();
    if (!elements) {
      this.setEdgeClicked(false);
      return;
    }
    const { panel, idLabel, closeBtn, saveBtn } = elements;

    const source = edge.data("source") as string;
    const target = edge.data("target") as string;
    const sourceEP = (edge.data("sourceEndpoint") as string) || "";
    const targetEP = (edge.data("targetEndpoint") as string) || "";
    this.updateExtendedPreview(idLabel, source, target, sourceEP, targetEP);
    panel.style.display = "block";
    this.setupExtendedClose(panel, closeBtn);

    const extraData = edge.data("extraData") || {};
    const ctx = this.inferLinkContext(source, target);
    this.prepareExtendedFields(extraData, ctx.isVeth);
    const renderErrors = (errors: string[]) => this.renderExtendedErrors(errors);
    const validate = (): string[] => this.validateExtendedInputs(ctx.isVeth);
    renderErrors(validate());
    this.attachExtendedValidators(validate, renderErrors);

    const freshSave = saveBtn.cloneNode(true) as HTMLElement;
    saveBtn.parentNode?.replaceChild(freshSave, saveBtn);
    freshSave.addEventListener("click", async () => {
      await this.handleExtendedSave(edge, ctx, validate, renderErrors);
      panel.style.display = "none";
      this.setEdgeClicked(false);
    });

    const applyBtn = document.getElementById(LinkEditorManager.ID_LINK_EDITOR_APPLY_BUTTON);
    if (applyBtn) {
      const freshApply = applyBtn.cloneNode(true) as HTMLElement;
      applyBtn.parentNode?.replaceChild(freshApply, applyBtn);
      freshApply.addEventListener("click", async () => {
        await this.handleExtendedSave(edge, ctx, validate, renderErrors);
        this.resetLinkEditorInitialValues();
      });
    }

    const mtuInput = document.getElementById(LinkEditorManager.ID_LINK_EXT_MTU);
    if (mtuInput) {
      mtuInput.addEventListener("input", () => this.updateLinkApplyButtonState());
    }

    setTimeout(() => {
      this.setEdgeClicked(false);
    }, 100);
  }

  private getExtendedEditorElements(): {
    panel: HTMLElement;
    idLabel: HTMLElement;
    closeBtn: HTMLElement;
    saveBtn: HTMLElement;
  } | null {
    const panel = document.getElementById("panel-link-editor") as HTMLElement | null;
    const idLabel = document.getElementById("panel-link-extended-editor-id") as HTMLElement | null;
    const closeBtn = document.getElementById("panel-link-editor-close") as HTMLElement | null;
    const saveBtn = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_SAVE_BUTTON
    ) as HTMLElement | null;
    if (!panel || !idLabel || !closeBtn || !saveBtn) {
      log.error("panelEdgeEditorExtended: missing required DOM elements");
      return null;
    }
    return { panel, idLabel, closeBtn, saveBtn };
  }

  private updateExtendedPreview(
    labelEl: HTMLElement,
    source: string,
    target: string,
    sourceEP: string,
    targetEP: string
  ): void {
    labelEl.innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`;
  }

  private setupExtendedClose(panel: HTMLElement, closeBtn: HTMLElement): void {
    const freshClose = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(freshClose, closeBtn);
    freshClose.addEventListener(
      "click",
      () => {
        panel.style.display = "none";
        this.setEdgeClicked(false);
      },
      { once: true }
    );
  }

  private inferLinkContext(
    source: string,
    target: string
  ): { inferredType: string; isVeth: boolean } {
    const special = (id: string): string | null => {
      if (id === LinkEditorManager.TYPE_HOST || id.startsWith(`${LinkEditorManager.TYPE_HOST}:`))
        return LinkEditorManager.TYPE_HOST;
      if (id === LinkEditorManager.TYPE_MGMT || id.startsWith(`${LinkEditorManager.TYPE_MGMT}:`))
        return LinkEditorManager.TYPE_MGMT;
      if (id.startsWith("macvlan:")) return "macvlan";
      if (id.startsWith("vxlan:")) return LinkEditorManager.TYPE_VXLAN;
      if (id.startsWith("vxlan-stitch:")) return LinkEditorManager.TYPE_VXLAN_STITCH;
      if (id.startsWith("dummy")) return LinkEditorManager.TYPE_DUMMY;
      return null;
    };
    const sourceType = special(source);
    const targetType = special(target);
    const inferredType = sourceType || targetType || "veth";
    const typeDisplayEl = document.getElementById(
      "panel-link-ext-type-display"
    ) as HTMLElement | null;
    if (typeDisplayEl) typeDisplayEl.textContent = inferredType;
    return { inferredType, isVeth: inferredType === "veth" };
  }

  private prepareExtendedFields(extraData: any, isVeth: boolean): void {
    this.resetExtendedDynamicContainers();
    this.setNonVethInfoVisibility(isVeth);
    this.setMacAndMtu(extraData, isVeth);
    if (isVeth) this.populateExtendedKeyValues(extraData);
  }

  private resetExtendedDynamicContainers(): void {
    const varsContainer = document.getElementById("panel-link-ext-vars-container");
    const labelsContainer = document.getElementById("panel-link-ext-labels-container");
    if (varsContainer) varsContainer.innerHTML = "";
    if (labelsContainer) labelsContainer.innerHTML = "";
    this.linkDynamicEntryCounters.clear();
  }

  private setNonVethInfoVisibility(isVeth: boolean): void {
    const nonVethInfo = document.getElementById(
      "panel-link-ext-non-veth-info"
    ) as HTMLElement | null;
    if (nonVethInfo)
      nonVethInfo.style.display = isVeth
        ? LinkEditorManager.DISPLAY_NONE
        : LinkEditorManager.DISPLAY_BLOCK;
  }

  private setMacAndMtu(extraData: any, isVeth: boolean): void {
    const srcMacEl = document.getElementById("panel-link-ext-src-mac") as HTMLInputElement | null;
    const tgtMacEl = document.getElementById("panel-link-ext-tgt-mac") as HTMLInputElement | null;
    const mtuEl = document.getElementById(LinkEditorManager.ID_LINK_EXT_MTU) as
      | HTMLInputElement
      | null;
    if (srcMacEl) srcMacEl.value = extraData.extSourceMac || "";
    if (tgtMacEl) tgtMacEl.value = extraData.extTargetMac || "";
    if (isVeth && mtuEl) mtuEl.value = extraData.extMtu != null ? String(extraData.extMtu) : "";
  }

  private populateExtendedKeyValues(extraData: any): void {
    if (extraData.extVars && typeof extraData.extVars === "object") {
      Object.entries(extraData.extVars).forEach(([k, v]) =>
        this.addLinkKeyValueEntryWithValue("vars", k, String(v))
      );
    }
    if (extraData.extLabels && typeof extraData.extLabels === "object") {
      Object.entries(extraData.extLabels).forEach(([k, v]) =>
        this.addLinkKeyValueEntryWithValue("labels", k, String(v))
      );
    }
  }

  private renderExtendedErrors(errors: string[]): void {
    const banner = document.getElementById("panel-link-ext-errors") as HTMLElement | null;
    const bannerList = document.getElementById("panel-link-ext-errors-list") as HTMLElement | null;
    const setSaveDisabled = (disabled: boolean) => {
      const btn = document.getElementById(
        LinkEditorManager.ID_LINK_EDITOR_SAVE_BUTTON
      ) as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = disabled;
      btn.classList.toggle(LinkEditorManager.CLASS_OPACITY_50, disabled);
      btn.classList.toggle(LinkEditorManager.CLASS_CURSOR_NOT_ALLOWED, disabled);
    };
    if (!banner || !bannerList) return;
    if (!errors.length) {
      banner.style.display = "none";
      bannerList.innerHTML = "";
      setSaveDisabled(false);
      return;
    }
    banner.style.display = "block";
    const labels: Record<string, string> = {
      "missing-host-interface": "Host Interface is required for this type",
      "missing-remote": "Remote (VTEP IP) is required",
      "missing-vni": "VNI is required",
      "missing-udp-port": "UDP Port is required",
      "invalid-veth-endpoints": "veth requires two endpoints with node and interface",
      "invalid-endpoint": "Endpoint with node and interface is required"
    };
    bannerList.innerHTML = errors.map((e) => `• ${labels[e] || e}`).join("<br>");
    setSaveDisabled(true);
  }

  private validateExtendedInputs(isVeth: boolean): string[] {
    if (!isVeth) return [];
    return [];
  }

  private attachExtendedValidators(
    validate: () => string[],
    renderErrors: RenderErrors
  ): void {
    const mtuEl = document.getElementById(LinkEditorManager.ID_LINK_EXT_MTU);
    const attach = (el: HTMLElement | null) => {
      if (el) {
        el.addEventListener("input", () => renderErrors(validate()));
      }
    };
    attach(mtuEl as HTMLElement);
  }

  private collectDynamicEntries(prefix: string): Record<string, string> {
    const entries = document.querySelectorAll(`[id^="${prefix}-entry-"]`);
    const parsed: Record<string, string> = {};
    entries.forEach((entry) => {
      const keyInput = entry.querySelector(`[data-field="${prefix}-key"]`) as HTMLInputElement;
      const valueInput = entry.querySelector(`[data-field="${prefix}-value"]`) as HTMLInputElement;
      if (keyInput && valueInput && keyInput.value.trim()) {
        parsed[keyInput.value.trim()] = valueInput.value;
      }
    });
    return parsed;
  }

  private async handleExtendedSave(
    edge: cytoscape.EdgeSingular,
    ctx: { inferredType: string; isVeth: boolean },
    validate: () => string[],
    renderErrors: RenderErrors
  ): Promise<void> {
    try {
      this.updateEdgeEndpoints(edge);
      const errsNow = validate();
      if (errsNow.length) {
        renderErrors(errsNow);
        return;
      }

      const current = edge.data();
      if (!ctx.isVeth) {
        await this.saveManager.saveTopo(this.cy, false);
        return;
      }

      const updatedExtra = this.buildLinkExtendedData(current.extraData || {});
      edge.data({ ...current, extraData: updatedExtra });
      await this.saveManager.saveTopo(this.cy, false);
    } catch (err) {
      log.error(
        `panelEdgeEditorExtended: error during save: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private updateEdgeEndpoints(edge: cytoscape.EdgeSingular): void {
    const source = edge.data("source") as string;
    const target = edge.data("target") as string;
    const srcInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_SOURCE_ENDPOINT
    ) as HTMLInputElement | null;
    const tgtInput = document.getElementById(
      LinkEditorManager.ID_LINK_EDITOR_TARGET_ENDPOINT
    ) as HTMLInputElement | null;
    const newSourceEP = this.shouldClearEndpoint(source) ? "" : srcInput?.value?.trim() || "";
    const newTargetEP = this.shouldClearEndpoint(target) ? "" : tgtInput?.value?.trim() || "";
    edge.data({ sourceEndpoint: newSourceEP, targetEndpoint: newTargetEP });
  }

  private shouldClearEndpoint(nodeId: string): boolean {
    if (!isSpecialNodeOrBridge(nodeId, this.cy)) return false;
    const node = this.cy.getElementById(nodeId);
    const kind = node.data("extraData")?.kind;
    return !LinkEditorManager.BRIDGE_TYPES.includes(kind as any);
  }

  private buildLinkExtendedData(existing: any): any {
    const updated = { ...existing } as any;
    const srcMacEl = document.getElementById("panel-link-ext-src-mac") as HTMLInputElement | null;
    const tgtMacEl = document.getElementById("panel-link-ext-tgt-mac") as HTMLInputElement | null;
    const mtuEl = document.getElementById(LinkEditorManager.ID_LINK_EXT_MTU) as
      | HTMLInputElement
      | null;
    if (srcMacEl) updated.extSourceMac = srcMacEl.value.trim() || undefined;
    if (tgtMacEl) updated.extTargetMac = tgtMacEl.value.trim() || undefined;
    if (mtuEl) updated.extMtu = mtuEl.value ? Number(mtuEl.value) : undefined;
    const vars = this.collectDynamicEntries("link-vars");
    const labels = this.collectDynamicEntries("link-labels");
    updated.extVars = Object.keys(vars).length ? vars : undefined;
    updated.extLabels = Object.keys(labels).length ? labels : undefined;
    return updated;
  }
}
