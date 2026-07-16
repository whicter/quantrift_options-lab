import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createBillingCheckout, createBillingPortal, getAccount } from '../lib/api';

function AccountData() {
  const { getToken } = useAuth();
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    let active = true;
    getToken().then(nextToken => { setToken(nextToken); return getAccount(nextToken); }).then(data => {
      if (active) setAccount(data);
    }).catch(() => {
      if (active) setError('账户数据暂不可用');
    });
    return () => { active = false; };
  }, [getToken]);

  if (error) return <p className="account-status error">{error}</p>;
  if (!account) return <p className="account-status">正在加载账户...</p>;
  const openBilling = async action => {
    try {
      const result = action === 'checkout' ? await createBillingCheckout(token) : await createBillingPortal(token);
      window.location.assign(result.url);
    } catch {
      setError('账单服务暂不可用');
    }
  };
  return (
    <>
      <div className="account-summary">
        <div><span>当前方案</span><strong>{account.subscription.plan === 'pro' ? 'Pro' : 'Free'}</strong></div>
        <div><span>订阅状态</span><strong>{account.subscription.status}</strong></div>
        <div><span>可用功能</span><strong>{account.entitlements.length}</strong></div>
      </div>
      <section className="account-plans">
        <div><h2>Free</h2><p>策略学习与延迟分析。</p></div>
        <div><h2>Pro</h2><p>实时分析、扫描器、提醒与组合持仓。</p>{account.subscription.plan === 'pro' ? <button type="button" onClick={() => openBilling('portal')}>管理订阅</button> : <button className="primary-btn" type="button" onClick={() => openBilling('checkout')}>升级 Pro</button>}</div>
      </section>
    </>
  );
}

export default function Account({ authConfigured }) {
  if (!authConfigured) return <main className="account-page"><h1>账户</h1><p>账户服务尚未配置。</p></main>;
  return (
    <main className="account-page">
      <h1>账户</h1>
      <SignedOut><p>登录后查看订阅与持仓。</p><SignInButton mode="modal"><button type="button" className="primary-btn">登录</button></SignInButton></SignedOut>
      <SignedIn><AccountData /></SignedIn>
    </main>
  );
}
