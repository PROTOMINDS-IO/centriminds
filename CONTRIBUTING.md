# Contributing

## Running it

Docker with Compose v2 is all you need. Clone
https://github.com/protominds-io/centriminds and, from the repository root:

```bash
make up        # build and start → http://localhost:3000
make down      # stop (data stays in the centriminds_data volume)
make logs      # follow the logs
make           # list every target
```

`make up` rebuilds the images, so run it again after a change. For hot
reload while working on the UI, run `make dev`: the Vite dev server in a
container on http://localhost:5173, forwarding `/api` to the stack's
backend (Compose starts that too if it is not running). Without Docker, `npm ci && npm run dev` in `frontend/`
(Node 24) forwards `/api` to `http://localhost:8000` instead; start the API
there with `uv run uvicorn app.main:app --reload` in `backend/` (Python 3.14
and uv), and its interactive documentation is at http://localhost:8000/docs.
`make dev` keeps its own `node_modules` in a volume; the one in `frontend/`
belongs to whichever side installed it last (the Docker checks install the
Linux build), so run `npm ci` before switching to the host's Node.

Measurement files and machine data are customer data and not part of the
repository — no machine's numbers belong in the code either: they live in
machine profiles, in the database. The backend tests generate synthetic
`.odx` files and workbooks with made-up numbers (`backend/tests/conftest.py`,
`test_machine_speeds_xlsx.py`). Two targets run the tests that need real
data, each with its folder mounted read-only:

```bash
make check-samples ODX_SAMPLE_DIR=/path/to/samples
make check-reference REFERENCE_DIR=/path/to/data
```

The first runs the parser tests for real exports
(`backend/tests/test_odx_parser.py`; the folder holds the sample `.odx`
files they name), which are skipped otherwise. The second checks the
analysis against real commissioning data: a folder with a machine speeds
workbook and the `.odx` sweeps of its machines
(`backend/tests/test_reference_data.py`).

## Checks

```bash
make check     # the code checks CI runs: ruff, pytest, tsc, ESLint, knip, Prettier, Vitest, build
make format    # apply ruff and Prettier formatting
make secrets   # scan every commit for secrets, as CI does (gitleaks)
```

`make secrets` also works from a linked worktree, and it fails when gitleaks
could not read the whole history instead of reporting no leaks.

CI (`.github/workflows/ci.yml`) also lints the CloudFormation template and
the shell scripts, runs `make secrets` and smoke-tests the Docker images. It
must be green before a pull request is merged.

## Branches, commits and pull requests

- Branch from `main` (`feature/…`, `fix/…`, `chore/…`, `docs/…`).
- Write commit subjects as conventional commits, with a scope where it
  helps: `feat(frontend): …`, `fix(backend): …`, `docs: …`; mark breaking
  changes with `!`. Explain the why in the body.
- Pull requests are rebased onto `main`, which keeps the history linear.
  The pull request template asks for the what, the why and a short
  checklist; bugs and feature ideas start from the issue forms.

## Conventions

The README's [conventions](README.md#project-layout--where-to-add-things)
cover the API, UI building blocks, colours, text, errors, the 3D view and
tests. In addition:

- **Comments** explain why and give the context a reader needs, not what
  the next line does. Each module starts with a short header saying what it
  is for. Prose is British English (colour, behaviour); identifiers follow
  the libraries (`color`).
- **Database changes** go into a new migration. The schema starts from one
  migration, `0001_initial_schema.py`; the next change becomes `0002`: run
  `uv run alembic revision --rev-id 0002 -m "what changes"` in `backend/`,
  write both `upgrade()` and `downgrade()`, change `app/models.py` to
  match, then `make format`. Migrations run when the API starts.
  `backend/tests/test_migrations.py` upgrades a fresh database to head
  (update the revision it expects) and compares the migrated schema with
  the models (Alembic's `compare_metadata`), so a model change without its
  migration, or the other way round, fails the tests. A migration that
  changes data gets a test of its own there.
- **Settings** a user can change live in `user.settings`: add the field to
  `UserSettings` and `UserSettingsUpdate` (`backend/app/schemas.py`) and to
  `api/types.ts`, then its default to `DEFAULT_SETTINGS`
  (`frontend/src/store/settingsStore.ts`); stored accounts pick up the
  default without a migration.
- **German texts** are typed against the English ones and use the formal
  "Sie"; have a native speaker read new or changed wording.
- **Unused code** is deleted, not commented out; knip fails the frontend
  check on unused files, exports and dependencies.
- **Dependencies** are updated by Dependabot every week (`.github/dependabot.yml`).
  Node and Python are upgraded by hand, in all places at once:
  - Node: `frontend/Dockerfile`, the `vite` service in `docker-compose.yml`,
    `node-version` in `.github/workflows/ci.yml`, `NODE` in the `Makefile`,
    and `@types/node` and `engines` in `frontend/package.json`;
  - Python: `backend/Dockerfile`, `python-version` in
    `.github/workflows/ci.yml`, every `python:` image in the `Makefile`,
    and `requires-python` and ruff's `target-version` in
    `backend/pyproject.toml`;
  - then the versions this file and the README name.

  uv is pinned the same way, in `backend/Dockerfile`, the `Makefile`,
  `.github/workflows/ci.yml` and `required-version` in
  `backend/pyproject.toml`.
- **Secrets** never go into the repository: `.env` files are ignored and CI
  runs gitleaks on every commit. Fake credentials in tests that gitleaks
  flags should follow the allowlisted patterns in `.gitleaks.toml`.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems are reported privately; see [SECURITY.md](SECURITY.md).
