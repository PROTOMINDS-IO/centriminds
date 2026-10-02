import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router';

import { api } from '../api/client';
import { useI18n } from '../i18n';
import { useAuthStore } from '../store/authStore';
import { Loading } from './ui/controls';

/** Gate for the signed-in routes. Verifies the stored token once per session;
 *  a 401 clears it (see api/client.ts), which sends the user to /login with
 *  the original target kept for the redirect back. Network errors do not
 *  sign anyone out. */
export default function RequireAuth() {
  const { t } = useI18n();
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: async () => {
      const user = await api.me();
      // Keep the stored account (name, settings) in step with the server.
      if (token) useAuthStore.getState().setSession(token, user);
      return user;
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  if (me.isPending) return <Loading>{t('app.shell.restoring')}</Loading>;
  return <Outlet />;
}
