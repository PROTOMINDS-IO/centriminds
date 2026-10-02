// Entry point: the shared query cache, ThemeSync and LocaleSync (which keep
// <html data-theme> and <html lang> in step with the settings) and the routes.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { LocaleSync } from './i18n';
import { queryClient } from './lib/queryClient';
import { ThemeSync } from './lib/theme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <LocaleSync />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
