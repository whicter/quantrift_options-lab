import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { getAccount } from '../lib/api';

function AccountData() {
  const { getToken } = useAuth();
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getToken().then(token => getAccount(token)).then(data => {
      if (active) setAccount(data);
    }).catch(() => {
      if (active) setError('账户数据暂不可用');
    });
    return () => { active = false; };
  }, [getToken]);

  if (error) return <p className="account-status error">{error}</p>;
  if (!account) return <p className="account-status">正在加载账户...</p>;
  return (
    <div className="account-summary">
      <div><span>当前方案</span><strong>{account.subscription.plan === 'pro' ? 'Pro' : 'Free'}</strong></div>
      <div><span>订阅状态</span><strong>{account.subscription.status}</strong></div>
      <div><span>可用功能</span><strong>{account.entitlements.length}</strong></div>
    </div>
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
