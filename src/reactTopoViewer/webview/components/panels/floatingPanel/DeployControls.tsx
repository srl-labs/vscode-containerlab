/**
 * Deploy button controls and drawer for FloatingActionPanel
 */
import React from "react";

/**
 * Panel Button Component
 */
interface PanelButtonProps {
  icon: string;
  tooltip: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  testId?: string;
  /** When true, applies active/highlighted styling to indicate the tool is selected */
  active?: boolean;
}

export const PanelButton: React.FC<PanelButtonProps> = ({
  icon,
  tooltip,
  onClick,
  disabled = false,
  variant = "secondary",
  testId,
  active = false
}) => {
  const getClass = () => {
    if (disabled) return "floating-panel-btn disabled";
    if (active) return "floating-panel-btn active";
    if (variant === "primary") return "floating-panel-btn primary";
    if (variant === "danger") return "floating-panel-btn danger";
    return "floating-panel-btn";
  };

  return (
    <button
      className={getClass()}
      title={tooltip}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <i className={`fas ${icon}`}></i>
    </button>
  );
};

/**
 * Drawer Button Component
 */
interface DrawerButtonProps {
  icon: string;
  tooltip: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  testId?: string;
}

export const DrawerButton: React.FC<DrawerButtonProps> = ({
  icon,
  tooltip,
  onClick,
  variant = "default",
  testId
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <button
      className={`floating-panel-btn ${variant === "danger" ? "danger" : ""}`}
      title={tooltip}
      onClick={handleClick}
      data-testid={testId}
    >
      <i className={`fas ${icon}`}></i>
    </button>
  );
};

/**
 * Processing mode type
 */
type ProcessingMode = "deploy" | "destroy" | null;

/**
 * Deploy Button Group with hover drawer
 */
interface DeployButtonGroupProps {
  isViewerMode: boolean;
  drawerSide: "left" | "right";
  onDeployClick: () => void;
  onDeployCleanup?: () => void;
  onDestroyCleanup?: () => void;
  onRedeploy?: () => void;
  onRedeployCleanup?: () => void;
  isProcessing?: boolean;
  processingMode?: ProcessingMode;
}

export const DeployButtonGroup: React.FC<DeployButtonGroupProps> = ({
  isViewerMode,
  drawerSide,
  onDeployClick,
  onDeployCleanup,
  onDestroyCleanup,
  onRedeploy,
  onRedeployCleanup,
  isProcessing = false,
  processingMode = null
}) => {
  // Build button class with processing state
  const getButtonClass = () => {
    const classes = ["floating-panel-btn", "primary"];
    if (isProcessing) {
      classes.push("processing");
      if (processingMode === "deploy") {
        classes.push("processing--deploy");
      } else if (processingMode === "destroy") {
        classes.push("processing--destroy");
      }
    }
    return classes.join(" ");
  };

  return (
    <div className={`deploy-button-group drawer-${drawerSide}`}>
      <button
        className={getButtonClass()}
        title={isViewerMode ? "Destroy Lab" : "Deploy Lab"}
        onClick={onDeployClick}
        disabled={isProcessing}
      >
        <i className={`fas ${isViewerMode ? "fa-stop" : "fa-play"}`}></i>
      </button>

      {/* Hide drawer when processing */}
      {!isProcessing && (
        <div className="deploy-drawer">
          {!isViewerMode && (
            <DrawerButton
              icon="fa-broom"
              tooltip="Deploy (cleanup)"
              onClick={onDeployCleanup}
              variant="danger"
            />
          )}
          {isViewerMode && (
            <>
              <DrawerButton
                icon="fa-broom"
                tooltip="Destroy (cleanup)"
                onClick={onDestroyCleanup}
                variant="danger"
              />
              <DrawerButton icon="fa-redo" tooltip="Redeploy" onClick={onRedeploy} />
              <DrawerButton
                icon="fa-redo"
                tooltip="Redeploy (cleanup)"
                onClick={onRedeployCleanup}
                variant="danger"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};
