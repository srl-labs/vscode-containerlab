import { createClabUiRuntime, createWindowClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWiresharkVncWebview } from "@srl-labs/clab-ui/wireshark-vnc";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

bootstrapWiresharkVncWebview(runtime);
