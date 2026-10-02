#!/usr/bin/env bash
# Runs ON the instance (invoked by deploy.sh via SSM) from /opt/centriminds.
#
#   bash src/deploy/aws/remote-deploy.sh <domain> <stack> <backup-bucket> <region>
#
# /opt/centriminds/.env is the source of truth for secrets and survives
# redeploys: JWT_SECRET is generated once (so sessions stay valid), and keys
# you add by hand are preserved. DOMAIN, CORS_ORIGINS and APP_ENV are
# re-derived on every deploy. Sign-up starts closed; REGISTRATION_EMAILS from
# deploy.sh (the addresses that may sign up, or "none") changes it, and
# DEMO_EMAIL (the shared demo login, or "none") likewise.
#
# Before rebuilding, the current data is backed up to S3 (pre-deploy/), so a
# bad migration can always be rolled back with restore.sh. The deploy stops
# if that backup fails (override: SKIP_PREDEPLOY_BACKUP=1).
set -euo pipefail
DOMAIN="${1:?usage: remote-deploy.sh <domain> <stack> <backup-bucket> <region>}"
STACK="${2:?stack}"
BACKUP_BUCKET="${3:?backup bucket}"
REGION="${4:?region}"
ROOT=/opt/centriminds
SRC="$ROOT/src/deploy/aws"
ENV_FILE="$ROOT/.env"
# shellcheck source=names.sh
source "$SRC/names.sh"   # DATA_VOLUME and the other on-instance names

# ── Secrets and environment ────────────────────────────────────────────
touch "$ENV_FILE" && chmod 600 "$ENV_FILE"
grep -q '^JWT_SECRET=' "$ENV_FILE" || echo "JWT_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE"
grep -q '^ALLOW_REGISTRATION=' "$ENV_FILE" || echo "ALLOW_REGISTRATION=false" >> "$ENV_FILE"
if [[ -n "${REGISTRATION_EMAILS:-}" ]]; then
  sed -i '/^ALLOW_REGISTRATION=/d;/^REGISTRATION_EMAILS=/d' "$ENV_FILE"
  if [[ "$REGISTRATION_EMAILS" == none ]]; then
    echo "ALLOW_REGISTRATION=false" >> "$ENV_FILE"
  else
    printf 'ALLOW_REGISTRATION=true\nREGISTRATION_EMAILS=%s\n' "$REGISTRATION_EMAILS" >> "$ENV_FILE"
  fi
fi
# The app refuses to start with sign-up open to anyone (app/config.py): stop
# here, before the running stack is replaced. "Open" is every spelling of
# true that pydantic accepts.
if grep -qiE '^ALLOW_REGISTRATION=["'"'"']?(1|on|t|true|y|yes)["'"'"']?[[:space:]]*$' "$ENV_FILE" \
  && ! grep -q '^REGISTRATION_EMAILS=.*@' "$ENV_FILE"; then
  echo "!! $ENV_FILE opens sign-up to anyone; redeploy with REGISTRATION_EMAILS=<addresses> or =none" >&2
  exit 1
fi
# The shared demo login (app/demo.py): DEMO_EMAIL from deploy.sh sets it,
# "none" removes it; the instance keeps it until it is changed.
if [[ -n "${DEMO_EMAIL:-}" ]]; then
  sed -i '/^DEMO_EMAIL=/d' "$ENV_FILE"
  [[ "$DEMO_EMAIL" == none ]] || echo "DEMO_EMAIL=$DEMO_EMAIL" >> "$ENV_FILE"
fi
sed -i '/^DOMAIN=/d;/^CORS_ORIGINS=/d;/^APP_ENV=/d' "$ENV_FILE"
printf 'DOMAIN=%s\nCORS_ORIGINS=https://%s,https://www.%s\nAPP_ENV=production\n' \
  "$DOMAIN" "$DOMAIN" "$DOMAIN" >> "$ENV_FILE"

# ── Backups: script, config, timers ────────────────────────────────────
printf 'BACKUP_BUCKET=%s\nSTACK=%s\nAWS_REGION=%s\n' "$BACKUP_BUCKET" "$STACK" "$REGION" > "$ROOT/backup.env"
install -m 0644 "$SRC/names.sh" "$ROOT/names.sh"
install -m 0755 "$SRC/backup.sh" /usr/local/bin/centriminds-backup
install -m 0644 "$SRC"/systemd/centriminds-{backup,demo-reset}*.{service,timer} /etc/systemd/system/
mkdir -p /var/lib/centriminds
# Until the first backup exists, the reported backup age counts from here.
[[ -f /var/lib/centriminds/installed-at ]] || date -u +%s > /var/lib/centriminds/installed-at
systemctl daemon-reload
systemctl enable --now centriminds-backup.timer centriminds-backup-report.timer
# The nightly demo reset runs only while a demo account is configured.
if grep -q '^DEMO_EMAIL=.' "$ENV_FILE"; then
  systemctl enable --now centriminds-demo-reset.timer
else
  systemctl disable --now centriminds-demo-reset.timer 2> /dev/null || true
fi

# Whenever data exists, even if the running app is failing: the backup reads
# the volume through a one-off container of the current (pre-deploy) image.
if docker volume inspect "$DATA_VOLUME" > /dev/null 2>&1; then
  if [[ "${SKIP_PREDEPLOY_BACKUP:-0}" == 1 ]]; then
    echo "!! skipping the pre-deploy backup (SKIP_PREDEPLOY_BACKUP=1)"
  else
    echo "==> Pre-deploy backup"
    centriminds-backup run pre-deploy
  fi
fi

# ── Build and start ────────────────────────────────────────────────────
# Compose builds through buildx (0.17 or later), which Amazon Linux's docker
# package does not ship. The release binary is pinned and checked against
# its published SHA-256 (the release's checksums.txt), like Compose in the
# instance's user data. Bump both together.
BUILDX_VERSION=v0.37.2
BUILDX_SHA256=982ca20490b45ed1ec8d99795974d3d874a358f75938c9c237305010e6b7e548
BUILDX=/usr/local/lib/docker/cli-plugins/docker-buildx
if ! "$BUILDX" version 2> /dev/null | grep -q " $BUILDX_VERSION "; then
  echo "==> Installing buildx $BUILDX_VERSION"
  curl -fsSL "https://github.com/docker/buildx/releases/download/$BUILDX_VERSION/buildx-$BUILDX_VERSION.linux-amd64" \
    -o /tmp/docker-buildx
  echo "$BUILDX_SHA256  /tmp/docker-buildx" | sha256sum -c -
  install -D -m 0755 /tmp/docker-buildx "$BUILDX"
  rm -f /tmp/docker-buildx
fi

cd "$SRC"
docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans
docker image prune -f
docker compose --env-file "$ENV_FILE" ps
centriminds-backup report || true
