# Machine profiles

What CentriMinds knows about a machine — which parts excite vibration and how
fast each turns at a given bowl speed — is a **machine profile**: a JSON
document kept with your account. The app holds no machine's data, only this
format. Profiles are created in *Machines*: imported from a machine speeds
workbook or a profile file, started from a template, or copied, and edited
there. Each one can be exported as JSON and imported elsewhere.

## The document

```json
{
  "format": "centriminds.machine-profile",
  "version": 1,
  "name": "Example decanter",
  "machine_type": "Decanter centrifuge",
  "description": "",
  "bowl_diameter_mm": 520,
  "match_patterns": ["example decanter"],
  "parameters": [
    { "key": "d", "label": "Differential speed", "unit": "rpm", "value": 10, "run_specific": true },
    { "key": "K1", "label": "Gearbox 1st stage ratio", "unit": "", "value": -60, "run_specific": false },
    { "key": "K2", "label": "Gearbox 2nd stage ratio", "unit": "", "value": 2, "run_specific": false },
    { "key": "f_mains", "label": "Mains frequency", "unit": "Hz", "value": 50, "run_specific": true }
  ],
  "components": [
    { "key": "bowl", "label": "Bowl", "kind": "shaft", "speed_rpm": "n", "max_order": 10 },
    { "key": "scroll", "label": "Scroll", "kind": "shaft", "speed_rpm": "n - sign(K1 * K2) * d", "max_order": 10 },
    { "key": "mains", "label": "Mains", "kind": "electrical", "speed_rpm": "60 * f_mains", "max_order": 3 }
  ],
  "operating_points": [
    {
      "label": "Nominal",
      "bowl_rpm": 3000,
      "parameters": { "d": 8 },
      "reference_rpm": { "scroll": 3008 }
    }
  ],
  "structural_modes": [
    { "name": "Rigid-body mode, vertical", "freq_hz": 9.2, "source": "FE modal analysis" }
  ],
  "resonance_zones": [
    { "label": "Frame resonance", "lo_hz": 62, "hi_hz": 78, "source": "Run-up test" }
  ]
}
```

| Field | |
| --- | --- |
| `parameters` | Named values the formulas use. `run_specific` marks those that change from one measurement to the next; each project shows them to override (this run's differential speed). |
| `components` | The parts that excite vibration. `speed_rpm` is a formula (below); order *k* of a component vibrates at *k* × \|speed\| / 60 Hz, for *k* = 1 … `max_order`. `kind` is `shaft`, `belt`, `gear_mesh`, `other` or `electrical`. |
| `operating_points` | Speeds the machine is specified at, with the parameter values there and, optionally, the component speeds a commissioning sheet gives (`reference_rpm`). The editor sets each computed speed beside them. |
| `structural_modes` | Natural frequencies known from FE studies or tests: drawn on the waterfall, and the analysis reports where the bowl crosses them and the strongest response near them. |
| `resonance_zones` | Frequency ranges known to amplify vibration, shown on every measurement of the machine. |
| `match_patterns` | Text in an export's `#Path` header or file name that identifies the machine (case-insensitive). An upload takes the profile with the longest matching pattern; on a tie, the most recently changed profile. A profile that is created, imported or edited also takes over the projects it recognises better than their current profile does: those with none (or one that no longer matches) and those matched by a shorter pattern. A profile the user picked for a project is never replaced. |
| `bowl_diameter_mm` | Selects the limit class of the decanter rating (a project can set its own). |

## Speed formulas

A formula gives a component's speed in rpm. It can use:

- `n` — the bowl speed in rpm, which is the speed an export records with
  every spectrum;
- the parameters, by `key`, and the components declared **before** this one
  (so `2 * belt` for a belt's flexing frequency);
- numbers, `+ - * / **` (exponents up to 4), brackets, `pi`, and the
  functions `abs`, `sign`, `min`, `max`, `sqrt`.

Nothing else is evaluated, so a profile from someone else is safe to import.
A formula is at most 500 characters long.
A negative speed is a direction of rotation: vibration sees its size, so the
lines of −363 rpm and 363 rpm are the same.

## Limits

A document outside these limits is rejected on import or save, with the
field that is wrong.

- `format` is `centriminds.machine-profile` and `version` is `1`. Fields
  the format does not define are rejected, at every level, so a typo does
  not go unnoticed.
- Parameter and component `key`s: letters, digits and `_`, not starting
  with a digit, at most 40 characters, unique across parameters and
  components, and none of the names formulas already use (`n`, `pi`,
  `abs`, `sign`, `min`, `max`, `sqrt`).
- Labels and names: 1–80 characters; `machine_type` and `source` up to 80,
  `unit` up to 20, `description` up to 2000.
- `match_patterns`: at most 12, each 2–60 characters.
- At most 60 `parameters`, 1–40 `components`, 8 `operating_points`, 20
  `structural_modes` and 20 `resonance_zones`.
- A component's `kind` defaults to `shaft` and its `max_order` to 10
  (1–50).
- Numbers are finite. `bowl_rpm` is above 0 and at most 100 000;
  frequencies (`freq_hz`, `lo_hz`, `hi_hz`) at most 100 000 Hz, with `hi_hz`
  above `lo_hz`; `bowl_diameter_mm`, when set, above 0 and at most 3000.

## What the analysis does with it

- **Order lines** — every order of every component across the sweep. Lines
  closer than the measurement can resolve (four frequency lines, the main
  lobe of a Hann window) at two speeds are drawn as one, e.g. "Bowl + Scroll
  1×" when the differential speed is small.
- **Resonance zones** — the amplitude is tracked along the lines up to the
  3rd order; where several independent lines swell at the same frequency (a
  natural frequency amplifying whatever crosses it), a zone is suggested,
  with its confidence and its amplitude relative to the strongest line.
  Readings where a line crosses another or the mains are left out.
- **Speed-independent lines** — frequencies lit through most of the speed
  range. Near an order of an `electrical` component they are the mains; near
  a structural mode, that mode; otherwise unexplained.
- **Peaks** — matched to the nearest component order within the tolerance;
  a peak on a mains line counts as the mains, even where a shaft order passes
  through 50 Hz.

## Machine speeds workbooks

The import reads workbooks with one sheet per machine in the layout of a
commissioning sheet: a label in the first column, one value per operating
point after it and a unit last; sections *1. Operating parameters*, *2.
Gearbox and belt data* and *3. Exciting speed*. The gearbox type (and a
second motor's belt) chooses a template whose formulas the sheet's values
fill; section 3 becomes each operating point's reference speeds. Rows that
are not recognised are listed after the import. Structural modes, the bowl
diameter and match patterns are not on such sheets: add them in the editor.
