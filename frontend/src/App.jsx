import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Learn from './pages/Learn';
import Analyze from './pages/Analyze';
import Scan from './pages/Scan';
import Weekly from './pages/Weekly';
import Home from './pages/Home';
import Account from './pages/Account';
import Portfolio from './pages/Portfolio';

const THEME_KEY = 'options-lab-theme';

function ResearchDisclosure() {
  return (
    <footer className="research-disclosure">
      <strong>研究与教育用途</strong>
      <span>本产品不构成投资建议或交易指令。期权可能导致全部本金损失；裸卖策略的损失可能超过初始收取的权利金。数据可能延迟、不完整或存在计算误差。</span>
    </footer>
  );
}

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App({ authConfigured = false }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <NavBar theme={theme} onThemeChange={setTheme} authConfigured={authConfigured} />
      <div key={theme}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/weekly/:symbol" element={<Weekly />} />
          <Route path="/weekly" element={<Weekly />} />
          <Route path="/account" element={<Account authConfigured={authConfigured} />} />
          <Route path="/portfolio" element={<Portfolio authConfigured={authConfigured} />} />
        </Routes>
        <ResearchDisclosure />
      </div>
    </BrowserRouter>
  );
}
