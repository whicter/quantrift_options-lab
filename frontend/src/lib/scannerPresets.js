export const OPPORTUNITY_PRESETS = {
  income: {
    label: '高 IV 收租',
    values: { minIvr: 50, maxIvr: 100, gammaRegime: 'all', wall: 'all', nearWallPct: '', unusualOnly: false, minUnusualOi: '', sort: 'ivr' },
  },
  wall: {
    label: '靠近压力/支撑',
    values: { minIvr: 30, maxIvr: 100, gammaRegime: 'all', wall: 'either', nearWallPct: '3', unusualOnly: false, minUnusualOi: '', sort: 'combined' },
  },
  activity: {
    label: '期权持仓异动',
    values: { minIvr: 0, maxIvr: 100, gammaRegime: 'all', wall: 'all', nearWallPct: '', unusualOnly: true, minUnusualOi: '1', sort: 'combined' },
  },
};
