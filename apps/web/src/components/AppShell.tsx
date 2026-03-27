import { Link, NavLink, Outlet } from 'react-router-dom';

import { useSite } from '../lib/site-context';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

export function AppShell() {
  const { text } = useSite();

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">SC</span>
          <span>
            <strong>Sloth Cloud</strong>
            <small>树懒云</small>
          </span>
        </Link>

        <nav className="nav-links">
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/">{text.nav.home}</NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/catalog">{text.nav.catalog}</NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/product/hk-c2-2c4g">{text.nav.product}</NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/services/10001">{text.nav.service}</NavLink>
        </nav>

        <div className="toolbar">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="footer">
        <p>Sloth Cloud phase-one prototype. BFF first, Paymenter behind the edge.</p>
      </footer>
    </div>
  );
}
