const SECTOR_ETFS = {
  XLK: { label: '科技', group: 'sector' },
  XLF: { label: '金融', group: 'sector' },
  XLE: { label: '能源', group: 'sector' },
  XLV: { label: '医疗', group: 'sector' },
  XLI: { label: '工业', group: 'sector' },
  XLY: { label: '可选消费', group: 'sector' },
  XLP: { label: '必需消费', group: 'sector' },
  XLU: { label: '公用事业', group: 'sector' },
  XLB: { label: '原材料', group: 'sector' },
  XLRE: { label: '房地产', group: 'sector' },
  XLC: { label: '通信服务', group: 'sector' },
  SMH: { label: '半导体', group: 'theme' },
  SOXX: { label: '半导体(SOXX)', group: 'theme' },
  IGV: { label: '软件', group: 'theme' },
  IBB: { label: '生物科技', group: 'theme' },
  GDX: { label: '金矿', group: 'theme' },
  GDXJ: { label: '小型金矿', group: 'theme' },
  IYR: { label: '地产(IYR)', group: 'theme' },
  VNQ: { label: '地产(VNQ)', group: 'theme' },
  ITB: { label: '住宅建筑', group: 'theme' },
  XHB: { label: '住宅建筑(XHB)', group: 'theme' },
  KIE: { label: '保险', group: 'theme' },
  IYT: { label: '运输', group: 'theme' },
  TAN: { label: '太阳能', group: 'theme' },
  ICLN: { label: '清洁能源', group: 'theme' },
  BOTZ: { label: '机器人/AI', group: 'theme' },
};

const ROTATION_BENCHMARK = process.env.ROTATION_BENCHMARK || 'SPY';

function round2(value) {
  return value == null || !Number.isFinite(value)
    ? null
    : Math.round(value * 100) / 100;
}

function rotationGrade(relativeStrength) {
  if (relativeStrength == null) return null;
  if (relativeStrength >= 5) return 'S';
  if (relativeStrength >= 2) return 'A';
  if (relativeStrength >= 0) return 'B';
  if (relativeStrength >= -3) return 'C';
  return 'D';
}

function rotationFlow(mfi) {
  if (mfi == null || !Number.isFinite(mfi)) return null;
  if (mfi >= 55) return 'inflow';
  if (mfi <= 45) return 'outflow';
  return 'neutral';
}

function buildSectorRotation(rows, benchmarkSymbol = ROTATION_BENCHMARK) {
  const bySymbol = new Map(rows.map(row => [row.symbol, row]));
  const benchmark = bySymbol.get(benchmarkSymbol);
  if (!benchmark || benchmark.ret5 == null || benchmark.ret20 == null) {
    return { status: 'missing', reason: 'benchmark_unavailable', benchmark: benchmarkSymbol };
  }

  const quadrantCounts = { leading: 0, weakening: 0, improving: 0, lagging: 0 };
  const sectors = [];
  for (const [symbol, metadata] of Object.entries(SECTOR_ETFS)) {
    const row = bySymbol.get(symbol);
    if (!row || row.ret5 == null || row.ret20 == null) continue;
    const relativeStrength = row.ret20 - benchmark.ret20;
    const momentum = (row.ret5 - benchmark.ret5) - relativeStrength / 4;
    const quadrant = relativeStrength >= 0
      ? (momentum >= 0 ? 'leading' : 'weakening')
      : (momentum >= 0 ? 'improving' : 'lagging');
    quadrantCounts[quadrant] += 1;
    sectors.push({
      symbol,
      label: metadata.label,
      group: metadata.group,
      rs: round2(relativeStrength),
      momentum: round2(momentum),
      quadrant,
      grade: rotationGrade(relativeStrength),
      mfi: row.mfi != null ? Math.round(row.mfi) : null,
      flow: rotationFlow(row.mfi),
      ret20: round2(row.ret20),
      ret5: round2(row.ret5),
      iv_rank: row.ivRank,
      gamma_regime: row.gammaRegime,
      above_ma50: row.close != null && row.ma50 != null ? row.close >= row.ma50 : null,
    });
  }
  sectors.sort((left, right) => (right.rs ?? -Infinity) - (left.rs ?? -Infinity));
  return {
    status: sectors.length ? 'ready' : 'missing',
    benchmark: benchmarkSymbol,
    benchmark_ret20: round2(benchmark.ret20),
    quadrant_counts: quadrantCounts,
    sectors,
  };
}

module.exports = { buildSectorRotation, SECTOR_ETFS, ROTATION_BENCHMARK };
