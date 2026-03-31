import React from "react";
import { createRoot } from "react-dom/client";

import { ContainerlabExplorerView } from "@srl-labs/clab-ui/explorer";
import {
  ClabUiRuntimeProvider,
  createClabUiRuntime,
  createWindowClabUiHost
} from "@srl-labs/clab-ui/host";
import { MuiThemeProvider } from "@srl-labs/clab-ui/theme";

const runtime = createClabUiRuntime({ host: createWindowClabUiHost() });

function bootstrap(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Explorer root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ClabUiRuntimeProvider runtime={runtime}>
        <MuiThemeProvider>
          <ContainerlabExplorerView />
        </MuiThemeProvider>
      </ClabUiRuntimeProvider>
    </React.StrictMode>
  );
}

bootstrap();
