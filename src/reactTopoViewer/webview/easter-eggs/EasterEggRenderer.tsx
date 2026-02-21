/**
 * Easter Egg Renderer - Renders the active easter egg mode component.
 * Extracts duplicated conditional rendering logic from App.tsx.
 */

import React from "react";

import {
  NightcallMode,
  StickerbushMode,
  AquaticAmbienceMode,
  VaporwaveMode,
  DeusExMode,
} from "./modes";
import type { UseEasterEggReturn } from "./useEasterEgg";

interface EasterEggRendererProps {
  easterEgg: UseEasterEggReturn;
}

/**
 * Renders the appropriate easter egg mode based on current state.
 */
export const EasterEggRenderer: React.FC<EasterEggRendererProps> = ({ easterEgg }) => {
  const { state, endPartyMode, nextMode, getModeName } = easterEgg;
  const { isPartyMode, easterEggMode } = state;

  if (!isPartyMode) return null;

  const commonProps = {
    isActive: isPartyMode,
    onClose: endPartyMode,
    onSwitchMode: nextMode,
    modeName: getModeName(),
  };

  switch (easterEggMode) {
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
