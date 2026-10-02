import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { getI18n } from '../i18n';
import { errorMessage } from '../lib/errorMessage';

/** Catches render errors (e.g. no WebGL, a malformed file) so one broken
 *  view shows a message instead of blanking the whole app. `fallback`
 *  replaces the message (the sign-in backdrop shows nothing); its `reset`
 *  renders the children again. */
export default class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: (error: Error, reset: () => void) => ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    // A class cannot use the hook; the page is shown once, in the language of the moment.
    const i18n = getI18n();
    const { t } = i18n;
    return (
      <div className="grid h-full place-items-center p-6">
        <div role="alert" className="card-glass max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold text-ink-50">{t('common.somethingWrong')}</h1>
          <p className="text-sm text-ink-300">
            {errorMessage(error, i18n) || t('app.errorPage.unexpected')}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {t('app.errorPage.reload')}
          </button>
        </div>
      </div>
    );
  }
}
