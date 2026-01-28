/**
 * Shared context menu for annotations
 */
import React, { useRef, useEffect } from "react";

interface AnnotationContextMenuProps {
  position: { x: number; y: number };
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const menuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 10000,
  backgroundColor: "rgba(30, 30, 30, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "6px",
  padding: "4px 0",
  minWidth: "120px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
  pointerEvents: "auto"
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  padding: "8px 12px",
  border: "none",
  background: "none",
  color: "white",
  fontSize: "13px",
  cursor: "pointer",
  textAlign: "left"
};

// Shared hover handlers for menu items
const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
};
const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.backgroundColor = "transparent";
};

export const AnnotationContextMenu: React.FC<AnnotationContextMenuProps> = ({
  position,
  onEdit,
  onDelete,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} style={{ ...menuStyle, left: position.x, top: position.y }}>
      <button
        style={itemStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          onEdit();
          onClose();
        }}
      >
        <i className="fas fa-pen" style={{ width: 16 }} />
        Edit
      </button>
      <button
        style={itemStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <i className="fas fa-trash" style={{ width: 16 }} />
        Delete
      </button>
    </div>
  );
};
