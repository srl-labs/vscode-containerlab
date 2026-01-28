/**
 * Shared style properties for text annotations and nodes.
 */
export interface TextStyle {
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  rotation?: number;
  width?: number;
  height?: number;
  roundedBackground?: boolean;
}

/**
 * Shared style properties for box/group containers.
 */
export interface BoxStyle {
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dotted" | "dashed" | "double";
  borderRadius?: number;
  labelColor?: string;
  labelPosition?: string;
}
