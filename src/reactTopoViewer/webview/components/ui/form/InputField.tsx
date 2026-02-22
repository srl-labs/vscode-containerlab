// Text or number input field.
import React from "react";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ClearIcon from "@mui/icons-material/Clear";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { SxProps, Theme } from "@mui/material/styles";

interface InputFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
  helperText?: string;
  tooltip?: string;
  required?: boolean;
  error?: boolean;
  /** Fixed text suffix shown inside the input (e.g. "seconds") */
  suffix?: string;
  /** Show a clear (×) button when the field has a value */
  clearable?: boolean;
}

const NUMBER_INPUT_SX: SxProps<Theme> = {
  "& input[type=number]": {
    MozAppearance: "textfield"
  },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
    {
      WebkitAppearance: "none",
      margin: 0
    }
};

const STEPPER_BUTTON_SX: SxProps<Theme> = {
  width: 18,
  height: 14,
  p: 0,
  borderRadius: 0.5,
  border: "1px solid",
  borderColor: "var(--vscode-input-border)",
  color: "text.secondary",
  "&:hover": {
    bgcolor: "action.hover",
    color: "text.primary",
    borderColor: "var(--vscode-focusBorder, var(--vscode-input-border))"
  }
};

const STEPPER_ICON_SX: SxProps<Theme> = { fontSize: 12 };

const parseNumericValue = (value: string): number | undefined => {
  const numericValue = Number(value);
  return value.trim().length > 0 && Number.isFinite(numericValue) ? numericValue : undefined;
};

const decimalPlaces = (n?: number): number => {
  if (n === undefined || !Number.isFinite(n)) return 0;
  const text = n.toString();
  if (text.includes("e-")) {
    const exponent = Number(text.split("e-")[1] ?? "0");
    return Number.isFinite(exponent) ? exponent : 0;
  }
  const dot = text.indexOf(".");
  return dot >= 0 ? text.length - dot - 1 : 0;
};

const formatNumber = (value: number, precision: number): string => {
  const normalized = precision > 0 ? Number(value.toFixed(precision)) : Math.round(value);
  return String(normalized);
};

const normalizeStep = (step?: number): number => (step !== undefined && step > 0 ? step : 1);

const getPrecision = (safeStep: number, min?: number, max?: number): number =>
  Math.max(decimalPlaces(safeStep), decimalPlaces(min), decimalPlaces(max));

const clampNumber = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

const hasContent = (value?: string): boolean => value !== undefined && value.length > 0;

const getInputSx = (isNumberField: boolean): SxProps<Theme> | undefined =>
  isNumberField ? NUMBER_INPUT_SX : undefined;

interface AdornmentStateOptions {
  clearable?: boolean;
  value: string;
  disabled?: boolean;
  tooltip?: string;
  suffix?: string;
  isNumberField: boolean;
  min?: number;
  max?: number;
  parsedValue?: number;
}

interface AdornmentState {
  showClear: boolean;
  hasTooltip: boolean;
  hasSuffix: boolean;
  showStepper: boolean;
  canStepDown: boolean;
  canStepUp: boolean;
  stepperRightGap: number;
  suffixRightGap: number;
  tooltipText: string;
  hasEndAdornment: boolean;
}

const getAdornmentState = ({
  clearable,
  value,
  disabled,
  tooltip,
  suffix,
  isNumberField,
  min,
  max,
  parsedValue
}: AdornmentStateOptions): AdornmentState => {
  const canInteract = disabled !== true;
  const showClear = clearable === true && value.length > 0 && canInteract;
  const hasTooltip = hasContent(tooltip);
  const hasSuffix = hasContent(suffix);
  const showStepper = isNumberField && canInteract;
  const canStepDown = min === undefined || parsedValue === undefined || parsedValue > min;
  const canStepUp = max === undefined || parsedValue === undefined || parsedValue < max;
  const stepperRightGap = hasSuffix ? 0.75 : 0.5;
  const suffixRightGap = showClear || hasTooltip ? 0.5 : 0;
  const hasEndAdornment = hasTooltip || hasSuffix || showClear || showStepper;

  return {
    showClear,
    hasTooltip,
    hasSuffix,
    showStepper,
    canStepDown,
    canStepUp,
    stepperRightGap,
    suffixRightGap,
    tooltipText: tooltip ?? "",
    hasEndAdornment
  };
};

interface CreateStepHandlerOptions {
  isNumberField: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  parsedValue?: number;
  safeStep: number;
  precision: number;
  onChange: (value: string) => void;
}

const createStepHandler =
  ({
    isNumberField,
    disabled,
    min,
    max,
    parsedValue,
    safeStep,
    precision,
    onChange
  }: CreateStepHandlerOptions) =>
  (direction: 1 | -1): void => {
    if (!isNumberField || disabled === true) return;
    const fallbackBase = direction > 0 ? (min ?? 0) : (max ?? min ?? 0);
    const base = parsedValue ?? fallbackBase;
    const stepped = clampNumber(base + direction * safeStep, min, max);
    onChange(formatNumber(stepped, precision));
  };

interface StepperButtonProps {
  direction: 1 | -1;
  onStep: (direction: 1 | -1) => void;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}

const StepperButton: React.FC<StepperButtonProps> = ({
  direction,
  onStep,
  disabled,
  label,
  icon
}) => (
  <IconButton
    size="small"
    onClick={() => onStep(direction)}
    onMouseDown={(e) => e.preventDefault()}
    edge="end"
    disabled={disabled}
    aria-label={label}
    sx={STEPPER_BUTTON_SX}
  >
    {icon}
  </IconButton>
);

interface InputEndAdornmentProps {
  showStepper: boolean;
  canStepUp: boolean;
  canStepDown: boolean;
  onStep: (direction: 1 | -1) => void;
  stepperRightGap: number;
  hasSuffix: boolean;
  suffix?: string;
  suffixRightGap: number;
  showClear: boolean;
  onClear: () => void;
  hasTooltip: boolean;
  tooltipText: string;
}

const InputEndAdornment: React.FC<InputEndAdornmentProps> = ({
  showStepper,
  canStepUp,
  canStepDown,
  onStep,
  stepperRightGap,
  hasSuffix,
  suffix,
  suffixRightGap,
  showClear,
  onClear,
  hasTooltip,
  tooltipText
}) => (
  <InputAdornment position="end">
    {showStepper ? (
      <Box sx={{ display: "flex", flexDirection: "column", mr: stepperRightGap, gap: 0.25 }}>
        <StepperButton
          direction={1}
          onStep={onStep}
          disabled={!canStepUp}
          label="Increase value"
          icon={<KeyboardArrowUpIcon sx={STEPPER_ICON_SX} />}
        />
        <StepperButton
          direction={-1}
          onStep={onStep}
          disabled={!canStepDown}
          label="Decrease value"
          icon={<KeyboardArrowDownIcon sx={STEPPER_ICON_SX} />}
        />
      </Box>
    ) : null}
    {hasSuffix ? (
      <Typography color="text.secondary" sx={{ mr: suffixRightGap }}>
        {suffix}
      </Typography>
    ) : null}
    {showClear ? (
      <IconButton size="small" onClick={onClear} edge="end" tabIndex={-1}>
        <ClearIcon fontSize="small" />
      </IconButton>
    ) : null}
    {hasTooltip ? (
      <Tooltip title={tooltipText} arrow>
        <IconButton size="small" edge="end" tabIndex={-1}>
          <InfoOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    ) : null}
  </InputAdornment>
);

export const InputField: React.FC<InputFieldProps> = ({
  id,
  value,
  onChange,
  label,
  placeholder,
  type = "text",
  min,
  max,
  step,
  disabled,
  helperText,
  tooltip,
  required,
  error,
  suffix,
  clearable
}) => {
  const isNumberField = type === "number";
  const safeStep = normalizeStep(step);
  const parsedValue = parseNumericValue(value);
  const precision = getPrecision(safeStep, min, max);
  const handleStep = createStepHandler({
    isNumberField,
    disabled,
    min,
    max,
    parsedValue,
    safeStep,
    precision,
    onChange
  });
  const adornmentState = getAdornmentState({
    clearable,
    value,
    disabled,
    tooltip,
    suffix,
    isNumberField,
    min,
    max,
    parsedValue
  });
  const inputSlotProps = adornmentState.hasEndAdornment
    ? {
        endAdornment: (
          <InputEndAdornment
            showStepper={adornmentState.showStepper}
            canStepUp={adornmentState.canStepUp}
            canStepDown={adornmentState.canStepDown}
            onStep={handleStep}
            stepperRightGap={adornmentState.stepperRightGap}
            hasSuffix={adornmentState.hasSuffix}
            suffix={suffix}
            suffixRightGap={adornmentState.suffixRightGap}
            showClear={adornmentState.showClear}
            onClear={() => onChange("")}
            hasTooltip={adornmentState.hasTooltip}
            tooltipText={adornmentState.tooltipText}
          />
        )
      }
    : undefined;

  return (
    <TextField
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      size="small"
      fullWidth
      required={required}
      error={error}
      helperText={helperText}
      sx={getInputSx(isNumberField)}
      slotProps={{
        htmlInput: {
          min,
          max,
          step
        },
        input: inputSlotProps
      }}
    />
  );
};
