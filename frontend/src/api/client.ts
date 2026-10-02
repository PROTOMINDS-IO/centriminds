// Thin typed fetch wrapper for the backend under /api, which Vite's dev server
// proxies to http://localhost:8000 (nginx does so in the container).
import { getAuthToken, useAuthStore } from '../store/authStore';
import { setSettingsSync } from '../store/settingsStore';
import type {
  AnalysisRunRead,
  AnalyzeRequest,
  AnalyzeResponse,
  AnnotationRead,
  AnnotationWrite,
  LoginRequest,
  MachineProfileData,
  MachineProfileRead,
  MachineProfileSaved,
  PasswordChange,
  ProfileCheck,
  ProfileImportResponse,
  ProfileTemplate,
  ProjectDetail,
  ProjectSummary,
  ProjectUpdate,
  RegisterRequest,
  SpectrogramRead,
  ThumbnailRead,
  TokenResponse,
  UserRead,
  UserSettings,
  UserUpdate,
} from './types';

const BASE = '/api';

/** A failed request. `code` and `params` come from the backend's error body
 *  ({detail, code, params}) so the UI can say it in the user's language;
 *  `detail` is the server's English message, the fallback. */
export class ApiError extends Error {
  status: number;
  code: string | null;
  params: Record<string, unknown>;
  detail: string;
  constructor(
    status: number,
    message: string,
    opts: { code?: string | null; params?: Record<string, unknown>; detail?: string } = {},
  ) {
    super(message);
    this.status = status;
    this.code = opts.code ?? null;
    this.params = opts.params ?? {};
    this.detail = opts.detail ?? message;
  }
}

/** Build an ApiError from a response body (JSON or text). */
function toApiError(status: number, statusText: string, body: unknown): ApiError {
  let detail = typeof body === 'string' ? body : '';
  let code: string | null = null;
  let params: Record<string, unknown> = {};
  if (typeof body === 'object' && body) {
    const b = body as { detail?: unknown; code?: unknown; params?: unknown };
    // FastAPI validation errors carry a list of problems; show their messages.
    detail = Array.isArray(b.detail)
      ? b.detail.map((d) => String((d as { msg?: unknown }).msg ?? d)).join('; ')
      : String(b.detail ?? '');
    if (typeof b.code === 'string') code = b.code;
    if (typeof b.params === 'object' && b.params) params = b.params as Record<string, unknown>;
  }
  return new ApiError(status, `${status} ${statusText}: ${detail}`, { code, params, detail });
}

/** Stale token? End the session, and with it the cache, so the router
 *  bounces back to /login. Only if that token is still the current one: a
 *  late 401 must not clear what the login page or a new session has loaded. */
function onUnauthorized(token: string | null) {
  if (token && getAuthToken() === token) useAuthStore.getState().clearSession();
}

/** Fetch `/api${path}` with the session's token. A failed request throws an
 *  ApiError (status 0 when the server could not be reached). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    // Offline, server down, or the request was cut off: say so in the
    // user's language rather than the browser's "Failed to fetch".
    throw new ApiError(0, 'Network error — check your connection.', { code: 'network' });
  }
  if (!resp.ok) {
    let body: unknown;
    // Parse a copy, so the body can still be read as text if it is not JSON.
    try {
      body = await resp.clone().json();
    } catch {
      body = await resp.text();
    }
    if (resp.status === 401) onUnauthorized(token);
    throw toApiError(resp.status, resp.statusText, body);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/** Request options for a JSON body. */
function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const api = {
  // ─── auth ─────────────────────────────────────────────
  register: (body: RegisterRequest) => request<TokenResponse>('/auth/register', json('POST', body)),

  login: (body: LoginRequest) => request<TokenResponse>('/auth/login', json('POST', body)),

  me: () => request<UserRead>('/auth/me'),

  updateMe: (body: UserUpdate) => request<UserRead>('/auth/me', json('PATCH', body)),

  /** Ends every session of the account and returns a new token for this one
   *  (useChangePassword carries on with it). */
  changePassword: (body: PasswordChange) =>
    request<TokenResponse>('/auth/me/password', json('POST', body)),

  /** Ends every session of the account, this one included. */
  signOutEverywhere: () => request<void>('/auth/me/sessions', { method: 'DELETE' }),

  authConfig: () => request<{ allow_registration: boolean }>('/auth/config'),

  // ─── machine profiles ─────────────────────────────────
  profiles: () => request<MachineProfileRead[]>('/machines/profiles'),

  createProfile: (data: MachineProfileData) =>
    request<MachineProfileSaved>('/machines/profiles', json('POST', { data })),

  replaceProfile: (id: number, data: MachineProfileData) =>
    request<MachineProfileRead>(`/machines/profiles/${id}`, json('PUT', { data })),

  deleteProfile: (id: number) =>
    request<{ deleted: number }>(`/machines/profiles/${id}`, { method: 'DELETE' }),

  /** A machine speeds workbook (.xlsx) or profile JSON; one profile per
   *  machine found. */
  importProfiles: (file: File) => {
    const form = new FormData();
    form.set('file', file);
    return request<ProfileImportResponse>('/machines/profiles/import', {
      method: 'POST',
      body: form,
    });
  },

  profileTemplates: () => request<ProfileTemplate[]>('/machines/templates'),

  /** A draft's component speeds at its operating points (nothing is saved). */
  checkProfile: (data: MachineProfileData) =>
    request<ProfileCheck>('/machines/check', json('POST', { data })),

  // ─── projects ─────────────────────────────────────────

  listProjects: () => request<ProjectSummary[]>('/projects'),

  getProject: (id: number) => request<ProjectDetail>(`/projects/${id}`),

  /** Multipart upload via XHR, which (unlike fetch) reports upload progress. */
  createProject: (form: FormData, onProgress?: (fraction: number) => void) =>
    new Promise<ProjectDetail>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/projects`);
      const token = getAuthToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        let body: unknown = xhr.responseText;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* keep text */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as ProjectDetail);
          return;
        }
        if (xhr.status === 401) onUnauthorized(token);
        reject(toApiError(xhr.status, xhr.statusText, body));
      };
      xhr.onerror = () =>
        reject(new ApiError(0, 'Network error — check your connection.', { code: 'network' }));
      xhr.send(form);
    }),

  updateProject: (id: number, body: ProjectUpdate) =>
    request<ProjectDetail>(`/projects/${id}`, json('PATCH', body)),

  deleteProject: (id: number) =>
    request<{ deleted: number }>(`/projects/${id}`, { method: 'DELETE' }),

  /** The sweep for the 3D view, downsampled by the server to at most
   *  `maxBlocks` spectra of `maxBins` lines (max-pooled, so peaks survive). */
  getSpectrogramPreview: (id: number, maxBlocks = 200, maxBins = 512) =>
    request<SpectrogramRead>(
      `/projects/${id}/spectrogram/preview?max_blocks=${maxBlocks}&max_bins=${maxBins}`,
    ),

  getThumbnail: (id: number, nBlocks = 24, nBins = 64) =>
    request<ThumbnailRead>(`/projects/${id}/thumbnail?n_blocks=${nBlocks}&n_bins=${nBins}`),

  analyzeProject: (id: number, body: AnalyzeRequest = {}) =>
    request<AnalyzeResponse>(`/projects/${id}/analyze`, json('POST', body)),

  /** The user's own annotations (the analysis's are in its results). */
  listAnnotations: (id: number) =>
    request<AnnotationRead[]>(`/projects/${id}/annotations?author=user`),

  createAnnotation: (id: number, body: AnnotationWrite) =>
    request<AnnotationRead>(`/projects/${id}/annotations`, json('POST', body)),

  replaceAnnotation: (id: number, annotationId: number, body: AnnotationWrite) =>
    request<AnnotationRead>(`/projects/${id}/annotations/${annotationId}`, json('PUT', body)),

  deleteAnnotation: (id: number, annotationId: number) =>
    request<{ deleted: number }>(`/projects/${id}/annotations/${annotationId}`, {
      method: 'DELETE',
    }),

  /** Runs newest first; `R` is the type of their results (PhysicsResults
   *  for physics runs). */
  listAnalyses: <R = Record<string, unknown>>(
    id: number,
    opts: { type?: string; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.type) qs.set('type', opts.type);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const tail = qs.toString() ? `?${qs}` : '';
    return request<AnalysisRunRead<R>[]>(`/projects/${id}/analyses${tail}`);
  },
};

// Settings changed anywhere in the app are saved to the account (when signed
// in). Best effort: the local copy already applies; the next sign-in or page
// load takes the account's settings again.
setSettingsSync((patch: Partial<UserSettings>) => {
  if (!getAuthToken()) return;
  api.updateMe({ settings: patch }).catch(() => {});
});
