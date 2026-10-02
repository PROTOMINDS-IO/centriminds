// Runs before first paint (a plain script in <head>; the CSP allows only
// same-origin scripts, so it cannot be inline). Applies the saved theme and
// language so a light-theme or German user never sees a flash of the
// defaults. lib/theme.ts and the i18n module take over once the app loads.
(function () {
  var root = document.documentElement;
  var settings = {};
  try {
    // settingsStore's persisted copy: { state: <the settings>, version }.
    var raw = localStorage.getItem('centriminds.settings');
    settings = (raw && JSON.parse(raw).state) || {};
  } catch (e) {
    /* private mode or corrupt storage: defaults */
  }
  var theme = settings.theme || 'dark';
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');

  // Same rule as resolveLocale (src/i18n): 'auto' means German for a German
  // browser, else English.
  var lang = settings.language;
  if (lang !== 'en' && lang !== 'de') {
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    lang = nav.toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
  }
  root.setAttribute('lang', lang);
})();
