import { setClabUiHost } from "@srl-labs/clab-ui/host";
import { bootstrapWelcomePage } from "@srl-labs/clab-ui/welcome";

import { createVsCodeClabUiHost } from "../shared/clabUiHost";

setClabUiHost(createVsCodeClabUiHost());

bootstrapWelcomePage();
