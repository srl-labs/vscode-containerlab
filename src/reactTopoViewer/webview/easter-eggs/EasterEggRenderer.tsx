/**
 * Easter Egg Renderer - Renders the active easter egg mode component.
 * Extracts duplicated conditional rendering logic from App.tsx.
 */

import React from "react";

import type { CyCompatCore } from "../hooks/useCytoCompatInstance";
import type { UseEasterEggReturn } from "./useEasterEgg";
import {
  NightcallMode,
  StickerbushMode,
  AquaticAmbienceMode,
  VaporwaveMode,
  DeusExMode
} from "./modes";

interface EasterEggRendererProps {
  easterEgg: UseEasterEggReturn;
  cyCompat: CyCompatCore | null;
}

/**
 * Renders the appropriate easter egg mode based on current state.
 * All modes receive identical props, so we use a switch for cleaner code.
 */
export const EasterEggRenderer: React.FC<EasterEggRendererProps> = ({ easterEgg, cyCompat }) => {
  const { state, endPartyMode, nextMode, getModeName } = easterEgg;

  const commonProps = {
    isActive: state.isPartyMode,
    onClose: endPartyMode,
    onSwitchMode: nextMode,
    modeName: getModeName(),
    cyCompat
  };

  switch (state.easterEggMode) {
    case "nightcall":
      return <NightcallMode {...commonProps} />;
    case "stickerbrush":
      return <StickerbushMode {...commonProps} />;
    case "aquatic":
      return <AquaticAmbienceMode {...commonProps} />;
    case "vaporwave":
      return <VaporwaveMode {...commonProps} />;
    case "deusex":
      return <DeusExMode {...commonProps} />;
    default:
      return null;
  }
};
