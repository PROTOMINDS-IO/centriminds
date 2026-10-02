// Routes. Sign-in and sign-up are public; every other page needs a session
// (RequireAuth) and sits in the Layout, under the top bar. Unknown paths lead
// to the project list.
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import MachineProfile from './pages/MachineProfile';
import Machines from './pages/Machines';
import Register from './pages/Register';
import Settings from './pages/Settings';
import Upload from './pages/Upload';

// The workspace carries three.js (most of the bundle); load it on demand so
// the project list paints without it. Sign-in and sign-up fetch three.js
// only for their animated backdrop, once the page is idle and not under
// reduced motion or a data saver (AuthShell).
const Workspace = lazy(() => import('./pages/Workspace'));

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="settings" element={<Settings />} />
            <Route path="machines" element={<Machines />} />
            <Route path="machines/:id" element={<MachineProfile />} />
            <Route path="projects/:id" element={<Workspace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
