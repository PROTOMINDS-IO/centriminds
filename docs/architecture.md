# Architecture

How CentriMinds is put together, below the overview in the
[README](../README.md#architecture).

## How a measurement flows through it

```mermaid
sequenceDiagram
    autonumber
    participant UI as Web app
    participant API as FastAPI
    participant FS as Uploads
    participant DB as SQLite

    UI->>API: POST /api/projects (.odx)
    API->>API: parse .odx, recognise the machine profile
    API->>FS: store <id>.odx (atomic write)
    API->>DB: Project row (shape, profile)
    UI->>API: GET /projects/{id}/spectrogram/preview
    API-->>UI: down-sampled matrix (peaks kept)
    UI->>API: POST /projects/{id}/analyze (when the inputs changed)
    API->>DB: AnalysisRun (results JSON) + auto annotations
    UI->>API: GET /projects/{id}/analyses?limit=1
    API-->>UI: order lines, zones, rating, peaks
    Note over UI: Waterfall3D draws the surface<br/>and the analysis layers
```

The workspace asks for an analysis whenever the run's input fingerprint
(profile, per-project parameters, pipeline version) differs from the latest
run's, so a profile edit shows up the next time the project opens.


## Data model

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    USER ||--o{ MACHINE_PROFILE : "owns (NULL = built in)"
    MACHINE_PROFILE |o--o{ PROJECT : "analysed with"
    PROJECT ||--o| MEASUREMENT_METADATA : has
    PROJECT ||--o{ ANNOTATION : "user + auto"
    PROJECT ||--o{ ANALYSIS_RUN : "newest few kept"

    USER { int id string email json settings int token_version }
    PROJECT { int id string name string odx_hash json machine_parameters float bowl_diameter_mm }
    MACHINE_PROFILE { int id string name json data string builtin_key }
    ANALYSIS_RUN { int id string version text params_json text results_json }
    ANNOTATION { int id string annotation_type string author float freq_hz float rpm }
```

The schema belongs to the Alembic migrations in `backend/alembic/versions/`,
applied when the API starts; a test checks that it matches the SQLAlchemy
models.


## In the browser

```mermaid
flowchart LR
    subgraph routes["pages/ (React Router)"]
        login["Login · Register"]
        dash["Dashboard · Upload"]
        mach["Machines · MachineProfile"]
        ws["Workspace<br/><i>lazy: carries three.js</i>"]
        set["Settings"]
    end
    queries["hooks/queries.ts<br/>TanStack Query"] --> client["api/client.ts<br/>typed fetch, ApiError"]
    stores["store/ (zustand)<br/>auth · settings · view state"]
    routes --> queries
    routes --> stores
    ws --> cards["workspace/<br/>AnalysisDock (left) · ViewCard (right)"]
    ws --> scene["waterfall/Waterfall3D<br/>model.ts → surface.ts → mesh,<br/>AnalysisLayers, CameraRig, Axes"]
    scene --> stores
    cards --> stores
```

`WaterfallModel` (`components/waterfall/model.ts`) is the one place that maps
frequency, speed and amplitude to scene coordinates; the surface, the
overlays, picking and the slice view all go through it.
