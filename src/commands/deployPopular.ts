import * as vscode from 'vscode';
import { deploy } from './deploy';
import { pickPopularRepo } from '../helpers/popularLabs';
import { ClabLabTreeNode } from '../treeView/common';

export async function deployPopularLab() {
  const pick = await pickPopularRepo('Deploy popular lab', 'Select a repository to deploy');
  if (!pick) {
    return;
  }
  const node = new ClabLabTreeNode('', vscode.TreeItemCollapsibleState.None, {
    absolute: (pick as any).repo,
    relative: '',
  });
  deploy(node);
}
