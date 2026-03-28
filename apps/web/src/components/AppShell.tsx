import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="sloth-cloud-logo" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#79f5dd" />
          <stop offset="52%" stopColor="#70c2ff" />
          <stop offset="100%" stopColor="#6a7cff" />
        </linearGradient>
        <radialGradient id="sloth-cloud-glow" cx="50%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect fill="url(#sloth-cloud-logo)" height="64" rx="20" width="64" />
      <rect fill="url(#sloth-cloud-glow)" height="64" rx="20" width="64" />
      <path
        d="M16.5 35.2c0-8.2 6.5-14.9 14.8-14.9 3.7 0 7.1 1.3 9.8 3.5a11.9 11.9 0 0 1 6.6-2c6.4 0 11.6 5.1 11.6 11.4 0 6.3-5.2 11.4-11.6 11.4H29.7c-7.3 0-13.2-5.5-13.2-12.4Z"
        fill="#071622"
        opacity="0.92"
      />
      <path
        d="M22 33.8c0-5.5 4.4-10 9.9-10 2.8 0 5.3 1.1 7.1 2.9 1.8-1.9 4.4-3 7.3-3 5.2 0 9.4 4.2 9.4 9.3 0 5.2-4.2 9.4-9.4 9.4H31.2c-5.1 0-9.2-3.9-9.2-8.6Z"
        fill="none"
        stroke="#dffcff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        opacity="0.95"
      />
      <path
        d="M25.5 24.7c1.8-2.2 4.5-3.5 7.6-3.5 3 0 5.8 1.2 7.8 3.3"
        fill="none"
        stroke="#0b2534"
        strokeLinecap="round"
        strokeWidth="4.5"
        opacity="0.8"
      />
      <circle cx="31" cy="33.5" fill="#071622" r="2.2" />
      <circle cx="39.2" cy="33.5" fill="#071622" r="2.2" />
      <path d="M30.8 39.3c1.6 1.7 3.4 2.6 5.4 2.6 2.1 0 3.9-.9 5.5-2.7" fill="none" stroke="#071622" strokeLinecap="round" strokeWidth="2.2" />
      <path d="M15 20.4c3.1-3.2 6.3-5.1 9.8-5.8" fill="none" stroke="#dffcff" strokeLinecap="round" strokeWidth="2.2" opacity="0.8" />
      <circle cx="47.7" cy="19.6" fill="#dffcff" r="1.4" opacity="0.85" />
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
            <span className="brand-tag">Headless VPS cloud</span>
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
