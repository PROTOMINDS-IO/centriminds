#!/usr/bin/env bash
# Data backups on the instance (installed as /usr/local/bin/centriminds-backup).
#
#   centriminds-backup run [weekly|pre-deploy]   # archive -> s3://$BACKUP_BUCKET/<kind>/
#   centriminds-backup report                    # publish backup age and disk use to CloudWatch
#
# Only data is backed up: the SQLite database and the uploaded .odx files.
# A one-off container from the backend image reads the data volume
# (app/backup.py uses SQLite's online backup, so the snapshot is consistent
# while the app keeps running), so backups also work while the app is
# stopped or failing, e.g. right before a restore. The application is
# rebuilt from Git.
# Configuration: /opt/centriminds/backup.env and names.sh (both installed by
# remote-deploy.sh).
set -euo pipefail
# shellcheck source=/dev/null
source /opt/centriminds/backup.env   # BACKUP_BUCKET, STACK, AWS_REGION
STATE=/var/lib/centriminds
# shellcheck source=names.sh
source /opt/centriminds/names.sh     # DATA_VOLUME, BACKEND_IMAGE
mkdir -p "$STATE"
TMP_DIR=""
trap '[[ -n "$TMP_DIR" ]] && rm -rf "$TMP_DIR"' EXIT

run() {
  local kind="${1:-weekly}"
  case "$kind" in weekly|pre-deploy) ;; *) echo "unknown backup kind: $kind" >&2; exit 2 ;; esac
  docker volume inspect "$DATA_VOLUME" > /dev/null \
    || { echo "no data volume $DATA_VOLUME: is the app deployed?" >&2; exit 1; }
  local tmp name sha
  # On disk: /tmp on Amazon Linux 2023 is RAM (tmpfs, capped at half of it).
  tmp="$(mktemp -d -p /var/tmp centriminds-backup.XXXXXX)"
  TMP_DIR="$tmp"
  name="centriminds-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"

  docker run --rm --pull never --network none --user 1000 \
    -v "$DATA_VOLUME:/data" -e DATA_DIR=/data \
    "$BACKEND_IMAGE" python -m app.backup create --stdout > "$tmp/$name"
  # Refuse to upload an archive that does not check out: every checksum in
  # its manifest, and a database present (not an empty or wrong volume).
  docker run --rm -i --pull never --network none --user 1000 \
    "$BACKEND_IMAGE" python -m app.backup verify - < "$tmp/$name"
  sha="$(sha256sum "$tmp/$name" | cut -d' ' -f1)"

  aws s3 cp "$tmp/$name" "s3://$BACKUP_BUCKET/$kind/$name" \
    --region "$AWS_REGION" --only-show-errors \
    --checksum-algorithm SHA256 --metadata "sha256=$sha"
  date -u +%s > "$STATE/last-backup-success"
  echo "backup ok: s3://$BACKUP_BUCKET/$kind/$name ($(du -h "$tmp/$name" | cut -f1), sha256 $sha)"
  report
}

# Hours since the newest successful backup (since install if there is none
# yet). The BackupAgeAlarm fires above 8 days or when reports stop.
report() {
  local now last
  now="$(date -u +%s)"
  last="$(cat "$STATE/last-backup-success" 2>/dev/null || cat "$STATE/installed-at" 2>/dev/null || echo 0)"
  aws cloudwatch put-metric-data --region "$AWS_REGION" \
    --namespace CentriMinds --metric-name BackupAgeHours \
    --dimensions "Stack=$STACK" --unit None \
    --value "$(( (now - last) / 3600 ))"
  # The root volume holds the data, the images and the backup scratch space
  # (DiskUsageAlarm fires above 80 %).
  aws cloudwatch put-metric-data --region "$AWS_REGION" \
    --namespace CentriMinds --metric-name DiskUsedPercent \
    --dimensions "Stack=$STACK" --unit Percent \
    --value "$(df --output=pcent / | tail -1 | tr -dc '0-9')"
}

case "${1:-}" in
  run) run "${2:-weekly}" ;;
  report) report ;;
  *) echo "usage: centriminds-backup run [weekly|pre-deploy] | report" >&2; exit 2 ;;
esac
