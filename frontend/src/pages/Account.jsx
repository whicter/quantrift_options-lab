import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createBillingCheckout, createBillingPortal, getAccount } from '../lib/api';

const SUBSCRIPTION_STATUS = {
  active: '有效', trialing: '试用中', past_due: '付款逾期', unpaid: '未付款',
  canceled: '已取消', incomplete: '待完成', incomplete_expired: '已失效', none: '未订阅',
};

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
        <div><span>订阅状态</span><strong>{SUBSCRIPTION_STATUS[account.subscription.status] || '状态未知'}</strong></div>
        <div><span>已启用功能</span><strong>{account.entitlements.length} 项</strong></div>
      </div>
      <section className="account-plans">
        <div><h2>Free</h2><p>策略学习；分析数据可能延迟。具体数据时效与使用限制见方案详情。</p></div>
        <div><h2>Pro</h2><p>更高频的数据快照、扫描器、条件提醒与持仓记录。数据频率和覆盖范围因来源而异。</p>{account.subscription.plan === 'pro' ? <button type="button" onClick={() => openBilling('portal')}>管理订阅</button> : <button className="primary-btn" type="button" onClick={() => openBilling('checkout')}>升级 Pro</button>}</div>
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
