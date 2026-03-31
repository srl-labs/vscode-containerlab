import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapNodeImpairmentsWebview } from "@srl-labs/clab-ui/node-impairments";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

bootstrapNodeImpairmentsWebview(runtime);
