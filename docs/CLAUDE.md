# Options Lab — Claude Instructions

## Project Overview
Interactive options strategy education tool, to be part of a future paid website.
Target: self-use + subscribers. Bilingual (English strategy names, Chinese descriptions).

## Tech Stack
- **Frontend**: React 19 + Vite
- **State**: Zustand
- **Charts**: Custom Canvas rendering (no chart libraries)
- **Styling**: CSS variables, dark theme (#0b0d10 background)
- **Deployment**: Vercel（前端静态）+ Railway（Node.js 后端 + PostgreSQL）
- **Database**: PostgreSQL（Railway 独立 Service，V2 引入）

## Key Directories
```
docs/                  ← All project documentation (task.md, wiki.md, learning.md, etc.)
frontend/src/
  data/strategies.js       ← All 70+ strategy definitions
  data/mockAnalysis.js     ← Mock data (9 symbols, GEX/PCR/trend/scenarios)
  data/companyInfo.js      ← Company info lookup (12 symbols, logo/zh/tagline)
  lib/blackscholes.js      ← BS pricing engine + Greeks
  components/              ← UI components (incl. InsightCarousel)
  pages/analyze/           ← 4-tab analyze page
  pages/weekly/            ← 5-section weekly recap
  store/useStrategyStore.js ← Zustand global state
```

## Code Conventions
- Use the Edit tool directly — never Python/Bash to modify files
- Functional React components only, no class components
- Keep strategy data and calculation logic separate from UI
- Canvas charts: always account for devicePixelRatio for retina displays
- All monetary values in USD, strikes relative to default spot = 100

## Strategy Data Format
```js
{
  id: 'long_call',
  name: 'Long Call',          // English
  zh: '买入看涨',              // Chinese
  cat: 'direction',            // direction|income|volatility|calendar|complex|arb|guide
  tag: 'bullish',              // bullish|bearish|neutral|volatile|guide
  lvl: 'novice',              // novice|intermediate|advanced
  desc: 'Short description',
  legs: [
    { type: 'call'|'put', dir: 1|-1, K: 100, dte: 45, iv: 0.30, qty: 1 }
    // dir: 1=long, -1=short; K=strike price; iv=decimal
  ],
  notes: {
    build, when, strike, iv, dte, delta, tp, sl, adj
  }
}
```

## Future Plans (do not implement yet)
- IB Gateway integration for real-time data
- Options scanner with push notifications
- User authentication + subscription tiers
- Portfolio tracking
