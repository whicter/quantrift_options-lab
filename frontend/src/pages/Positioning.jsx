import { Link } from 'react-router-dom';
import { getMarketPositioning } from '../lib/api';
import useAsyncResource from '../hooks/useAsyncResource';

// Copy rule for this page, same as the state matrix: describe the option chain,
// never prescribe a trade. Two claims are specifically out of bounds --
// that any dealer is positioned a certain way (open interest does not identify
// who holds which side), and that a listed name is likely to move (nothing here
// has been scored against an outcome yet).

const GAP_TONE = {
  at: 'pos-gap-at',
  near: 'pos-gap-near',
  mid: 'pos-gap-mid',
  far: 'pos-gap-far',
};

function compact(value) {
  if (value == null) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(value);
}

function Row({ row }) {
  return (
    <tr>
      <td className="pos-sym">
        <Link to={`/analyze?symbol=${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>
      </td>
      <td className="pos-num">{row.spot?.toFixed(2) ?? '—'}</td>
      <td className="pos-num pos-strike">{row.concentration_strike?.toFixed(2) ?? '—'}</td>
      <td className="pos-num">
        <span className={`pos-gap ${GAP_TONE[row.gap_band] || ''}`}>
          {row.gap_pct == null ? '—' : `${row.gap_pct.toFixed(1)}%`}
        </span>
      </td>
      <td className="pos-num">{compact(row.call_oi_above)}</td>
      <td className="pos-num">
        {row.concentration == null ? '—' : `${Math.round(row.concentration * 100)}%`}
      </td>
      <td className="pos-num">{row.call_put_ratio == null ? '—' : row.call_put_ratio.toFixed(1)}</td>
      <td className="pos-num">{row.unusual_oi_count || '—'}</td>
      <td className="pos-num">
        {row.fee_rate == null ? '—' : (
          <span className={row.fee_rate >= 10 ? 'pos-fee-high'
            : row.fee_rate >= 3 ? 'pos-fee-warm' : ''}>
            {row.fee_rate.toFixed(2)}%
          </span>
        )}
      </td>
      <td className="pos-num">{row.days_to_cover == null ? '—' : row.days_to_cover.toFixed(1)}</td>
      <td className="pos-notes">{row.notes.join(' · ')}</td>
    </tr>
  );
}

export default function Positioning() {
  const { data, error } = useAsyncResource(getMarketPositioning);
  const ready = data && data.status === 'ok';

  return (
    <main className="product-page positioning-page">
      <header className="product-header">
        <div className="product-kicker">Positioning · 看涨持仓分布</div>
        <h1 className="product-title">持仓异动</h1>
        <p className="product-subtitle">
          现价上方看涨期权持仓的堆积位置与集中程度。页面描述期权链的当前结构，
          不预测方向，也不提供买卖指令。
        </p>
      </header>

      {/* Stated on the page itself, not buried in docs: these readings have not
          been checked against outcomes, and the capture series is new. */}
      <div className="positioning-caveat">
        <strong>这些读数尚未经过校准。</strong>
        判据阈值是初始设定，还没有用历史结果检验过；持仓记录自 2026-08-11 起累积。
        另外，公开持仓量无法识别多空双方各自是谁，因此本页不对做市商的行为作任何判断。
      </div>

      {!data && !error && <div className="market-loading">加载持仓分布…</div>}
      {error && <div className="market-loading">持仓分布暂不可用。</div>}
      {data && data.status === 'missing' && (
        <div className="market-loading">尚无持仓捕获记录，收盘后生成。</div>
      )}

      {ready && (
        <>
          <div className="positioning-meta">
            数据日期 {data.market_date} · 共 {data.counted} 只标的（仅普通股）
          </div>
          <div className="positioning-scroll">
            <table className="positioning-table">
              <thead>
                <tr>
                  <th>标的</th>
                  <th>现价</th>
                  <th>集中价位</th>
                  <th>距离</th>
                  <th>上方看涨持仓</th>
                  <th>最大价位占比</th>
                  <th>看涨÷看跌</th>
                  <th>持仓异动</th>
                  <th>借券费率</th>
                  <th>回补天数</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => <Row key={row.symbol} row={row} />)}
              </tbody>
            </table>
          </div>
          <p className="positioning-foot">
            「集中价位」是现价上方持有最多看涨持仓的行权价；「借券费率」是做空该标的的
            年化持仓成本，全市场多数标的低于 0.5%；「回补天数」按已发行股本口径的空头持仓
            除以日均成交量。三者均为观察到的事实，不代表价格会到达该位置。
          </p>
        </>
      )}
    </main>
  );
}
