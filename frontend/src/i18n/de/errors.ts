import type { Messages } from '../en';

export const errors: Messages['errors'] = {
  generic: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
  network: 'Netzwerkfehler – bitte prüfen Sie Ihre Verbindung.',
  not_authenticated: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  registration_disabled:
    'Die Registrierung ist geschlossen. Bitte fragen Sie Ihren Administrator nach einer Einladung.',
  not_invited:
    'Diese E-Mail-Adresse ist nicht für die Registrierung freigegeben. Bitte fragen Sie Ihren Administrator.',
  email_taken: 'Für diese E-Mail-Adresse gibt es bereits ein Konto.',
  invalid_credentials: 'E-Mail-Adresse oder Passwort ist falsch.',
  account_disabled: 'Dieses Konto ist deaktiviert.',
  rate_limited:
    'Zu viele Versuche. Bitte warten Sie {retry_after} Sekunden und versuchen Sie es erneut.',
  wrong_password: 'Das aktuelle Passwort ist falsch.',
  project_not_found: 'Projekt nicht gefunden.',
  analysis_not_found: 'Analyse nicht gefunden.',
  file_too_large: 'Die Datei ist größer als {max_mb} MB.',
  odx_parse_failed: 'Die Datei konnte nicht als VIBXPERT-.odx-Export gelesen werden ({reason}).',
  profile_not_found: 'Maschinenprofil nicht gefunden.',
  profile_builtin:
    'Eingebaute Profile lassen sich nicht ändern; duplizieren Sie eines, um es zu bearbeiten.',
  invalid_profile: 'Das Maschinenprofil ist nicht gültig.',
  import_unreadable:
    'Diese Datei lässt sich nicht importieren: Sie ist weder eine Drehzahl-Arbeitsmappe (.xlsx) noch ein Maschinenprofil (.json).',
  profile_formula_error: 'Das Maschinenprofil lässt sich nicht auswerten ({reason}).',
  annotation_not_found: 'Anmerkung nicht gefunden.',
  annotation_read_only:
    'Die Ergebnisse der Analyse selbst lassen sich nicht ändern; behalten Sie eines als Anmerkung.',
  invalid_sensor_direction: 'Unbekannte Sensorrichtung: {value}.',
  odx_missing: 'Die Messdatei fehlt auf dem Server.',
  odx_corrupt: 'Die gespeicherte Messdatei ist beschädigt ({reason}).',
  not_ratable:
    'Die Spektren enthalten keine Linien zwischen {band_lo_hz} und {band_hi_hz} Hz; diese Messung kann daher nicht nach den Schwingungsgrenzwerten für Dekanter bewertet werden.',
  invalid_status: 'Unbekannter Status: {value}.',
  invalid_analysis_type: 'Unbekannter Analysetyp: {value}.',
  invalid_annotation_author: 'Unbekannter Autor der Anmerkung: {value}.',
  invalid_annotation_type: 'Unbekannter Anmerkungstyp: {value}.',
};
