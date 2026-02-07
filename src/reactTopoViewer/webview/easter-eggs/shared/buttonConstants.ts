/**
 * Shared button constants for Easter Egg modes
 */
import type { SxProps, Theme } from "@mui/material/styles";

/** Button visible state sx */
export const BTN_VISIBLE_SX: SxProps<Theme> = {
  opacity: 1,
  transform: "translateY(0)"
};

/** Button hidden state sx */
export const BTN_HIDDEN_SX: SxProps<Theme> = {
  opacity: 0,
  transform: "translateY(16px)"
};

/** Button backdrop blur value */
export const BTN_BLUR = "blur(10px)";
