import { useEffect } from 'react';

const APP = 'CentriMinds';

/** "<page> · CentriMinds" in the browser tab; the app name alone when empty. */
export function usePageTitle(page?: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · ${APP}` : APP;
  }, [page]);
}
