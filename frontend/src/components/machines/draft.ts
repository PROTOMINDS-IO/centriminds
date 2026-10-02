// Edits of the draft profile document in the editor: a patch of its top
// level, and the add/change/remove/move of one item of its lists.
import type {
  FrequencyZone,
  MachineProfileData,
  OperatingPoint,
  ProfileComponent,
  ProfileParameter,
  ProfileStructuralMode,
} from '../../api/types';

/** Applies a patch to the draft's top level. */
export type Edit = (patch: Partial<MachineProfileData>) => void;

/** The draft's lists of items, and the type of their items. */
interface Lists {
  parameters: ProfileParameter;
  components: ProfileComponent;
  operating_points: OperatingPoint;
  structural_modes: ProfileStructuralMode;
  resonance_zones: FrequencyZone;
}

/** Edits of the list `key` of the draft, each a new list in one patch. */
export function listOps<K extends keyof Lists>(draft: MachineProfileData, edit: Edit, key: K) {
  const list = draft[key] as Lists[K][];
  const set = (next: Lists[K][]) => edit({ [key]: next } as Partial<MachineProfileData>);
  return {
    update: (i: number, patch: Partial<Lists[K]>) =>
      set(list.map((x, j) => (j === i ? { ...x, ...patch } : x))),
    remove: (i: number) => set(list.filter((_, j) => j !== i)),
    add: (item: Lists[K]) => set([...list, item]),
    /** Moves item `i` by `by` places. */
    move: (i: number, by: number) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item);
      set(next);
    },
  };
}

/** A key not used yet: `base`, `base2`, … */
export function freeKey(base: string, taken: string[]): string {
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}${i}`;
  return key;
}
