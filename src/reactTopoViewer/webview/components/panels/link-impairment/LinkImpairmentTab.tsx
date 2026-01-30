import type React from "react";

import { FormField, InputField } from "../../shared/form";

import type { NetemState } from "./types";

interface LinkImpairmentTabProps {
  data: NetemState;
  onChange: (updates: Partial<NetemState>) => void;
}

export const LinkImpairmentTab: React.FC<LinkImpairmentTabProps> = ({ data, onChange }) => {
  return (
    <div className="space-y-3">
      <FormField label="delay" unit="ms/s">
        <InputField
          id="delay"
          value={data.delay ?? ""}
          onChange={(value) => onChange({ delay: value })}
          placeholder="0ms"
        />
      </FormField>
      <FormField label="jitter" unit="ms/s">
        <InputField
          id="jitter"
          value={data.jitter ?? ""}
          onChange={(value) => onChange({ jitter: value })}
          placeholder="0ms"
        />
      </FormField>
      <FormField label="loss" unit="%">
        <InputField
          id="loss"
          value={data.loss ?? ""}
          onChange={(value) => onChange({ loss: value })}
          placeholder="0"
        />
      </FormField>
      <FormField label="rate limit" unit="kbps">
        <InputField
          id="rate"
          value={data.rate ?? ""}
          onChange={(value) => onChange({ rate: value })}
          placeholder="0"
        />
      </FormField>
      <FormField label="corruption" unit="%">
        <InputField
          id="corruption"
          value={data.corruption ?? ""}
          onChange={(value) => onChange({ corruption: value })}
          placeholder="0"
        />
      </FormField>
    </div>
  );
};
