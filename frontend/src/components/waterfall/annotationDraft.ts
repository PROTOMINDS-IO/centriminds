// The annotation form's draft: the fields as typed, and the request they make.
import type { AnnotationRead, AnnotationWrite, UserAnnotationType } from '../../api/types';

/** The form's text fields, as typed. */
export interface Draft {
  type: UserAnnotationType;
  freq: string;
  freqEnd: string;
  rpm: string;
  rpmEnd: string;
  order: string;
  component: string;
  label: string;
  text: string;
  /** "slot:N" (a palette slot) or a fixed #rrggbb an annotation came with,
   *  kept until another colour is picked. */
  color: string;
}

export const EMPTY_DRAFT: Draft = {
  type: 'band',
  freq: '',
  freqEnd: '',
  rpm: '',
  rpmEnd: '',
  order: '',
  component: '',
  label: '',
  text: '',
  color: 'slot:0',
};

const num = (v: number | null | undefined) => (v == null ? '' : String(Number(v.toFixed(3))));

export function draftOf(a: AnnotationRead): Draft {
  return {
    type: a.annotation_type as UserAnnotationType,
    freq: num(a.freq_hz),
    freqEnd: num(a.freq_hz_end),
    rpm: num(a.rpm),
    rpmEnd: num(a.rpm_end),
    order: num(a.payload.order),
    component: a.payload.component ?? '',
    label: a.label,
    text: a.payload.text ?? '',
    color: a.color,
  };
}

/** The request for a draft, or null while a required value is missing. */
export function toWrite(d: Draft): AnnotationWrite | null {
  const value = (s: string) => (s.trim() === '' ? null : Number(s));
  const ok = (v: number | null) => v != null && Number.isFinite(v) && v >= 0;
  const body: AnnotationWrite = {
    annotation_type: d.type,
    label: d.label.trim(),
    color: d.color,
  };
  const freq = value(d.freq);
  const rpm = value(d.rpm);
  switch (d.type) {
    case 'frequency_line':
      return ok(freq) ? { ...body, freq_hz: freq } : null;
    case 'speed_line':
      return ok(rpm) ? { ...body, rpm } : null;
    case 'note':
      return ok(freq) && ok(rpm) ? { ...body, freq_hz: freq, rpm, text: d.text.trim() } : null;
    case 'band': {
      const end = value(d.freqEnd);
      const rpmEnd = value(d.rpmEnd);
      if (!ok(freq) || !ok(end) || end! <= freq!) return null;
      const range = ok(rpm) && ok(rpmEnd) && rpmEnd! > rpm! ? { rpm, rpm_end: rpmEnd } : {};
      return { ...body, freq_hz: freq, freq_hz_end: end, ...range };
    }
    case 'order_line': {
      const order = value(d.order);
      if (!(order != null && order > 0 && order <= 100)) return null;
      return { ...body, order, component: d.component || null };
    }
  }
}
