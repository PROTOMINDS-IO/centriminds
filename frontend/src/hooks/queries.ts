// Server data hooks. Everything cached for one project is keyed under
// ['project', id], so it can be dropped in one call: SQLite can hand the id of
// a project just deleted to the next upload, which must not open with the old
// file's data.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '../api/client';
import type {
  AnalyzeRequest,
  AnnotationWrite,
  MachineProfileData,
  PasswordChange,
  PhysicsResults,
  ProjectUpdate,
  UserUpdate,
} from '../api/types';
import { getAuthToken, useAuthStore } from '../store/authStore';
import { settingsOf, useSettingsStore } from '../store/settingsStore';

/** Whether sign-up is open (the server's ALLOW_REGISTRATION). It is fixed
 *  while the server runs, so it is fetched once. */
export function useAuthConfig() {
  return useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig, staleTime: Infinity });
}

/** Change the account (name, settings); the session takes the saved record. */
export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: UserUpdate) => api.updateMe(body),
    onSuccess: (user) => {
      const { token, user: current, setSession } = useAuthStore.getState();
      // Only for the account that asked: someone else may be signed in by now.
      if (!token || current?.id !== user.id) return;
      // This browser's settings stay as they are. Each change is saved on its
      // own the moment it is made, so they are the newest; a reply to a
      // request sent earlier must not undo a choice made since.
      setSession(token, { ...user, settings: settingsOf(useSettingsStore.getState()) });
    },
  });
}

/** POST /auth/me/password; a wrong current password fails with code
 *  `wrong_password`. The server ends every session of the account, and this
 *  one carries on with the new token it returns. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChange) => api.changePassword(body),
    onSuccess: ({ access_token, user }) => {
      const { token, user: current, renewToken } = useAuthStore.getState();
      // Only for the account that asked, while it is still signed in: by now
      // another account may be, or none.
      if (token && current?.id === user.id) renewToken(access_token);
    },
  });
}

/** DELETE /auth/me/sessions: ends every session of the account, this one
 *  included, so this browser signs out as well (and RequireAuth shows the
 *  sign-in page). */
export function useSignOutEverywhere() {
  return useMutation({
    mutationFn: async () => {
      const token = getAuthToken();
      await api.signOutEverywhere();
      return token;
    },
    // The token the request went out with has ended. A session begun since
    // (another tab signed in again) is not this one's to end.
    onSuccess: (token) => {
      if (token && getAuthToken() === token) useAuthStore.getState().clearSession();
    },
  });
}

/** The account's machine profiles, built-ins first. */
export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: api.profiles });
}

export function useProfileTemplates() {
  return useQuery({
    queryKey: ['profile-templates'],
    queryFn: api.profileTemplates,
    staleTime: Infinity,
  });
}

/** After a profile changes, so does what projects show and analyse with: the
 *  list (machine names) and every project's details (inputs hash). */
function profilesChanged(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['profiles'] });
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['project'] });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MachineProfileData) => api.createProfile(data),
    onSuccess: () => profilesChanged(qc),
  });
}

export function useReplaceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MachineProfileData }) =>
      api.replaceProfile(id, data),
    onSuccess: () => profilesChanged(qc),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteProfile(id),
    onSuccess: () => profilesChanged(qc),
  });
}

export function useImportProfiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.importProfiles(file),
    onSuccess: () => profilesChanged(qc),
  });
}

/** Checks a draft profile's formulas at its operating points. */
export function useCheckProfile() {
  return useMutation({ mutationFn: (data: MachineProfileData) => api.checkProfile(data) });
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
}

/** A project's details. A 404 (gone, or another account's) is not retried. */
export function useProject(id: number | undefined) {
  return useQuery({
    queryKey: ['project', id, 'detail'],
    queryFn: () => api.getProject(id!),
    enabled: id != null && !Number.isNaN(id),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** The spectrogram the 3D view draws, downsampled by the server
 *  (api.getSpectrogramPreview). A project's file never changes, so neither
 *  does this: it is never refetched while cached (creating or deleting a
 *  project drops what is cached under its id). Nor compared with an earlier
 *  copy: walking a matrix of ~100k numbers would find nothing to share. */
export function useSpectrogramPreview(id: number | undefined) {
  return useQuery({
    queryKey: ['project', id, 'spectrogram-preview'],
    queryFn: () => api.getSpectrogramPreview(id!),
    enabled: id != null && !Number.isNaN(id),
    staleTime: Infinity,
    structuralSharing: false,
  });
}

/** A project-list row's thumbnail; fixed like the preview. */
export function useThumbnail(id: number | undefined) {
  return useQuery({
    queryKey: ['project', id, 'thumbnail'],
    queryFn: () => api.getThumbnail(id!),
    enabled: id != null,
    staleTime: Infinity,
  });
}

/** Newest physics run only — each run carries every detected peak. */
export function useLatestPhysics(id: number | undefined) {
  return useQuery({
    queryKey: ['project', id, 'analyses', 'physics', 'latest'],
    queryFn: () => api.listAnalyses<PhysicsResults>(id!, { type: 'physics', limit: 1 }),
    enabled: id != null && !Number.isNaN(id),
    select: (runs) => runs[0],
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ form, onProgress }: { form: FormData; onProgress?: (f: number) => void }) =>
      api.createProject(form, onProgress),
    onSuccess: (created) => {
      // Its id may still be cached here for a project deleted elsewhere.
      qc.removeQueries({ queryKey: ['project', created.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Change a project; refreshes the list and its details. A new rating needs a
 *  new analysis run, which the caller starts when an analysis input changed. */
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ProjectUpdate }) => api.updateProject(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', id, 'detail'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    // Drop the project's cache once the list is refreshed: until then its row
    // can still re-render, and would fetch again what had been removed.
    onSuccess: async (_data, id) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      qc.removeQueries({ queryKey: ['project', id] });
    },
  });
}

/** Run the physics analysis. Refreshes the runs, and the details: a run with
 *  findings (attributed peaks, bands) moves a new project to 'annotated'. */
export function useAnalyzeProject(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnalyzeRequest = {}) => api.analyzeProject(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'analyses'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'detail'] });
    },
  });
}

/** The user's annotations on a project. */
export function useAnnotations(projectId: number | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'annotations'],
    queryFn: () => api.listAnnotations(projectId!),
    enabled: projectId != null && !Number.isNaN(projectId),
  });
}

/** Add (no id) or change (id) one of the user's annotations. */
export function useSaveAnnotation(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: AnnotationWrite }) =>
      id == null
        ? api.createAnnotation(projectId, body)
        : api.replaceAnnotation(projectId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId, 'annotations'] }),
  });
}

export function useDeleteAnnotation(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteAnnotation(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId, 'annotations'] }),
  });
}
