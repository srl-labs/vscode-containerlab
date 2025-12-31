/**
 * Easter Egg Renderer - Renders the active easter egg mode component.
 * Extracts duplicated conditional rendering logic from App.tsx.
 */

import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { UseEasterEggReturn } from './useEasterEgg';
import {
  NightcallMode,
  StickerbushMode,
  AquaticAmbienceMode,
  VaporwaveMode,
  DeusExMode,
  FinalCountdownMode,
} from './modes';

interface EasterEggRendererProps {
  easterEgg: UseEasterEggReturn;
  cyInstance: CyCore | null;
}

/**
 * Renders the appropriate easter egg mode based on current state.
 * All modes receive identical props, so we use a switch for cleaner code.
 */
export const EasterEggRenderer: React.FC<EasterEggRendererProps> = ({
  easterEgg,
  cyInstance,
}) => {
  const { state, endPartyMode, nextMode, getModeName } = easterEgg;

  const commonProps = {
    isActive: state.isPartyMode,
    onClose: endPartyMode,
    onSwitchMode: nextMode,
    modeName: getModeName(),
    cyInstance,
  };

  switch (state.easterEggMode) {
    case 'nightcall':
      return <NightcallMode {...commonProps} />;
    case 'stickerbrush':
      return <StickerbushMode {...commonProps} />;
    case 'aquatic':
      return <AquaticAmbienceMode {...commonProps} />;
    case 'vaporwave':
      return <VaporwaveMode {...commonProps} />;
    case 'deusex':
      return <DeusExMode {...commonProps} />;
    case 'finalcountdown':
      return <FinalCountdownMode {...commonProps} />;
    default:
      return null;
  }
};
