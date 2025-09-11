import { cloneRepoFromUrl } from './cloneRepo';
import { pickPopularRepo } from '../helpers/popularLabs';

export async function clonePopularRepo() {
  const pick = await pickPopularRepo('Clone popular lab', 'Select a repository to clone');
  if (!pick) {
    return;
  }
  await cloneRepoFromUrl((pick as any).repo);
}
