import { postCommand } from "../../../messaging/extensionMessaging";
import type { NetemState } from "../../../../shared/parsing";
import { normalizeNetemPercentage } from "../../../utils/netemNormalization";

import type { LinkImpairmentData } from "./types";

// Field validations
const TIME_UNIT_RE = /^\d+(ms|s)$/;
const ERR_TIME_UNIT =
  "Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)";
const PERCENTAGE_RE = /^(?:100(?:\.0+)?|(?:0|[1-9]\d?)(?:\.\d+)?)$/;
const ERR_PERCENTAGE = "Input should be a number between 0 and 100.";
const NUMBER_RE = /^\d+$/;
const ERR_NUMBER = "Input should be a number.";

type FormatCheck = {
  format: RegExp;
  error: string;
};

const NETEM_FIELD_FORMAT: Record<keyof NetemState, FormatCheck> = {
  delay: { format: TIME_UNIT_RE, error: ERR_TIME_UNIT },
  jitter: { format: TIME_UNIT_RE, error: ERR_TIME_UNIT },
  loss: { format: PERCENTAGE_RE, error: ERR_PERCENTAGE },
  rate: { format: NUMBER_RE, error: ERR_NUMBER },
  corruption: { format: PERCENTAGE_RE, error: ERR_PERCENTAGE }
};

/**
 * Validate netem state.
 * @param netemState to validate
 * @returns list of errors
 */
export function validateLinkImpairmentState(netemState: NetemState): string[] {
  const errors: string[] = [];

  // Format check
  Object.keys(netemState).forEach((k) => {
    const key = k as keyof NetemState;
    if (!NETEM_FIELD_FORMAT[key].format.test(netemState[key]!)) {
      errors.push(`(${key}) - ${NETEM_FIELD_FORMAT[key].error}`);
    }
  });

  // Cross-field validations
  const delayVal = parseFloat(netemState.delay || "") || 0;
  const jitterVal = parseFloat(netemState.jitter || "") || 0;
  if (jitterVal > 0 && delayVal === 0) {
    errors.push("cannot set jitter when delay is 0");
  }
  return errors;
}

function stripNetemDataUnit(data: NetemState): NetemState {
  return {
    delay: data.delay,
    jitter: data.jitter,
    loss: normalizeNetemPercentage(data.loss),
    rate: data.rate,
    corruption: normalizeNetemPercentage(data.corruption)
  };
}

/**
 * Strip units for clab netem states. Assign source and target netem from clab state if absent.
 * @param data raw link impairment data
 */
export function formatNetemData(data: LinkImpairmentData): LinkImpairmentData {
  const formattedData: LinkImpairmentData = { ...data };
  if (formattedData.extraData?.clabSourceNetem) {
    formattedData.extraData.clabSourceNetem = stripNetemDataUnit(
      formattedData.extraData?.clabSourceNetem
    );
    formattedData.sourceNetem = formattedData.extraData.clabSourceNetem;
  }
  if (formattedData.extraData?.clabTargetNetem) {
    formattedData.extraData.clabTargetNetem = stripNetemDataUnit(
      formattedData.extraData?.clabTargetNetem
    );
    formattedData.targetNetem = formattedData.extraData.clabTargetNetem;
  }
  return formattedData;
}

/**
 * Apply netem settings for changed interface.
 * @param data retrieved from link impairment panel
 */
export function applyNetemSettings(data: LinkImpairmentData): void {
  if (JSON.stringify(data.sourceNetem) !== JSON.stringify(data.extraData?.clabSourceNetem)) {
    postCommand("clab-link-impairment", {
      nodeName: data.extraData?.clabSourceLongName ?? data.source,
      interfaceName: data.sourceEndpoint,
      data: data.sourceNetem
    });
  }

  if (JSON.stringify(data.targetNetem) !== JSON.stringify(data.extraData?.clabTargetNetem)) {
    postCommand("clab-link-impairment", {
      nodeName: data.extraData?.clabTargetLongName ?? data.target,
      interfaceName: data.targetEndpoint,
      data: data.targetNetem
    });
  }
}
