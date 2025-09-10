import * as https from 'node:https';
import * as vscode from 'vscode';

export interface PopularRepo {
  name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
}

export const fallbackRepos: PopularRepo[] = [
  {
    name: 'srl-telemetry-lab',
    html_url: 'https://github.com/srl-labs/srl-telemetry-lab',
    description: 'A lab demonstrating the telemetry stack with SR Linux.',
    stargazers_count: 85,
  },
  {
    name: 'netbox-nrx-clab',
    html_url: 'https://github.com/srl-labs/netbox-nrx-clab',
    description: 'NetBox NRX Containerlab integration, enabling network automation use cases.',
    stargazers_count: 65,
  },
  {
    name: 'sros-anysec-macsec-lab',
    html_url: 'https://github.com/srl-labs/sros-anysec-macsec-lab',
    description: 'SR OS Anysec & MACsec lab with containerlab.',
    stargazers_count: 42,
  },
  {
    name: 'intent-based-ansible-lab',
    html_url: 'https://github.com/srl-labs/intent-based-ansible-lab',
    description: 'Intent-based networking lab with Ansible and SR Linux.',
    stargazers_count: 38,
  },
  {
    name: 'multivendor-evpn-lab',
    html_url: 'https://github.com/srl-labs/multivendor-evpn-lab',
    description: 'Multivendor EVPN lab with Nokia, Arista, and Cisco network operating systems.',
    stargazers_count: 78,
  },
];

export function fetchPopularRepos(): Promise<PopularRepo[]> {
  const url =
    'https://api.github.com/search/repositories?q=topic:clab-topo+org:srl-labs+fork:true&sort=stars&order=desc';

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'VSCode-Containerlab-Extension',
          Accept: 'application/vnd.github.v3+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.items || []);
          } catch (e) {
            reject(e);
          }
        });
      },
    );

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function getRepos(): Promise<PopularRepo[]> {
  try {
    return await fetchPopularRepos();
  } catch {
    return fallbackRepos;
  }
}

export async function pickPopularRepo(title: string, placeHolder: string) {
  const repos = await getRepos();
  const items = repos.map((r) => ({
    label: r.name,
    description: r.description,
    detail: `⭐ ${r.stargazers_count}`,
    repo: r.html_url,
  }));
  return vscode.window.showQuickPick(items, { title, placeHolder });
}
