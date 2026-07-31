import { Link } from 'react-router-dom';
import { getMarketStateMatrix } from '../lib/api';
import { buildStateMatrixView } from '../lib/stateMatrix';
import MarketInternals from '../components/MarketInternals';
import SectorRotation from '../components/SectorRotation';
import MarketBriefing from '../components/MarketBriefing';
import useAsyncResource from '../hooks/useAsyncResource';

export default function Market() {
  const { data: raw, error } = useAsyncResource(getMarketStateMatrix);

  const view = buildStateMatrixView(raw);

  return (
    <main className="product-page market-page">
      <header className="product-header market-head">
        <div className="product-kicker">Market pulse · 市场脉搏</div>
        <h1 className="product-title">市场 · Market</h1>
        <p className="product-subtitle">
          查看市场宽度、期权环境、标的状态与板块相对表现。页面描述当前市场，不提供买卖指令。
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
                      >
                        <b>{sym.symbol}</b>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <p className="sm-foot">
            点标的进入分析页。状态仅用于研究观察，不构成买卖建议。
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
