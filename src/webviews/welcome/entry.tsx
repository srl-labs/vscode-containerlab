import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWelcomePage } from "@srl-labs/clab-ui/welcome";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

bootstrapWelcomePage(runtime);
