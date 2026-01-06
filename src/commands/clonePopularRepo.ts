import { pickPopularRepo } from '../helpers/popularLabs';

import { cloneRepoFromUrl } from './cloneRepoCore';

export async function clonePopularRepo() {
  const pick = await pickPopularRepo('Clone popular lab', 'Select a repository to clone');
  if (!pick) {
    return;
  }
  await cloneRepoFromUrl(pick.repo);
}
