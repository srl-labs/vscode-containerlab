import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapNodeImpairmentsWebview } from "@srl-labs/clab-ui/node-impairments";

setClabUiHost(createWindowClabUiHost());

bootstrapNodeImpairmentsWebview();
