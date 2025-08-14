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
          <tr data-node-name="${containerName.toLowerCase()}">
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
        <section class="lab-section" data-lab-name="${labName.toLowerCase()}">
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
        </section>
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
        button.secondary {
          background-color: transparent;
          border: 1px solid var(--vscode-panel-border);
          color: var(--vscode-editor-foreground);
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
        <div class="header-actions">
          <input id="searchBox" type="text" placeholder="Search labs or nodes" />
          <button id="refreshButton" class="secondary"><span class="codicon codicon-refresh"></span> Refresh</button>
        </div>
      </div>
      ${allTables || "<p>No containers found.</p>"}
      
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

        const searchBox = document.getElementById('searchBox');
        searchBox.addEventListener('input', () => {
          const query = searchBox.value.trim();
          
          // regex filter function
          let filter;
          if (!query) {
            filter = () => true;
          } else {
            try {
              // Convert user-friendly patterns to regex
              let processedPattern = query;
              
             // Check if it already looks like regex
              const looksLikeRegex = query.includes('\\\\') || query.includes('[') || query.includes('(') || 
                                   query.includes('|') || query.includes('^') || query.includes('$') ||
                                   query.includes('.*') || query.includes('.+');
              
              if (!looksLikeRegex) {
                // Convert wildcards to regex
                const hasWildcards = /[\\*\\?#]/.test(query);
                processedPattern = query.replace(/\\*/g, '.*').replace(/\\?/g, '.').replace(/#/g, '\\\\d+');
                
                if (hasWildcards) {
                  processedPattern = '^' + processedPattern + '$';
                }
              }
              
              const regex = new RegExp(processedPattern, 'i');
              filter = (value) => regex.test(value);
            } catch (error) {
              // Invalid regex -> fall back simple string
              const queryLower = query.toLowerCase();
              filter = (value) => value.toLowerCase().includes(queryLower);
            }
          }
          
          document.querySelectorAll('.lab-section').forEach(section => {
            const labName = section.getAttribute('data-lab-name') || '';
            let sectionVisible = false;

            if (query && filter(labName)) {
              section.style.display = '';
              section.querySelectorAll('tbody tr').forEach(tr => (tr.style.display = ''));
              return;
            }

            section.querySelectorAll('tbody tr').forEach(tr => {
              const node = tr.getAttribute('data-node-name') || '';
              const rowText = tr.textContent || '';
              const match = filter(node) || filter(rowText);
              tr.style.display = !query || match ? '' : 'none';
              if (match) sectionVisible = true;
            });

            section.style.display = !query || sectionVisible ? '' : 'none';
          });
        });

        document.querySelectorAll('table thead th').forEach((header, idx) => {
          header.addEventListener('click', () => {
            const table = header.closest('table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const asc = header.getAttribute('data-sort') !== 'asc';

            rows.sort((a, b) => {
              const aText = a.children[idx].textContent.trim();
              const bText = b.children[idx].textContent.trim();
              const aNum = parseFloat(aText);
              const bNum = parseFloat(bText);
              if (!isNaN(aNum) && !isNaN(bNum)) {
                return asc ? aNum - bNum : bNum - aNum;
              }
              return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
            });

            header.setAttribute('data-sort', asc ? 'asc' : 'desc');
            rows.forEach(r => tbody.appendChild(r));
          });
        });
      </script>
    </body>
    </html>
  `;
}