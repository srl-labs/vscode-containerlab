// Icon preview with configurable corner radius.
import Avatar from "@mui/material/Avatar";
import type { FC } from "react";

interface IconPreviewProps {
  src: string;
  alt?: string;
  size: number;
  cornerRadius?: number;
}

export const IconPreview: FC<IconPreviewProps> = ({ src, alt = "", size, cornerRadius }) => (
  <Avatar
    variant="square"
    src={src}
    alt={alt}
    sx={{
      width: size,
      height: size,
      borderRadius:
        cornerRadius !== undefined && cornerRadius > 0 ? `${(cornerRadius / 48) * size}px` : 0,
    }}
  />
);
