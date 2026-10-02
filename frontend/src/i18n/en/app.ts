// App shell and pages: top bar and account menu, sign-in and sign-up, the
// project list, upload, settings, legal.
//
// {name} placeholders are filled by t(); a few sentences carry React elements
// instead (e.g. {odx}, the file-type chip), which <RichText> puts in place.
export const app = {
  shell: {
    home: 'CentriMinds home',
    accountMenu: 'Account menu for {name}',
    signedIn: 'Signed in',
    restoring: 'Restoring session…',
  },

  brand: {
    newTab: '(opens in a new tab)',
  },

  legal: {
    representedBy: 'Represented by the partners {names}',
    businessAddress: 'Business address',
    furtherAddress: 'Further business address',
    contact: 'Contact',
  },

  errorPage: {
    unexpected: 'An unexpected error occurred.',
    reload: 'Reload',
  },

  auth: {
    tagline: 'Vibration analysis for decanter centrifuges.',
    heroTitle: 'Vibration analysis for decanter centrifuges, {em}.',
    heroEm: 'in 3D',
    heroBody:
      'Upload a VIBXPERT / Omnitrend {odx} export and inspect the speed sweep as an interactive waterfall — rated against the permissible vibration levels for your bowl size.',
    capabilities: {
      rating: 'Decanter permissible-level rating',
      sources: 'Excitation-source attribution',
      modes: 'Structural-mode and resonance checks',
    },
    name: 'Name',
    email: 'Email',
    emailPlaceholder: 'you@company.com',
    password: 'Password',
    confirmPassword: 'Confirm password',
    display: 'Language and theme',
    signIn: {
      title: 'Sign in',
      subtitle: 'Welcome back — your projects are waiting.',
      submit: 'Sign in',
      submitting: 'Signing in…',
      noAccount: 'No account yet?',
      createOne: 'Create one',
      needAccess: 'Need access?',
      contact: 'Contact ProtoMinds',
    },
    signUp: {
      title: 'Create account',
      subtitle: 'Your projects stay private to your account.',
      closedSubtitle: 'Sign-up is by invitation.',
      closedBody:
        'New accounts are set up by ProtoMinds. Write to {email} and we will get you access.',
      submit: 'Create account',
      submitting: 'Creating account…',
      haveAccount: 'Already have an account?',
      signIn: 'Sign in',
    },
  },

  /** Rules for a new password (sign-up and Settings). */
  password: {
    hint: 'At least {min} characters',
    tooShort: 'The password needs at least {min} characters.',
    tooLong:
      'The password is too long: at most {max} characters, where letters such as ä or é count as two.',
    mismatch: 'The passwords do not match.',
  },

  dashboard: {
    count: { one: '{count} measurement', other: '{count} measurements' },
    attention: '{count} at alarm level or above',
    searchPlaceholder: 'Search projects, files or paths',
    searchLabel: 'Search projects',
    conditionLabel: 'Filter by condition',
    condition: {
      all: 'All conditions',
      attention: 'Alarm or worse',
      unrated: 'Not analysed',
    },
    sortLabel: 'Sort',
    sort: {
      recent: 'Newest first',
      severity: 'Highest vibration',
      name: 'Name (A–Z)',
    },
    columns: {
      spectrum: 'Spectrum',
      project: 'Project',
      machine: 'Machine',
      condition: 'Condition',
      added: 'Added',
    },
    notAnalysed: 'Not analysed',
    deleteLabel: 'Delete {name}',
    deleteTitle: 'Delete project',
    deleteConfirm: 'Delete “{name}”? The measurement and its analyses are removed permanently.',
    noMatch: 'No projects match those filters.',
    empty: {
      title: 'Start with a measurement',
      body: 'Upload a VIBXPERT / Omnitrend {odx} export. The machine is recognised from the file by its profile, and the sweep opens as a 3D waterfall, rated right away.',
      action: 'Upload .odx',
    },
  },

  upload: {
    title: 'New analysis',
    intro:
      'Upload a VIBXPERT / Omnitrend {odx} export. The machine is recognised from the file by its profile, and the analysis runs as soon as it opens.',
    drop: 'Drop an .odx file here, or browse',
    limit: 'Up to {max_mb} MB',
    chosen: '{size} MB · choose or drop another to replace',
    wrongType: 'Choose a .odx export (VIBXPERT / Omnitrend).',
    name: 'Project name',
    namePlaceholder: 'Taken from the file name if left empty',
    progress: 'Uploading… {percent}%',
    reading: 'Reading the file…',
    submit: 'Upload and analyse',
    submitting: 'Uploading…',
    machine: 'Machine',
    machineAuto: 'Recognise from the file',
    machineHint:
      'A profile whose match patterns appear in the file’s path or name is chosen by itself; without one, the generic profile is used.',
    manageMachines: 'Machine profiles',
  },

  machines: {
    title: 'Machines',
    intro:
      'What the analysis knows about each machine: its drive train as parameters and speed formulas, its operating points, structural modes and known resonance zones. Profiles are your data, kept with your account.',
    import: 'Import…',
    importing: 'Importing…',
    importHint:
      'Import a machine speeds workbook (.xlsx, one profile per machine sheet) or a profile file (.json) exported here.',
    new: 'New profile',
    fromTemplate: 'Start from a template',
    fromTemplateHint:
      'The drive train’s formulas with example values; enter your machine’s values in the editor.',
    builtin: 'Built in',
    components: { one: '{count} component', other: '{count} components' },
    projects: { one: 'used by {count} project', other: 'used by {count} projects' },
    recognises: 'Recognises files containing {patterns}',
    duplicate: 'Duplicate {name}',
    export: 'Export {name} as JSON',
    delete: 'Delete {name}',
    deleteConfirm: 'Delete the profile “{name}”?',
    deleteConfirmUsed: {
      one: 'Delete the profile “{name}”? {count} project uses it and will fall back to the generic profile.',
      other:
        'Delete the profile “{name}”? {count} projects use it and will fall back to the generic profile.',
    },
    copyName: '{name} (copy)',
    imported: { one: '{count} profile imported', other: '{count} profiles imported' },
    importedFrom: 'from {source}',
    assigned: {
      one: 'now used by {count} project it recognised',
      other: 'now used by {count} projects it recognised',
    },
    importedCheck:
      'Open a profile to check its speeds against the sheet and to add what a sheet does not carry: structural modes, the bowl diameter, match patterns.',
  },

  /** The machine profile editor (/machines/:id). */
  profile: {
    notFoundTitle: 'Profile not found',
    notFoundText: 'It may have been deleted, or it belongs to another account.',
    builtinNote: 'Built in and read-only. Duplicate it to make your own.',
    unsaved: 'Unsaved changes',
    saved: 'All changes saved',
    export: 'Export as JSON',
    duplicate: 'Duplicate',
    delete: 'Delete profile',
    revert: 'Revert',
    problems: {
      one: 'The profile cannot be saved yet: {count} problem',
      other: 'The profile cannot be saved yet: {count} problems',
    },
    general: 'General',
    generalHint:
      'How the profile is named and recognised. The bowl diameter selects the limit class of the rating.',
    name: 'Name',
    machineType: 'Machine type',
    machineTypePlaceholder: 'e.g. Decanter centrifuge',
    bowlDiameter: 'Bowl diameter (mm)',
    bowlDiameterHint: 'A project can set its own; empty = strictest class.',
    patterns: 'Match patterns',
    patternsHint:
      'Text in an export’s path or file name that identifies this machine, separated by commas. The longest match wins.',
    description: 'Description',
    parameters: 'Parameters',
    parametersHint:
      'Named values the formulas use: gear ratios, pulley diameters, belt lengths. Mark those that change between measurements (differential speed, mains frequency) as per run: a project shows them to override.',
    key: 'Name in formulas',
    label: 'Label',
    value: 'Value',
    unit: 'Unit',
    runSpecific: 'Per run',
    runSpecificLabel: '{name} changes between measurements',
    remove: 'Remove {name}',
    addParameter: 'Add parameter',
    newParameter: 'New parameter',
    components: 'Components',
    componentsHint:
      'The parts that excite vibration, each with its speed as a formula. Order k of a component vibrates at k × speed / 60 Hz; lines closer than the measurement can resolve are drawn as one.',
    kind: 'Kind',
    kinds: {
      shaft: 'Shaft',
      belt: 'Belt',
      gear_mesh: 'Gear mesh',
      electrical: 'Electrical',
      other: 'Other',
    },
    formula: 'Speed (rpm)',
    formulaFor: 'Speed formula of {name}',
    maxOrder: 'Up to order',
    moveUp: 'Move up',
    moveDown: 'Move down',
    addComponent: 'Add component',
    newComponent: 'New component',
    formulaHelpTitle: 'How formulas work',
    formulaHelpN: 'n is the bowl speed in rpm — the speed an export records at every spectrum.',
    formulaHelpNames:
      'Use the parameters by their names, and the components declared above by theirs (e.g. 2 * belt).',
    formulaHelpOps:
      'Numbers, + − × / ** and brackets, pi, abs(), sign(), min(), max(), sqrt(). Nothing else runs, so a shared profile is safe to import.',
    formulaHelpOrders:
      'A negative speed is a direction of rotation; vibration sees its size, so −363 rpm and 363 rpm give the same lines.',
    formulaHelpKinds:
      'Electrical components (the mains) do not follow the speed: they are drawn dashed and left out of the resonance search.',
    points: 'Operating points and check',
    pointsHint:
      'Speeds the machine is specified at, with the values of the per-run parameters there. Each component’s speed is computed at every point and set beside the speed a commissioning sheet gives.',
    component: 'Component',
    pointLabel: 'Name of the operating point',
    bowlRpm: 'Bowl rpm',
    sheet: 'Sheet',
    sheetFor: 'Sheet speed of {name} at {point}',
    differs: 'differs by {delta} rpm',
    matches: 'matches the sheet',
    pointsNote:
      'Directions are not compared: a sheet often lists sizes only. Where a formula and the sheet disagree, check both: the sheet can be wrong too.',
    addPoint: 'Add operating point',
    newPoint: 'Nominal',
    modes: 'Structural modes',
    modesHint:
      'Natural frequencies known from FE studies or tests. The waterfall draws them, and the analysis reports where the bowl crosses them.',
    modeName: 'Name',
    frequency: 'Frequency (Hz)',
    source: 'Source',
    addMode: 'Add structural mode',
    newMode: 'Rigid-body mode, vertical',
    newModeSource: 'FE modal analysis',
    zones: 'Known resonance zones',
    zonesHint:
      'Frequency ranges known to amplify vibration; every measurement of this machine shows them.',
    from: 'From (Hz)',
    to: 'To (Hz)',
    addZone: 'Add zone',
    newZone: 'Resonance zone',
  },

  settings: {
    intro: 'Choose how CentriMinds looks and works for you.',
    savedToAccount: 'Changes are saved to your account and follow you to every device.',
    profile: {
      title: 'Profile',
      description: 'Your name as it appears in the account menu.',
      name: 'Name',
      email: 'Email',
      emailHint: 'You sign in with this address. It cannot be changed here.',
    },
    appearance: {
      title: 'Appearance',
      description: 'A dark or light look, or whichever your device uses.',
      dark: 'Dark',
      light: 'Light',
      system: 'System',
      systemHint: 'Follows your device',
    },
    language: {
      title: 'Language',
      description: 'The language of menus, labels and messages.',
      auto: 'Automatic ({language})',
      autoHint: 'Follows your browser',
    },
    view: {
      title: '3D view',
      description: 'Defaults for the 3D view. They apply when you open a project.',
      autoRotate: 'Auto-rotate when idle',
      autoRotateHint:
        'Turns slowly while you are not using it. Off by default if your device asks for less motion.',
      defaultView: 'Default view',
      defaultViewHint: 'How a project opens: in perspective or from above.',
      view3d: '3D',
      viewTop: 'Top view',
      scale: 'Amplitude scale',
      scaleHint: 'Log brings out small peaks next to large ones.',
      linear: 'Linear',
      log: 'Log',
      spread: 'Colour spread',
      spreadHint:
        'On the linear scale: Even colours in proportion to the amplitude; Balanced and Detail colour logarithmically, so small waves and their peaks show while heights stay true.',
      spreadEven: 'Even',
      spreadBalanced: 'Balanced',
      spreadDetail: 'Detail',
      colormap: 'Surface colours',
      colormapHint:
        'Colour scheme of the waterfall and the project thumbnails. Each has a dark and a light version, so quiet areas fade into the background and peaks stand out.',
    },
    security: {
      title: 'Security',
      description:
        'Change the password you sign in with. This signs you out on your other devices.',
      current: 'Current password',
      new: 'New password',
      confirm: 'Confirm new password',
      submit: 'Change password',
      submitting: 'Changing password…',
      changed: 'Your password has been changed. You are now signed out on your other devices.',
    },
    sessions: {
      title: 'Sessions',
      description:
        'Signed in on a shared or lost device? Sign out everywhere to end all your sessions, this one included.',
      submit: 'Sign out everywhere',
      submitting: 'Signing out…',
    },
  },
};
