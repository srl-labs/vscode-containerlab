import React from "react";
import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

const HEADER_SX = { px: 2, py: 1 } as const;
const HEADER_WITH_ACTION_SX = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  px: 2,
  py: 1,
} as const;
const DEFAULT_FORM_BODY_SX = { display: "flex", flexDirection: "column", gap: 1.5, p: 2 } as const;
const DEFAULT_LIST_BODY_SX = { p: 2 } as const;

interface PanelSectionHeaderProps {
  title: string;
  withTopDivider?: boolean;
}

export const PanelSectionHeader: React.FC<PanelSectionHeaderProps> = ({
  title,
  withTopDivider = true,
}) => (
  <>
    {withTopDivider && <Divider />}
    <Box sx={HEADER_SX}>
      <Typography variant="subtitle2">{title}</Typography>
    </Box>
    <Divider />
  </>
);

interface PanelSectionProps {
  title: string;
  children: React.ReactNode;
  withTopDivider?: boolean;
  bodySx?: SxProps<Theme>;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  title,
  children,
  withTopDivider = true,
  bodySx = DEFAULT_FORM_BODY_SX,
}) => (
  <>
    <PanelSectionHeader title={title} withTopDivider={withTopDivider} />
    <Box sx={bodySx}>{children}</Box>
  </>
);

interface PanelAddSectionProps {
  title: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel?: string;
  withTopDivider?: boolean;
  bodySx?: SxProps<Theme>;
  addDisabled?: boolean;
  addTitle?: string;
}

export const PanelAddSection: React.FC<PanelAddSectionProps> = ({
  title,
  children,
  onAdd,
  addLabel = "ADD",
  withTopDivider = true,
  bodySx = DEFAULT_LIST_BODY_SX,
  addDisabled = false,
  addTitle,
}) => (
  <>
    {withTopDivider && <Divider />}
    <Box sx={HEADER_WITH_ACTION_SX}>
      <Typography variant="subtitle2">{title}</Typography>
      <Button
        variant="text"
        size="small"
        startIcon={<AddIcon />}
        onClick={onAdd}
        disabled={addDisabled}
        title={addDisabled ? addTitle : undefined}
        sx={{ py: 0 }}
      >
        {addLabel}
      </Button>
    </Box>
    <Divider />
    <Box sx={bodySx}>{children}</Box>
  </>
);
