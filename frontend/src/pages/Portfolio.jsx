import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useState } from 'react';
import { closePosition, createPosition, getPortfolio } from '../lib/api';
import { blankLeg, buildPositionPayload, money } from '../lib/portfolio';

const initialDraft = () => ({ symbol: '', strategy_name: '', quantity: 1, notes: '', legs: [blankLeg()] });

function Summary({ summary }) {
  const items = [
    ['估算未实现 P/L', summary.pricing_complete ? money(summary.pnl) : '待报价'], ['估算组合 Delta', summary.pricing_complete ? Number(summary.delta).toFixed(2) : '待报价'],
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
        <label>策略组合数量<input type="number" min="1" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label>
      </div>
      <div className="portfolio-legs">
        {draft.legs.map((leg, index) => (
          <div className="portfolio-leg" key={index}>
            <select value={leg.side} onChange={event => updateLeg(index, 'side', event.target.value)}><option value="long">Long</option><option value="short">Short</option></select>
            <select value={leg.option_right} onChange={event => updateLeg(index, 'option_right', event.target.value)}><option value="C">Call</option><option value="P">Put</option></select>
            <input type="date" aria-label="到期日" value={leg.expiry} onChange={event => updateLeg(index, 'expiry', event.target.value)} />
            <input type="number" min="0" step="0.01" aria-label="执行价" placeholder="Strike" value={leg.strike} onChange={event => updateLeg(index, 'strike', event.target.value)} />
            <input type="number" min="0" step="0.01" aria-label="开仓价（每股期权报价）" placeholder="开仓价（每股）" value={leg.entry_price} onChange={event => updateLeg(index, 'entry_price', event.target.value)} />
            <button type="button" aria-label="删除腿" disabled={draft.legs.length === 1} onClick={() => setDraft(current => ({ ...current, legs: current.legs.filter((_, i) => i !== index) }))}>删除</button>
          </div>
        ))}
      </div>
      <label>备注<input value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="portfolio-submit"><button className="primary-btn" type="submit">保存持仓记录</button><span>仅保存手工记录，不会同步券商。策略组合数量会应用到每条腿的合约数。{message}</span></div>
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
  useEffect(() => {
    let active = true;
    getToken()
      .then(async nextToken => ({ nextToken, nextData: await getPortfolio(nextToken) }))
      .then(({ nextToken, nextData }) => {
        if (!active) return;
        setToken(nextToken);
        setData(nextData);
        setError('');
      })
      .catch(() => { if (active) setError('持仓数据暂不可用'); });
    return () => { active = false; };
  }, [getToken]);
  const close = async id => {
    if (!window.confirm('这只会在 Quantrift 中标记该记录为已平仓，不会向券商发送订单。')) return;
    await closePosition(token, id);
    await load();
  };
  if (error) return <p className="account-status error">{error}</p>;
  if (!data) return <p className="account-status">正在加载持仓...</p>;
  return (
    <>
      <Summary summary={data.summary} />
      <p className="account-status">估算未实现 P/L 与 Greeks 基于最新可用 mark、合约乘数和数量；不含手续费、滑点和税费，报价缺失时不可用。</p>
      <PositionForm token={token} onCreated={load} />
      <section className="portfolio-list">
        <h2>持仓明细</h2>
        {!data.positions.length ? <p className="account-status">暂无持仓</p> : data.positions.map(position => (
          <article className="portfolio-position" key={position.id}>
            <div className="portfolio-position-head">
              <div><strong>{position.symbol}</strong><span>{position.strategy_name}</span></div>
              <div><strong>{position.priced_legs === position.legs.length ? money(position.pnl) : '待报价'}</strong>{position.status === 'open' ? <button type="button" onClick={() => close(position.id)}>标记为已平仓</button> : <span>已标记为平仓</span>}</div>
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
  return <main className="portfolio-page"><h1>组合持仓</h1><SignedOut><p>登录后记录持仓与估算组合 Greeks。</p><SignInButton mode="modal"><button type="button" className="primary-btn">登录</button></SignInButton></SignedOut><SignedIn><PortfolioData /></SignedIn></main>;
}
