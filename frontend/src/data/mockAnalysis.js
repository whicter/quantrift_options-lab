// Mock data for V2 Analyze page — replaces real API calls during development

export const MOCK_ANALYSIS = {
  AAPL: {
    symbol: 'AAPL',
    price: 213.5,
    // IV metrics
    ivRank: 31,
    ivPercentile: 14,
    iv30: 27.2,
    hv30: 11.2,
    hv60: 14.2,
    ivHvDiff: 16.0,
    // Direction signals
    direction: {
      score: 0.6,        // -1 (bearish) to +1 (bullish)
      label: 'Bullish',
      signals: [
        { name: 'Price vs MA50', value: '+3.2%', bullish: true },
        { name: 'Price vs MA200', value: '+8.1%', bullish: true },
        { name: 'RSI (14)', value: '58', bullish: true },
        { name: 'MACD', value: 'Above signal', bullish: true },
      ],
    },
    // Event risk
    earnings: {
      date: '2026-07-30',
      daysAway: 40,
      warning: false,   // true if within 14 days
    },
    // Strategy recommendation
    recommendation: {
      strategy: 'Bull Put Spread',
      reason: 'IV moderately elevated vs HV; bullish bias; no near-term event risk',
      legs: [
        { type: 'put', dir: -1, deltaTarget: 0.30, dte: 45, label: 'Short Put' },
        { type: 'put', dir:  1, deltaTarget: 0.15, dte: 45, label: 'Long Put' },
      ],
      params: {
        dte: 45,
        shortDelta: 0.30,
        pop: 72,
        maxCredit: 1.20,
        maxLoss: 3.80,
      },
    },
    // Term structure
    termStructure: [
      { expiry: '2026-06-27', iv: 23.2 },
      { expiry: '2026-07-17', iv: 24.1 },
      { expiry: '2026-07-31', iv: 27.5 },
      { expiry: '2026-08-21', iv: 27.5 },
      { expiry: '2026-09-18', iv: 27.8 },
      { expiry: '2026-12-18', iv: 29.4 },
    ],
  },
  SPY: {
    symbol: 'SPY',
    price: 586.3,
    ivRank: 36,
    ivPercentile: 42,
    iv30: 14.6,
    hv30: 8.7,
    hv60: 11.7,
    ivHvDiff: 5.9,
    direction: {
      score: 0.3,
      label: 'Slightly Bullish',
      signals: [
        { name: 'Price vs MA50', value: '+1.1%', bullish: true },
        { name: 'Price vs MA200', value: '+4.3%', bullish: true },
        { name: 'RSI (14)', value: '54', bullish: true },
        { name: 'MACD', value: 'Flat', bullish: false },
      ],
    },
    earnings: { date: null, daysAway: null, warning: false },
    recommendation: {
      strategy: 'Iron Condor',
      reason: 'IV above HV; neutral market; no event risk; classic premium selling setup',
      legs: [
        { type: 'call', dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Call' },
        { type: 'call', dir:  1, deltaTarget: 0.10, dte: 45, label: 'Long Call' },
        { type: 'put',  dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Put' },
        { type: 'put',  dir:  1, deltaTarget: 0.10, dte: 45, label: 'Long Put' },
      ],
      params: {
        dte: 45,
        shortDelta: 0.20,
        pop: 68,
        maxCredit: 1.45,
        maxLoss: 3.55,
      },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 9.7 },
      { expiry: '2026-07-17', iv: 16.5 },
      { expiry: '2026-07-31', iv: 17.4 },
      { expiry: '2026-08-21', iv: 18.0 },
      { expiry: '2026-09-18', iv: 19.3 },
      { expiry: '2026-12-18', iv: 21.9 },
    ],
  },
  QQQ: {
    symbol: 'QQQ',
    price: 519.2,
    ivRank: 69,
    ivPercentile: 98,
    iv30: 19.5,
    hv30: 13.2,
    hv60: 17.1,
    ivHvDiff: 6.3,
    direction: {
      score: 0.2,
      label: 'Slightly Bullish',
      signals: [
        { name: 'Price vs MA50', value: '+0.8%', bullish: true },
        { name: 'Price vs MA200', value: '+5.2%', bullish: true },
        { name: 'RSI (14)', value: '51', bullish: false },
        { name: 'MACD', value: 'Below signal', bullish: false },
      ],
    },
    earnings: { date: null, daysAway: null, warning: false },
    recommendation: {
      strategy: 'Short Strangle',
      reason: 'IV Rank 69% — high relative IV; strong vol risk premium; ideal for premium selling',
      legs: [
        { type: 'call', dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Call' },
        { type: 'put',  dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Put' },
      ],
      params: {
        dte: 45,
        shortDelta: 0.20,
        pop: 66,
        maxCredit: 3.80,
        maxLoss: null,  // undefined risk
      },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 17.8 },
      { expiry: '2026-07-17', iv: 26.9 },
      { expiry: '2026-07-31', iv: 27.1 },
      { expiry: '2026-08-21', iv: 27.9 },
      { expiry: '2026-09-18', iv: 28.9 },
      { expiry: '2026-12-18', iv: 30.2 },
    ],
  },
};

// Additional symbols for scanner
const MOCK_EXTRA = {
  TSLA: { symbol: 'TSLA', price: 248.3, ivRank: 72, ivPercentile: 91, iv30: 68.4, hv30: 42.1, hv60: 51.3, ivHvDiff: 26.3,
    direction: { score: -0.2, label: 'Slightly Bearish', signals: [
      { name: 'Price vs MA50', value: '-2.1%', bullish: false },
      { name: 'Price vs MA200', value: '+3.4%', bullish: true },
      { name: 'RSI (14)', value: '46', bullish: false },
      { name: 'MACD', value: 'Below signal', bullish: false },
    ]},
    earnings: { date: '2026-07-23', daysAway: 33, warning: false },
    recommendation: { strategy: 'Iron Condor', reason: 'IV Rank 72% — elevated vol; neutral bias preferred given uncertainty',
      legs: [
        { type: 'call', dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Call' },
        { type: 'call', dir:  1, deltaTarget: 0.10, dte: 45, label: 'Long Call' },
        { type: 'put',  dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Put' },
        { type: 'put',  dir:  1, deltaTarget: 0.10, dte: 45, label: 'Long Put' },
      ],
      params: { dte: 45, shortDelta: 0.20, pop: 64, maxCredit: 5.20, maxLoss: 4.80 },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 52.1 }, { expiry: '2026-07-17', iv: 65.3 },
      { expiry: '2026-07-31', iv: 68.4 }, { expiry: '2026-09-18', iv: 71.2 },
    ],
  },
  MSFT: { symbol: 'MSFT', price: 432.1, ivRank: 58, ivPercentile: 63, iv30: 22.3, hv30: 14.8, hv60: 17.2, ivHvDiff: 7.5,
    direction: { score: 0.5, label: 'Bullish', signals: [
      { name: 'Price vs MA50', value: '+2.8%', bullish: true },
      { name: 'Price vs MA200', value: '+9.1%', bullish: true },
      { name: 'RSI (14)', value: '61', bullish: true },
      { name: 'MACD', value: 'Above signal', bullish: true },
    ]},
    earnings: { date: '2026-07-29', daysAway: 39, warning: false },
    recommendation: { strategy: 'Bull Put Spread', reason: 'IV Rank 58%; bullish trend intact; sell put spread for directional premium',
      legs: [
        { type: 'put', dir: -1, deltaTarget: 0.30, dte: 45, label: 'Short Put' },
        { type: 'put', dir:  1, deltaTarget: 0.15, dte: 45, label: 'Long Put' },
      ],
      params: { dte: 45, shortDelta: 0.30, pop: 71, maxCredit: 1.85, maxLoss: 3.15 },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 18.2 }, { expiry: '2026-07-17', iv: 21.8 },
      { expiry: '2026-07-31', iv: 22.3 }, { expiry: '2026-09-18', iv: 23.9 },
    ],
  },
  XOM: { symbol: 'XOM', price: 118.4, ivRank: 61, ivPercentile: 74, iv30: 24.7, hv30: 16.2, hv60: 19.8, ivHvDiff: 8.5,
    direction: { score: 0.1, label: 'Neutral', signals: [
      { name: 'Price vs MA50', value: '+0.3%', bullish: true },
      { name: 'Price vs MA200', value: '-1.2%', bullish: false },
      { name: 'RSI (14)', value: '49', bullish: false },
      { name: 'MACD', value: 'Flat', bullish: false },
    ]},
    earnings: { date: null, daysAway: null, warning: false },
    recommendation: { strategy: 'Short Strangle', reason: 'IV Rank 61%; neutral price action; strong vol premium vs HV',
      legs: [
        { type: 'call', dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Call' },
        { type: 'put',  dir: -1, deltaTarget: 0.20, dte: 45, label: 'Short Put' },
      ],
      params: { dte: 45, shortDelta: 0.20, pop: 67, maxCredit: 2.10, maxLoss: null },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 20.1 }, { expiry: '2026-07-17', iv: 24.2 },
      { expiry: '2026-07-31', iv: 24.7 }, { expiry: '2026-09-18', iv: 26.1 },
    ],
  },
  GLD: { symbol: 'GLD', price: 234.8, ivRank: 44, ivPercentile: 51, iv30: 16.8, hv30: 13.1, hv60: 14.9, ivHvDiff: 3.7,
    direction: { score: 0.4, label: 'Bullish', signals: [
      { name: 'Price vs MA50', value: '+1.9%', bullish: true },
      { name: 'Price vs MA200', value: '+6.3%', bullish: true },
      { name: 'RSI (14)', value: '57', bullish: true },
      { name: 'MACD', value: 'Above signal', bullish: true },
    ]},
    earnings: { date: null, daysAway: null, warning: false },
    recommendation: { strategy: 'Bull Put Spread', reason: 'IV moderate; bullish momentum; defined-risk premium sell',
      legs: [
        { type: 'put', dir: -1, deltaTarget: 0.25, dte: 45, label: 'Short Put' },
        { type: 'put', dir:  1, deltaTarget: 0.10, dte: 45, label: 'Long Put' },
      ],
      params: { dte: 45, shortDelta: 0.25, pop: 74, maxCredit: 0.95, maxLoss: 4.05 },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 13.2 }, { expiry: '2026-07-17', iv: 16.4 },
      { expiry: '2026-07-31', iv: 16.8 }, { expiry: '2026-09-18', iv: 17.9 },
    ],
  },
  NVDA: { symbol: 'NVDA', price: 134.2, ivRank: 38, ivPercentile: 29, iv30: 48.2, hv30: 38.9, hv60: 44.1, ivHvDiff: 9.3,
    direction: { score: 0.7, label: 'Bullish', signals: [
      { name: 'Price vs MA50', value: '+5.1%', bullish: true },
      { name: 'Price vs MA200', value: '+22.4%', bullish: true },
      { name: 'RSI (14)', value: '66', bullish: true },
      { name: 'MACD', value: 'Above signal', bullish: true },
    ]},
    earnings: { date: '2026-08-27', daysAway: 68, warning: false },
    recommendation: { strategy: 'Bull Call Spread', reason: 'Low IVR 38%; strong bullish trend; buy debit spread to leverage direction',
      legs: [
        { type: 'call', dir:  1, deltaTarget: 0.50, dte: 45, label: 'Long Call' },
        { type: 'call', dir: -1, deltaTarget: 0.25, dte: 45, label: 'Short Call' },
      ],
      params: { dte: 45, shortDelta: 0.25, pop: 48, maxCredit: -2.40, maxLoss: 2.40 },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 41.2 }, { expiry: '2026-07-17', iv: 47.8 },
      { expiry: '2026-07-31', iv: 48.2 }, { expiry: '2026-09-18', iv: 51.3 },
    ],
  },
  AMD: { symbol: 'AMD', price: 162.7, ivRank: 25, ivPercentile: 18, iv30: 42.1, hv30: 35.6, hv60: 38.2, ivHvDiff: 6.5,
    direction: { score: 0.3, label: 'Slightly Bullish', signals: [
      { name: 'Price vs MA50', value: '+1.2%', bullish: true },
      { name: 'Price vs MA200', value: '+4.8%', bullish: true },
      { name: 'RSI (14)', value: '52', bullish: true },
      { name: 'MACD', value: 'Flat', bullish: false },
    ]},
    earnings: { date: '2026-07-29', daysAway: 39, warning: false },
    recommendation: { strategy: 'Long Straddle', reason: 'Low IVR 25%; vol likely to expand; buy straddle for vol play',
      legs: [
        { type: 'call', dir: 1, deltaTarget: 0.50, dte: 45, label: 'Long Call' },
        { type: 'put',  dir: 1, deltaTarget: 0.50, dte: 45, label: 'Long Put' },
      ],
      params: { dte: 45, shortDelta: 0.50, pop: 42, maxCredit: -6.80, maxLoss: 6.80 },
    },
    termStructure: [
      { expiry: '2026-06-27', iv: 36.1 }, { expiry: '2026-07-17', iv: 41.8 },
      { expiry: '2026-07-31', iv: 42.1 }, { expiry: '2026-09-18', iv: 44.7 },
    ],
  },
};

// Default watchlist for scanner
export const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMD', 'XOM', 'GLD'];

export const ALL_MOCK = { ...MOCK_ANALYSIS, ...MOCK_EXTRA };

// V2 Phase 1 extensions: GEX + trend + sector mock data
const MOCK_GEX = {
  AAPL: {
    sector: ['科技硬件', 'AI应用', '消费电子'],
    gexTotal: 124_500_000,
    gexByStrike: [
      { strike: 195, gex: -620000 }, { strike: 200, gex: -980000 },
      { strike: 205, gex: -1840000 }, { strike: 207.5, gex: -750000 },
      { strike: 210, gex: -320000 }, { strike: 212.5, gex: 580000 },
      { strike: 215, gex: 1650000 }, { strike: 217.5, gex: 2280000 },
      { strike: 220, gex: 3100000 }, { strike: 222.5, gex: 1420000 },
      { strike: 225, gex: 820000 }, { strike: 230, gex: 310000 },
    ],
    putWall: 205, callWall: 220, pcr: 0.52,
    unusualActivity: [
      { type: 'PUT', strike: 210, date: '2026-07-10', vol: 3241 },
      { type: 'CALL', strike: 220, date: '2026-07-09', vol: 5832 },
    ],
    trend: { regime: '多头格局', momentum: '向上增强', signal: '趋势延续', rvol: 1.18, kfUpper: 216.2, kfLower: 209.8 },
    conclusion: '价格处于Call Wall($220)与Put Wall($205)之间，正Gamma $124.5M缓冲摆动，PCR 0.52偏多，趋势延续需量能配合',
    scenarios: { upTrigger: 220, upTarget: 226, downTrigger: 205, downTarget: 198 },
  },
  SPY: {
    sector: ['大盘ETF', 'S&P 500', '被动指数'],
    gexTotal: 2_850_000_000,
    gexByStrike: [
      { strike: 560, gex: -4200000 }, { strike: 565, gex: -7100000 },
      { strike: 570, gex: -9800000 }, { strike: 575, gex: -18500000 },
      { strike: 578, gex: -6200000 }, { strike: 580, gex: -1800000 },
      { strike: 582, gex: 3400000 }, { strike: 585, gex: 8900000 },
      { strike: 588, gex: 14200000 }, { strike: 590, gex: 21000000 },
      { strike: 592, gex: 16500000 }, { strike: 595, gex: 31800000 },
      { strike: 600, gex: 18200000 }, { strike: 605, gex: 9100000 },
      { strike: 610, gex: 4300000 },
    ],
    putWall: 575, callWall: 595, pcr: 1.20,
    unusualActivity: [
      { type: 'PUT', strike: 575, date: '2026-07-10', vol: 18420 },
      { type: 'CALL', strike: 595, date: '2026-07-09', vol: 12840 },
      { type: 'PUT', strike: 580, date: '2026-07-08', vol: 9230 },
    ],
    trend: { regime: '多头格局', momentum: '趋于平稳', signal: '趋势延续', rvol: 0.92, kfUpper: 589.4, kfLower: 582.8 },
    conclusion: '价格处于Put Wall($575)支撑区间，正Gamma $2.85B为市场强力缓冲，PCR 1.20情绪偏空，Call Wall $595构成近期阻力',
    scenarios: { upTrigger: 595, upTarget: 605, downTrigger: 575, downTarget: 565 },
  },
  QQQ: {
    sector: ['科技ETF', 'Nasdaq 100', '被动指数'],
    gexTotal: 892_000_000,
    gexByStrike: [
      { strike: 495, gex: -3100000 }, { strike: 500, gex: -5800000 },
      { strike: 505, gex: -9200000 }, { strike: 508, gex: -4600000 },
      { strike: 510, gex: -1200000 }, { strike: 513, gex: 2100000 },
      { strike: 515, gex: 5400000 }, { strike: 518, gex: 8700000 },
      { strike: 520, gex: 12300000 }, { strike: 525, gex: 18100000 },
      { strike: 528, gex: 11200000 }, { strike: 530, gex: 22400000 },
      { strike: 535, gex: 14200000 }, { strike: 540, gex: 7800000 },
      { strike: 545, gex: 3200000 },
    ],
    putWall: 505, callWall: 530, pcr: 0.65,
    unusualActivity: [
      { type: 'CALL', strike: 530, date: '2026-07-10', vol: 8341 },
      { type: 'PUT', strike: 505, date: '2026-07-10', vol: 6128 },
    ],
    trend: { regime: '多头格局', momentum: '向下减弱', signal: '趋势延续', rvol: 0.78, kfUpper: 522.8, kfLower: 515.1 },
    conclusion: 'IV Rank 69%处于高位，正Gamma $892M撑住短线，Call Wall $530上方压力明显，PCR 0.65偏多但动能减弱',
    scenarios: { upTrigger: 530, upTarget: 542, downTrigger: 505, downTarget: 495 },
  },
  TSLA: {
    sector: ['新能源汽车', 'AI/机器人', '科技消费'],
    gexTotal: -285_000_000,
    gexByStrike: [
      { strike: 225, gex: -4200000 }, { strike: 230, gex: -6800000 },
      { strike: 235, gex: -8900000 }, { strike: 240, gex: -12400000 },
      { strike: 245, gex: -7200000 }, { strike: 248, gex: -2100000 },
      { strike: 252, gex: 1800000 }, { strike: 255, gex: 4300000 },
      { strike: 260, gex: 6900000 }, { strike: 265, gex: 3100000 },
      { strike: 270, gex: 1400000 },
    ],
    putWall: 240, callWall: 260, pcr: 0.88,
    unusualActivity: [
      { type: 'PUT', strike: 240, date: '2026-07-10', vol: 12841 },
      { type: 'PUT', strike: 245, date: '2026-07-09', vol: 8392 },
    ],
    trend: { regime: '空头格局', momentum: '向下减弱', signal: '趋势反转', rvol: 1.42, kfUpper: 252.1, kfLower: 244.8 },
    conclusion: '负Gamma环境(-$285M)价格波动被放大，Put Wall $240是关键支撑，财报前高RVol 1.42需特别注意',
    scenarios: { upTrigger: 260, upTarget: 272, downTrigger: 240, downTarget: 228 },
  },
  MSFT: {
    sector: ['云计算', 'AI/企业软件', '科技硬件'],
    gexTotal: 381_000_000,
    gexByStrike: [
      { strike: 415, gex: -2100000 }, { strike: 420, gex: -1400000 },
      { strike: 425, gex: -3200000 }, { strike: 428, gex: -800000 },
      { strike: 430, gex: 1200000 }, { strike: 432, gex: 2800000 },
      { strike: 435, gex: 4100000 }, { strike: 438, gex: 3600000 },
      { strike: 440, gex: 6200000 }, { strike: 445, gex: 3800000 },
      { strike: 450, gex: 1900000 },
    ],
    putWall: 425, callWall: 440, pcr: 0.48,
    unusualActivity: [
      { type: 'CALL', strike: 440, date: '2026-07-10', vol: 4821 },
      { type: 'CALL', strike: 445, date: '2026-07-09', vol: 3192 },
    ],
    trend: { regime: '多头格局', momentum: '向上增强', signal: '趋势延续', rvol: 0.95, kfUpper: 435.2, kfLower: 428.8 },
    conclusion: '正Gamma $381M支撑，价格在Call Wall $440下方运行，PCR 0.48偏多情绪，财报前谨慎追高',
    scenarios: { upTrigger: 440, upTarget: 450, downTrigger: 425, downTarget: 415 },
  },
  XOM: {
    sector: ['能源', '石油天然气', '传统能源'],
    gexTotal: 142_000_000,
    gexByStrike: [
      { strike: 110, gex: -1200000 }, { strike: 113, gex: -1800000 },
      { strike: 115, gex: -2400000 }, { strike: 117, gex: -900000 },
      { strike: 119, gex: 800000 }, { strike: 120, gex: 2100000 },
      { strike: 122, gex: 3400000 }, { strike: 124, gex: 2200000 },
      { strike: 125, gex: 1600000 }, { strike: 127, gex: 800000 },
    ],
    putWall: 115, callWall: 122, pcr: 0.74,
    unusualActivity: [
      { type: 'CALL', strike: 122, date: '2026-07-10', vol: 2841 },
    ],
    trend: { regime: '中性格局', momentum: '趋于平稳', signal: '趋势延续', rvol: 0.88, kfUpper: 119.8, kfLower: 116.9 },
    conclusion: '价格夹在Call Wall $122与Put Wall $115之间，正Gamma $142M，PCR 0.74中性偏多，方向需油价配合',
    scenarios: { upTrigger: 122, upTarget: 127, downTrigger: 115, downTarget: 110 },
  },
  GLD: {
    sector: ['贵金属', '黄金ETF', '避险资产'],
    gexTotal: 78_000_000,
    gexByStrike: [
      { strike: 225, gex: -900000 }, { strike: 228, gex: -1400000 },
      { strike: 230, gex: -2100000 }, { strike: 232, gex: -800000 },
      { strike: 234, gex: 600000 }, { strike: 236, gex: 1800000 },
      { strike: 238, gex: 2600000 }, { strike: 240, gex: 3400000 },
      { strike: 243, gex: 2100000 }, { strike: 245, gex: 1200000 },
    ],
    putWall: 230, callWall: 240, pcr: 0.42,
    unusualActivity: [
      { type: 'CALL', strike: 240, date: '2026-07-10', vol: 1932 },
    ],
    trend: { regime: '多头格局', momentum: '向上增强', signal: '趋势延续', rvol: 1.08, kfUpper: 236.8, kfLower: 232.9 },
    conclusion: '黄金正Gamma $78M温和撑盘，PCR 0.42偏多，趋势向好，Call Wall $240是近期突破目标',
    scenarios: { upTrigger: 240, upTarget: 247, downTrigger: 230, downTarget: 224 },
  },
  NVDA: {
    sector: ['半导体', 'AI芯片', '数据中心'],
    gexTotal: -124_000_000,
    gexByStrike: [
      { strike: 120, gex: -3400000 }, { strike: 124, gex: -5800000 },
      { strike: 127, gex: -8200000 }, { strike: 130, gex: -9800000 },
      { strike: 132, gex: -4200000 }, { strike: 134, gex: -1200000 },
      { strike: 136, gex: 2100000 }, { strike: 138, gex: 4800000 },
      { strike: 140, gex: 7200000 }, { strike: 144, gex: 4100000 },
      { strike: 148, gex: 2200000 },
    ],
    putWall: 130, callWall: 140, pcr: 0.72,
    unusualActivity: [
      { type: 'CALL', strike: 140, date: '2026-07-10', vol: 9821 },
      { type: 'CALL', strike: 145, date: '2026-07-09', vol: 7142 },
      { type: 'PUT', strike: 130, date: '2026-07-08', vol: 5841 },
    ],
    trend: { regime: '多头格局', momentum: '向上增强', signal: '趋势延续', rvol: 1.32, kfUpper: 136.8, kfLower: 131.4 },
    conclusion: '负GEX $-124M做市商short gamma可能放大波动，Call Wall $140是关键突破位，成功突破则目标$150+',
    scenarios: { upTrigger: 140, upTarget: 152, downTrigger: 130, downTarget: 120 },
  },
  AMD: {
    sector: ['半导体', 'AI芯片', 'PC/服务器'],
    gexTotal: 68_000_000,
    gexByStrike: [
      { strike: 150, gex: -1800000 }, { strike: 155, gex: -2400000 },
      { strike: 158, gex: -3100000 }, { strike: 160, gex: -1200000 },
      { strike: 162, gex: 800000 }, { strike: 165, gex: 2200000 },
      { strike: 168, gex: 3800000 }, { strike: 170, gex: 2600000 },
      { strike: 172, gex: 1400000 }, { strike: 175, gex: 700000 },
    ],
    putWall: 158, callWall: 168, pcr: 0.95,
    unusualActivity: [
      { type: 'PUT', strike: 160, date: '2026-07-10', vol: 4821 },
    ],
    trend: { regime: '中性格局', momentum: '趋于平稳', signal: '趋势延续', rvol: 0.82, kfUpper: 164.8, kfLower: 160.2 },
    conclusion: '正Gamma $68M，价格在Call Wall $168下方盘整，财报前观望，PCR 0.95中性，关注突破方向',
    scenarios: { upTrigger: 168, upTarget: 175, downTrigger: 158, downTarget: 150 },
  },
};

export function getMockAnalysis(symbol) {
  const base = ALL_MOCK[symbol.toUpperCase()];
  if (!base) return null;
  const ext = MOCK_GEX[symbol.toUpperCase()] || {};
  return { ...base, ...ext };
}

export function scanMock({ minIvr = 0, maxIvr = 100, strategies = [] }) {
  return Object.values(ALL_MOCK)
    .filter(d => d.ivRank >= minIvr && d.ivRank <= maxIvr)
    .filter(d => strategies.length === 0 || strategies.includes(d.recommendation.strategy))
    .sort((a, b) => b.ivRank - a.ivRank);
}
