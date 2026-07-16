import { Link, NavLink } from 'react-router-dom';

export default function NavBar({ theme, onThemeChange }) {
  return (
    <nav className="navbar">
      <Link className="navbar-brand" to="/">Quantrift</Link>
      <div className="navbar-links">
        <NavLink to="/learn" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          策略库
        </NavLink>
        <NavLink to="/analyze" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          策略分析
        </NavLink>
        <NavLink to="/scan" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          扫描器
        </NavLink>
        <NavLink to="/weekly" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          周复盘
        </NavLink>
      </div>
      <div className="theme-toggle" role="group" aria-label="Theme mode">
        <button
          type="button"
          className={theme === 'dark' ? 'theme-toggle-btn active' : 'theme-toggle-btn'}
          onClick={() => onThemeChange('dark')}
          aria-pressed={theme === 'dark'}
        >
          Dark
        </button>
        <button
          type="button"
          className={theme === 'light' ? 'theme-toggle-btn active' : 'theme-toggle-btn'}
          onClick={() => onThemeChange('light')}
          aria-pressed={theme === 'light'}
        >
          Light
        </button>
      </div>
    </nav>
  );
}
