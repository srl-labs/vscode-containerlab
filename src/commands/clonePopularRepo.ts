import * as vscode from 'vscode';
import { cloneRepo } from './cloneRepo';
import { fetchPopularRepos, fallbackRepos, PopularRepo } from '../helpers/popularLabs';

async function getRepos(): Promise<PopularRepo[]> {
  try {
    return await fetchPopularRepos();
  } catch {
    return fallbackRepos;
  }
}

export async function clonePopularRepo() {
  const repos = await getRepos();

  const items = repos.map((r) => ({
    label: r.name,
    description: r.description,
    detail: `⭐ ${r.stargazers_count}`,
    repo: r.html_url,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Clone popular lab',
    placeHolder: 'Select a repository to clone',
  });

  if (!pick) {
    return;
  }

  await cloneRepo(pick.repo);
}
