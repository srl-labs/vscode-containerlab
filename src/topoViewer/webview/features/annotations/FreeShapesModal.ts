import { FreeShapeAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';
import {
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE
} from './FreeShapesSvgRenderer';

const PANEL_FREE_SHAPES_ID = 'panel-free-shapes';
const CLASS_HAS_CHANGES = 'btn-has-changes';

export interface ShapeModalElements {
  panel: HTMLDivElement;
  titleEl: HTMLSpanElement;
  closeBtn: HTMLButtonElement;
  typeSelect: HTMLSelectElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  fillColorInput: HTMLInputElement;
  fillOpacityInput: HTMLInputElement;
  fillOpacityValue: HTMLSpanElement;
  fillControls: HTMLDivElement;
  borderColorInput: HTMLInputElement;
  borderColorLabel: HTMLLabelElement;
  borderWidthInput: HTMLInputElement;
  borderWidthLabel: HTMLLabelElement;
  borderStyleSelect: HTMLSelectElement;
  borderStyleLabel: HTMLLabelElement;
  cornerRadiusInput: HTMLInputElement;
  cornerRadiusControl: HTMLDivElement;
  lineStartArrowCheck: HTMLInputElement;
  lineEndArrowCheck: HTMLInputElement;
  arrowSizeInput: HTMLInputElement;
  lineControls: HTMLDivElement;
  sizeControls: HTMLDivElement;
  rotationInput: HTMLInputElement;
  rotationControl: HTMLDivElement;
  transparentBtn: HTMLButtonElement;
  noBorderBtn: HTMLButtonElement;
  applyBtn: HTMLButtonElement;
  okBtn: HTMLButtonElement;
}

type ShapeResolve = (annotation: FreeShapeAnnotation | null) => void;

/**
 * Handles the free shapes modal dialog for editing shape properties.
 */
export class FreeShapesModal {
  private initialValues: Record<string, string> | null = null;
  private onApplyCallback: ((annotation: FreeShapeAnnotation) => void) | null = null;

  /**
   * Prompt the user to edit a shape annotation via modal dialog.
   * Returns the modified annotation or null if cancelled.
   */
  public async promptForShape(
    title: string,
    annotation: FreeShapeAnnotation,
    onApply?: (annotation: FreeShapeAnnotation) => void
  ): Promise<FreeShapeAnnotation | null> {
    this.onApplyCallback = onApply ?? null;
    return new Promise((resolve) => {
      this.openShapeModal(title, annotation, resolve);
    });
  }

  private openShapeModal(title: string, annotation: FreeShapeAnnotation, resolve: ShapeResolve): void {
    const elements = this.getModalElements();
    if (!elements) {
      resolve(null);
      return;
    }

    this.initializeModal(title, annotation, elements);
    this.setupModalHandlers(annotation, elements, resolve);

    // Capture initial values for change tracking after a small delay to ensure DOM is updated
    setTimeout(() => {
      this.initialValues = this.captureValues(elements);
      this.updateApplyButtonState(elements);
    }, 0);

    // Set up change tracking on all inputs
    this.setupChangeTracking(elements);

    this.showModal(elements);
  }

  private getModalElements(): ShapeModalElements | null {
    const elements = {
      panel: document.getElementById(PANEL_FREE_SHAPES_ID) as HTMLDivElement | null,
      titleEl: document.getElementById(`${PANEL_FREE_SHAPES_ID}-title`) as HTMLSpanElement | null,
      closeBtn: document.getElementById(`${PANEL_FREE_SHAPES_ID}-close`) as HTMLButtonElement | null,
      typeSelect: document.getElementById('free-shapes-type') as HTMLSelectElement | null,
      widthInput: document.getElementById('free-shapes-width') as HTMLInputElement | null,
      heightInput: document.getElementById('free-shapes-height') as HTMLInputElement | null,
      fillColorInput: document.getElementById('free-shapes-fill-color') as HTMLInputElement | null,
      fillOpacityInput: document.getElementById('free-shapes-fill-opacity') as HTMLInputElement | null,
      fillOpacityValue: document.getElementById('free-shapes-fill-opacity-value') as HTMLSpanElement | null,
      fillControls: document.getElementById('free-shapes-fill-controls') as HTMLDivElement | null,
      borderColorInput: document.getElementById('free-shapes-border-color') as HTMLInputElement | null,
      borderColorLabel: document.getElementById('free-shapes-border-color-label') as HTMLLabelElement | null,
      borderWidthInput: document.getElementById('free-shapes-border-width') as HTMLInputElement | null,
      borderWidthLabel: document.getElementById('free-shapes-border-width-label') as HTMLLabelElement | null,
      borderStyleSelect: document.getElementById('free-shapes-border-style') as HTMLSelectElement | null,
      borderStyleLabel: document.getElementById('free-shapes-border-style-label') as HTMLLabelElement | null,
      cornerRadiusInput: document.getElementById('free-shapes-corner-radius') as HTMLInputElement | null,
      cornerRadiusControl: document.getElementById('free-shapes-corner-radius-control') as HTMLDivElement | null,
      lineStartArrowCheck: document.getElementById('free-shapes-line-start-arrow') as HTMLInputElement | null,
      lineEndArrowCheck: document.getElementById('free-shapes-line-end-arrow') as HTMLInputElement | null,
      arrowSizeInput: document.getElementById('free-shapes-arrow-size') as HTMLInputElement | null,
      lineControls: document.getElementById('free-shapes-line-controls') as HTMLDivElement | null,
      sizeControls: document.getElementById('free-shapes-size-controls') as HTMLDivElement | null,
      rotationInput: document.getElementById('free-shapes-rotation') as HTMLInputElement | null,
      rotationControl: document.getElementById('free-shapes-rotation-control') as HTMLDivElement | null,
      transparentBtn: document.getElementById('free-shapes-transparent-btn') as HTMLButtonElement | null,
      noBorderBtn: document.getElementById('free-shapes-no-border-btn') as HTMLButtonElement | null,
      applyBtn: document.getElementById('free-shapes-apply-btn') as HTMLButtonElement | null,
      okBtn: document.getElementById('free-shapes-ok-btn') as HTMLButtonElement | null,
    };

    if (Object.values(elements).some(el => el === null)) {
      log.error('Free shapes modal elements not found');
      return null;
    }

    return elements as ShapeModalElements;
  }

  private initializeModal(title: string, annotation: FreeShapeAnnotation, els: ShapeModalElements): void {
    els.titleEl.textContent = title;
    els.typeSelect.value = annotation.shapeType;
    els.widthInput.value = String(annotation.width ?? DEFAULT_SHAPE_WIDTH);
    els.heightInput.value = String(annotation.height ?? DEFAULT_SHAPE_HEIGHT);
    els.fillColorInput.value = annotation.fillColor ?? DEFAULT_FILL_COLOR;
    els.fillOpacityInput.value = String(Math.round((annotation.fillOpacity ?? DEFAULT_FILL_OPACITY) * 100));
    els.fillOpacityValue.textContent = `${Math.round((annotation.fillOpacity ?? DEFAULT_FILL_OPACITY) * 100)}%`;
    els.borderColorInput.value = annotation.borderColor ?? DEFAULT_BORDER_COLOR;
    els.borderWidthInput.value = String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH);
    els.borderStyleSelect.value = annotation.borderStyle ?? DEFAULT_BORDER_STYLE;
    els.cornerRadiusInput.value = String(annotation.cornerRadius ?? 0);
    els.lineStartArrowCheck.checked = annotation.lineStartArrow ?? false;
    els.lineEndArrowCheck.checked = annotation.lineEndArrow ?? false;
    els.arrowSizeInput.value = String(annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE);
    els.rotationInput.value = String(annotation.rotation ?? 0);

    this.updateControlVisibility(annotation.shapeType, els);
  }

  private updateControlVisibility(shapeType: string, els: ShapeModalElements): void {
    const isLine = shapeType === 'line';

    // Size controls (hidden for lines)
    els.sizeControls.style.display = isLine ? 'none' : 'grid';

    // Line-specific controls
    els.lineControls.style.display = isLine ? 'block' : 'none';

    // Corner radius (only for rectangles)
    els.cornerRadiusControl.style.display = shapeType === 'rectangle' ? 'block' : 'none';

    // Fill controls (hidden for lines - lines don't have fill)
    els.fillControls.style.display = isLine ? 'none' : 'grid';

    // Rotation (hidden for lines - line angle is determined by endpoints)
    els.rotationControl.style.display = isLine ? 'none' : 'block';

    // Update labels for lines
    els.borderColorLabel.textContent = isLine ? 'Line Color:' : 'Border Color:';
    els.borderWidthLabel.textContent = isLine ? 'Line Width:' : 'Border Width:';
    els.borderStyleLabel.textContent = isLine ? 'Line Style:' : 'Border Style:';
  }

  private setupChangeTracking(els: ShapeModalElements): void {
    const updateState = () => this.updateApplyButtonState(els);

    const inputs = [
      els.typeSelect, els.widthInput, els.heightInput,
      els.fillColorInput, els.fillOpacityInput,
      els.borderColorInput, els.borderWidthInput, els.borderStyleSelect,
      els.cornerRadiusInput, els.lineStartArrowCheck, els.lineEndArrowCheck,
      els.arrowSizeInput, els.rotationInput
    ];

    inputs.forEach(input => {
      if (input) {
        input.addEventListener('input', updateState);
        input.addEventListener('change', updateState);
      }
    });
  }

  private captureValues(els: ShapeModalElements): Record<string, string> {
    return {
      type: els.typeSelect.value,
      width: els.widthInput.value,
      height: els.heightInput.value,
      fillColor: els.fillColorInput.value,
      fillOpacity: els.fillOpacityInput.value,
      borderColor: els.borderColorInput.value,
      borderWidth: els.borderWidthInput.value,
      borderStyle: els.borderStyleSelect.value,
      cornerRadius: els.cornerRadiusInput.value,
      lineStartArrow: String(els.lineStartArrowCheck.checked),
      lineEndArrow: String(els.lineEndArrowCheck.checked),
      arrowSize: els.arrowSizeInput.value,
      rotation: els.rotationInput.value
    };
  }

  private hasChanges(els: ShapeModalElements): boolean {
    if (!this.initialValues) return false;
    const current = this.captureValues(els);
    return Object.keys(this.initialValues).some(
      key => this.initialValues![key] !== current[key]
    );
  }

  private updateApplyButtonState(els: ShapeModalElements): void {
    const { applyBtn } = els;
    if (!applyBtn) return;
    const hasChanges = this.hasChanges(els);
    applyBtn.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  private resetInitialValues(els: ShapeModalElements): void {
    this.initialValues = this.captureValues(els);
    this.updateApplyButtonState(els);
  }

  private setupModalHandlers(annotation: FreeShapeAnnotation, els: ShapeModalElements, resolve: ShapeResolve): void {
    const cleanup = () => {
      this.hideModal(els);
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    els.typeSelect.addEventListener('change', () => {
      this.updateControlVisibility(els.typeSelect.value, els);
    });

    els.fillOpacityInput.addEventListener('input', () => {
      els.fillOpacityValue.textContent = `${els.fillOpacityInput.value}%`;
    });

    els.transparentBtn.addEventListener('click', () => {
      els.fillOpacityInput.value = '0';
      els.fillOpacityValue.textContent = '0%';
    });

    els.noBorderBtn.addEventListener('click', () => {
      els.borderWidthInput.value = '0';
    });

    // Close button just closes without saving
    els.closeBtn.addEventListener('click', handleCancel);

    const buildResult = (): FreeShapeAnnotation => ({
      ...annotation,
      shapeType: els.typeSelect.value as 'rectangle' | 'circle' | 'line',
      width: parseInt(els.widthInput.value),
      height: parseInt(els.heightInput.value),
      fillColor: els.fillColorInput.value,
      fillOpacity: parseInt(els.fillOpacityInput.value) / 100,
      borderColor: els.borderColorInput.value,
      borderWidth: parseInt(els.borderWidthInput.value),
      borderStyle: els.borderStyleSelect.value as 'solid' | 'dashed' | 'dotted',
      cornerRadius: parseInt(els.cornerRadiusInput.value),
      lineStartArrow: els.lineStartArrowCheck.checked,
      lineEndArrow: els.lineEndArrowCheck.checked,
      lineArrowSize: parseInt(els.arrowSizeInput.value),
      rotation: parseInt(els.rotationInput.value)
    });

    // Apply changes without closing or resolving
    const applyChanges = () => {
      const result = buildResult();
      // Update annotation in place
      Object.assign(annotation, result);
      // Call the apply callback if provided
      if (this.onApplyCallback) {
        this.onApplyCallback(result);
      }
      // Reset initial values after successful apply
      this.resetInitialValues(els);
    };

    // Apply saves but keeps panel open (doesn't resolve promise)
    els.applyBtn.addEventListener('click', applyChanges);

    // OK saves and closes
    els.okBtn.addEventListener('click', () => {
      cleanup();
      resolve(buildResult());
    });
  }

  private showModal(els: ShapeModalElements): void {
    // Use window manager to show the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_SHAPES_ID);
    if (managedWindow) {
      managedWindow.show();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'flex';
    }
  }

  private hideModal(els: ShapeModalElements): void {
    // Use window manager to hide the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_SHAPES_ID);
    if (managedWindow) {
      managedWindow.hide();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'none';
    }
  }
}
