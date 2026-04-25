import { bootstrapImageManagerWebview } from "@srl-labs/clab-ui/image-manager";
import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

bootstrapImageManagerWebview(runtime);
