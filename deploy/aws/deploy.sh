#!/usr/bin/env bash
# Ship the current source to the CentriMinds instance and (re)build it.
#
#   ./deploy/aws/deploy.sh
#   SKIP_PREDEPLOY_BACKUP=1 ./deploy/aws/deploy.sh   # e.g. when the backup itself fails
#   REGISTRATION_EMAILS=you@example.com,colleague@example.com ./deploy/aws/deploy.sh
#   REGISTRATION_EMAILS=none ./deploy/aws/deploy.sh
#   DEMO_EMAIL=demo@example.com ./deploy/aws/deploy.sh      # shared demo login, reset nightly
#   DEMO_EMAIL=none ./deploy/aws/deploy.sh
#
# Sign-up is closed after the first deploy. REGISTRATION_EMAILS opens it to
# just those addresses (each signs up with a password of their own), and
# "none" closes it again; the instance keeps the setting until it is changed.
#
# Steps:
#   1. Tar what Git would commit into a bundle: tracked files and new ones
#      that are not ignored, as they are in the working tree (uncommitted
#      changes included). Ignored files never leave this machine.
#   2. Upload the bundle to the private deploy bucket (from stack outputs).
#   3. Via SSM, download + extract on the instance and run remote-deploy.sh,
#      which backs up existing data (pre-deploy/), then rebuilds and
#      restarts the containers. No SSH, no GitHub creds on the box.
set -euo pipefail
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/ssm.sh"

SKIP_PREDEPLOY_BACKUP="${SKIP_PREDEPLOY_BACKUP:-0}"
[[ "$SKIP_PREDEPLOY_BACKUP" =~ ^[01]$ ]] || { echo "SKIP_PREDEPLOY_BACKUP must be 0 or 1" >&2; exit 1; }
REGISTRATION_EMAILS="${REGISTRATION_EMAILS:-}"
DEMO_EMAIL="${DEMO_EMAIL:-}"
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
# Checked here, before anything is replaced: each item a plain address (it
# also goes into the SSM command line below, so nothing a shell would read).
if [[ -n "$REGISTRATION_EMAILS" && "$REGISTRATION_EMAILS" != none ]]; then
  IFS=, read -r -a _emails <<< "$REGISTRATION_EMAILS"
  [[ "$REGISTRATION_EMAILS" != *, ]] || _emails+=("")
  for _email in "${_emails[@]}"; do
    [[ "$_email" =~ $EMAIL_RE ]] \
      || { echo "REGISTRATION_EMAILS: '$_email' is not an email address (comma-separated, no spaces, or none)" >&2; exit 1; }
  done
fi
if [[ -n "$DEMO_EMAIL" && "$DEMO_EMAIL" != none && ! "$DEMO_EMAIL" =~ $EMAIL_RE ]]; then
  echo "DEMO_EMAIL: '$DEMO_EMAIL' is not an email address (or none)" >&2; exit 1
fi
INSTANCE_ID="$(require_out InstanceId)"
BUCKET="$(require_out DeployBucket)"
BACKUP_BUCKET="$(require_out BackupBucket)"
DOMAIN="$(require_out DomainName)"
echo "==> instance=$INSTANCE_ID bucket=$BUCKET backups=$BACKUP_BUCKET domain=$DOMAIN"

echo "==> Building source bundle"
# A directory of our own, so the bundle gets a fixed name inside it and the
# trap removes everything mktemp created.
BUNDLE_DIR="$(mktemp -d -t centriminds-src.XXXXXX)"
BUNDLE="$BUNDLE_DIR/src.tar.gz"
trap 'rm -rf "$BUNDLE_DIR"' EXIT
# The file list comes from Git, so what .gitignore covers (.env files, local
# settings, caches, node_modules, data, other worktrees) stays out; a file
# deleted but not yet committed is skipped. COPYFILE_DISABLE stops macOS
# bsdtar from embedding AppleDouble (._*) files, which carry null bytes and
# break Alembic's version-file loader on the box. --no-xattrs keeps extended
# attributes (e.g. com.apple.provenance) out as well: GNU tar on the box
# warns about each one, and the warnings crowd the SSM output, which is
# capped, so a real error at the end is cut off.
export COPYFILE_DISABLE=1
git -C "$REPO_DIR" ls-files -z --cached --others --exclude-standard \
  | while IFS= read -r -d '' f; do
      if [[ -e "$REPO_DIR/$f" ]]; then printf '%s\0' "$f"; fi
    done \
  | tar --no-xattrs -czf "$BUNDLE" -C "$REPO_DIR" --null -T -

echo "==> Uploading bundle to s3://$BUCKET/deploy/src.tar.gz"
awsx s3 cp "$BUNDLE" "s3://$BUCKET/deploy/src.tar.gz"

# The values below are stack outputs, env.sh settings and the inputs
# validated above, so the instance's shell reads them as plain words.
echo "==> Sending deploy command via SSM (Ctrl-C stops waiting; the build continues on the instance)"
ssm_run --progress "centriminds deploy" \
  "set -euxo pipefail" \
  "mkdir -p /opt/centriminds && cd /opt/centriminds" \
  "aws s3 cp s3://$BUCKET/deploy/src.tar.gz /tmp/src.tar.gz" \
  "rm -rf src && mkdir -p src && tar -xzf /tmp/src.tar.gz -C src" \
  "SKIP_PREDEPLOY_BACKUP=$SKIP_PREDEPLOY_BACKUP REGISTRATION_EMAILS=$REGISTRATION_EMAILS DEMO_EMAIL=$DEMO_EMAIL bash src/deploy/aws/remote-deploy.sh $DOMAIN $STACK $BACKUP_BUCKET $REGION"
echo "==> Done. https://$DOMAIN"
