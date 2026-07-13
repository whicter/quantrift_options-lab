// Weekly Recap mock data — 3 symbols, week of 7/7–7/11 2026

const gex = (strikes, vals) => strikes.map((s, i) => ({ strike: s, gex: vals[i] }));

export const WEEKLY_MOCK = {
  AAPL: {
    symbol: 'AAPL', week: '7/7 – 7/11',
    prevClose: 208.4, weekClose: 213.5, weekChange: 2.45,
    weekHigh: 215.2, weekLow: 207.8,
    tone: '本周是正Gamma主导的温和上涨周：价格从Put Wall $205区域稳步攀升，Call Wall $220形成明显阻力天花板，做市商减震效应使得每次拉升都显得克制',
    cmeScore: 62,
    candles: [
      { day: 'Mon', open: 208.4, high: 210.8, low: 207.5, close: 210.2 },
      { day: 'Tue', open: 210.2, high: 212.1, low: 209.8, close: 211.4 },
      { day: 'Wed', open: 211.4, high: 213.5, low: 210.5, close: 212.8 },
      { day: 'Thu', open: 212.8, high: 215.2, low: 211.9, close: 214.1 },
      { day: 'Fri', open: 214.1, high: 215.0, low: 212.3, close: 213.5 },
    ],
    gammaByDay: {
      Mon: {
        callWall: 220, putWall: 205,
        gexByStrike: gex([200,205,210,215,217.5,220,222.5,225,230],
                         [-1200000,-1840000,-320000,1650000,2280000,3100000,1420000,820000,310000]),
      },
      Tue: {
        callWall: 220, putWall: 205,
        gexByStrike: gex([200,205,210,215,217.5,220,222.5,225,230],
                         [-980000,-1640000,-280000,1800000,2400000,3200000,1500000,860000,340000]),
      },
      Wed: {
        callWall: 220, putWall: 207,
        gexByStrike: gex([200,205,207,210,215,217.5,220,222.5,225],
                         [-700000,-1200000,-2100000,-180000,1920000,2550000,3400000,1620000,940000]),
      },
      Thu: {
        callWall: 222, putWall: 207,
        gexByStrike: gex([205,207,210,215,217.5,220,222,225,230],
                         [-1400000,-2200000,-250000,1750000,2620000,3000000,3800000,1800000,600000]),
      },
      Fri: {
        callWall: 220, putWall: 205,
        gexByStrike: gex([200,205,210,215,217.5,220,222.5,225,230],
                         [-800000,-1840000,-300000,1650000,2280000,3100000,1420000,820000,310000]),
      },
    },
    gammaMigration: '本周Gamma墙整体稳定，Call Wall $220全周主导，周三Put Wall短暂上移至$207、周四Call Wall拓展至$222后均回归原位，表明主力筹码未发生方向性转移',
    maxPain: 210, fridayClose: 213.5,
    pinningNote: '收盘$213.5偏离Max Pain $210约1.67%，位于正Gamma吸引区间上方。Call Wall $220的正GEX引力将价格托举在Max Pain之上，但未能突破',
    smartMoney: {
      cumulative: 24_800_000, divergence: false,
      dailyFlows: [
        { day: 'Mon', flow: -5_200_000 },
        { day: 'Tue', flow: -1_800_000 },
        { day: 'Wed', flow: 4_200_000 },
        { day: 'Thu', flow: 12_600_000 },
        { day: 'Fri', flow: 15_000_000 },
      ],
      note: '周四起主力资金明显流入，与价格冲高完全同步，趋势可信度高。周一至周二的小幅流出属于正常洗盘，未出现背离',
    },
    scenarios: {
      upTrigger: 220, upTarget: 228,
      upWatch: '观察突破$220时成交量是否放大至RVol > 1.5×，Gamma做市商被迫平空头对冲将形成加速',
      downTrigger: 205, downTarget: 198,
      downWatch: '观察跌破$205后是否出现成交量放大，负Gamma区域将使下跌加速，需警惕连锁踩踏',
    },
  },

  SPY: {
    symbol: 'SPY', week: '7/7 – 7/11',
    prevClose: 574.2, weekClose: 586.3, weekChange: 2.11,
    weekHigh: 588.5, weekLow: 573.8,
    tone: '本周宏观数据持续超预期推动大盘突破，PCR从1.4回落至1.2显示空头开始回补。正Gamma $2.85B提供强力缓冲，涨势平稳但上方Call Wall $595阻力仍重',
    cmeScore: 55,
    candles: [
      { day: 'Mon', open: 574.2, high: 578.4, low: 573.8, close: 577.2 },
      { day: 'Tue', open: 577.2, high: 580.8, low: 576.5, close: 579.6 },
      { day: 'Wed', open: 579.6, high: 583.2, low: 578.8, close: 582.4 },
      { day: 'Thu', open: 582.4, high: 586.9, low: 581.5, close: 585.1 },
      { day: 'Fri', open: 585.1, high: 588.5, low: 584.2, close: 586.3 },
    ],
    gammaByDay: {
      Mon: {
        callWall: 590, putWall: 570,
        gexByStrike: gex([565,570,575,578,580,582,585,588,590,595,600],
                         [-7200000,-12400000,-18500000,-6200000,-1800000,3400000,8900000,14200000,21000000,31800000,18200000]),
      },
      Tue: {
        callWall: 590, putWall: 572,
        gexByStrike: gex([570,572,575,578,580,582,585,588,590,595,600],
                         [-8800000,-14200000,-16400000,-5800000,-1200000,4100000,9600000,15800000,22400000,33000000,19600000]),
      },
      Wed: {
        callWall: 592, putWall: 572,
        gexByStrike: gex([570,572,575,578,580,583,585,588,590,592,595,600],
                         [-6400000,-11800000,-14200000,-4800000,-800000,2800000,8200000,13600000,18900000,24100000,30400000,17000000]),
      },
      Thu: {
        callWall: 595, putWall: 575,
        gexByStrike: gex([570,575,578,580,582,585,588,590,592,595,600],
                         [-9800000,-18500000,-6200000,-1800000,3400000,8900000,14200000,21000000,16500000,31800000,18200000]),
      },
      Fri: {
        callWall: 595, putWall: 575,
        gexByStrike: gex([570,575,578,580,582,585,588,590,592,595,600,605],
                         [-9800000,-18500000,-6200000,-1800000,3400000,8900000,14200000,21000000,16500000,31800000,18200000,9100000]),
      },
    },
    gammaMigration: '本周Call Wall从$590→$595逐步上移，与价格上涨同步爬升，显示做市商建立新Call仓位跟随趋势。Put Wall从$570→$575稳步上移提供动态支撑，Gamma墙整体向多头方向迁移',
    maxPain: 580, fridayClose: 586.3,
    pinningNote: '收盘$586.3偏离Max Pain $580约1.09%，偏离幅度适中。本周趋势动能较强，Max Pain引力效应被方向性力量压制，下周回归压力轻微',
    smartMoney: {
      cumulative: 86_400_000, divergence: false,
      dailyFlows: [
        { day: 'Mon', flow: 8_400_000 },
        { day: 'Tue', flow: 14_200_000 },
        { day: 'Wed', flow: 18_600_000 },
        { day: 'Thu', flow: 22_800_000 },
        { day: 'Fri', flow: 22_400_000 },
      ],
      note: '全周持续净流入，资金与价格高度同步，无背离信号。机构增仓态势明确，周五仍维持强劲流入，下周延续可期',
    },
    scenarios: {
      upTrigger: 595, upTarget: 607,
      upWatch: '观察突破$595时成交量是否配合，下一正GEX峰值在$605区域，突破后目标明确',
      downTrigger: 575, downTarget: 565,
      downWatch: '跌破$575则进入Put Wall负GEX区域，做市商对冲压力可能加速下跌至$565支撑',
    },
  },

  QQQ: {
    symbol: 'QQQ', week: '7/7 – 7/11',
    prevClose: 508.1, weekClose: 519.2, weekChange: 2.19,
    weekHigh: 521.4, weekLow: 507.2,
    tone: '本周科技股反弹显著，但Call Wall $530构成明显天花板，动能在接近压力区时明显减弱。IV Rank维持69%高位，期权卖方仍占优',
    cmeScore: 48,
    candles: [
      { day: 'Mon', open: 508.1, high: 511.8, low: 507.2, close: 510.6 },
      { day: 'Tue', open: 510.6, high: 514.2, low: 510.1, close: 513.4 },
      { day: 'Wed', open: 513.4, high: 517.6, low: 512.8, close: 516.2 },
      { day: 'Thu', open: 516.2, high: 520.8, low: 515.4, close: 519.1 },
      { day: 'Fri', open: 519.1, high: 521.4, low: 517.9, close: 519.2 },
    ],
    gammaByDay: {
      Mon: {
        callWall: 525, putWall: 500,
        gexByStrike: gex([495,500,505,510,513,515,518,520,525,530,535],
                         [-3100000,-5800000,-9200000,-1200000,2100000,5400000,8700000,12300000,18100000,22400000,14200000]),
      },
      Tue: {
        callWall: 525, putWall: 502,
        gexByStrike: gex([498,502,505,510,513,515,518,520,525,530,535],
                         [-2800000,-6200000,-8400000,-800000,2600000,6100000,9400000,13200000,19400000,23800000,15600000]),
      },
      Wed: {
        callWall: 528, putWall: 505,
        gexByStrike: gex([500,505,508,510,513,515,518,520,525,528,530,535],
                         [-3600000,-9200000,-4600000,-1200000,2100000,5400000,8700000,12300000,18100000,20400000,22400000,14200000]),
      },
      Thu: {
        callWall: 530, putWall: 505,
        gexByStrike: gex([500,505,508,510,513,515,518,520,525,530,535,540],
                         [-4200000,-9200000,-4600000,-1200000,2100000,5400000,8700000,12300000,18100000,22400000,14200000,7800000]),
      },
      Fri: {
        callWall: 530, putWall: 505,
        gexByStrike: gex([500,505,508,510,513,515,518,520,525,530,535,540,545],
                         [-3100000,-9200000,-4600000,-1200000,2100000,5400000,8700000,12300000,18100000,22400000,14200000,7800000,3200000]),
      },
    },
    gammaMigration: '本周Call Wall从$525→$530阶梯上移，价格跟随攀升。Put Wall从$500→$505上移提供动态支撑。周四Call Wall稳固在$530，构成明确阻力上限',
    maxPain: 514, fridayClose: 519.2,
    pinningNote: '收盘$519.2偏离Max Pain $514约1.01%，价格被Call Wall吸引停留在Max Pain上方。下周若Call Wall维持$530，价格有向上寻找新平衡的动力',
    smartMoney: {
      cumulative: 12_600_000, divergence: false,
      dailyFlows: [
        { day: 'Mon', flow: -8_400_000 },
        { day: 'Tue', flow: -3_200_000 },
        { day: 'Wed', flow: 2_800_000 },
        { day: 'Thu', flow: 9_600_000 },
        { day: 'Fri', flow: 11_800_000 },
      ],
      note: '周初资金流出，周中开始转向。周四周五流入明显，但累计量相对价格涨幅偏小，需关注下周是否持续，否则涨势缺乏机构背书',
    },
    scenarios: {
      upTrigger: 530, upTarget: 542,
      upWatch: '突破$530 Call Wall后，负GEX阻力消除，目标下一正GEX峰值$542附近',
      downTrigger: 505, downTarget: 495,
      downWatch: '跌破Put Wall $505，进入负GEX区域，历史波动率69%意味着下跌可能快速',
    },
  },
};

export function getWeeklyMock(symbol) {
  return WEEKLY_MOCK[symbol?.toUpperCase()] || null;
}
