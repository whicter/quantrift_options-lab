'use strict';

/**
 * The single freshness contract for every data product.
 *
 * Freshness is computed here, never stored. It decays with wall-clock time, so
 * a persisted label would be wrong the moment nothing writes -- `symbol_data_state`
 * deliberately records only observed facts and leaves the verdict to this module.
 *
 * Vocabulary, in the order a caller should reason about it:
 *   fresh   - real data, inside its product's target
 *   stale   - real data, past its target. Still displayable, and must be shown
 *             with is_stale and age rather than blanked into an empty page.
 *   missing - no data has ever landed
 *   queued  - no usable data yet and a refresh is in flight
 *   failed  - the last refresh attempt did not land and nothing usable exists
 *
 * `stale` and `queued`/`failed` are not exclusive: data can be stale while a
 * refresh is in flight. Callers report freshness (about the data) and
 * refresh_status (about the last attempt) as separate fields; resolveState()
 * collapses them into one label only where a single word is required.
 */

const PRODUCT_PRICE_DAILY = 'price_daily';
const PRODUCT_PRICE_30M = 'price_30m';
const PRODUCT_METRICS = 'metrics';
const PRODUCT_OPTION_CHAIN = 'option_chain';
const PRODUCT_GEX = 'gex';

const PRODUCTS = [
  PRODUCT_PRICE_DAILY,
  PRODUCT_PRICE_30M,
  PRODUCT_METRICS,
  PRODUCT_OPTION_CHAIN,
  PRODUCT_GEX,
];

// Targets. Kept identical to the per-route constants these replace, so
// unifying the definition does not silently move any endpoint's threshold:
//   price daily  <- prices.js  PRICE_STALE_DAYS   (5 days)
//   metrics      <- metrics.js IV_STALE_DAYS      (2 days)
//   option chain <- options.js OPTIONS_STALE_MINUTES (180 minutes)
//
// The P2.8 target for option chain / GEX is 60 minutes. Tightening it multiplies
// stale-driven enqueues, so it stays gated behind the queue-fill scheduler and
// shared rate limiter (E6/E7) rather than landing here. Override to adopt it early.
const PRICE_STALE_DAYS = parseInt(process.env.PRICE_STALE_DAYS ?? 5, 10);
const IV_STALE_DAYS = parseInt(process.env.IV_STALE_DAYS ?? 2, 10);
const OPTIONS_STALE_MINUTES = parseInt(process.env.OPTIONS_STALE_MINUTES ?? 180, 10);

const STATE_FRESH = 'fresh';
const STATE_STALE = 'stale';
const STATE_MISSING = 'missing';
const STATE_QUEUED = 'queued';
const STATE_FAILED = 'failed';

function ageMinutes(ts, now = new Date()) {
  if (!ts) return null;
  const parsed = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 60000));
}

/** Calendar-day gap between a market date and today in New York. */
function ageDays(marketDate, now = new Date()) {
  if (!marketDate) return null;
  const iso = String(marketDate?.toISOString?.().slice(0, 10) ?? marketDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = newYorkDate(now);
  const diffMs = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(diffMs)) return null;
  return Math.max(0, Math.round(diffMs / 86400000));
}

function newYorkDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

/**
 * Freshness of one product from its own facts.
 *
 * `facts` carries what actually landed: { snapshotTs, marketDate, latestDailyMarketDate }.
 * Returns { freshness, is_stale, age_minutes, age_days } and never throws on
 * absent input -- absent data is `missing`, not an error.
 */
function freshnessFor(product, facts = {}, now = new Date()) {
  const { snapshotTs = null, marketDate = null, latestDailyMarketDate = null } = facts;

  switch (product) {
    case PRODUCT_PRICE_DAILY: {
      // Judged by market date, not clock age: a weekend or holiday has no bar
      // to produce, so the previous trading day's close is still current. The
      // multi-day tolerance is what absorbs non-trading days.
      const days = ageDays(marketDate, now);
      if (days == null) return missing();
      return verdict(days > PRICE_STALE_DAYS, { age_days: days, age_minutes: ageMinutes(snapshotTs, now) });
    }

    case PRODUCT_PRICE_30M: {
      // An intraday feed is judged against the daily close, not the clock:
      // 30M bars that lag the latest daily bar are a previous session's and
      // must never be presented as current confirmation.
      if (!marketDate) return missing();
      const barDate = String(marketDate?.toISOString?.().slice(0, 10) ?? marketDate).slice(0, 10);
      if (!latestDailyMarketDate) {
        // With no daily bar to compare against, fall back to the daily tolerance
        // rather than inventing a verdict.
        const days = ageDays(barDate, now);
        return verdict(days == null || days > PRICE_STALE_DAYS, { age_days: days });
      }
      const dailyDate = String(
        latestDailyMarketDate?.toISOString?.().slice(0, 10) ?? latestDailyMarketDate
      ).slice(0, 10);
      return verdict(barDate !== dailyDate, {
        age_days: ageDays(barDate, now),
        age_minutes: ageMinutes(snapshotTs, now),
      });
    }

    case PRODUCT_METRICS: {
      // Trading-day cadence: metrics land once per session after the close.
      const days = ageDays(marketDate, now);
      if (days == null) return missing();
      return verdict(days > IV_STALE_DAYS, { age_days: days });
    }

    case PRODUCT_OPTION_CHAIN:
    case PRODUCT_GEX: {
      // Intraday products judged by clock age. GEX has no independent
      // freshness: it inherits the option snapshot it was computed from.
      const minutes = ageMinutes(snapshotTs, now);
      if (minutes == null) return missing();
      return verdict(minutes > OPTIONS_STALE_MINUTES, { age_minutes: minutes });
    }

    default:
      throw new Error(`unknown data product: ${product}`);
  }
}

function missing() {
  return { freshness: STATE_MISSING, is_stale: false, age_minutes: null, age_days: null };
}

function verdict(isStale, extra = {}) {
  return {
    freshness: isStale ? STATE_STALE : STATE_FRESH,
    is_stale: Boolean(isStale),
    age_minutes: extra.age_minutes ?? null,
    age_days: extra.age_days ?? null,
  };
}

/**
 * Collapse data freshness and refresh state into the single label a caller
 * needs when only one word fits.
 *
 * Real data always outranks refresh state: a stale snapshot with a failed
 * refresh reports `stale`, because the user can still see real data and
 * calling it `failed` would imply an empty page. `queued`/`failed` describe
 * having nothing usable to show.
 */
function resolveState(freshness, refreshStatus) {
  if (freshness === STATE_FRESH || freshness === STATE_STALE) return freshness;
  if (refreshStatus === 'queued' || refreshStatus === 'running') return STATE_QUEUED;
  if (refreshStatus === 'failed' || refreshStatus === 'blocked') return STATE_FAILED;
  return STATE_MISSING;
}

module.exports = {
  PRODUCTS,
  PRODUCT_PRICE_DAILY,
  PRODUCT_PRICE_30M,
  PRODUCT_METRICS,
  PRODUCT_OPTION_CHAIN,
  PRODUCT_GEX,
  STATE_FRESH,
  STATE_STALE,
  STATE_MISSING,
  STATE_QUEUED,
  STATE_FAILED,
  PRICE_STALE_DAYS,
  IV_STALE_DAYS,
  OPTIONS_STALE_MINUTES,
  freshnessFor,
  resolveState,
  ageMinutes,
  ageDays,
  newYorkDate,
};
