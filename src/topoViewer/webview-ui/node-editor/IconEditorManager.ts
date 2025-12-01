// file: managerIconEditor.ts

import { getIconDataUriForRole } from "../cytoscape/BaseStyles";

// Constants
const ID_NODE_ICON_EDIT_BUTTON = "node-icon-edit-button" as const;
const ID_NODE_ICON_ADD_BUTTON = "node-icon-add-button" as const;
const ID_ICON_EDITOR_MODAL = "icon-editor-modal" as const;
const ID_ICON_EDITOR_BACKDROP = "icon-editor-backdrop" as const;
const ID_ICON_EDITOR_CANCEL = "icon-editor-cancel" as const;
const ID_ICON_EDITOR_CLOSE = "icon-editor-close" as const;
const ID_ICON_EDITOR_SAVE = "icon-editor-save" as const;
const ID_ICON_EDITOR_COLOR = "icon-editor-color" as const;
const ID_ICON_EDITOR_HEX = "icon-editor-hex" as const;
const ID_ICON_EDITOR_SHAPE = "icon-editor-shape" as const;
const ID_ICON_EDITOR_CORNER = "icon-editor-corner" as const;
const ID_ICON_EDITOR_CORNER_VALUE = "icon-editor-corner-value" as const;
const ID_ICON_EDITOR_PREVIEW = "icon-editor-preview" as const;
const ID_PANEL_NODE_TOPOROLE_FILTER_INPUT = "panel-node-editor-toporole-dropdown-filter-input" as const;

const DEFAULT_ICON_COLOR = "#1a73e8" as const;
const DEFAULT_ICON_CORNER_RADIUS = 0;
const NODE_ICON_BASE_SIZE = 48;
const ICON_PREVIEW_DEFAULT_SIZE = 100;

/**
 * Interface for icon editor utilities needed from the parent manager
 */
/* eslint-disable no-unused-vars */
export interface IconEditorUtilities {
  getNodeIconOptions: () => string[];
  getCurrentIconValue: () => string;
  handleIconUpload: () => Promise<void>;
  normalizeIconColor: (raw: string, fallback: string | null) => string | null;
}
/* eslint-enable no-unused-vars */

/**
 * IconEditorManager handles the icon customization modal:
 * - Color picker and hex input
 * - Shape selection
 * - Corner radius slider
 * - Preview updates
 */
export class IconEditorManager {
  private utilities: IconEditorUtilities;
  private iconEditorInitialized = false;

  // Icon state
  private currentIconColor: string | null = null;
  private currentIconCornerRadius: number = DEFAULT_ICON_CORNER_RADIUS;

  // Callbacks for state changes
  /* eslint-disable no-unused-vars */
  private onColorChange: ((color: string | null) => void) | null = null;
  private onCornerRadiusChange: ((radius: number) => void) | null = null;
  /* eslint-enable no-unused-vars */

  constructor(utilities: IconEditorUtilities) {
    this.utilities = utilities;
  }

  /* eslint-disable no-unused-vars */
  public setCallbacks(
    onColorChange: (color: string | null) => void,
    onCornerRadiusChange: (radius: number) => void
  ): void {
    this.onColorChange = onColorChange;
    this.onCornerRadiusChange = onCornerRadiusChange;
  }
  /* eslint-enable no-unused-vars */

  public setCurrentIconColor(color: string | null): void {
    this.currentIconColor = color;
  }

  public setCurrentIconCornerRadius(radius: number): void {
    this.currentIconCornerRadius = radius;
  }

  public getCurrentIconColor(): string | null {
    return this.currentIconColor;
  }

  public getCurrentIconCornerRadius(): number {
    return this.currentIconCornerRadius;
  }

  public setupIconEditorControls(): void {
    if (this.iconEditorInitialized) return;
    const editButton = document.getElementById(
      ID_NODE_ICON_EDIT_BUTTON
    ) as HTMLButtonElement | null;
    const addButton = document.getElementById(ID_NODE_ICON_ADD_BUTTON) as HTMLButtonElement | null;
    const modal = document.getElementById(ID_ICON_EDITOR_MODAL);
    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP);
    if (!editButton || !modal || !backdrop) return;
    this.iconEditorInitialized = true;

    editButton.addEventListener("click", () => this.openIconEditor());
    addButton?.addEventListener("click", () => {
      void this.utilities.handleIconUpload();
    });
    this.registerIconEditorDismissHandlers();
    this.registerIconEditorActionHandlers();
    this.registerIconEditorInputHandlers();
  }

  private registerIconEditorDismissHandlers(): void {
    const cancelBtn = document.getElementById(ID_ICON_EDITOR_CANCEL) as HTMLButtonElement | null;
    cancelBtn?.addEventListener("click", () => this.closeIconEditor());

    const closeBtn = document.getElementById(ID_ICON_EDITOR_CLOSE) as HTMLButtonElement | null;
    closeBtn?.addEventListener("click", () => this.closeIconEditor());

    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP) as HTMLDivElement | null;
    backdrop?.addEventListener("click", () => this.closeIconEditor());
  }

  private registerIconEditorActionHandlers(): void {
    const saveBtn = document.getElementById(ID_ICON_EDITOR_SAVE) as HTMLButtonElement | null;
    saveBtn?.addEventListener("click", () => this.applyIconEditorSelection());
  }

  private registerIconEditorInputHandlers(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    if (colorInput) {
      colorInput.addEventListener("input", () =>
        this.handleIconEditorColorInput(colorInput, hexInput)
      );
    }
    if (hexInput) {
      hexInput.addEventListener("input", () => this.handleIconEditorHexInput(hexInput, colorInput));
    }

    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    if (shapeSelect) {
      this.populateIconShapeOptions(shapeSelect);
      shapeSelect.addEventListener("change", () => this.updateIconPreviewElement());
    }

    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    if (cornerInput) {
      cornerInput.addEventListener("input", () => this.handleIconEditorCornerInput(cornerInput));
    }
  }

  private handleIconEditorColorInput(
    colorInput: HTMLInputElement,
    hexInput: HTMLInputElement | null
  ): void {
    const normalized = this.utilities.normalizeIconColor(colorInput.value, DEFAULT_ICON_COLOR);
    if (hexInput && normalized) {
      hexInput.value = normalized;
    }
    this.updateIconPreviewElement();
  }

  public resolveIconSelectionAfterChange(
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

  private handleIconEditorHexInput(
    hexInput: HTMLInputElement,
    colorInput: HTMLInputElement | null
  ): void {
    const normalized = this.utilities.normalizeIconColor(hexInput.value, null);
    if (normalized && colorInput) {
      colorInput.value = normalized;
      hexInput.value = normalized;
      this.updateIconPreviewElement();
    }
  }

  private updateCornerRadiusLabel(value: number): void {
    const radiusLabel = document.getElementById(ID_ICON_EDITOR_CORNER_VALUE);
    if (radiusLabel) {
      const normalized = Math.max(0, Math.round(value));
      radiusLabel.textContent = `${normalized}px`;
    }
  }

  private handleIconEditorCornerInput(cornerInput: HTMLInputElement): void {
    this.updateCornerRadiusLabel(Number(cornerInput.value));
    this.updateIconPreviewElement();
  }

  private scaleRadiusForPreview(value: number, preview: HTMLImageElement): number {
    const previewSize = preview?.clientWidth || ICON_PREVIEW_DEFAULT_SIZE;
    const normalizedRadius = Math.max(0, Number.isFinite(value) ? value : 0);
    const scaled = (normalizedRadius / NODE_ICON_BASE_SIZE) * previewSize;
    return Math.min(scaled, previewSize / 2);
  }

  private populateIconShapeOptions(select: HTMLSelectElement): void {
    select.innerHTML = "";
    for (const role of this.utilities.getNodeIconOptions()) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      select.appendChild(option);
    }
  }

  private openIconEditor(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const currentShape = this.utilities.getCurrentIconValue();
    if (shapeSelect) {
      if (!Array.from(shapeSelect.options).some((opt) => opt.value === currentShape)) {
        this.populateIconShapeOptions(shapeSelect);
      }
      shapeSelect.value = currentShape;
    }
    const colorValue = this.currentIconColor ?? DEFAULT_ICON_COLOR;
    if (colorInput) colorInput.value = colorValue;
    if (hexInput) hexInput.value = this.currentIconColor ?? "";
    if (cornerInput) {
      cornerInput.value = `${this.currentIconCornerRadius}`;
      this.updateCornerRadiusLabel(this.currentIconCornerRadius);
    }
    this.toggleIconEditor(true);
    this.updateIconPreviewElement();
  }

  private closeIconEditor(): void {
    this.toggleIconEditor(false);
  }

  private toggleIconEditor(show: boolean): void {
    const modal = document.getElementById(ID_ICON_EDITOR_MODAL) as HTMLDivElement | null;
    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP) as HTMLDivElement | null;
    if (!modal || !backdrop) return;
    modal.style.display = show ? "block" : "none";
    backdrop.style.display = show ? "block" : "none";
  }

  private updateIconPreviewElement(): void {
    const preview = document.getElementById(ID_ICON_EDITOR_PREVIEW) as HTMLImageElement | null;
    if (!preview) return;
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const color =
      this.utilities.normalizeIconColor(
        colorInput?.value || this.currentIconColor || DEFAULT_ICON_COLOR,
        DEFAULT_ICON_COLOR
      ) ?? DEFAULT_ICON_COLOR;
    const shape = shapeSelect?.value || this.utilities.getCurrentIconValue();
    const dataUri = getIconDataUriForRole(shape, color);
    if (dataUri) {
      preview.src = dataUri;
    }
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const radius = cornerInput ? Number(cornerInput.value) : this.currentIconCornerRadius;
    preview.style.borderRadius = `${this.scaleRadiusForPreview(radius, preview)}px`;
  }

  private applyIconEditorSelection(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const rawColor = colorInput?.value || "";
    const normalized = this.utilities.normalizeIconColor(rawColor, null);
    const effectiveColor =
      normalized && normalized.toLowerCase() !== DEFAULT_ICON_COLOR ? normalized : null;

    this.currentIconColor = effectiveColor;
    if (this.onColorChange) {
      this.onColorChange(effectiveColor);
    }

    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    if (hexInput) {
      hexInput.value = effectiveColor ?? "";
    }
    const shape = shapeSelect?.value || this.utilities.getCurrentIconValue();
    this.setIconShapeValue(shape);
    const cornerRadius = cornerInput ? Number(cornerInput.value) : DEFAULT_ICON_CORNER_RADIUS;
    const effectiveRadius = Number.isFinite(cornerRadius) ? cornerRadius : DEFAULT_ICON_CORNER_RADIUS;

    this.currentIconCornerRadius = effectiveRadius;
    if (this.onCornerRadiusChange) {
      this.onCornerRadiusChange(effectiveRadius);
    }

    this.closeIconEditor();
  }

  private setIconShapeValue(shape: string): void {
    const input = document.getElementById(
      ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
    ) as HTMLInputElement | null;
    if (!input) return;
    input.value = shape;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
