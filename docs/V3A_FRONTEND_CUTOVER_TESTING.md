# V3A Frontend Cutover — Browser Acceptance Checklist

Branch: `feat/v3a-frontend-cutover` (built on `feat/v3a-2-materialized-candidates`).
Everything except the visual render is already verified: `eslint .` 0 errors,
`node --test` 46/46, `vite build` OK, `check:dist` OK. This file is the manual
browser check that this environment could not automate.

## What changed

Analyze now overlays the server-assembled summary (`GET /api/analyze/:symbol/summary`)
onto the page. The positioning **conclusion** and **scenario triggers/targets**
come from the server when it has a real positioning; the GEX chart, walls and
metadata still render from the local `applyGex`. When the summary is missing or
the server has no positioning, the page falls back to the locally computed
conclusion/scenarios, so nothing goes blank.

The Scanner was intentionally **not** cut over — see task.md (`/api/v1/scanner/candidates`
is a lean candidate feed and cannot back the rich Scanner rows without endpoint
enrichment).

## Run locally

```
# backend (needs DATABASE_URL; server has the two new tables + a live batch)
cd server && npm start
# frontend
cd frontend && npm run dev
```

## Check in the browser

1. **`/analyze?symbol=SPY`** (and a few others: AAPL, a smaller-cap name):
   - The positioning conclusion sentence renders and reads the same as before
     (server text was ported byte-for-byte from the old browser text).
   - Tab "关键价位与情景": up/down trigger and target numbers are present and match
     the Call Wall / Put Wall (up_trigger = Call Wall, down_trigger = Put Wall).
   - The GEX-by-strike chart and Call/Put Wall markers still render normally.
2. **Provider names**: confirm the user-facing data-status label (if surfaced)
   shows only freshness (e.g. "数据更新于2小时前"), never `polygon_licensed`/`tastytrade`/etc.
3. **Fallback**: with the network throttled or `/summary` blocked (DevTools →
   block `*/summary`), the conclusion/scenarios still render (from local applyGex)
   rather than going blank.
4. **A symbol with stale/missing GEX**: the "GEX/Wall 暂不可用" state still shows;
   no crash.

## After it passes

Once the server conclusion/scenarios are confirmed to render identically, the
follow-up is to remove the now-redundant conclusion/scenario computation from
`applyGex` in `frontend/src/lib/analyzeData.js` (keeping only the chart data), so
the positioning logic fully leaves the browser bundle. Do that as a separate
commit after acceptance.
