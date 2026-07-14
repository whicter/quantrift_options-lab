import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Learn from './pages/Learn';
import Analyze from './pages/Analyze';
import Scan from './pages/Scan';
import Weekly from './pages/Weekly';

const THEME_KEY = 'options-lab-theme';

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <NavBar theme={theme} onThemeChange={setTheme} />
      <div key={theme}>
        <Routes>
          <Route path="/" element={<Navigate to="/learn" replace />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/weekly/:symbol" element={<Weekly />} />
          <Route path="/weekly" element={<Weekly />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
