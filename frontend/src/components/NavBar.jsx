import { NavLink } from 'react-router-dom';

export default function NavBar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">Options Lab</div>
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
      </div>
    </nav>
  );
}
