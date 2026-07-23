import { useState } from 'react';
import { createAlertSubscription, deleteAlertSubscription, getVapidPublicKey } from '../lib/api';

const TOKEN_KEY = 'quantrift-scanner-alert-token';

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

export default function ScannerAlerts({ minIvr, gammaRegime, unusualOnly }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [status, setStatus] = useState('');
  const rules = { min_iv_rank: minIvr, gamma_regime: gammaRegime === 'all' ? null : gammaRegime, unusual_only: unusualOnly };

  function saveToken(result) {
    localStorage.setItem(TOKEN_KEY, result.unsubscribe_token);
    setToken(result.unsubscribe_token);
    setStatus('提醒已保存');
  }

  async function subscribeEmail() {
    setStatus('');
    try {
      saveToken(await createAlertSubscription({ channel: 'email', destination: { email }, rules, consent: true }));
    } catch { setStatus('Email 格式或服务暂不可用'); }
  }

  async function subscribePush() {
    setStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('unsupported');
      const { public_key: publicKey } = await getVapidPublicKey();
      if (!publicKey) throw new Error('not configured');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      saveToken(await createAlertSubscription({ channel: 'web_push', destination: subscription.toJSON(), rules, consent: true }));
    } catch { setStatus('浏览器 Push 尚未配置或未获授权'); }
  }

  async function removeSubscription() {
    try {
      await deleteAlertSubscription(token);
      localStorage.removeItem(TOKEN_KEY);
      setToken('');
      setStatus('提醒已取消');
    } catch { setStatus('取消失败，请稍后重试'); }
  }

  return (
    <details className="scan-alerts">
      <summary>扫描命中提醒</summary>
      <div className="scan-alert-row">
        <span>当前条件：IV Rank ≥ {minIvr}{gammaRegime !== 'all' ? ` · ${gammaRegime} Gamma` : ''}{unusualOnly ? ' · 仅异动' : ''}</span>
        {!token && <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" />}
        {!token && <button type="button" onClick={subscribeEmail} disabled={!email}>Email 提醒</button>}
        {!token && <button type="button" onClick={subscribePush}>浏览器 Push</button>}
        {token && <button type="button" onClick={removeSubscription}>取消提醒</button>}
      </div>
      <div className="scan-filter-help">提醒可能延迟或遗漏，仅提示已保存条件命中，不应作为下单依据。</div>
      {status && <div className="scan-filter-help">{status}</div>}
    </details>
  );
}
