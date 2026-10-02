#!/usr/bin/env bash
# List data backups, or restore one onto the running instance.
#
#   ./deploy/aws/restore.sh                                   # list backups
#   ./deploy/aws/restore.sh weekly/centriminds-<utc>.tar.gz   # restore it
#
# Restoring takes a safety backup of the current data, verifies the
# archive's checksums, stops the app, swaps in the backed-up database and
# uploads, and starts the app again. The data it replaces also stays on the
# volume (/data/.pre-restore-<utc>/), so a restore can itself be undone.
# It works while the app is failing (e.g. after a bad migration): the safety
# backup and the restore run in one-off containers, and a failed safety
# backup (a corrupt database, say) does not block the restore.
set -euo pipefail
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/ssm.sh"

BUCKET="$(require_out BackupBucket)"

if [[ $# -eq 0 ]]; then
  echo "==> Backups in s3://$BUCKET (newest last)"
  awsx s3 ls "s3://$BUCKET/" --recursive | grep '\.tar\.gz$' | sort
  exit 0
fi

KEY="$1"
[[ "$KEY" =~ ^(weekly|pre-deploy)/centriminds-[0-9TZ]+\.tar\.gz$ ]] || { echo "Unexpected backup key: $KEY" >&2; exit 1; }
awsx s3api head-object --bucket "$BUCKET" --key "$KEY" > /dev/null
confirm_stack "to replace ALL its data with $KEY"

# Runs on the instance. $KEY (validated above), $BUCKET (a stack output) and
# $REGION (env.sh) are expanded here; everything in single quotes is
# expanded there, including the names from names.sh (which deploy.sh
# installs, so its absence also means the app was never deployed).
# shellcheck disable=SC2016
ssm_run "centriminds restore" \
  'set -euo pipefail' \
  'not_deployed() { echo "The app is not deployed on this instance yet: run ./deploy/aws/deploy.sh first." >&2; exit 1; }' \
  '[[ -f /opt/centriminds/names.sh ]] || not_deployed' \
  'source /opt/centriminds/names.sh' \
  'docker image inspect "$BACKEND_IMAGE" > /dev/null || not_deployed' \
  'tmp="$(mktemp -d -p /var/tmp centriminds-restore.XXXXXX)"' \
  'cleanup() { rm -rf "$tmp"; docker start "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER" > /dev/null; }' \
  'trap cleanup EXIT' \
  'centriminds-backup run pre-deploy || echo "!! safety backup failed; restoring anyway (the current data stays under /data/.pre-restore-*)"' \
  "aws s3 cp s3://$BUCKET/$KEY \"\$tmp/restore.tar.gz\" --region $REGION --only-show-errors" \
  'docker run --rm -i --pull never --network none --user 1000 "$BACKEND_IMAGE" python -m app.backup verify - < "$tmp/restore.tar.gz"' \
  'docker stop "$FRONTEND_CONTAINER" "$BACKEND_CONTAINER"' \
  'docker run --rm --pull never --network none --user 1000 -v "$DATA_VOLUME:/data" -v "$tmp/restore.tar.gz:/restore.tar.gz:ro" -e DATA_DIR=/data "$BACKEND_IMAGE" python -m app.backup restore /restore.tar.gz --force' \
  "echo restored $KEY"
