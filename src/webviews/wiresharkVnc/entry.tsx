import { setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWiresharkVncWebview } from "@srl-labs/clab-ui/wireshark-vnc";

import { createVsCodeClabUiHost } from "../shared/clabUiHost";

setClabUiHost(createVsCodeClabUiHost());

bootstrapWiresharkVncWebview();
