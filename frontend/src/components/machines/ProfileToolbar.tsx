// The profile editor's sticky header: the profile's name and whether it is
// saved, and its actions (export, duplicate, delete, revert, save).
import type { MachineProfileData, MachineProfileRead } from '../../api/types';
import { useI18n } from '../../i18n';
import { CopyIcon, DownloadIcon, TrashIcon } from '../ui/icons';
import { IconAction } from './parts';
import { downloadProfile } from './profileFile';

export default function ProfileToolbar({
  profile,
  draft,
  dirty,
  saving,
  onDuplicate,
  onDelete,
  onRevert,
  onSave,
}: {
  profile: MachineProfileRead;
  draft: MachineProfileData;
  dirty: boolean;
  saving: boolean;
  onDuplicate: () => void;
  /** Called once the user has confirmed. */
  onDelete: () => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const readOnly = profile.builtin;
  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-edge/10 bg-ink-950/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-ink-50">{draft.name || '–'}</h1>
        <p className="text-xs text-ink-300">
          {readOnly
            ? t('app.profile.builtinNote')
            : dirty
              ? t('app.profile.unsaved')
              : t('app.profile.saved')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IconAction label={t('app.profile.export')} onClick={() => downloadProfile(draft)}>
          <DownloadIcon size={15} />
        </IconAction>
        <IconAction label={t('app.profile.duplicate')} onClick={onDuplicate}>
          <CopyIcon size={15} />
        </IconAction>
        {!readOnly && (
          <>
            <IconAction
              danger
              label={t('app.profile.delete')}
              onClick={() => {
                const message =
                  profile.project_count > 0
                    ? t('app.machines.deleteConfirmUsed', {
                        name: profile.name,
                        count: profile.project_count,
                      })
                    : t('app.machines.deleteConfirm', { name: profile.name });
                if (confirm(message)) onDelete();
              }}
            >
              <TrashIcon size={15} />
            </IconAction>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!dirty || saving}
              onClick={onRevert}
            >
              {t('app.profile.revert')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || saving}
              onClick={onSave}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
