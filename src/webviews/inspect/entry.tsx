import { bootstrapInspectWebview } from "@srl-labs/clab-ui/inspect";
import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

bootstrapInspectWebview(runtime);
