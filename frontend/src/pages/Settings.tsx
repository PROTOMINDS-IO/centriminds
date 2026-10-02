// The user's settings. Appearance, language and the 3D-view defaults apply
// the moment they are chosen and are saved to the account in the background
// (settingsStore.update); name and password are saved with their own button,
// and the Sessions card signs out everywhere.
import BackLink from '../components/BackLink';
import ColormapPicker from '../components/ColormapPicker';
import BuiltBy from '../components/brand/BuiltBy';
import { LANGUAGE_NAMES } from '../components/languages';
import PageScroll from '../components/PageScroll';
import PasswordSection from '../components/settings/PasswordSection';
import ProfileSection from '../components/settings/ProfileSection';
import SessionsSection from '../components/settings/SessionsSection';
import SettingsSection, { SettingRow } from '../components/settings/SettingsSection';
import ThemePreview from '../components/settings/ThemePreview';
import ChoiceCards from '../components/ui/ChoiceCards';
import { Segmented, Toggle } from '../components/ui/controls';
import {
  CheckIcon,
  CubeIcon,
  GlobeIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from '../components/ui/icons';
import { usePageTitle } from '../hooks/usePageTitle';
import { LOCALES, resolveLocale, useI18n } from '../i18n';
import {
  useAutoRotate,
  useSettingsStore,
  type LanguageSetting,
  type ThemeSetting,
} from '../store/settingsStore';

function AppearanceSection() {
  const { t } = useI18n();
  const theme = useSettingsStore((s) => s.theme);
  const update = useSettingsStore((s) => s.update);
  const icons = { dark: <MoonIcon />, light: <SunIcon />, system: <MonitorIcon /> };
  const themes: ThemeSetting[] = ['dark', 'light', 'system'];
  return (
    <SettingsSection
      icon={<SunIcon size={16} />}
      title={t('app.settings.appearance.title')}
      description={t('app.settings.appearance.description')}
    >
      <ChoiceCards
        label={t('app.settings.appearance.title')}
        value={theme}
        onChange={(v) => update({ theme: v })}
        className="grid-cols-3 gap-2 sm:gap-3"
        options={themes.map((value) => ({
          value,
          label: t(`app.settings.appearance.${value}`),
          icon: icons[value],
          hint: value === 'system' ? t('app.settings.appearance.systemHint') : undefined,
          preview: <ThemePreview theme={value} />,
        }))}
      />
    </SettingsSection>
  );
}

function LanguageSection() {
  const { t } = useI18n();
  const language = useSettingsStore((s) => s.language);
  const update = useSettingsStore((s) => s.update);
  const browser = LANGUAGE_NAMES[resolveLocale('auto')];
  return (
    <SettingsSection
      icon={<GlobeIcon size={16} />}
      title={t('app.settings.language.title')}
      description={t('app.settings.language.description')}
    >
      <ChoiceCards<LanguageSetting>
        label={t('app.settings.language.title')}
        value={language}
        onChange={(v) => update({ language: v })}
        className="grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3"
        options={[
          {
            value: 'auto',
            label: t('app.settings.language.auto', { language: browser }),
            hint: t('app.settings.language.autoHint'),
          },
          ...LOCALES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code], lang: code })),
        ]}
      />
    </SettingsSection>
  );
}

function ViewSection() {
  const { t } = useI18n();
  const autoRotate = useAutoRotate();
  const defaultView = useSettingsStore((s) => s.default_view);
  const defaultScale = useSettingsStore((s) => s.default_scale);
  const spread = useSettingsStore((s) => s.colour_spread);
  const update = useSettingsStore((s) => s.update);
  return (
    <SettingsSection
      icon={<CubeIcon size={16} />}
      title={t('app.settings.view.title')}
      description={t('app.settings.view.description')}
    >
      <div className="divide-y divide-edge/[0.06]">
        <div className="pb-3 text-sm">
          <Toggle
            label={t('app.settings.view.autoRotate')}
            hint={t('app.settings.view.autoRotateHint')}
            on={autoRotate}
            onToggle={() => update({ auto_rotate: !autoRotate })}
          />
        </div>
        <SettingRow
          label={t('app.settings.view.defaultView')}
          hint={t('app.settings.view.defaultViewHint')}
        >
          <Segmented
            label={t('app.settings.view.defaultView')}
            value={defaultView}
            onChange={(v) => update({ default_view: v })}
            options={[
              { value: '3d', label: t('app.settings.view.view3d') },
              { value: 'top', label: t('app.settings.view.viewTop') },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('app.settings.view.scale')} hint={t('app.settings.view.scaleHint')}>
          <Segmented
            label={t('app.settings.view.scale')}
            value={defaultScale}
            onChange={(v) => update({ default_scale: v })}
            options={[
              { value: 'linear', label: t('app.settings.view.linear') },
              { value: 'log', label: t('app.settings.view.log') },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('app.settings.view.spread')} hint={t('app.settings.view.spreadHint')}>
          <Segmented
            label={t('app.settings.view.spread')}
            value={spread}
            onChange={(v) => update({ colour_spread: v })}
            options={[
              { value: 'even', label: t('app.settings.view.spreadEven') },
              { value: 'balanced', label: t('app.settings.view.spreadBalanced') },
              { value: 'detail', label: t('app.settings.view.spreadDetail') },
            ]}
          />
        </SettingRow>
        <div className="space-y-2.5 pt-3">
          <div>
            <div className="text-sm text-ink-100">{t('app.settings.view.colormap')}</div>
            <p className="mt-0.5 text-xs text-ink-300">{t('app.settings.view.colormapHint')}</p>
          </div>
          <ColormapPicker label={t('app.settings.view.colormap')} />
        </div>
      </div>
    </SettingsSection>
  );
}

export default function Settings() {
  const { t } = useI18n();
  usePageTitle(t('common.settings'));
  return (
    <PageScroll>
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6">
          <BackLink className="mb-3" />
          <h1 className="text-2xl font-semibold text-ink-50">{t('common.settings')}</h1>
          <p className="mt-1 text-sm text-ink-300">{t('app.settings.intro')}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-300">
            <CheckIcon size={12} strokeWidth={2.5} className="shrink-0 text-accent-300" />
            {t('app.settings.savedToAccount')}
          </p>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <ProfileSection />
          <AppearanceSection />
          <LanguageSection />
          <ViewSection />
          <PasswordSection />
          <SessionsSection />
        </div>

        <BuiltBy className="mt-auto justify-center pt-10" />
      </div>
    </PageScroll>
  );
}
