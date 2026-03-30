import React from "react";
import { createRoot } from "react-dom/client";

import { ContainerlabExplorerView } from "@srl-labs/clab-ui/explorer";
import { createWindowClabUiHost, setClabUiHost } from "@srl-labs/clab-ui/host";
import { MuiThemeProvider } from "@srl-labs/clab-ui/theme";

setClabUiHost(createWindowClabUiHost());

function bootstrap(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Explorer root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <MuiThemeProvider>
        <ContainerlabExplorerView />
      </MuiThemeProvider>
    </React.StrictMode>
  );
}

bootstrap();
