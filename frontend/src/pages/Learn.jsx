import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import PayoffChart from '../components/PayoffChart';
import GreeksCharts from '../components/GreeksCharts';
import StrategyNotes from '../components/StrategyNotes';
import RightPanel from '../components/RightPanel';
import GreeksKnowledge from '../components/GreeksKnowledge';
import useStrategyStore from '../store/useStrategyStore';
import { STRATEGIES } from '../data/strategies';
import StrategyComparison from '../components/StrategyComparison';

const CAT_LABELS = {
  direction: '方向', income: '权利金卖方', volatility: '波动率',
  calendar: '跨期', complex: '复杂', arb: '相对价值', guide: '向导',
};
const TAG_LABELS = {
  bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL',
  volatile: 'VOLATILE', guide: 'GUIDE',
};
const LVL_LABELS = {
  novice: 'NOVICE', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED',
};

export default function Learn() {
  const { strategy, resetLegs } = useStrategyStore();
  const [view, setView] = useState('strategy'); // 'strategy' | 'greeks'
  const [comparisonIds, setComparisonIds] = useState([strategy.id, STRATEGIES.find((item) => item.id !== strategy.id).id]);

  function toggleComparison() {
    setView((current) => current === 'comparison' ? 'strategy' : 'comparison');
  }

  function selectComparison(slot, id) {
    setComparisonIds((current) => current.map((currentId, index) => (index === slot ? id : currentId)));
  }

  const breadcrumb = [
    CAT_LABELS[strategy.cat] || strategy.cat,
    TAG_LABELS[strategy.tag] || strategy.tag,
    LVL_LABELS[strategy.lvl] || strategy.lvl,
  ].join(' / ');

  return (
    <div className="app">
      <Sidebar view={view} onViewChange={setView} />

      <main className="main">
        {view === 'greeks' ? (
          <>
            <div className="strategy-header">
              <div className="header-left">
                <div className="header-breadcrumb">KNOWLEDGE BASE</div>
                <div className="header-title">Greeks 知识库</div>
                <div className="header-badges">
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>期权希腊字母完整指南 · 互动关系 · 交易决策框架</span>
                </div>
              </div>
              <div className="header-right">
                <button
                  style={{ padding: '6px 12px', background: 'var(--blue-dim)', border: '1px solid var(--blue)', color: 'var(--blue)', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
                  onClick={() => setView('strategy')}
                >
                  ← 返回策略库
                </button>
              </div>
            </div>
            <div className="main-scroll">
              <GreeksKnowledge />
            </div>
          </>
        ) : view === 'comparison' ? (
          <>
            <div className="strategy-header">
              <div className="header-left">
                <div className="header-breadcrumb">STRATEGY LIBRARY</div>
                <div className="header-title">策略对比</div>
              </div>
              <div className="header-right">
                <button className="learn-action" type="button" onClick={toggleComparison}>返回策略库</button>
              </div>
            </div>
            <div className="main-scroll"><StrategyComparison strategies={STRATEGIES} selectedIds={comparisonIds} onSelect={selectComparison} /></div>
          </>
        ) : (
          <>
            <div className="strategy-header">
              <div className="header-left">
                <div className="header-breadcrumb">{breadcrumb}</div>
                <div className="header-title">{strategy.name} &nbsp;<span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500 }}>{strategy.zh}</span></div>
                <div className="header-badges" style={{ marginTop: 4 }}>
                  <span className={`lvl-badge lvl-${strategy.lvl}`}>{LVL_LABELS[strategy.lvl]}</span>
                  <span className={`tag-badge tag-${strategy.tag}`}>{TAG_LABELS[strategy.tag]}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>{strategy.desc}</span>
                </div>
              </div>
              <div className="header-right">
                <button className="learn-action" type="button" onClick={toggleComparison}>策略对比</button>
                <button
                  className="learn-action"
                  type="button"
                  onClick={resetLegs}
                >
                  ↺ 重置模板
                </button>
              </div>
            </div>

            <div className="main-scroll">
              <PayoffChart />
              <GreeksCharts />
              <StrategyNotes />
            </div>
          </>
        )}
      </main>

      {view === 'strategy' && <RightPanel />}
    </div>
  );
}
