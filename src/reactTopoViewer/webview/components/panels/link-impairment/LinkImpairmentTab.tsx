import type React from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

import { InputField } from "../../ui/form";

import type { NetemState } from "./types";

interface LinkImpairmentTabProps {
  data: NetemState;
  onChange: (updates: Partial<NetemState>) => void;
}

export const LinkImpairmentTab: React.FC<LinkImpairmentTabProps> = ({ data, onChange }) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Impairment Settings */}
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Impairment Settings</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <InputField
          id="delay"
          label="Delay"
          value={data.delay ?? ""}
          onChange={(value) => onChange({ delay: value })}
          placeholder="Delay (with units). i.e. 50ms, 5s"
        />
        <InputField
          id="jitter"
          label="Jitter"
          value={data.jitter ?? ""}
          onChange={(value) => onChange({ jitter: value })}
          placeholder="Jitter (with units). i.e. 10ms, 500ms"
        />
        <InputField
          id="loss"
          label="Loss"
          value={data.loss ?? ""}
          onChange={(value) => onChange({ loss: value })}
          placeholder="Loss in percent. i.e. 5, 0.1"
        />
        <InputField
          id="rate"
          label="Rate Limit"
          value={data.rate ?? ""}
          onChange={(value) => onChange({ rate: value })}
          placeholder="Rate in kbps. i.e. 1000, 10000"
        />
        <InputField
          id="corruption"
          label="Corruption"
          value={data.corruption ?? ""}
          onChange={(value) => onChange({ corruption: value })}
          placeholder="Corruption in percent. i.e. 5, 0.1"
        />
      </Box>
    </Box>
  );
};
