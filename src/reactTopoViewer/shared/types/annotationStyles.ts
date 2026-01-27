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
