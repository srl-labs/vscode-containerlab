import { bootstrapInspectWebview } from "@srl-labs/clab-ui/inspect";
import { setClabUiHost } from "@srl-labs/clab-ui/host";

import { createVsCodeClabUiHost } from "../shared/clabUiHost";

setClabUiHost(createVsCodeClabUiHost());

bootstrapInspectWebview();
