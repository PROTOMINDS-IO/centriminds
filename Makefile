# Everyday commands. Everything runs in Docker, so the host needs nothing
# but Docker (no local Python or Node toolchains).
.PHONY: help up down logs dev check check-backend check-frontend check-reference check-samples format secrets
.DEFAULT_GOAL := help

# One-off containers on the mounted source tree. The backend venv is built
# inside the container (/tmp/venv), so no Linux venv lands in backend/.venv
# on the host. Keep the uv pin in step with backend/Dockerfile.
PY  = docker run --rm -v "$(CURDIR)/backend:/app" -w /app -e UV_PROJECT_ENVIRONMENT=/tmp/venv python:3.14-slim sh -c
UV  = pip install -q --root-user-action=ignore uv==0.12.22 && uv sync --frozen -q
NODE = docker run --rm -v "$(CURDIR)/frontend:/app" -w /app node:24-alpine sh -c
# Pinned by digest; CI runs `make secrets` too. Update it by hand (Dependabot
# does not see it) and keep SCAN in step with its log format.
GITLEAKS = ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
# gitleaks only logs git's errors: it stops reading the history at the first
# one, yet still reports "no leaks found" and exits 0 (a worktree once passed
# like that after reading 0 commits). So the scan also fails when git
# complained ("[git]" in the log) or no commit was read.
SCAN = set -o pipefail; \
  gitleaks git . --config .gitleaks.toml --redact --no-banner --verbose 2>&1 | tee /tmp/scan.log || exit; \
  if grep -q '\[git\]' /tmp/scan.log || ! grep -Eq '(^|[^0-9])[1-9][0-9]* commits scanned' /tmp/scan.log; then \
    echo 'make secrets: gitleaks did not read the whole history (see above); failing instead of reporting no leaks' >&2; exit 1; \
  fi

help:          ## list the targets (this text)
	@awk 'BEGIN { FS = ":.*## " } /^[a-z-]+:.*## / { printf "  %-16s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

up:            ## build and start the app on http://localhost:3000
	docker compose up -d --build --wait

down:          ## stop the app (data stays in the named volume)
	docker compose down

logs:          ## follow the stack's logs
	docker compose logs -f

dev:           ## hot-reloading UI on http://localhost:5173 (Vite, with the stack's API)
	docker compose --profile dev up vite

check: check-backend check-frontend   ## the code checks CI runs, locally

check-backend: ## ruff and pytest (in Docker)
	$(PY) "$(UV) && uv run ruff check . && uv run ruff format --check . && uv run pytest"

check-frontend: ## tsc, ESLint, knip, Prettier, Vitest and the build (in Docker)
	$(NODE) "npm ci --no-audit --no-fund && npm run check && npm run build"

# Checks against real commissioning data, which stays outside the repository:
# REFERENCE_DIR holds a machine speeds workbook and the .odx sweeps it covers
# (tests/test_reference_data.py). Mounted read-only.
check-reference: ## analysis checks on real data: REFERENCE_DIR=/path/to/data
	@test -n "$(REFERENCE_DIR)" || { echo "usage: make check-reference REFERENCE_DIR=/path/to/data" >&2; exit 2; }
	docker run --rm -v "$(CURDIR)/backend:/app" -v "$(abspath $(REFERENCE_DIR)):/reference:ro" \
		-e REFERENCE_DIR=/reference -w /app -e UV_PROJECT_ENVIRONMENT=/tmp/venv python:3.14-slim \
		sh -c "$(UV) && uv run pytest -q tests/test_reference_data.py"

# The parser tests for real .odx exports (tests/test_odx_parser.py), which
# are skipped without them: ODX_SAMPLE_DIR is a folder holding the sample
# files those tests name. Mounted read-only, like REFERENCE_DIR.
check-samples: ## parser tests on real .odx exports: ODX_SAMPLE_DIR=/path/to/samples
	@test -n "$(ODX_SAMPLE_DIR)" || { echo "usage: make check-samples ODX_SAMPLE_DIR=/path/to/samples" >&2; exit 2; }
	docker run --rm -v "$(CURDIR)/backend:/app" -v "$(abspath $(ODX_SAMPLE_DIR)):/samples:ro" \
		-e ODX_SAMPLE_DIR=/samples -w /app -e UV_PROJECT_ENVIRONMENT=/tmp/venv python:3.14-slim \
		sh -c "$(UV) && uv run pytest -q -rs tests/test_odx_parser.py"

format:        ## apply ruff and prettier formatting
	$(PY) "$(UV) && uv run ruff check --fix . && uv run ruff format ."
	$(NODE) "npm ci --no-audit --no-fund && npx prettier --write ."

# In a linked worktree (git worktree) .git is a file pointing into the main
# checkout's .git, outside the mounted directory, so git on the host finds
# that repository directory and it is mounted as well. Both keep their host
# paths, so the pointer resolves in the container as it does outside. A
# plain checkout has its .git inside the first mount already.
secrets:       ## scan every commit for secrets (gitleaks, .gitleaks.toml)
	@git_dir="$$(git rev-parse --path-format=absolute --git-common-dir)" || exit; \
	case "$$git_dir" in "$(CURDIR)"/*) set -- ;; *) set -- -v "$$git_dir:$$git_dir:ro" ;; esac; \
	docker run --rm -v "$(CURDIR):$(CURDIR):ro" "$$@" -w "$(CURDIR)" \
		--entrypoint sh $(GITLEAKS) -c "$(SCAN)"
