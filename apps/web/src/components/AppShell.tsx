import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { requestJson } from '../lib/api';
import { brand } from '../lib/brand';
import { resolveThemeDomain, useSite } from '../lib/site-context';
import { getUiText } from '../lib/ui-text';
import { BrandLogo } from './BrandLogo';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { AssistantWidget } from './AssistantWidget';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, text, setThemeDomain, themeDomain } = useSite();
  const { isAuthenticated, loading, logout, user } = useAuth();
  const ui = getUiText(locale);
  const operatorNavLabel = locale.startsWith('zh') ? 'AI 工作台' : 'AI Workspace';
  const currentThemeDomain = resolveThemeDomain(location.pathname);
  const hideAssistantWidget = /^\/(?:operator|workspaces\/|capsules\/)/.test(location.pathname);

  useEffect(() => {
    setThemeDomain(currentThemeDomain);
  }, [currentThemeDomain, setThemeDomain]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const referralCode = searchParams.get('ref')?.trim();
    if (!referralCode) {
      return;
    }

    void requestJson('/api/v1/affiliate/track', {
      method: 'POST',
      body: {
        code: referralCode,
      },
    }).catch(() => undefined);

    searchParams.delete('ref');
    const nextSearch = searchParams.toString();
    navigate({
      pathname: location.pathname,
      search: nextSearch ? `?${nextSearch}` : '',
      hash: location.hash,
    }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <div className={`shell shell--${themeDomain}`}>
      <header className={`topbar topbar--${currentThemeDomain}`}>
        <Link className="brand" aria-label={brand.ariaLabel} to="/">
          <span style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrandLogo />
          </span>
          <span className="brand-copy">
            <strong className="brand-name-cn">{brand.nameCn}</strong>
            <small className="brand-name-en">{brand.nameEn}</small>
            <span className="brand-tag">{ui.home.heroEyebrow}</span>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/">
            {text.nav.home}
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/operator">
            {operatorNavLabel}
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
              <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/affiliate">
                {text.nav.affiliate}
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

      <main className={`page page--${currentThemeDomain}`}>
        <Outlet />
      </main>

      <footer className="footer">
        <p>{text.footer.statement}</p>
      </footer>
      {!hideAssistantWidget ? <AssistantWidget /> : null}
    </div>
  );
}
