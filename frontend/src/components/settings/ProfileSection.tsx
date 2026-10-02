import type { FormEvent } from 'react';

import { useUpdateMe } from '../../hooks/queries';
import { useSyncedDraft } from '../../hooks/useSyncedDraft';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import FormError from '../FormError';
import { CheckIcon, UserIcon } from '../ui/icons';
import SettingsSection from './SettingsSection';

/** Longest name the backend accepts (UserUpdate in backend/app/schemas.py). */
const NAME_MAX = 100;

/** Settings card for the account's name, saved with its own button, and its
 *  email address, which is shown but cannot be changed. */
export default function ProfileSection() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const save = useUpdateMe();
  const saved = user?.name ?? '';
  // Follows the account's name when it changes (after saving, or another tab).
  const [name, setName] = useSyncedDraft(saved);
  const next = name.trim();
  const dirty = next !== saved;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (dirty && !save.isPending) save.mutate({ name: next });
  }

  return (
    <SettingsSection
      icon={<UserIcon size={16} />}
      title={t('app.settings.profile.title')}
      description={t('app.settings.profile.description')}
    >
      <div className="space-y-4">
        <form onSubmit={submit}>
          <label className="label" htmlFor="settings-name">
            {t('app.settings.profile.name')}
          </label>
          <div className="flex gap-2">
            <input
              id="settings-name"
              className="input min-w-0"
              autoComplete="name"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (save.error) save.reset();
              }}
            />
            <button
              type="submit"
              className="btn btn-primary shrink-0"
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
          <p
            role="status"
            className="mt-1.5 flex min-h-4 items-center gap-1.5 text-xs text-ink-300"
          >
            {save.isSuccess && !dirty && (
              <>
                <CheckIcon size={12} strokeWidth={2.5} className="text-accent-300" />
                {t('common.saved')}
              </>
            )}
          </p>
          <FormError error={save.error} />
        </form>

        <div>
          <label className="label" htmlFor="settings-email">
            {t('app.settings.profile.email')}
          </label>
          <input
            id="settings-email"
            type="email"
            className="input text-ink-300"
            value={user?.email ?? ''}
            readOnly
            aria-describedby="settings-email-hint"
          />
          <p id="settings-email-hint" className="mt-1 text-xs text-ink-300">
            {t('app.settings.profile.emailHint')}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
