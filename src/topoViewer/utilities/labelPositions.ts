export const GROUP_LABEL_POSITIONS = [
  'top-center',
  'top-left',
  'top-right',
  'bottom-center',
  'bottom-left',
  'bottom-right'
] as const;

export type GroupLabelPosition = typeof GROUP_LABEL_POSITIONS[number];

