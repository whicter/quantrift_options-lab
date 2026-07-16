import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useState } from 'react';
import { closePosition, createPosition, getPortfolio } from '../lib/api';
import { blankLeg, buildPositionPayload, money } from '../lib/portfolio';

const initialDraft = () => ({ symbol: '', strategy_name: '', quantity: 1, notes: '', legs: [blankLeg()] });

function Summary({ summary }) {
  const items = [
    ['未实现 P/L', summary.pricing_complete ? money(summary.pnl) : '待报价'], ['组合 Delta', summary.pricing_complete ? Number(summary.delta).toFixed(2) : '待报价'],
    ['Gamma', summary.pricing_complete ? Number(summary.gamma).toFixed(2) : '待报价'],
    ['Theta / 日', summary.pricing_complete ? Number(summary.theta).toFixed(2) : '待报价'],
    ['Vega', summary.pricing_complete ? Number(summary.vega).toFixed(2) : '待报价'],
  ];
  return <div className="portfolio-summary">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function PositionForm({ token, onCreated }) {
  const [draft, setDraft] = useState(initialDraft);
  const [message, setMessage] = useState('');
  const updateLeg = (index, field, value) => setDraft(current => ({
    ...current, legs: current.legs.map((leg, legIndex) => legIndex === index ? { ...leg, [field]: value } : leg),
  }));
  const submit = async event => {
    event.preventDefault();
    try {
      const payload = buildPositionPayload(draft);
      await createPosition(token, payload);
      setDraft(initialDraft());
      setMessage('持仓已添加');
      onCreated();
    } catch (error) {
      setMessage(error.message || '保存失败');
    }
  };
  return (
    <form className="portfolio-form" onSubmit={submit}>
      <div className="portfolio-form-head"><h2>记录持仓</h2><button type="button" onClick={() => setDraft(current => ({ ...current, legs: [...current.legs, blankLeg()] }))}>添加腿</button></div>
      <div className="portfolio-fields">
        <label>标的<input value={draft.symbol} onChange={event => setDraft({ ...draft, symbol: event.target.value })} placeholder="AAPL" /></label>
        <label>策略<input value={draft.strategy_name} onChange={event => setDraft({ ...draft, strategy_name: event.target.value })} placeholder="Bull Put Spread" /></label>
        <label>组合数量<input type="number" min="1" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label>
      </div>
      <div className="portfolio-legs">
        {draft.legs.map((leg, index) => (
          <div className="portfolio-leg" key={index}>
            <select value={leg.side} onChange={event => updateLeg(index, 'side', event.target.value)}><option value="long">Long</option><option value="short">Short</option></select>
            <select value={leg.option_right} onChange={event => updateLeg(index, 'option_right', event.target.value)}><option value="C">Call</option><option value="P">Put</option></select>
            <input type="date" aria-label="到期日" value={leg.expiry} onChange={event => updateLeg(index, 'expiry', event.target.value)} />
            <input type="number" min="0" step="0.01" aria-label="执行价" placeholder="Strike" value={leg.strike} onChange={event => updateLeg(index, 'strike', event.target.value)} />
            <input type="number" min="0" step="0.01" aria-label="开仓价格" placeholder="Entry" value={leg.entry_price} onChange={event => updateLeg(index, 'entry_price', event.target.value)} />
            <button type="button" aria-label="删除腿" disabled={draft.legs.length === 1} onClick={() => setDraft(current => ({ ...current, legs: current.legs.filter((_, i) => i !== index) }))}>删除</button>
          </div>
        ))}
      </div>
      <label>备注<input value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="portfolio-submit"><button className="primary-btn" type="submit">保存持仓</button><span>{message}</span></div>
    </form>
  );
}

function PortfolioData() {
  const { getToken } = useAuth();
  const [token, setToken] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const nextToken = await getToken();
      setToken(nextToken);
      setData(await getPortfolio(nextToken));
      setError('');
    } catch {
      setError('持仓数据暂不可用');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);
  const close = async id => { await closePosition(token, id); await load(); };
  if (error) return <p className="account-status error">{error}</p>;
  if (!data) return <p className="account-status">正在加载持仓...</p>;
  return (
    <>
      <Summary summary={data.summary} />
      <PositionForm token={token} onCreated={load} />
      <section className="portfolio-list">
        <h2>持仓明细</h2>
        {!data.positions.length ? <p className="account-status">暂无持仓</p> : data.positions.map(position => (
          <article className="portfolio-position" key={position.id}>
            <div className="portfolio-position-head">
              <div><strong>{position.symbol}</strong><span>{position.strategy_name}</span></div>
              <div><strong>{position.priced_legs === position.legs.length ? money(position.pnl) : '待报价'}</strong>{position.status === 'open' ? <button type="button" onClick={() => close(position.id)}>关闭</button> : <span>已关闭</span>}</div>
            </div>
            {position.legs.map(leg => <div className="portfolio-position-leg" key={leg.id}><span>{leg.side.toUpperCase()}</span><span>{leg.option_right === 'C' ? 'CALL' : 'PUT'} {leg.strike}</span><span>{String(leg.expiry).slice(0, 10)}</span><span>{leg.current_mark == null ? '待报价' : `Mark ${leg.current_mark.toFixed(2)}`}</span></div>)}
          </article>
        ))}
      </section>
    </>
  );
}

export default function Portfolio({ authConfigured }) {
  if (!authConfigured) return <main className="portfolio-page"><h1>组合持仓</h1><p>账户服务尚未配置。</p></main>;
  return <main className="portfolio-page"><h1>组合持仓</h1><SignedOut><p>登录后记录持仓与组合 Greeks。</p><SignInButton mode="modal"><button type="button" className="primary-btn">登录</button></SignInButton></SignedOut><SignedIn><PortfolioData /></SignedIn></main>;
}
