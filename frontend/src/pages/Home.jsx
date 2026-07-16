import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketRegime } from '../lib/api';
import heroMark from '../assets/hero.png';

const PRODUCTS = [
  { title: '标的分析', label: 'Analyze', text: '把价格结构、GEX、Wall、波动率与期权链放进同一份分析。', to: '/analyze', accent: 'green' },
  { title: '机会扫描', label: 'Scan', text: '按 IV、趋势、Gamma 与流动性筛选，并落到真实到期日和策略腿。', to: '/scan', accent: 'blue' },
  { title: '周度复盘', label: 'Weekly', text: '复盘五个交易日的价格、Gamma 迁徙、Max Pain 与 ΔOI。', to: '/weekly', accent: 'red' },
];

const HERO_PREVIEW_ROWS = [
  { symbol: 'SPY', price: '$642.08', iv: 'IV Rank 42', gamma: 'Positive Gamma', wall: 'Call Wall $650', strategy: 'Bull Put Spread', score: '82' },
  { symbol: 'QQQ', price: '$571.42', iv: 'IV Rank 37', gamma: 'Positive Gamma', wall: 'Put Wall $560', strategy: 'Iron Condor', score: '78' },
  { symbol: 'AAPL', price: '$213.50', iv: 'IV Rank 31', gamma: 'Balanced Gamma', wall: 'Call Wall $220', strategy: 'Call Calendar', score: '74' },
  { symbol: 'NVDA', price: '$164.92', iv: 'IV Rank 56', gamma: 'Negative Gamma', wall: 'Put Wall $160', strategy: 'Bear Call Spread', score: '71' },
];

export default function Home() {
  const [market, setMarket] = useState(null);
  useEffect(() => { getMarketRegime().then(setMarket).catch(() => {}); }, []);
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-dashboard" aria-hidden="true">
          <div className="home-dashboard-topline">
            <span>MARKET SCANNER</span>
            <span>LIVE RESEARCH VIEW</span>
          </div>
          <div className="home-dashboard-head">
            <span>标的</span><span>波动</span><span>期权定位</span><span>候选单</span><span>分数</span>
          </div>
          {HERO_PREVIEW_ROWS.map(row => (
            <div className="home-dashboard-row" key={row.symbol}>
              <span><strong>{row.symbol}</strong><small>{row.price}</small></span>
              <span>{row.iv}</span>
              <span><i className={row.gamma.startsWith('Negative') ? 'negative' : ''} />{row.gamma}<small>{row.wall}</small></span>
              <span>{row.strategy}</span>
              <b>{row.score}</b>
            </div>
          ))}
          <img className="home-hero-mark" src={heroMark} alt="" />
        </div>
        <div className="home-hero-overlay" />
        <div className="home-hero-content">
          <div className="home-kicker">OPTIONS INTELLIGENCE</div>
          <h1>Quantrift</h1>
          <p>从全市场扫描到具体期权结构，把价格趋势与期权仓位变成可核验的研究路径。</p>
          <div className="home-actions">
            <Link className="home-primary" to="/analyze?symbol=SPY">分析标的</Link>
            <Link className="home-secondary" to="/scan">打开扫描器</Link>
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
          <div><span>Research workflow</span><strong>Concrete setups</strong><small>analysis to execution</small></div>
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
