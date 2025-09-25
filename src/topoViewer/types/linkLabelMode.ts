export type LinkLabelMode = 'on-select' | 'show-all' | 'hide';

export function normalizeLinkLabelMode(value: string): LinkLabelMode {
  const normalized = (value || '').toLowerCase();
  switch (normalized) {
    case 'show-all':
    case 'hide':
    case 'on-select':
      return normalized as LinkLabelMode;
    case 'show':
    case 'show-labels':
    case 'show_labels':
    case 'showlabels':
    case 'show labels':
      return 'show-all';
    case 'none':
    case 'no-labels':
    case 'no_labels':
    case 'nolabels':
    case 'no labels':
      return 'hide';
    default:
      return 'on-select';
  }
}

export function linkLabelModeLabel(mode: LinkLabelMode): string {
  switch (mode) {
    case 'show-all':
      return 'Show Labels';
    case 'hide':
      return 'No Labels';
    case 'on-select':
    default:
      return 'Show Link Labels on Select';
  }
}
