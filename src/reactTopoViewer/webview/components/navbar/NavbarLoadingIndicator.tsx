/**
 * Navbar Loading Indicator Component
 * Shows a progress sweep animation during deployment/destroy operations
 */
import React from "react";

interface NavbarLoadingIndicatorProps {
  isActive: boolean;
  mode: "deploy" | "destroy" | null;
}

export const NavbarLoadingIndicator: React.FC<NavbarLoadingIndicatorProps> = ({
  isActive,
  mode
}) => {
  // Build class names based on state
  const indicatorClass = [
    "navbar-loading-indicator",
    isActive && "is-active",
    isActive && mode === "deploy" && "is-deploy",
    isActive && mode === "destroy" && "is-destroy"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={indicatorClass}>
      <div className="navbar-loading-indicator__bar" />
    </div>
  );
};
