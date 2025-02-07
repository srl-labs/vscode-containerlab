import * as vscode from "vscode";

export function getNodeImpairmentsHtml(
  webview: vscode.Webview,
  nodeName: string,
  interfacesData: Record<string, any>,
  extensionUri: vscode.Uri
): string {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "nodeImpairments.css")
  );

  let rowsHtml = "";
  for (const [intfName, netemState] of Object.entries(interfacesData)) {
    rowsHtml += `
    <tr>
      <td data-label="Interface">${intfName}</td>
      <td data-label="Delay">
        <div class="input-wrapper">
          <input type="text" data-intf="${intfName}" data-field="delay" value="${netemState.delay || ""}" placeholder="50"/>
          <span class="unit">ms/s/m</span>
        </div>
      </td>
      <td data-label="Jitter">
        <div class="input-wrapper">
          <input type="text" data-intf="${intfName}" data-field="jitter" value="${netemState.jitter || ""}" placeholder="10"/>
          <span class="unit">ms/s/m</span>
        </div>
      </td>
      <td data-label="Loss">
        <div class="input-wrapper">
          <input type="number" data-intf="${intfName}" data-field="loss" value="${netemState.loss || ""}" placeholder="0"/>
          <span class="unit">%</span>
        </div>
      </td>
      <td data-label="Rate">
        <div class="input-wrapper">
          <input type="number" data-intf="${intfName}" data-field="rate" value="${netemState.rate || ""}" placeholder="1000"/>
          <span class="unit">kb/s</span>
        </div>
      </td>
      <td data-label="Corruption">
        <div class="input-wrapper">
          <input type="number" data-intf="${intfName}" data-field="corruption" value="${netemState.corruption || ""}" placeholder="0"/>
          <span class="unit">%</span>
        </div>
      </td>
    </tr>
    `;
  }

  return /* html */ `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <link rel="stylesheet" href="${styleUri}">
      <title>Manage Link Impairments for ${nodeName}</title>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Link Impairments: ${nodeName}</h2>
          <div class="buttons">
            <button id="applyBtn">Apply</button>
            <button id="clearAllBtn" class="secondary">Clear All</button>
            <button id="refreshBtn" class="secondary">Refresh</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Interface</th>
              <th>Delay</th>
              <th>Jitter</th>
              <th>Loss</th>
              <th>Rate-limit</th>
              <th>Corruption</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        function gatherNetemData() {
          const inputs = document.querySelectorAll("input[data-intf]");
          const results = {};
          inputs.forEach(input => {
            const intfName = input.getAttribute("data-intf");
            const field = input.getAttribute("data-field");
            const value = input.value.trim();
            if (!results[intfName]) {
              results[intfName] = {};
            }
            results[intfName][field] = value;
          });
          return results;
        }

        document.getElementById("applyBtn").addEventListener("click", () => {
          const data = gatherNetemData();
          vscode.postMessage({ command: "apply", data });
        });

        document.getElementById("clearAllBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "clearAll" });
        });

        document.getElementById("refreshBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "refresh" });
        });

        window.addEventListener("message", event => {
          const message = event.data;
          if (message.command === "updateFields") {
            const newData = message.data;
            const inputs = document.querySelectorAll("input[data-intf]");
            inputs.forEach(input => {
              const intfName = input.getAttribute("data-intf");
              const field = input.getAttribute("data-field");
              if (newData[intfName] && newData[intfName][field] !== undefined) {
                input.value = newData[intfName][field];
              }
            });
          }
        });
      </script>
    </body>
  </html>
  `;
}
