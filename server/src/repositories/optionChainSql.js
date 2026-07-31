function executableQuotePredicate(alias) {
  return `${alias}.bid IS NOT NULL
      AND ${alias}.ask IS NOT NULL
      AND ${alias}.ask > 0
      AND ${alias}.ask >= ${alias}.bid`;
}

const LATEST_QUOTED_CHAIN_CTE = `latest_quote_chain AS (
  SELECT DISTINCT ON (s.symbol)
    s.symbol, s.id AS snapshot_id, s.source AS quote_source,
    s.snapshot_ts AS quote_snapshot_ts
  FROM option_chain_snapshots s
  WHERE EXISTS (
    SELECT 1
    FROM option_contract_snapshots quoted
    WHERE quoted.snapshot_id = s.id
      AND ${executableQuotePredicate('quoted')}
  )
  ORDER BY s.symbol, s.snapshot_ts DESC
)`;

const QUOTED_CONTRACT_SAMPLES_CTE = `contract_samples AS (
  SELECT
    c.symbol,
    jsonb_agg(
      jsonb_build_object(
        'expiry', c.expiry,
        'dte', (c.expiry::date - (NOW() AT TIME ZONE 'America/New_York')::date)::int,
        'strike', c.strike,
        'right', c.option_right,
        'bid', c.bid,
        'ask', c.ask,
        'mark', c.mark,
        'volume', c.volume,
        'openInterest', c.open_interest,
        'delta', c.delta,
        'gamma', c.gamma,
        'iv', c.iv,
        'contractSymbol', c.contract_symbol
      )
      ORDER BY c.expiry ASC, c.strike ASC, c.option_right ASC
    ) AS option_contracts
  FROM option_contract_snapshots c
  JOIN latest_quote_chain lc ON lc.symbol = c.symbol AND lc.snapshot_id = c.snapshot_id
  WHERE c.bid IS NOT NULL
    AND c.ask IS NOT NULL
  GROUP BY c.symbol
)`;

module.exports = {
  executableQuotePredicate,
  LATEST_QUOTED_CHAIN_CTE,
  QUOTED_CONTRACT_SAMPLES_CTE,
};
