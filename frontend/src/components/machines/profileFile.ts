// Saving a machine profile as a file, and naming copies.
import type { MachineProfileData } from '../../api/types';

/** Downloads the profile as `<name>.json`: the document the import reads. */
export function downloadProfile(data: MachineProfileData) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'machine'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A copy of a profile under a new name (match patterns left out, so the
 *  copy does not compete with the original for uploads). */
export function copyOf(data: MachineProfileData, name: string): MachineProfileData {
  return { ...structuredClone(data), name: name.slice(0, 80), match_patterns: [] };
}
