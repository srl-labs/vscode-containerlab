import * as vscode from 'vscode';
import { deploy } from './deploy';
import { fetchPopularRepos, fallbackRepos, PopularRepo } from '../helpers/popularLabs';
import { ClabLabTreeNode } from '../treeView/common';

async function getRepos(): Promise<PopularRepo[]> {
  try {
    return await fetchPopularRepos();
  } catch {
    return fallbackRepos;
  }
}

export async function deployPopularLab() {
  const repos = await getRepos();

  const items = repos.map((r) => ({
    label: r.name,
    description: r.description,
    detail: `⭐ ${r.stargazers_count}`,
    repo: r.html_url,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Deploy popular lab',
    placeHolder: 'Select a repository to deploy',
  });

  if (!pick) {
    return;
  }

  const node = new ClabLabTreeNode('', vscode.TreeItemCollapsibleState.None, {
    absolute: pick.repo,
    relative: '',
  });
  deploy(node);
}
