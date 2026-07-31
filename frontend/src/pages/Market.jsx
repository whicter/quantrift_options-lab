import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketStateMatrix } from '../lib/api';
import { buildStateMatrixView } from '../lib/stateMatrix';
import MarketInternals from '../components/MarketInternals';
import SectorRotation from '../components/SectorRotation';
import MarketBriefing from '../components/MarketBriefing';

export default function Market() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { getMarketStateMatrix().then(setRaw).catch(() => setError(true)); }, []);

  const view = buildStateMatrixView(raw);

  return (
    <main className="product-page market-page">
      <header className="product-header market-head">
        <div className="product-kicker">Market pulse · 市场脉搏</div>
        <h1 className="product-title">市场 · Market</h1>
        <p className="product-subtitle">
          整个覆盖池现在处于什么状态——规则把每个标的判成一个市场状态（描述状态、不给买卖动作），
          点标的看触发原因。上方是全市场宽度与覆盖池期权体征，下方是逐标的状态矩阵。
        </p>
      </header>

      <nav className="market-jumpbar" aria-label="市场页面分区">
        <a href="#market-briefing"><i className="market-jump-dot market-jump-blue" />今日简报</a>
        <a href="#market-internals"><i className="market-jump-dot market-jump-purple" />市场内参</a>
        <a href="#market-states"><i className="market-jump-dot market-jump-green" />状态矩阵</a>
        <a href="#market-sectors"><i className="market-jump-dot market-jump-orange" />板块轮动</a>
      </nav>

      <div id="market-briefing" className="market-section-anchor">
        <MarketBriefing />
      </div>

      <div id="market-internals" className="market-section-anchor">
        <MarketInternals />
      </div>

      <div id="market-states" className="market-section-anchor">
        {!raw && !error && <div className="market-loading">加载状态矩阵…</div>}
        {error && <div className="market-loading">状态矩阵暂不可用。</div>}

        {view.status === 'ready' && (
          <section className="sm-section">
          <div className="sm-dist-head">
            <div>
              <small>Market states</small>
              <b>状态分布</b>
            </div>
            <span>{view.universeCount} 只标的</span>
          </div>
          <div className="sm-dist-bar" role="img" aria-label="市场状态分布">
            {view.segments.map(seg => (
              <i
                key={seg.id}
                className={`sm-tone-${seg.tone}`}
                style={{ width: `${seg.pct}%` }}
                title={`${seg.label} · ${seg.count}`}
              >
                {seg.pct >= 7 ? `${seg.id} · ${seg.count}` : ''}
              </i>
            ))}
          </div>

          <div className="sm-cols">
            {view.buckets
              .filter(b => b.id !== 'insufficient' || b.count > 0)
              .map(bucket => (
                <div className={`sm-col sm-col-${bucket.tone} sm-col-${bucket.id}`} key={bucket.id}>
                  <div className="sm-col-head">
                    <span className="sm-cn"><i className={`sm-tone-${bucket.tone}`} />{bucket.label}</span>
                    <span className="sm-cc">{bucket.count} 只</span>
                  </div>
                  <div className="sm-col-body">
                    {bucket.count === 0 && <div className="sm-empty">今日无</div>}
                    {bucket.symbols.map(sym => (
                      <Link
                        key={sym.symbol}
                        className="sm-sym"
                        to={`/analyze?symbol=${encodeURIComponent(sym.symbol)}`}
                        title={sym.reasons.join(' · ')}
                      >
                        <b>{sym.symbol}</b>
                        <small>{sym.signal}</small>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <p className="sm-foot">
            点标的 → 分析页；小字是触发该状态的信号，不是买卖建议。阈值：IV Rank≥{view.thresholds?.ivrHigh ?? 80} 判高波动、
            突破需放量 RVol≥{view.thresholds?.rvolBreakout ?? 1.5}、回调/企稳需 5 日动量超 ±{view.thresholds?.momBand ?? 1.5}%。
          </p>
          </section>
        )}
      </div>

      <div id="market-sectors" className="market-section-anchor">
        <SectorRotation />
      </div>
    </main>
  );
}
