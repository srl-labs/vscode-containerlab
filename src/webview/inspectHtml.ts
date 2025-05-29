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

  // Group containers ...
  const grouped: Record<string, any[]> = {};
  containers.forEach((c) => {
    const key = c.lab_name || c.labPath || "unknown-lab";
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(c);
  });

  // Build tables
  let allTables = "";
  for (const [labName, arr] of Object.entries(grouped)) {
      let rows = arr.map((ctr) => {
        const cls = stateToClass(ctr.state);

        const type = ctr.node_type || ctr.Labels?.['clab-node-type'] || '';
        const pid = ctr.Pid ?? '';
        const net = ctr.network_name || ctr.NetworkName || '';
        const status = ctr.status || ctr.Status || '';

        return `
          <tr>
            <td>${ctr.name}</td>
            <td>${ctr.kind}</td>
            <td>${type}</td>
            <td>${ctr.image}</td>
            <td class="${cls}">${ctr.state}</td>
            <td>${status}</td>
            <td>${pid}</td>
            <td>${ctr.ipv4_address}</td>
            <td>${ctr.ipv6_address}</td>
            <td>${net}</td>
          </tr>
        `;
      }).join("");

      allTables += `
        <h2>${labName}</h2>
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
            </tr>
          </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <link rel="stylesheet" href="${styleUri}">
      <title>Containerlab Inspect</title>
    </head>
    <body>
      ${allTables || "<p>No containers found.</p>"}
    </body>
    </html>
  `;
}
