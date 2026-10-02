// How the measurement is looked at: 3D or top view, the spectrum at one
// speed, idle auto-rotate, reset, and saving the view as an image. An icon toolbar on the view card, a
// labelled list in the phone sheet; both drive the same state.
import { useI18n } from '../../i18n';
import { useAutoRotate, useSettingsStore } from '../../store/settingsStore';
import { type ViewMode, useUIStore } from '../../store/uiStore';
import { ChromeButton, IconButton, Segmented, Toggle, ToolbarDivider } from '../ui/controls';
import { AutoRotateIcon, DownloadIcon, ResetViewIcon, SpectrumIcon } from '../ui/icons';

/** State and actions shared by the toolbar and the phone list. */
function useViewControls() {
  const { t } = useI18n();
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const showSlice = useUIStore((s) => s.showSlice);
  const toggleSlice = useUIStore((s) => s.toggleSlice);
  const resetCamera = useUIStore((s) => s.resetCamera);
  const saveImage = useUIStore((s) => s.requestExport);
  const autoRotate = useAutoRotate();
  const updateSettings = useSettingsStore((s) => s.update);
  const modes: { value: ViewMode; label: string; title: string }[] = [
    {
      value: '3d',
      label: t('workspace.view.perspective'),
      title: t('workspace.view.perspectiveTitle'),
    },
    { value: 'top', label: t('workspace.view.top'), title: t('workspace.view.topTitle') },
  ];
  return {
    t,
    modes,
    viewMode,
    setViewMode,
    showSlice,
    toggleSlice,
    resetCamera,
    saveImage,
    autoRotate,
    // Saved to the account like the Settings page's switch.
    toggleAutoRotate: () => updateSettings({ auto_rotate: !autoRotate }),
  };
}

/** The view card's toolbar: [3D | Top] · spectrum · auto-rotate · reset · image. */
export function ViewToolbar() {
  const c = useViewControls();
  return (
    <>
      <Segmented
        label={c.t('workspace.view.title')}
        value={c.viewMode}
        onChange={c.setViewMode}
        options={c.modes}
      />
      <ToolbarDivider />
      <IconButton title={c.t('workspace.view.slice')} active={c.showSlice} onClick={c.toggleSlice}>
        <SpectrumIcon />
      </IconButton>
      <IconButton
        title={c.t('workspace.view.autoRotate')}
        tooltip={c.t(c.autoRotate ? 'workspace.view.autoRotateOn' : 'workspace.view.autoRotateOff')}
        active={c.autoRotate}
        onClick={c.toggleAutoRotate}
      >
        <AutoRotateIcon />
      </IconButton>
      <IconButton title={c.t('workspace.view.reset')} onClick={c.resetCamera}>
        <ResetViewIcon />
      </IconButton>
      <IconButton title={c.t('workspace.view.saveImage')} onClick={c.saveImage}>
        <DownloadIcon />
      </IconButton>
    </>
  );
}

/** The same controls with their names, for the phone sheet (no tooltips on touch). */
export function ViewControlList() {
  const c = useViewControls();
  return (
    <div className="space-y-2 text-xs">
      <Segmented
        label={c.t('workspace.view.title')}
        value={c.viewMode}
        onChange={c.setViewMode}
        options={c.modes}
      />
      <Toggle label={c.t('workspace.view.slice')} on={c.showSlice} onToggle={c.toggleSlice} />
      <Toggle
        label={c.t('workspace.view.autoRotate')}
        on={c.autoRotate}
        onToggle={c.toggleAutoRotate}
      />
      <div className="-ml-2.5 flex flex-wrap gap-1">
        <ChromeButton onClick={c.resetCamera}>
          <ResetViewIcon />
          {c.t('workspace.view.reset')}
        </ChromeButton>
        <ChromeButton onClick={c.saveImage}>
          <DownloadIcon />
          {c.t('workspace.view.saveImage')}
        </ChromeButton>
      </div>
    </div>
  );
}
