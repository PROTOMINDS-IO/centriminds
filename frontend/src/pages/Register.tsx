// Sign-up page (/register). The password rules are checked here first, so
// the message is in the user's language; when the server has sign-up closed
// (ALLOW_REGISTRATION=false), the page says whom to ask instead.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';

import { api } from '../api/client';
import {
  PASSWORD_MIN,
  checkNewPassword,
  passwordProblemText,
  type PasswordProblem,
} from '../components/auth/passwordRules';
import { startSession } from '../components/auth/session';
import AuthShell from '../components/AuthShell';
import FormError from '../components/FormError';
import { RichText } from '../components/ui/RichText';
import { useAuthConfig } from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';
import { useAuthStore } from '../store/authStore';

const LINK = 'text-accent-300 hover:text-accent-200';
const CONTACT = 'info@protominds.io';

export default function Register() {
  const { t } = useI18n();
  usePageTitle(t('app.auth.signUp.title'));
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const authConfig = useAuthConfig();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<PasswordProblem | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (token) return <Navigate to="/" replace />;

  const closed = authConfig.data?.allow_registration === false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const found = checkNewPassword(password, confirm);
    setProblem(found);
    if (found) return;
    setSubmitting(true);
    try {
      startSession(await api.register({ email, name, password }), { newAccount: true });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const problemText = problem ? passwordProblemText(problem, t) : null;

  return (
    <AuthShell
      title={t('app.auth.signUp.title')}
      subtitle={closed ? t('app.auth.signUp.closedSubtitle') : t('app.auth.signUp.subtitle')}
      footer={
        <>
          {t('app.auth.signUp.haveAccount')}{' '}
          <Link to="/login" className={LINK}>
            {t('app.auth.signUp.signIn')}
          </Link>
        </>
      }
    >
      {closed ? (
        <p className="text-sm leading-relaxed text-ink-200">
          <RichText
            text={t('app.auth.signUp.closedBody')}
            parts={{
              email: (
                <a href={`mailto:${CONTACT}`} className={LINK}>
                  {CONTACT}
                </a>
              ),
            }}
          />
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              {t('app.auth.name')}
            </label>
            <input
              id="name"
              autoComplete="name"
              maxLength={100}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              {t('app.auth.email')}
            </label>
            <input
              id="email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
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
              autoComplete="new-password"
              className="input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setProblem(null);
              }}
              placeholder={t('app.password.hint', { min: PASSWORD_MIN })}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t('app.auth.confirmPassword')}
            </label>
            <input
              id="confirm"
              required
              type="password"
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setProblem(null);
              }}
            />
          </div>

          <FormError error={problemText ?? error} />

          <button
            type="submit"
            className="btn btn-primary w-full py-2.5"
            disabled={submitting || !email || !password || !confirm}
          >
            {submitting ? t('app.auth.signUp.submitting') : t('app.auth.signUp.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
