// Sign-in page (/login). Signing in returns the user to the page RequireAuth
// sent them from, else the project list; a signed-in visitor goes straight to
// the project list.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { api } from '../api/client';
import { startSession } from '../components/auth/session';
import AuthShell from '../components/AuthShell';
import FormError from '../components/FormError';
import { useAuthConfig } from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';
import { useAuthStore } from '../store/authStore';

const LINK = 'text-accent-300 hover:text-accent-200';

export default function Login() {
  const { t } = useI18n();
  usePageTitle(t('app.auth.signIn.title'));
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const authConfig = useAuthConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (token) {
    return <Navigate to="/" replace />;
  }

  const redirectTo =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      startSession(await api.login({ email, password }));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={t('app.auth.signIn.title')}
      subtitle={t('app.auth.signIn.subtitle')}
      footer={
        authConfig.data?.allow_registration ? (
          <>
            {t('app.auth.signIn.noAccount')}{' '}
            <Link to="/register" className={LINK}>
              {t('app.auth.signIn.createOne')}
            </Link>
          </>
        ) : (
          <>
            {t('app.auth.signIn.needAccess')}{' '}
            <a href="mailto:info@protominds.io" className={LINK}>
              {t('app.auth.signIn.contact')}
            </a>
          </>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            {t('app.auth.email')}
          </label>
          <input
            id="email"
            required
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('app.auth.emailPlaceholder')}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t('app.auth.password')}
          </label>
          <input
            id="password"
            required
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <FormError error={error} />

        <button
          type="submit"
          className="btn btn-primary w-full py-2.5"
          disabled={submitting || !email || !password}
        >
          {submitting ? t('app.auth.signIn.submitting') : t('app.auth.signIn.submit')}
        </button>
      </form>
    </AuthShell>
  );
}
