#!/usr/bin/env node
require('dotenv').config();

const pool = require('../src/db');
const { evaluateConfluenceReplay } = require('../src/domain/confluence/replay');

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function symbolsToReplay(minBars, requested) {
  if (requested?.length) return requested;
  const { rows } = await pool.query(
    `SELECT symbol
     FROM price_history
     GROUP BY symbol
     HAVING COUNT(*) >= $1
     ORDER BY symbol ASC`,
    [minBars]
  );
  return rows.map(row => row.symbol);
}

async function main() {
  const minHistory = Number.parseInt(argument('min-history', '90'), 10);
  const horizonDays = Number.parseInt(argument('horizon-days', '5'), 10);
  const symbols = (argument('symbols', '') || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  if (!Number.isInteger(minHistory) || minHistory < 20 || !Number.isInteger(horizonDays) || horizonDays < 1) {
    throw new Error('min-history must be >= 20 and horizon-days must be >= 1');
  }

  const requested = await symbolsToReplay(minHistory + horizonDays + 1, symbols);
  const { rows: coverageRows } = await pool.query(
    `SELECT MIN(date) AS first_date, MAX(date) AS last_date
     FROM price_history
     WHERE symbol = ANY($1::text[])`,
    [requested]
  );
  const results = [];
  for (const symbol of requested) {
    const { rows } = await pool.query(
      `SELECT date, high, low, close, volume
       FROM price_history
       WHERE symbol = $1
       ORDER BY date ASC`,
      [symbol]
    );
    const replay = evaluateConfluenceReplay(rows, { minHistory, horizonDays });
    results.push({ symbol, ...replay, decisions: undefined });
  }

  const eligible = results.filter(result => result.confluence.opportunities > 0);
  const aggregate = side => {
    const values = eligible.map(result => result[side]);
    const sum = key => values.reduce((total, value) => total + (Number(value[key]) || 0), 0);
    const touches = sum('touches');
    const events = sum('reversal_events');
    return {
      opportunities: sum('opportunities'), touches, holds: sum('holds'), reversal_events: events, reversal_hits: sum('reversal_hits'),
      hold_rate: touches ? sum('holds') / touches : null,
      reversal_recall: events ? sum('reversal_hits') / events : null,
    };
  };
  const confluence = aggregate('confluence');
  const control = aggregate('control');
  const average = value => {
    const values = [value.hold_rate, value.reversal_recall].filter(Number.isFinite);
    return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
  };
  const relativeImprovement = average(control) && average(confluence) != null
    ? (average(confluence) - average(control)) / average(control)
    : null;
  const gatePassed = relativeImprovement != null && relativeImprovement >= 0.15
    && confluence.hold_rate > control.hold_rate && confluence.reversal_recall > control.reversal_recall;
  process.stdout.write(`${JSON.stringify({
    generated_at: new Date().toISOString(),
    symbols_requested: requested.length,
    symbols_eligible: eligible.length,
    data_date_range: coverageRows[0] || null,
    min_history: minHistory,
    horizon_days: horizonDays,
    gamma_mode: 'disabled_for_historical_replay',
    control: { type: 'single_point_sr_band', band_pct: 0.005, ...control },
    confluence,
    relative_improvement: relativeImprovement,
    gate: { threshold: 0.15, passed: gatePassed, reason: 'requires_at_least_15pct_composite_lift_and_both_component_metrics_to_improve' },
    per_symbol: results,
  }, null, 2)}\n`);
}

main()
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
