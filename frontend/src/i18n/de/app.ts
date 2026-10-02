import type { Messages } from '../en';

export const app: Messages['app'] = {
  shell: {
    home: 'CentriMinds – Startseite',
    accountMenu: 'Kontomenü für {name}',
    signedIn: 'Angemeldet',
    restoring: 'Sitzung wird wiederhergestellt…',
  },

  brand: {
    newTab: '(öffnet in einem neuen Tab)',
  },

  legal: {
    representedBy: 'Vertreten durch die Gesellschafter {names}',
    businessAddress: 'Geschäftsanschrift',
    furtherAddress: 'Weitere Geschäftsanschrift',
    contact: 'Kontakt',
  },

  errorPage: {
    unexpected: 'Ein unerwarteter Fehler ist aufgetreten.',
    reload: 'Neu laden',
  },

  auth: {
    tagline: 'Schwingungsanalyse für Dekanterzentrifugen.',
    heroTitle: 'Schwingungsanalyse für Dekanterzentrifugen – {em}.',
    heroEm: 'in 3D',
    heroBody:
      'Laden Sie einen {odx}-Export aus VIBXPERT / Omnitrend hoch und untersuchen Sie den Drehzahlverlauf als interaktives Wasserfalldiagramm – bewertet nach den zulässigen Schwingungswerten für Ihre Trommelgröße.',
    capabilities: {
      rating: 'Bewertung nach zulässigen Schwingungswerten für Dekanter',
      sources: 'Zuordnung der Anregungsquellen',
      modes: 'Prüfung von Eigenfrequenzen und Resonanzen',
    },
    name: 'Name',
    email: 'E-Mail-Adresse',
    emailPlaceholder: 'name@firma.de',
    password: 'Passwort',
    confirmPassword: 'Passwort bestätigen',
    display: 'Sprache und Darstellung',
    signIn: {
      title: 'Anmelden',
      subtitle: 'Willkommen zurück – Ihre Projekte warten auf Sie.',
      submit: 'Anmelden',
      submitting: 'Anmeldung läuft…',
      noAccount: 'Noch kein Konto?',
      createOne: 'Jetzt registrieren',
      needAccess: 'Sie benötigen Zugang?',
      contact: 'ProtoMinds kontaktieren',
    },
    signUp: {
      title: 'Konto erstellen',
      subtitle: 'Ihre Projekte bleiben privat in Ihrem Konto.',
      closedSubtitle: 'Die Registrierung ist nur auf Einladung möglich.',
      closedBody:
        'Neue Konten werden von ProtoMinds eingerichtet. Schreiben Sie an {email}, dann erhalten Sie Zugang.',
      submit: 'Konto erstellen',
      submitting: 'Konto wird erstellt…',
      haveAccount: 'Sie haben bereits ein Konto?',
      signIn: 'Anmelden',
    },
  },

  password: {
    hint: 'Mindestens {min} Zeichen',
    tooShort: 'Das Passwort muss mindestens {min} Zeichen lang sein.',
    tooLong:
      'Das Passwort ist zu lang: höchstens {max} Zeichen, wobei Buchstaben wie ä oder é doppelt zählen.',
    mismatch: 'Die Passwörter stimmen nicht überein.',
  },

  dashboard: {
    count: { one: '{count} Messung', other: '{count} Messungen' },
    attention: 'davon {count} mit Alarm oder schlechter',
    searchPlaceholder: 'Projekte, Dateien oder Pfade suchen',
    searchLabel: 'Projekte durchsuchen',
    conditionLabel: 'Nach Zustand filtern',
    condition: {
      all: 'Alle Zustände',
      attention: 'Alarm oder schlechter',
      unrated: 'Nicht analysiert',
    },
    sortLabel: 'Sortierung',
    sort: {
      recent: 'Neueste zuerst',
      severity: 'Höchste Schwingung',
      name: 'Name (A–Z)',
    },
    columns: {
      spectrum: 'Spektrum',
      project: 'Projekt',
      machine: 'Maschine',
      condition: 'Zustand',
      added: 'Hinzugefügt',
    },
    notAnalysed: 'Nicht analysiert',
    deleteLabel: '{name} löschen',
    deleteTitle: 'Projekt löschen',
    deleteConfirm: '„{name}“ löschen? Die Messung und ihre Analysen werden endgültig entfernt.',
    noMatch: 'Keine Projekte entsprechen diesen Filtern.',
    empty: {
      title: 'Beginnen Sie mit einer Messung',
      body: 'Laden Sie einen {odx}-Export aus VIBXPERT / Omnitrend hoch. Die Maschine wird anhand ihres Profils aus der Datei erkannt, und die Messung öffnet sich als 3D-Wasserfall – sofort bewertet.',
      action: '.odx hochladen',
    },
  },

  upload: {
    title: 'Neue Analyse',
    intro:
      'Laden Sie einen {odx}-Export aus VIBXPERT / Omnitrend hoch. Die Maschine wird anhand ihres Profils aus der Datei erkannt, und die Analyse startet, sobald die Messung geöffnet ist.',
    drop: '.odx-Datei hier ablegen oder auswählen',
    limit: 'Bis {max_mb} MB',
    chosen: '{size} MB · zum Ersetzen eine andere Datei wählen oder ablegen',
    wrongType: 'Wählen Sie einen .odx-Export (VIBXPERT / Omnitrend).',
    name: 'Projektname',
    namePlaceholder: 'Leer lassen, um den Dateinamen zu übernehmen',
    progress: 'Wird hochgeladen… {percent} %',
    reading: 'Datei wird gelesen…',
    submit: 'Hochladen und analysieren',
    submitting: 'Wird hochgeladen…',
    machine: 'Maschine',
    machineAuto: 'Aus der Datei erkennen',
    machineHint:
      'Ein Profil, dessen Erkennungsmuster im Pfad oder Namen der Datei vorkommen, wird von selbst gewählt; ohne passendes Profil gilt das allgemeine.',
    manageMachines: 'Maschinenprofile',
  },

  machines: {
    title: 'Maschinen',
    intro:
      'Was die Analyse über jede Maschine weiß: ihren Antriebsstrang als Parameter und Drehzahlformeln, ihre Betriebspunkte, Strukturmoden und bekannten Resonanzbereiche. Profile sind Ihre Daten und bleiben in Ihrem Konto.',
    import: 'Importieren…',
    importing: 'Wird importiert…',
    importHint:
      'Importieren Sie eine Drehzahl-Arbeitsmappe (.xlsx, ein Profil je Maschinenblatt) oder eine hier exportierte Profildatei (.json).',
    new: 'Neues Profil',
    fromTemplate: 'Mit einer Vorlage beginnen',
    fromTemplateHint:
      'Die Formeln des Antriebsstrangs mit Beispielwerten; tragen Sie im Editor die Werte Ihrer Maschine ein.',
    builtin: 'Eingebaut',
    components: { one: '{count} Komponente', other: '{count} Komponenten' },
    projects: { one: 'von {count} Projekt genutzt', other: 'von {count} Projekten genutzt' },
    recognises: 'Erkennt Dateien mit {patterns}',
    duplicate: '{name} duplizieren',
    export: '{name} als JSON exportieren',
    delete: '{name} löschen',
    deleteConfirm: 'Das Profil „{name}“ löschen?',
    deleteConfirmUsed: {
      one: 'Das Profil „{name}“ löschen? {count} Projekt nutzt es und fällt auf das allgemeine Profil zurück.',
      other:
        'Das Profil „{name}“ löschen? {count} Projekte nutzen es und fallen auf das allgemeine Profil zurück.',
    },
    copyName: '{name} (Kopie)',
    imported: { one: '{count} Profil importiert', other: '{count} Profile importiert' },
    importedFrom: 'aus {source}',
    assigned: {
      one: 'jetzt von {count} erkannten Projekt genutzt',
      other: 'jetzt von {count} erkannten Projekten genutzt',
    },
    importedCheck:
      'Öffnen Sie ein Profil, um seine Drehzahlen mit dem Blatt abzugleichen und zu ergänzen, was ein Blatt nicht enthält: Strukturmoden, den Trommeldurchmesser, Erkennungsmuster.',
  },

  profile: {
    notFoundTitle: 'Profil nicht gefunden',
    notFoundText: 'Es wurde möglicherweise gelöscht oder gehört zu einem anderen Konto.',
    builtinNote: 'Eingebaut und schreibgeschützt. Duplizieren Sie es für ein eigenes.',
    unsaved: 'Ungespeicherte Änderungen',
    saved: 'Alle Änderungen gespeichert',
    export: 'Als JSON exportieren',
    duplicate: 'Duplizieren',
    delete: 'Profil löschen',
    revert: 'Verwerfen',
    problems: {
      one: 'Das Profil lässt sich noch nicht speichern: {count} Problem',
      other: 'Das Profil lässt sich noch nicht speichern: {count} Probleme',
    },
    general: 'Allgemein',
    generalHint:
      'Wie das Profil heißt und erkannt wird. Der Trommeldurchmesser bestimmt die Grenzwertklasse der Bewertung.',
    name: 'Name',
    machineType: 'Maschinenart',
    machineTypePlaceholder: 'z. B. Dekanterzentrifuge',
    bowlDiameter: 'Trommeldurchmesser (mm)',
    bowlDiameterHint: 'Ein Projekt kann einen eigenen setzen; leer = strengste Klasse.',
    patterns: 'Erkennungsmuster',
    patternsHint:
      'Text im Pfad oder Dateinamen eines Exports, der diese Maschine kennzeichnet, durch Kommas getrennt. Der längste Treffer gewinnt.',
    description: 'Beschreibung',
    parameters: 'Parameter',
    parametersHint:
      'Benannte Werte, die die Formeln nutzen: Übersetzungen, Scheibendurchmesser, Riemenlängen. Markieren Sie, was sich zwischen Messungen ändert (Differenzdrehzahl, Netzfrequenz), als „je Lauf“: ein Projekt bietet es zum Überschreiben an.',
    key: 'Name in Formeln',
    label: 'Bezeichnung',
    value: 'Wert',
    unit: 'Einheit',
    runSpecific: 'Je Lauf',
    runSpecificLabel: '{name} ändert sich zwischen Messungen',
    remove: '{name} entfernen',
    addParameter: 'Parameter hinzufügen',
    newParameter: 'Neuer Parameter',
    components: 'Komponenten',
    componentsHint:
      'Die Teile, die Schwingungen anregen, jedes mit seiner Drehzahl als Formel. Die Ordnung k einer Komponente schwingt mit k × Drehzahl / 60 Hz; Linien, die die Messung nicht trennen kann, werden als eine gezeichnet.',
    kind: 'Art',
    kinds: {
      shaft: 'Welle',
      belt: 'Riemen',
      gear_mesh: 'Zahneingriff',
      electrical: 'Elektrisch',
      other: 'Sonstige',
    },
    formula: 'Drehzahl (U/min)',
    formulaFor: 'Drehzahlformel von {name}',
    maxOrder: 'Bis Ordnung',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    addComponent: 'Komponente hinzufügen',
    newComponent: 'Neue Komponente',
    formulaHelpTitle: 'So funktionieren Formeln',
    formulaHelpN:
      'n ist die Trommeldrehzahl in U/min – die Drehzahl, die ein Export zu jedem Spektrum aufzeichnet.',
    formulaHelpNames:
      'Verwenden Sie die Parameter und die weiter oben angelegten Komponenten über ihre Namen (z. B. 2 * belt).',
    formulaHelpOps:
      'Zahlen, + − × / ** und Klammern, pi, abs(), sign(), min(), max(), sqrt(). Sonst wird nichts ausgeführt, ein weitergegebenes Profil ist also sicher zu importieren.',
    formulaHelpOrders:
      'Eine negative Drehzahl ist eine Drehrichtung; die Schwingung sieht nur ihren Betrag, −363 und 363 U/min ergeben dieselben Linien.',
    formulaHelpKinds:
      'Elektrische Komponenten (das Netz) folgen nicht der Drehzahl: Sie werden gestrichelt gezeichnet und bei der Resonanzsuche ausgelassen.',
    points: 'Betriebspunkte und Abgleich',
    pointsHint:
      'Drehzahlen, für die die Maschine ausgelegt ist, mit den Werten der Parameter je Lauf dort. Die Drehzahl jeder Komponente wird an jedem Punkt berechnet und neben die eines Inbetriebnahmeblatts gestellt.',
    component: 'Komponente',
    pointLabel: 'Name des Betriebspunkts',
    bowlRpm: 'Trommel U/min',
    sheet: 'Blatt',
    sheetFor: 'Drehzahl laut Blatt für {name} bei {point}',
    differs: 'weicht um {delta} U/min ab',
    matches: 'stimmt mit dem Blatt überein',
    pointsNote:
      'Drehrichtungen werden nicht verglichen: Ein Blatt nennt oft nur Beträge. Wo Formel und Blatt abweichen, prüfen Sie beide: auch das Blatt kann irren.',
    addPoint: 'Betriebspunkt hinzufügen',
    newPoint: 'Nennbetrieb',
    modes: 'Strukturmoden',
    modesHint:
      'Eigenfrequenzen aus FE-Studien oder Versuchen. Der Wasserfall zeigt sie, und die Analyse meldet, wo die Trommel sie kreuzt.',
    modeName: 'Name',
    frequency: 'Frequenz (Hz)',
    source: 'Quelle',
    addMode: 'Strukturmode hinzufügen',
    newMode: 'Rigid-body mode, vertical',
    newModeSource: 'FE-Modalanalyse',
    zones: 'Bekannte Resonanzbereiche',
    zonesHint:
      'Frequenzbereiche, die Schwingungen bekanntermaßen verstärken; jede Messung dieser Maschine zeigt sie.',
    from: 'Von (Hz)',
    to: 'Bis (Hz)',
    addZone: 'Bereich hinzufügen',
    newZone: 'Resonanzbereich',
  },

  settings: {
    intro: 'Legen Sie fest, wie CentriMinds für Sie aussieht und arbeitet.',
    savedToAccount:
      'Änderungen werden in Ihrem Konto gespeichert und gelten auf allen Ihren Geräten.',
    profile: {
      title: 'Profil',
      description: 'Ihr Name, wie er im Kontomenü erscheint.',
      name: 'Name',
      email: 'E-Mail-Adresse',
      emailHint: 'Mit dieser Adresse melden Sie sich an. Sie kann hier nicht geändert werden.',
    },
    appearance: {
      title: 'Darstellung',
      description: 'Dunkel oder hell – oder so, wie Ihr Gerät eingestellt ist.',
      dark: 'Dunkel',
      light: 'Hell',
      system: 'System',
      systemHint: 'Folgt Ihrem Gerät',
    },
    language: {
      title: 'Sprache',
      description: 'Die Sprache von Menüs, Beschriftungen und Meldungen.',
      auto: 'Automatisch ({language})',
      autoHint: 'Folgt Ihrem Browser',
    },
    view: {
      title: '3D-Ansicht',
      description: 'Voreinstellungen für die 3D-Ansicht. Sie gelten, wenn Sie ein Projekt öffnen.',
      autoRotate: 'Automatisch drehen, wenn unbenutzt',
      autoRotateHint:
        'Die Ansicht dreht sich langsam, solange Sie sie nicht bedienen. Standardmäßig aus, wenn Ihr Gerät weniger Bewegung wünscht.',
      defaultView: 'Standardansicht',
      defaultViewHint: 'Wie ein Projekt geöffnet wird: perspektivisch oder von oben.',
      view3d: '3D',
      viewTop: 'Draufsicht',
      scale: 'Amplitudenskalierung',
      scaleHint: 'Logarithmisch macht kleine Spitzen neben großen sichtbar.',
      linear: 'Linear',
      log: 'Logarithmisch',
      spread: 'Farbverteilung',
      spreadHint:
        'Bei linearer Skalierung: Gleichmäßig färbt proportional zur Amplitude; Ausgewogen und Detail färben logarithmisch, sodass kleine Wellen und ihre Spitzen sichtbar werden, während die Höhen maßstabsgetreu bleiben.',
      spreadEven: 'Gleichmäßig',
      spreadBalanced: 'Ausgewogen',
      spreadDetail: 'Detail',
      colormap: 'Oberflächenfarben',
      colormapHint:
        'Farbschema des Wasserfalldiagramms und der Projektvorschauen. Jedes gibt es dunkel und hell: Ruhige Bereiche treten in den Hintergrund, Spitzen heben sich ab.',
    },
    security: {
      title: 'Sicherheit',
      description:
        'Ändern Sie das Passwort, mit dem Sie sich anmelden. Auf Ihren anderen Geräten werden Sie dabei abgemeldet.',
      current: 'Aktuelles Passwort',
      new: 'Neues Passwort',
      confirm: 'Neues Passwort bestätigen',
      submit: 'Passwort ändern',
      submitting: 'Passwort wird geändert…',
      changed: 'Ihr Passwort wurde geändert. Auf Ihren anderen Geräten sind Sie jetzt abgemeldet.',
    },
    sessions: {
      title: 'Sitzungen',
      description:
        'Auf einem gemeinsam genutzten oder verlorenen Gerät angemeldet? Melden Sie sich überall ab, um alle Ihre Sitzungen zu beenden, auch diese.',
      submit: 'Überall abmelden',
      submitting: 'Abmeldung läuft…',
    },
  },
};
