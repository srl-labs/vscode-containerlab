import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWiresharkVncWebview } from "@srl-labs/clab-ui/wireshark-vnc";

setClabUiHost(createWindowClabUiHost());

bootstrapWiresharkVncWebview();
