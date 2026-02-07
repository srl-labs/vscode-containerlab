/**
 * PaletteView - Wraps PaletteSection for use in ContextPanel
 */
import React from "react";

import { PaletteSection } from "../../lab-drawer/PaletteSection";

export interface PaletteViewProps {
  mode?: "edit" | "view";
  isLocked?: boolean;
  onEditCustomNode: (name: string) => void;
  onDeleteCustomNode: (name: string) => void;
  onSetDefaultCustomNode: (name: string) => void;
}

export const PaletteView: React.FC<PaletteViewProps> = (props) => {
  return <PaletteSection {...props} />;
};
