import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';

export function LoginPage() {
  const { text } = useSite();
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const next = new URLSearchParams(location.search).get('next') ?? '/catalog';
  const [requiresCode, setRequiresCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    code: '',
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login({
        email: form.email,
        password: form.password,
        ...(requiresCode && form.code ? { code: form.code } : {}),
      });
      navigate(next, { replace: true });
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      const payload = typeof apiError.payload === 'object' && apiError.payload !== null
        ? apiError.payload as Record<string, unknown>
        : null;

      if (apiError.statusCode === 409 && payload?.code === 'tfa_required') {
        setRequiresCode(true);
        setError(text.auth.tfaHint);
      } else {
        setError(apiError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <div className="stack-12">
          <span className="eyebrow">{text.nav.login}</span>
          <h1>{text.auth.loginTitle}</h1>
          <p className="muted">{text.auth.loginSubtitle}</p>
        </div>

        <form className="stack-16" onSubmit={handleSubmit}>
          <label className="field">
            <span>{text.auth.email}</span>
            <input
              className="text-input"
              onChange={(event) => setForm((state) => ({ ...state, email: event.target.value }))}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="field">
            <span>{text.auth.password}</span>
            <input
              className="text-input"
              onChange={(event) => setForm((state) => ({ ...state, password: event.target.value }))}
              required
              type="password"
              value={form.password}
            />
          </label>

          {requiresCode ? (
            <label className="field">
              <span>{text.auth.code}</span>
              <input
                className="text-input"
                onChange={(event) => setForm((state) => ({ ...state, code: event.target.value }))}
                required
                type="text"
                value={form.code}
              />
            </label>
          ) : null}

          {error ? <div className="error-card compact">{error}</div> : null}

          <button className="button primary" disabled={submitting} type="submit">
            {text.auth.submitLogin}
          </button>
        </form>

        <Link className="text-link" to="/register">
          {text.auth.needAccount}
        </Link>
      </article>
    </section>
  );
}
