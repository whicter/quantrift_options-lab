// Pure view-model for the /market Sector Rotation RRG (R1.3 frontend). Turns the
// /api/market/sector-rotation response into scatter-dot positions + quadrant
// groups, so the component only renders and toggles a hovered symbol. The
// scatter and the list share these groups, which is how the two views stay in
// sync without a chart library.

export const RS_DOMAIN = 12;   // % relative strength mapped to the plot half-width
export const MOM_DOMAIN = 6;   // % relative-momentum mapped to the plot half-height
export const PLOT_HALF = 44;   // % from center to edge (leaves a margin for labels)

// Canonical RRG quadrant order + display metadata.
export const QUADRANTS = [
  { id: 'leading', label: '领先', en: 'Leading', desc: '强且加速', tone: 'lead' },
  { id: 'weakening', label: '走弱', en: 'Weakening', desc: '强但减速', tone: 'weak' },
  { id: 'improving', label: '改善', en: 'Improving', desc: '弱但加速', tone: 'imp' },
  { id: 'lagging', label: '落后', en: 'Lagging', desc: '弱且减速', tone: 'lag' },
];

const TONE_BY_QUADRANT = Object.fromEntries(QUADRANTS.map(q => [q.id, q.tone]));

function clamp1(v) {
  return Math.max(-1, Math.min(1, v));
}

// Screen position (percent) for an (rs, momentum) point. y is inverted because
// higher momentum should sit higher on screen. Out-of-domain points clamp to the
// edge rather than escaping the plot.
export function dotPosition(rs, momentum, rsDomain = RS_DOMAIN, momDomain = MOM_DOMAIN) {
  return {
    x: 50 + clamp1((Number(rs) || 0) / rsDomain) * PLOT_HALF,
    y: 50 - clamp1((Number(momentum) || 0) / momDomain) * PLOT_HALF,
  };
}

export function buildRotationView(res) {
  if (!res || res.status !== 'ready') return { status: res?.status || 'missing' };

  const dots = (res.sectors || []).map(s => ({
    ...s,
    ...dotPosition(s.rs, s.momentum),
    tone: TONE_BY_QUADRANT[s.quadrant] || 'neutral',
  }));

  const groups = QUADRANTS.map(q => {
    const members = dots
      .filter(d => d.quadrant === q.id)
      .sort((a, b) => (b.rs ?? -Infinity) - (a.rs ?? -Infinity));
    return {
      ...q,
      count: res.quadrant_counts?.[q.id] ?? members.length,
      sectors: members,
    };
  });

  return {
    status: 'ready',
    benchmark: res.benchmark,
    benchmarkRet20: res.benchmark_ret20 ?? null,
    quadrantCounts: res.quadrant_counts || {},
    dots,
    groups,
    empty: dots.length === 0,
  };
}
