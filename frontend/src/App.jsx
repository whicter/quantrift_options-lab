import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Learn from './pages/Learn';
import Analyze from './pages/Analyze';
import Scan from './pages/Scan';
import Weekly from './pages/Weekly';
import Home from './pages/Home';
import Account from './pages/Account';

const THEME_KEY = 'options-lab-theme';

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
        </Routes>
      </div>
    </BrowserRouter>
  );
}
