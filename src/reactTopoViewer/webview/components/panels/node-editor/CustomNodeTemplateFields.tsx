// Custom node template fields.
import React, { useState, useCallback } from "react";
import {
  Check as CheckIcon,
  ContentCopy as ContentCopyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  InfoOutlined as InfoOutlinedIcon
} from "@mui/icons-material";
import {
  Box,
  Collapse,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";

import { InputField, CheckboxField, Section } from "../../ui/form";

import { copyToClipboard } from "../../../utils/clipboard";

import type { TabProps } from "./types";

/**
 * Interface pattern example with description
 */
interface PatternExample {
  pattern: string;
  description: string;
  result: string;
}

const PATTERN_EXAMPLES: PatternExample[] = [
  { pattern: "e1-{n}", description: "Sequential from 1", result: "e1-1, e1-2, e1-3..." },
  { pattern: "eth{n:0}", description: "Sequential from 0", result: "eth0, eth1, eth2..." },
  {
    pattern: "Gi0/0/{n:1-4}",
    description: "Range 1-4 only",
    result: "Gi0/0/1, Gi0/0/2, Gi0/0/3, Gi0/0/4"
  },
  { pattern: "xe-0/0/{n:0}", description: "Juniper style", result: "xe-0/0/0, xe-0/0/1..." }
];

/**
 * Copyable code snippet with copy button
 */
const CopyableCode: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <Box
      component="button"
      onClick={() => void handleCopy()}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        fontFamily: "monospace",
        px: 1,
        py: 0.25,
        borderRadius: 0.5,
        bgcolor: "action.hover",
        border: 1,
        borderColor: "divider",
        cursor: "pointer",
        "&:hover": { bgcolor: "action.selected" }
      }}
      title="Click to copy"
    >
      <span>{text}</span>
      {copied ? (
        <CheckIcon sx={{ fontSize: 12, color: "success.main" }} />
      ) : (
        <ContentCopyIcon sx={{ fontSize: 12, opacity: 0.6 }} />
      )}
    </Box>
  );
};

/**
 * Interface pattern info panel with examples
 */
const InterfacePatternInfo: React.FC<{ isExpanded: boolean; onToggle: () => void }> = ({
  isExpanded,
  onToggle
}) => {
  return (
    <Paper variant="outlined" sx={{ mt: 1, overflow: "hidden" }}>
      {/* Header - always visible */}
      <Box
        component="button"
        onClick={onToggle}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1,
          textAlign: "left",
          bgcolor: "action.hover",
          border: "none",
          cursor: "pointer",
          "&:hover": { bgcolor: "action.selected" }
        }}
      >
        {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        <InfoOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="caption" color="text.secondary">
          Pattern syntax: Use{" "}
          <Box component="code" sx={{ px: 0.5 }}>
            {"{n}"}
          </Box>{" "}
          for sequential numbering
        </Typography>
      </Box>

      {/* Expandable content */}
      <Collapse in={isExpanded}>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: (theme) => theme.typography.fontWeightMedium }}>
                  Pattern
                </TableCell>
                <TableCell sx={{ fontWeight: (theme) => theme.typography.fontWeightMedium }}>
                  Description
                </TableCell>
                <TableCell sx={{ fontWeight: (theme) => theme.typography.fontWeightMedium }}>
                  Result
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {PATTERN_EXAMPLES.map((example) => (
                <TableRow key={example.pattern}>
                  <TableCell sx={{ py: 0.75 }}>
                    <CopyableCode text={example.pattern} />
                  </TableCell>
                  <TableCell sx={{ py: 0.75, color: "text.secondary" }}>
                    {example.description}
                  </TableCell>
                  <TableCell sx={{ py: 0.75, color: "text.secondary", fontFamily: "monospace" }}>
                    {example.result}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Collapse>
    </Paper>
  );
};

/**
 * Custom Node Template fields - shown only when editing custom node templates
 */
export const CustomNodeTemplateFields: React.FC<TabProps> = ({ data, onChange }) => {
  const [showPatternInfo, setShowPatternInfo] = useState(false);

  return (
    <Section title="Custom Node Template">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <InputField
          id="node-custom-name"
          label="Template Name"
          value={data.customName || ""}
          onChange={(value) => onChange({ customName: value })}
          placeholder="Template name"
        />
        <InputField
          id="node-base-name"
          label="Base Name (for canvas)"
          value={data.baseName || ""}
          onChange={(value) => onChange({ baseName: value })}
          placeholder="e.g., srl (will become srl1, srl2, etc.)"
        />
        <CheckboxField
          id="node-custom-default"
          label="Set as default"
          checked={data.isDefaultCustomNode || false}
          onChange={(checked) => onChange({ isDefaultCustomNode: checked })}
        />
        <Box>
          <InputField
            id="node-interface-pattern"
            label="Interface Pattern"
            value={data.interfacePattern || ""}
            onChange={(value) => onChange({ interfacePattern: value })}
            placeholder="e.g., e1-{n} or Gi0/0/{n:0}"
          />
          <InterfacePatternInfo
            isExpanded={showPatternInfo}
            onToggle={() => setShowPatternInfo(!showPatternInfo)}
          />
        </Box>
      </Box>
    </Section>
  );
};
