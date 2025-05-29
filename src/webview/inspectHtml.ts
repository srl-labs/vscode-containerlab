import * as vscode from "vscode";

/**
 * Build the HTML string for the webview, grouping containers by lab_name or labPath.
 */
function stateToClass(state: string): string {
  switch (state) {
    case "running":
      return "state-running";
    case "exited":
    case "stopped":
      return "state-exited";
    default:
      return "state-other";
  }
}

export function getInspectHtml(
  webview: vscode.Webview,
  containers: any[],
  extensionUri: vscode.Uri
): string {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "inspect.css")
  );

  // Group containers by lab name - check multiple possible locations
  const grouped: Record<string, any[]> = {};
  containers.forEach((c) => {
    const key = c.lab_name ||
                c.labPath ||
                c.Labels?.['containerlab'] ||
                c.Labels?.['clab-topo-file']?.split('/').slice(-1)[0]?.replace('.clab.yml', '') ||
                "unknown-lab";
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(c);
  });

  // Build tables
  let allTables = "";
  for (const [labName, arr] of Object.entries(grouped)) {
      let rows = arr.map((ctr) => {
        // Extract container name - handle both formats
        const containerName = ctr.name ||
                            (ctr.Names && Array.isArray(ctr.Names) ? ctr.Names[0] : '') ||
                            ctr.Labels?.['clab-node-longname'] ||
                            '';

        // Extract state
        const state = ctr.state || ctr.State || '';
        const cls = stateToClass(state);

        // Extract other fields with fallbacks
        const kind = ctr.kind || ctr.Labels?.['clab-node-kind'] || '';
        const type = ctr.node_type || ctr.Labels?.['clab-node-type'] || '';
        const image = ctr.image || ctr.Image || '';
        const pid = ctr.Pid ?? '';
        const net = ctr.network_name || ctr.NetworkName || '';
        const status = ctr.status || ctr.Status || '';
        const owner = ctr.Labels?.['clab-owner'] || '';

        // Extract IP addresses - handle both formats
        const ipv4 = ctr.ipv4_address ||
                    ctr.NetworkSettings?.IPv4addr ||
                    ctr.NetworkSettings?.ipv4_address ||
                    '';
        const ipv6 = ctr.ipv6_address ||
                    ctr.NetworkSettings?.IPv6addr ||
                    ctr.NetworkSettings?.ipv6_address ||
                    '';

        // Extract container ID for port links
        const containerId = ctr.ID || ctr.id || ctr.ShortID || '';

        // Format ports as clickable links
        let portsHtml = '';
        if (ctr.Ports && Array.isArray(ctr.Ports) && ctr.Ports.length > 0) {
          const portLinks = ctr.Ports.map((p: any) => {
            // Generate a unique ID for this port link
            const portId = `port-${containerId}-${p.port}-${p.protocol}`;
            return `<a href="#" class="port-link" data-container-name="${containerName}" data-container-id="${containerId}" data-port="${p.port}" data-protocol="${p.protocol}" id="${portId}">${p.port}/${p.protocol}</a>`;
          }).join(', ');
          portsHtml = portLinks;
        } else {
          portsHtml = '-';
        }

        return `
          <tr>
            <td>${containerName}</td>
            <td>${kind}</td>
            <td>${type}</td>
            <td title="${image}">${image}</td>
            <td class="${cls}">${state}</td>
            <td>${status}</td>
            <td>${pid}</td>
            <td>${ipv4}</td>
            <td>${ipv6}</td>
            <td>${net}</td>
            <td>${owner}</td>
            <td>${portsHtml}</td>
          </tr>
        `;
      }).join("");

      allTables += `
        <h2>${labName}</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Type</th>
                <th>Image</th>
                <th>State</th>
                <th>Status</th>
                <th>PID</th>
                <th>IPv4</th>
                <th>IPv6</th>
                <th>Network</th>
                <th>Owner</th>
                <th>Ports</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
    `;
  }

  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <link rel="stylesheet" href="${styleUri}">
      <title>Containerlab Inspect</title>
      <style>
        .header-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1em;
          padding: 0.5em 0;
        }
        .refresh-button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 6px 12px;
          cursor: pointer;
          border-radius: 2px;
        }
        .refresh-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .port-link {
          color: var(--vscode-textLink-foreground);
          text-decoration: none;
          cursor: pointer;
          padding: 2px 4px;
        }
        .port-link:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="header-controls">
        <h1>Containerlab Inspect</h1>
        <button class="refresh-button" id="refreshButton">🔄 Refresh</button>
      </div>
      ${allTables || "<p>No containers found.</p>"}
      ${allTables ? '<p style="font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 1em;">Note: Port links open http://localhost:[port] in your browser. Ensure ports are properly mapped to the host.</p>' : ''}
      
      <script>
        const vscode = acquireVsCodeApi();
        
        // Handle refresh button click
        document.getElementById('refreshButton').addEventListener('click', () => {
          vscode.postMessage({ command: 'refresh' });
        });
        
        // Handle port link clicks
        document.addEventListener('click', (e) => {
          if (e.target.classList.contains('port-link')) {
            e.preventDefault();
            const containerName = e.target.getAttribute('data-container-name');
            const containerId = e.target.getAttribute('data-container-id');
            const port = e.target.getAttribute('data-port');
            const protocol = e.target.getAttribute('data-protocol');
            
            vscode.postMessage({
              command: 'openPort',
              containerName: containerName,
              containerId: containerId,
              port: port,
              protocol: protocol
            });
          }
        });
      </script>
    </body>
    </html>
  `;
}