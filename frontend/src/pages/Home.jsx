import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketRegime } from '../lib/api';

const PRODUCTS = [
  { title: '机会扫描', label: 'Scan', text: '按 IV、趋势、Gamma 与流动性筛选，并落到真实到期日和策略腿。', to: '/scan', accent: 'blue' },
  { title: '标的分析', label: 'Analyze', text: '把价格结构、GEX、Wall、波动率与期权链放进同一份分析。', to: '/analyze', accent: 'green' },
  { title: '周度复盘', label: 'Weekly', text: '复盘五个交易日的价格、Gamma 迁徙、Max Pain 与 ΔOI。', to: '/weekly', accent: 'red' },
];

export default function Home() {
  const [market, setMarket] = useState(null);
  useEffect(() => { getMarketRegime().then(setMarket).catch(() => {}); }, []);
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-image" aria-hidden="true" />
        <div className="home-hero-overlay" />
        <div className="home-hero-content">
          <div className="home-kicker">OPTIONS INTELLIGENCE</div>
          <h1>Quantrift</h1>
          <p>从全市场扫描到具体期权结构，把价格趋势与期权仓位变成可核验的研究路径。</p>
          <div className="home-actions">
            <Link className="home-primary" to="/scan">打开扫描器</Link>
            <Link className="home-secondary" to="/analyze">分析标的</Link>
          </div>
        </div>
        <div className="home-live-strip">
          <div><span>Market Regime</span><strong>{market?.regime?.label || 'Loading'}</strong></div>
          {(market?.instruments || []).map(item => (
            <div key={item.symbol}>
              <span>{item.symbol}</span>
              <strong>{item.momentum?.status === 'ready' ? item.momentum.score : '--'}</strong>
              <small>{item.gex?.gamma_regime ? `${item.gex.gamma_regime} Gamma` : 'GEX unavailable'}</small>
            </div>
          ))}
          <div><span>Data model</span><strong>Snapshot-first</strong><small>missing stays missing</small></div>
        </div>
      </section>

      <section className="home-workflows">
        <div className="home-section-head">
          <span>WORKFLOWS</span>
          <h2>从发现机会，到理解结构</h2>
        </div>
        <div className="home-product-grid">
          {PRODUCTS.map(product => (
            <Link key={product.to} className={`home-product home-product-${product.accent}`} to={product.to}>
              <div className="home-product-top"><span>{product.label}</span><b>→</b></div>
              <h3>{product.title}</h3>
              <p>{product.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
