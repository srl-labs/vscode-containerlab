import * as vscode from "vscode";

import { extensionContext } from "../../../globals";
import {
  TOPOVIEWER_FONT_SCALE_DEFAULT,
  resolveTopoViewerFontScale
} from "../../shared/constants/topoViewerFontScale";

const TOPOVIEWER_FONT_SCALE_STATE_KEY = "reactTopoViewer.fontScale";
const LEGACY_FONT_SCALE_CONFIG_SECTION = "containerlab.ui";
const LEGACY_FONT_SCALE_CONFIG_KEY = "fontScale";

const fontScaleChangeEmitter = new vscode.EventEmitter<number>();
let previewFontScale: number | undefined;

function getLegacyTopoViewerFontScale(): number {
  const legacyValue = vscode.workspace
    .getConfiguration(LEGACY_FONT_SCALE_CONFIG_SECTION)
    .get<number>(LEGACY_FONT_SCALE_CONFIG_KEY, TOPOVIEWER_FONT_SCALE_DEFAULT);

  return resolveTopoViewerFontScale(legacyValue);
}

export function getStoredTopoViewerFontScale(): number {
  const storedValue = extensionContext?.globalState.get<number>(TOPOVIEWER_FONT_SCALE_STATE_KEY);
  if (typeof storedValue === "number" && Number.isFinite(storedValue)) {
    return resolveTopoViewerFontScale(storedValue);
  }

  return getLegacyTopoViewerFontScale();
}

export function getEffectiveTopoViewerFontScale(): number {
  return previewFontScale ?? getStoredTopoViewerFontScale();
}

export function previewTopoViewerFontScale(value: number): number {
  const fontScale = resolveTopoViewerFontScale(value);
  previewFontScale = fontScale;
  fontScaleChangeEmitter.fire(fontScale);
  return fontScale;
}

export function resetTopoViewerFontScalePreview(): number {
  previewFontScale = undefined;
  const fontScale = getStoredTopoViewerFontScale();
  fontScaleChangeEmitter.fire(fontScale);
  return fontScale;
}

export async function setStoredTopoViewerFontScale(value: number): Promise<number> {
  const fontScale = resolveTopoViewerFontScale(value);

  await extensionContext.globalState.update(TOPOVIEWER_FONT_SCALE_STATE_KEY, fontScale);
  previewFontScale = undefined;
  fontScaleChangeEmitter.fire(fontScale);

  return fontScale;
}

export const onDidChangeTopoViewerFontScale = fontScaleChangeEmitter.event;
