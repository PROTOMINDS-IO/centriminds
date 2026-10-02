#!/usr/bin/env bash
# Add the demo machine and its analysed sample sweeps (app/demo.py) to one
# existing account, e.g. a client's after they signed up, so they do not
# start on an empty dashboard. A second run changes nothing; the account's
# own projects are never touched.
#
#   ./deploy/aws/demo-seed.sh client@example.com
set -euo pipefail
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/ssm.sh"
# shellcheck source=names.sh
source "$(dirname "$0")/names.sh"   # BACKEND_CONTAINER

EMAIL="${1:?usage: demo-seed.sh <email of an existing account>}"
# It goes into the SSM command line below: a plain address only.
[[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] \
  || { echo "'$EMAIL' is not an email address" >&2; exit 1; }

echo "==> Seeding demo data for $EMAIL"
ssm_run "centriminds demo seed" \
  "docker exec $BACKEND_CONTAINER python -m app.demo seed --email $EMAIL"
