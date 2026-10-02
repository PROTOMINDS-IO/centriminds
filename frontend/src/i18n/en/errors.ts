// Messages for the backend's error codes ({detail, code, params}); see
// backend/app/errors.py. FormError falls back to the server's English detail
// for a code that is not listed here. `generic` and `network` are the
// client's own (lib/errorMessage.ts, api/client.ts).
export const errors = {
  generic: 'Something went wrong. Please try again.',
  network: 'Network error — check your connection.',
  not_authenticated: 'Your session has ended. Please sign in again.',
  registration_disabled: 'Sign-up is closed. Ask your administrator for an invitation.',
  not_invited: 'This email address is not on the sign-up list. Ask your administrator to add it.',
  email_taken: 'An account with this email address already exists.',
  invalid_credentials: 'Email or password is incorrect.',
  account_disabled: 'This account is disabled.',
  rate_limited: 'Too many attempts. Please wait {retry_after} seconds and try again.',
  wrong_password: 'The current password is incorrect.',
  project_not_found: 'Project not found.',
  analysis_not_found: 'Analysis not found.',
  file_too_large: 'The file is larger than {max_mb} MB.',
  odx_parse_failed: 'This file could not be read as a VIBXPERT .odx export ({reason}).',
  profile_not_found: 'Machine profile not found.',
  profile_builtin: 'Built-in profiles cannot be changed; duplicate one to edit it.',
  invalid_profile: 'The machine profile is not valid.',
  import_unreadable:
    'This file cannot be imported: it is neither a machine speeds workbook (.xlsx) nor a machine profile (.json).',
  profile_formula_error: 'The machine profile cannot be evaluated ({reason}).',
  annotation_not_found: 'Annotation not found.',
  annotation_read_only:
    'The analysis’s own findings cannot be changed; keep one as an annotation instead.',
  invalid_sensor_direction: 'Unknown sensor direction: {value}.',
  odx_missing: 'The measurement file is missing on the server.',
  odx_corrupt: 'The stored measurement file is damaged ({reason}).',
  not_ratable:
    'The spectra have no lines between {band_lo_hz} and {band_hi_hz} Hz, so this measurement cannot be rated against the decanter vibration limits.',
  invalid_status: 'Unknown status: {value}.',
  invalid_analysis_type: 'Unknown analysis type: {value}.',
  invalid_annotation_author: 'Unknown annotation author: {value}.',
  invalid_annotation_type: 'Unknown annotation type: {value}.',
};
