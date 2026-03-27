import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

export function AppShell() {
  const { text } = useSite();
  const { isAuthenticated, loading, logout, user } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            懒
          </span>
          <span>
            <strong>树懒云</strong>
            <small>Sloth Cloud</small>
          </span>
        </Link>

        <nav className="nav-links">
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/">{text.nav.home}</NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/catalog">{text.nav.catalog}</NavLink>
          {isAuthenticated ? (
            <>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/checkout">{text.nav.checkout}</NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/services">{text.nav.services}</NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/invoices">{text.nav.invoices}</NavLink>
            </>
          ) : null}
          {!loading && !isAuthenticated ? (
            <>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/login">{text.nav.login}</NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/register">{text.nav.register}</NavLink>
            </>
          ) : null}
        </nav>

        <div className="toolbar">
          {isAuthenticated && user ? (
            <div className="user-pill">
              <span>{text.common.hello}</span>
              <strong>{user.firstName || user.name}</strong>
              <button className="toolbar-link" onClick={() => void logout()} type="button">
                {text.nav.logout}
              </button>
            </div>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="footer">
        <p>{text.footer.statement}</p>
      </footer>
    </div>
  );
}
