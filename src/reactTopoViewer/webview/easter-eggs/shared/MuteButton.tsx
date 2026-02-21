/**
 * Shared Mute Button component for Easter Egg modes
 */

import React from "react";
import Box from "@mui/material/Box";

import { BTN_VISIBLE_SX, BTN_HIDDEN_SX, BTN_BLUR } from "./buttonConstants";

export interface MuteButtonProps {
  isMuted: boolean;
  onToggle: () => void;
  visible: boolean;
  /** Background gradient for unmuted state */
  unmutedBackground: string;
  /** Box shadow for unmuted state */
  unmutedShadow: string;
  /** Border color */
  borderColor?: string;
}

/** Muted speaker icon */
const MutedIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

/** Unmuted speaker icon */
const UnmutedIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

/** Muted state background */
const MUTED_BACKGROUND =
  "linear-gradient(135deg, rgba(100, 100, 100, 0.8) 0%, rgba(60, 60, 60, 0.8) 100%)";

/** Muted state shadow */
const MUTED_SHADOW = "0 0 20px rgba(100, 100, 100, 0.5), inset 0 0 20px rgba(60, 60, 60, 0.1)";

/**
 * Shared mute button component with consistent styling across all modes
 */
export const MuteButton: React.FC<MuteButtonProps> = ({
  isMuted,
  onToggle,
  visible,
  unmutedBackground,
  unmutedShadow,
  borderColor = "rgba(255, 255, 255, 0.5)",
}) => {
  return (
    <Box
      component="button"
      onClick={onToggle}
      sx={{
        p: 1.5,
        borderRadius: "50%",
        pointerEvents: "auto",
        transition: "all 0.5s",
        ...(visible ? BTN_VISIBLE_SX : BTN_HIDDEN_SX),
        background: isMuted ? MUTED_BACKGROUND : unmutedBackground,
        border: `2px solid ${borderColor}`,
        cursor: "pointer",
        backdropFilter: BTN_BLUR,
        boxShadow: isMuted ? MUTED_SHADOW : unmutedShadow,
      }}
      title={isMuted ? "Unmute" : "Mute"}
    >
      {isMuted ? <MutedIcon /> : <UnmutedIcon />}
    </Box>
  );
};
