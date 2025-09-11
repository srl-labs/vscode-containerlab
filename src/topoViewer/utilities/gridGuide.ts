type Theme = 'light' | 'dark';

export function buildGridGuideOptions(theme: Theme, overrides: Record<string, any> = {}): Record<string, any> {
  const base = {
    snapToGridOnRelease: true,
    snapToGridDuringDrag: false,
    snapToAlignmentLocationOnRelease: true,
    snapToAlignmentLocationDuringDrag: false,
    distributionGuidelines: false,
    geometricGuideline: false,
    initPosAlignment: false,
    centerToEdgeAlignment: false,
    resize: false,
    parentPadding: false,
    drawGrid: true,
    gridSpacing: 10,
    snapToGridCenter: true,
    zoomDash: true,
    panGrid: true,
    gridStackOrder: -1,
    lineWidth: 0.5,
    guidelinesStackOrder: 4,
    guidelinesTolerance: 2.0,
    guidelinesStyle: {
      strokeStyle: '#8b7d6b',
      geometricGuidelineRange: 400,
      range: 100,
      minDistRange: 10,
      distGuidelineOffset: 10,
      horizontalDistColor: '#ff0000',
      verticalDistColor: '#00ff00',
      initPosAlignmentColor: '#0000ff',
      lineDash: [0, 0],
      horizontalDistLine: [0, 0],
      verticalDistLine: [0, 0],
      initPosAlignmentLine: [0, 0],
    },
    parentSpacing: -1,
  } as Record<string, any>;

  const themeGridColor = theme === 'dark' ? '#666666' : '#cccccc';
  const merged = {
    ...base,
    ...overrides,
    guidelinesStyle: {
      ...base.guidelinesStyle,
      ...(overrides.guidelinesStyle || {}),
    },
  } as Record<string, any>;

  if (!('gridColor' in merged)) {
    (merged as any).gridColor = themeGridColor;
  }

  return merged;
}

