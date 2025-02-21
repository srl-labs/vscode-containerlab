import * as vscode from "vscode";

export function getNodeImpairmentsHtml(
  webview: vscode.Webview,
  nodeName: string,
  interfacesData: Record<string, any>,
  extensionUri: vscode.Uri
): string {
  // Sort interface names alphabetically
  const sortedInterfaces = Object.keys(interfacesData).sort();

  // Reference to your CSS file
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "nodeImpairments.css")
  );

  let rowsHtml = "";

  for (const intfName of sortedInterfaces) {
    const netemState = interfacesData[intfName];

    rowsHtml += /* html */ `
      <tr data-intf="${intfName}">
        <td data-label="Interface">${intfName}</td>

        <!-- Delay cell -->
        <td data-label="Delay">
          <div class="input-wrapper">
            <input 
              type="text" 
              data-intf="${intfName}" 
              data-field="delay" 
              value="${netemState.delay || ""}" 
              placeholder="50"
            />
            <span class="unit">ms/s/m</span>
          </div>
          <!-- Hidden explanation if Jitter>0 but Delay=0 -->
          <div class="validation-error" data-field="delayMissing" style="display:none;">
            <small class="error-text">A positive delay is required if jitter is set.</small>
          </div>
        </td>

        <!-- Jitter cell -->
        <td data-label="Jitter">
          <div class="input-wrapper">
            <input 
              type="text" 
              data-intf="${intfName}" 
              data-field="jitter" 
              value="${netemState.jitter || ""}" 
              placeholder="10"
            />
            <span class="unit">ms/s</span>
          </div>
        </td>

        <!-- Loss -->
        <td data-label="Loss">
          <div class="input-wrapper">
            <input 
              type="text" 
              data-intf="${intfName}" 
              data-field="loss" 
              value="${netemState.loss || ""}" 
              placeholder="0"
            />
            <span class="unit">%</span>
          </div>
        </td>

        <!-- Rate -->
        <td data-label="Rate-limit">
          <div class="input-wrapper">
            <input 
              type="number" 
              data-intf="${intfName}" 
              data-field="rate" 
              value="${netemState.rate || ""}" 
              placeholder="1000"
            />
            <span class="unit">kb/s</span>
          </div>
        </td>

        <!-- Corruption -->
        <td data-label="Corruption">
          <div class="input-wrapper">
            <input 
              type="text" 
              data-intf="${intfName}" 
              data-field="corruption" 
              value="${netemState.corruption || ""}" 
              placeholder="0"
            />
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

        // Gather netem data from all inputs
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

        // Simple validation: if jitter > 0, ensure delay > 0.
        // We highlight the Jitter field in red and show a note near Delay if invalid.
        function validateAllInputs() {
          const rows = document.querySelectorAll("tr[data-intf]");
          rows.forEach(row => {
            const delayInput = row.querySelector("input[data-field='delay']");
            const jitterInput = row.querySelector("input[data-field='jitter']");
            const delayError = row.querySelector(".validation-error[data-field='delayMissing']");

            // Reset any previous invalid styling/message
            jitterInput.classList.remove("invalid-input");
            if (delayError) {
              delayError.style.display = "none";
            }

            const delayVal = parseFloat(delayInput.value) || 0;
            const jitterVal = parseFloat(jitterInput.value) || 0;

            // If jitter is positive but delay <= 0 => invalid
            if (jitterVal > 0 && delayVal <= 0) {
              // highlight the jitter field
              jitterInput.classList.add("invalid-input");
              // show the explanation near the delay
              if (delayError) {
                delayError.style.display = "block";
              }
            }
          });
        }

        // Listen to changes in the inputs to re-validate
        document.querySelectorAll("input[data-intf]").forEach(input => {
          input.addEventListener("input", validateAllInputs);
        });

        // Apply
        document.getElementById("applyBtn").addEventListener("click", () => {
          // Run validation once more on apply
          validateAllInputs();

          // Then gather the data to post
          const data = gatherNetemData();
          vscode.postMessage({ command: "apply", data });
        });

        // Clear All
        document.getElementById("clearAllBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "clearAll" });
        });

        // Refresh
        document.getElementById("refreshBtn").addEventListener("click", () => {
          vscode.postMessage({ command: "refresh" });
        });

        // Listen for messages from the extension
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
              } else {
                input.value = "";
              }
            });
            // Re-validate after updating
            validateAllInputs();
          }
        });
      </script>
    </body>
    </html>
  `;
}
