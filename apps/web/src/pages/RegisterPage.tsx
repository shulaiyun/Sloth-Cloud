import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useSite } from '../lib/site-context';

export function RegisterPage() {
  const { text } = useSite();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await register(form);
      navigate('/catalog', { replace: true });
    } catch (caughtError) {
      setError((caughtError as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <div className="stack-12">
          <span className="eyebrow">{text.nav.register}</span>
          <h1>{text.auth.registerTitle}</h1>
          <p className="muted">{text.auth.registerSubtitle}</p>
        </div>

        <form className="stack-16" onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>{text.auth.firstName}</span>
              <input
                className="text-input"
                onChange={(event) => setForm((state) => ({ ...state, firstName: event.target.value }))}
                required
                type="text"
                value={form.firstName}
              />
            </label>
            <label className="field">
              <span>{text.auth.lastName}</span>
              <input
                className="text-input"
                onChange={(event) => setForm((state) => ({ ...state, lastName: event.target.value }))}
                required
                type="text"
                value={form.lastName}
              />
            </label>
          </div>

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

          <div className="field-row">
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
            <label className="field">
              <span>{text.auth.passwordConfirmation}</span>
              <input
                className="text-input"
                onChange={(event) => setForm((state) => ({ ...state, passwordConfirmation: event.target.value }))}
                required
                type="password"
                value={form.passwordConfirmation}
              />
            </label>
          </div>

          {error ? <div className="error-card compact">{error}</div> : null}

          <button className="button primary" disabled={submitting} type="submit">
            {text.auth.submitRegister}
          </button>
        </form>

        <Link className="text-link" to="/login">
          {text.auth.alreadyHaveAccount}
        </Link>
      </article>
    </section>
  );
}
