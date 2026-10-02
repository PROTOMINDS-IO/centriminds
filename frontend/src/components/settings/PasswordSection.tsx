import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useChangePassword } from '../../hooks/queries';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import {
  PASSWORD_MIN,
  checkNewPassword,
  passwordProblemText,
  type PasswordProblem,
} from '../auth/passwordRules';
import FormError from '../FormError';
import { CheckIcon, KeyIcon } from '../ui/icons';
import SettingsSection from './SettingsSection';

/** Settings card to change the password. The new one is checked here first
 *  (auth/passwordRules.ts), so the message is in the user's language; a wrong
 *  current password is reported by the server. A change signs the account out
 *  on every other device, while this one carries on (useChangePassword). */
export default function PasswordSection() {
  const { t } = useI18n();
  const email = useAuthStore((s) => s.user?.email ?? '');
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<PasswordProblem | null>(null);
  const [changed, setChanged] = useState(false);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  /** Typing again clears the last outcome. */
  function edit(set: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      set(e.target.value);
      setProblem(null);
      setChanged(false);
      if (change.error) change.reset();
    };
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (change.isPending) return;
    const found = checkNewPassword(next, confirm);
    setProblem(found);
    if (found) {
      (found === 'mismatch' ? confirmRef : nextRef).current?.focus();
      return;
    }
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          setChanged(true);
        },
      },
    );
  }

  const nextProblem = problem === 'tooShort' || problem === 'tooLong';
  const problemText = problem ? passwordProblemText(problem, t) : null;

  return (
    <SettingsSection
      icon={<KeyIcon size={16} />}
      title={t('app.settings.security.title')}
      description={t('app.settings.security.description')}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* For password managers: whose password this is. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <label className="label" htmlFor="password-current">
            {t('app.settings.security.current')}
          </label>
          <input
            id="password-current"
            type="password"
            autoComplete="current-password"
            className="input"
            value={current}
            onChange={edit(setCurrent)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password-new">
            {t('app.settings.security.new')}
          </label>
          <input
            ref={nextRef}
            id="password-new"
            type="password"
            autoComplete="new-password"
            className="input"
            value={next}
            onChange={edit(setNext)}
            aria-invalid={nextProblem || undefined}
            aria-describedby="password-new-note"
          />
          <p
            id="password-new-note"
            className={`mt-1 text-xs ${nextProblem ? 'text-danger-text' : 'text-ink-300'}`}
          >
            {nextProblem ? problemText : t('app.password.hint', { min: PASSWORD_MIN })}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="password-confirm">
            {t('app.settings.security.confirm')}
          </label>
          <input
            ref={confirmRef}
            id="password-confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            value={confirm}
            onChange={edit(setConfirm)}
            aria-invalid={problem === 'mismatch' || undefined}
            aria-describedby={problem === 'mismatch' ? 'password-confirm-note' : undefined}
          />
          {problem === 'mismatch' && (
            <p id="password-confirm-note" className="mt-1 text-xs text-danger-text">
              {problemText}
            </p>
          )}
        </div>

        <FormError error={change.error} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!current || !next || !confirm || change.isPending}
          >
            {change.isPending
              ? t('app.settings.security.submitting')
              : t('app.settings.security.submit')}
          </button>
          <p role="status" className="flex items-center gap-1.5 text-sm text-ink-200">
            {changed && (
              <>
                <CheckIcon size={14} strokeWidth={2.5} className="text-accent-300" />
                {t('app.settings.security.changed')}
              </>
            )}
          </p>
        </div>
      </form>
    </SettingsSection>
  );
}
