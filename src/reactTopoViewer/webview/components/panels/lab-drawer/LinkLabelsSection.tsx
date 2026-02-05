/**
 * LinkLabelsSection - Link label mode controls for the Settings Drawer
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";

import type { LinkLabelMode } from "../../../stores/topoViewerStore";

interface LinkLabelsSectionProps {
  linkLabelMode: LinkLabelMode;
  onLinkLabelModeChange: (mode: LinkLabelMode) => void;
}

export const LinkLabelsSection: React.FC<LinkLabelsSectionProps> = ({
  linkLabelMode,
  onLinkLabelModeChange
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onLinkLabelModeChange(event.target.value as LinkLabelMode);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Link Labels
      </Typography>

      <FormControl component="fieldset">
        <RadioGroup value={linkLabelMode} onChange={handleChange}>
          <FormControlLabel
            value="show-all"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2">Always Show</Typography>
                <Typography variant="caption" color="text.secondary">
                  Display all link endpoint labels at all times
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="on-select"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2">Show on Select</Typography>
                <Typography variant="caption" color="text.secondary">
                  Only show labels when a link is selected
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="hide"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2">Hide</Typography>
                <Typography variant="caption" color="text.secondary">
                  Never show link endpoint labels
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </FormControl>
    </Box>
  );
};
