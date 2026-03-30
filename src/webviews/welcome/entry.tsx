import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWelcomePage } from "@srl-labs/clab-ui/welcome";

setClabUiHost(createWindowClabUiHost());

bootstrapWelcomePage();
