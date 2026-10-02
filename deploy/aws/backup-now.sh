#!/usr/bin/env bash
# Take a data backup right now (same as the weekly one), e.g. before risky
# changes or a teardown.
#
#   ./deploy/aws/backup-now.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/ssm.sh"
echo "==> Backing up $STACK"
ssm_run "centriminds backup" "centriminds-backup run weekly"
