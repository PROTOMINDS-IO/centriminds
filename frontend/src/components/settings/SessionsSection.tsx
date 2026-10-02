import { useSignOutEverywhere } from '../../hooks/queries';
import { useI18n } from '../../i18n';
import FormError from '../FormError';
import { SignOutIcon } from '../ui/icons';
import SettingsSection from './SettingsSection';

/** Settings card to sign out everywhere, for a device that was lost or
 *  shared. It ends every session of the account, this one included: the
 *  server keeps no list of sessions to end one at a time
 *  (backend/app/auth.py). */
export default function SessionsSection() {
  const { t } = useI18n();
  const signOut = useSignOutEverywhere();
  return (
    <SettingsSection
      icon={<SignOutIcon size={16} />}
      title={t('app.settings.sessions.title')}
      description={t('app.settings.sessions.description')}
    >
      <div className="space-y-4">
        <FormError error={signOut.error} />
        <button
          type="button"
          className="btn btn-outline"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {signOut.isPending
            ? t('app.settings.sessions.submitting')
            : t('app.settings.sessions.submit')}
        </button>
      </div>
    </SettingsSection>
  );
}
