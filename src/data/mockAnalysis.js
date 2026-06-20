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

export function getMockAnalysis(symbol) {
  return ALL_MOCK[symbol.toUpperCase()] || null;
}

export function scanMock({ minIvr = 0, maxIvr = 100, strategies = [] }) {
  return Object.values(ALL_MOCK)
    .filter(d => d.ivRank >= minIvr && d.ivRank <= maxIvr)
    .filter(d => strategies.length === 0 || strategies.includes(d.recommendation.strategy))
    .sort((a, b) => b.ivRank - a.ivRank);
}
