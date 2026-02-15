// Icon preview with configurable corner radius.
import Avatar from "@mui/material/Avatar";

interface IconPreviewProps {
  src: string;
  alt?: string;
  size: number;
  cornerRadius?: number;
}

export const IconPreview: React.FC<IconPreviewProps> = ({ src, alt = "", size, cornerRadius }) => (
  <Avatar
    variant="square"
    src={src}
    alt={alt}
    sx={{
      width: size,
      height: size,
      borderRadius: cornerRadius ? `${(cornerRadius / 48) * size}px` : 0
    }}
  />
);
