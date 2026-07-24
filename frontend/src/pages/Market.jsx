import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketStateMatrix } from '../lib/api';
import { buildStateMatrixView } from '../lib/stateMatrix';
import MarketInternals from '../components/MarketInternals';

const CHIP_LIMIT = 12; // symbols shown per column before the "+N" fold

export default function Market() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { getMarketStateMatrix().then(setRaw).catch(() => setError(true)); }, []);

  const view = buildStateMatrixView(raw);

  return (
    <main className="market-page">
      <header className="market-head">
        <div className="market-kicker">决策语言层 · Decision Language</div>
        <h1>市场 · Market</h1>
        <p>
          整个覆盖池现在处于什么状态——规则把每个标的判成一个市场状态（描述状态、不给买卖动作），
          点标的看触发原因。上方是期权原生市场体征，下方是逐标的状态矩阵。
        </p>
      </header>

      <MarketInternals />

      {!raw && !error && <div className="market-loading">加载状态矩阵…</div>}
      {error && <div className="market-loading">状态矩阵暂不可用。</div>}

      {view.status === 'ready' && (
        <section className="sm-section">
          <div className="sm-dist-head">
            <b>状态分布</b>
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
                <div className="sm-col" key={bucket.id}>
                  <div className="sm-col-head">
                    <span className="sm-cn"><i className={`sm-tone-${bucket.tone}`} />{bucket.label}</span>
                    <span className="sm-cc">{bucket.count} 只</span>
                  </div>
                  <div className="sm-col-body">
                    {bucket.count === 0 && <div className="sm-empty">今日无</div>}
                    {bucket.symbols.slice(0, CHIP_LIMIT).map(sym => (
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
                    {bucket.count > CHIP_LIMIT && <div className="sm-more">+{bucket.count - CHIP_LIMIT} 只…</div>}
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
    </main>
  );
}
