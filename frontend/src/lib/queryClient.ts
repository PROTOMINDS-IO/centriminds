// The app's one query cache. Its own module, so the auth store can clear it
// when a session ends without importing main.tsx.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
