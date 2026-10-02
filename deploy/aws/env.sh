# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are used by the scripts that source this
# Shared settings for the deploy/aws scripts. Everything comes from the
# environment; the defaults are protominds' own deployment, so a deployment
# of your own sets at least DOMAIN (and usually AWS_PROFILE and STACK):
#
#   AWS_PROFILE  AWS CLI profile (default: centriminds). Set it empty
#                (AWS_PROFILE=) to use the CLI's default credential chain,
#                e.g. AWS_ACCESS_KEY_ID or SSO in the environment.
#   AWS_REGION   region of the stack (default: eu-central-1)
#   STACK        CloudFormation stack name, also the prefix of its bucket
#                names (default: centriminds)
#   DOMAIN       apex domain the app is served on; www.<domain> redirects
#                to it (default: centriminds.de). provision.sh passes it to
#                the stack; the other scripts read it back from there.
#
# Per script (see each script's header):
#   provision.sh  ALERT_EMAIL, INSTANCE_TYPE, BACKUP_RETENTION_DAYS,
#                 REFRESH_AMI=1, SKIP_BACKUP=1, GITHUB_REPO,
#                 GITHUB_OIDC_PROVIDER_ARN, MONTHLY_BUDGET_USD
#   deploy.sh     REGISTRATION_EMAILS, DEMO_EMAIL, SKIP_PREDEPLOY_BACKUP=1
#   demo-seed.sh  (an account's email as its argument)
#   teardown.sh   SKIP_BACKUP=1
#   ../hostinger/set-dns.sh  HOSTINGER_API_TOKEN (optional DNS helper)
PROFILE="${AWS_PROFILE-centriminds}"
REGION="${AWS_REGION:-eu-central-1}"
STACK="${STACK:-centriminds}"
DOMAIN="${DOMAIN:-centriminds.de}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Scripts must never block in `less` on table output.
export AWS_PAGER=""

awsx() { aws ${PROFILE:+--profile "$PROFILE"} --region "$REGION" "$@"; }

# Read one CloudFormation output of $STACK; empty if the stack or the output
# is missing (the CLI prints "None" while the stack has no outputs at all).
out() {
  local value
  value="$(awsx cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || true)"
  [[ "$value" == None ]] || printf '%s\n' "$value"
}

# An output the script cannot do without: print it, or explain and fail.
#   BUCKET="$(require_out DeployBucket)"   # exits the script under set -e
require_out() {
  local value
  value="$(out "$1")"
  if [[ -z "$value" ]]; then
    echo "Stack $STACK ($REGION) has no $1 output: run ./deploy/aws/provision.sh first." >&2
    return 1
  fi
  printf '%s\n' "$value"
}

# Guard a destructive step: the operator types the stack name, anything
# else aborts the script before it has changed anything.
#   confirm_stack "to delete it"   # -> Type the stack name (<stack>) to delete it:
confirm_stack() {
  local reply
  read -r -p "Type the stack name ($STACK) $1: " reply
  [[ "$reply" == "$STACK" ]] || { echo "Aborted; nothing changed." >&2; exit 1; }
}
