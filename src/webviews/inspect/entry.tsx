import { bootstrapInspectWebview } from "@srl-labs/clab-ui/inspect";
import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";

setClabUiHost(createWindowClabUiHost());

bootstrapInspectWebview();
