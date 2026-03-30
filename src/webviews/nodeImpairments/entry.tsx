import { setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapNodeImpairmentsWebview } from "@srl-labs/clab-ui/node-impairments";

import { createVsCodeClabUiHost } from "../shared/clabUiHost";

setClabUiHost(createVsCodeClabUiHost());

bootstrapNodeImpairmentsWebview();
