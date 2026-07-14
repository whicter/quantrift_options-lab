export function getThemeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function getChartColors() {
  return {
    bg: getThemeColor('--bg-card'),
    grid: getThemeColor('--border'),
    gridSoft: getThemeColor('--border-light'),
    axis: getThemeColor('--text-muted'),
    text: getThemeColor('--text-dim'),
    spot: getThemeColor('--blue'),
    green: getThemeColor('--green'),
    red: getThemeColor('--red'),
    yellow: getThemeColor('--yellow'),
  };
}
