import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 84 84">
      <defs>
        <linearGradient id="sloth-core" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#74f4dd" />
          <stop offset="48%" stopColor="#67b8ff" />
          <stop offset="100%" stopColor="#7886ff" />
        </linearGradient>
        <radialGradient id="sloth-aura" cx="22%" cy="20%" r="85%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect fill="url(#sloth-core)" height="84" rx="26" width="84" />
      <rect fill="url(#sloth-aura)" height="84" rx="26" width="84" />

      <path
        d="M16 43c0-13.7 11.2-24.8 25-24.8 5.8 0 11.1 2 15.3 5.5 2.7-1.8 5.9-2.9 9.4-2.9 9.2 0 16.6 7.3 16.6 16.3 0 9-7.4 16.3-16.6 16.3H38.6C26 53.4 16 49 16 43Z"
        fill="#071622"
        opacity="0.92"
      />
      <path
        d="M23.6 41.1c0-9.3 7.6-16.8 16.9-16.8 4.9 0 9.3 2 12.4 5.1 3.2-3.2 7.6-5.2 12.6-5.2 8.9 0 16 7.1 16 15.8 0 8.7-7.1 15.8-16 15.8H39.2c-8.6 0-15.6-6.5-15.6-14.7Z"
        fill="none"
        opacity="0.95"
        stroke="#dffcff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <circle cx="39.4" cy="40.8" fill="#06131f" r="2.8" />
      <circle cx="51.4" cy="40.8" fill="#06131f" r="2.8" />
      <path d="M39.2 48.8c2.2 2.2 4.6 3.3 7.2 3.3 2.7 0 5.1-1.2 7.4-3.4" fill="none" stroke="#06131f" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M20.2 25.9c4.2-4.4 8.7-7 13.4-8" fill="none" opacity="0.82" stroke="#dffcff" strokeLinecap="round" strokeWidth="2.6" />
      <circle cx="64.8" cy="24.8" fill="#dffcff" opacity="0.9" r="1.7" />
    </svg>
  );
}

export function AppShell() {
  const { text } = useSite();
  const { isAuthenticated, loading, logout, user } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="brand-copy">
            <strong className="brand-name-cn">树懒云</strong>
            <small className="brand-name-en">Sloth Cloud</small>
            <span className="brand-tag">Premium Headless VPS Cloud</span>
          </span>
        </Link>

        <nav className="nav-links">
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/">
            {text.nav.home}
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/catalog">
            {text.nav.catalog}
          </NavLink>
          {isAuthenticated ? (
            <>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/checkout">
                {text.nav.checkout}
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/services">
                {text.nav.services}
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/invoices">
                {text.nav.invoices}
              </NavLink>
            </>
          ) : null}
          {!loading && !isAuthenticated ? (
            <>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/login">
                {text.nav.login}
              </NavLink>
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/register">
                {text.nav.register}
              </NavLink>
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
