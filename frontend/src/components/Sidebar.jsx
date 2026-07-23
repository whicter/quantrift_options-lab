import { useEffect, useRef } from 'react';
import useStrategyStore from '../store/useStrategyStore';
import { CATEGORIES, STRATEGIES } from '../data/strategies';
import { strategyIvProfile } from '../lib/strategyIvProfile';

const CAT_LABEL = { direction:'方向', income:'权利金卖方', volatility:'波动率', calendar:'跨期', complex:'复杂', arb:'相对价值', guide:'向导' };

export default function Sidebar({ view, onViewChange }) {
  const { strategy, category, search, setStrategy, setCategory, setSearch, getFilteredStrategies } =
    useStrategyStore();
  const list = getFilteredStrategies();
  const activeRef = useRef(null);

  // Keyboard navigation: ↑↓ arrows switch strategies
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const idx = list.findIndex((s) => s.id === strategy.id);
      if (idx === -1) return;
      const next = e.key === 'ArrowDown'
        ? list[Math.min(idx + 1, list.length - 1)]
        : list[Math.max(idx - 1, 0)];
      setStrategy(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, strategy, setStrategy]);

  // Scroll active item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [strategy.id]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-label">Options Lab</div>
        <div className="logo-title">期权策略库</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {STRATEGIES.length} 个策略
        </div>
      </div>

      <div className="sidebar-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索策略名称 / 中文…"
        />
      </div>

      <div className="sidebar-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`filter-btn ${category === c.id ? 'active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.zh}
          </button>
        ))}
      </div>

      {/* Greeks Knowledge button */}
      <button
        className={`gk-nav-btn ${view === 'greeks' ? 'active' : ''}`}
        onClick={() => onViewChange(view === 'greeks' ? 'strategy' : 'greeks')}
      >
        <span>Δ</span>
        <span>Greeks 知识库</span>
      </button>

      <div className="strategy-list">
        {list.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            无匹配策略
          </div>
        )}
        {list.map((s) => {
          const ivProfile = strategyIvProfile(s.notes.iv);
          return (
            <div
              key={s.id}
              ref={s.id === strategy.id ? activeRef : null}
              className={`strategy-item ${strategy.id === s.id ? 'active' : ''}`}
              onClick={() => setStrategy(s)}
            >
              <div className="si-name">{s.name}</div>
              <div className="si-meta">
                <span className="si-zh">{s.zh}</span>
                <span className={`cat-badge cat-${s.cat}`}>{CAT_LABEL[s.cat]}</span>
                <span className={`iv-profile iv-profile-${ivProfile}`} title="策略适用的隐含波动率环境，不是当前标的的 IV Rank 数据。">IV {ivProfile === 'low' ? 'LOW' : ivProfile === 'high' ? 'HIGH' : 'MED'}</span>
              </div>
            </div>
          );
        })}
        {list.length > 0 && (
          <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
            {list.length} 个 · ↑↓ 键切换
          </div>
        )}
      </div>
    </aside>
  );
}
