// One machine profile (/machines/:id): its editor, or a note when the
// profile does not exist (deleted, or another account's).
import { Link, useParams } from 'react-router';

import BackLink from '../components/BackLink';
import BuiltBy from '../components/brand/BuiltBy';
import FormError from '../components/FormError';
import ProfileEditor from '../components/machines/ProfileEditor';
import PageScroll from '../components/PageScroll';
import { Loading } from '../components/ui/controls';
import { useProfiles } from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';

export default function MachineProfile() {
  const { t } = useI18n();
  const { id } = useParams();
  const profiles = useProfiles();
  const profile = profiles.data?.find((p) => p.id === Number(id));
  usePageTitle(profile?.name ?? t('app.machines.title'));

  return (
    <PageScroll>
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pt-6 pb-6 sm:px-6 sm:pb-10">
        <BackLink to="/machines" label={t('app.machines.title')} className="mb-1 self-start" />
        {profiles.isLoading && <Loading />}
        <FormError error={profiles.error} />
        {profiles.data && !profile && (
          <div className="card-glass mx-auto mt-8 max-w-sm space-y-3 text-center">
            <h1 className="text-lg font-semibold text-ink-50">{t('app.profile.notFoundTitle')}</h1>
            <p className="text-sm text-ink-300">{t('app.profile.notFoundText')}</p>
            <Link to="/machines" className="btn btn-primary inline-flex">
              {t('app.machines.title')}
            </Link>
          </div>
        )}
        {/* Keyed by the saved version: saving or switching profiles starts a fresh draft. */}
        {profile && <ProfileEditor key={`${profile.id}:${profile.updated_at}`} profile={profile} />}
        <BuiltBy className="mt-auto justify-center pt-10" />
      </div>
    </PageScroll>
  );
}
