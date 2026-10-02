#!/usr/bin/env bash
# Create or update the CentriMinds stack (EC2 + EIP + S3 deploy, backup and
# access-log buckets + backup alarm).
#
#   ./deploy/aws/provision.sh
#   ALERT_EMAIL=ops@example.com ./deploy/aws/provision.sh   # backup alerts by email
#   INSTANCE_TYPE=t3.medium ./deploy/aws/provision.sh       # resize (stop/start, data kept)
#   BACKUP_RETENTION_DAYS=180 ./deploy/aws/provision.sh     # keep weekly backups 180 days
#   REFRESH_AMI=1 ./deploy/aws/provision.sh                 # newer Amazon Linux (replaces the instance)
#   GITHUB_REPO=owner/repo ./deploy/aws/provision.sh        # deploy role for GitHub Actions
#   MONTHLY_BUDGET_USD=40 ./deploy/aws/provision.sh         # cost alert to ALERT_EMAIL
#   OFF_HOURS=21-6 ./deploy/aws/provision.sh                # stop 21:00, start 06:00 daily ("none" = always on)
#   SCHEDULE_TZ=Europe/Berlin ./deploy/aws/provision.sh     # time zone of OFF_HOURS
#
# Every run goes through a change set. A change that would replace the
# instance (a new AMI, different volume settings) would also replace the
# disk that holds the database and uploads, so the script stops, asks for
# confirmation, backs the data up first (SKIP_BACKUP=1 skips that, e.g. when
# the app was never deployed) and prints the restore command. Unset settings
# keep their current values.
#
# After a teardown the stack can be created again: the retained backup and
# access-log buckets are found and reused, backups included.
#
# DOMAIN (deploy/aws/env.sh) is the domain the stack serves and is passed on
# every run. A run with another domain than the stack's asks first: env.sh
# falls back to protominds' domain when DOMAIN is unset.
#
# Then: point the A records of DOMAIN and www.DOMAIN at the printed IP at
# your DNS provider (for Hostinger, ./deploy/hostinger/set-dns.sh does it)
# and ship the code (./deploy/aws/deploy.sh).
set -euo pipefail
source "$(dirname "$0")/env.sh"

STATUS="$(awsx cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE)"
# REVIEW_IN_PROGRESS: a create change set was made but never executed, so
# the stack has no resources yet and is created again.
case "$STATUS" in
  NONE|REVIEW_IN_PROGRESS) TYPE=CREATE ;;
  ROLLBACK_COMPLETE)
    echo "Stack $STACK failed to create earlier. Delete it (./deploy/aws/teardown.sh) and re-run." >&2
    exit 1 ;;
  *_IN_PROGRESS)
    echo "Stack $STACK is busy ($STATUS). Re-run when it has settled." >&2
    exit 1 ;;
  *) TYPE=UPDATE ;;
esac

# ── Parameters: set what is asked for, keep everything else ────────────
CURRENT_KEYS=""
if [[ "$TYPE" == UPDATE ]]; then
  CURRENT_KEYS="$(awsx cloudformation describe-stacks --stack-name "$STACK" \
    --query 'Stacks[0].Parameters[].ParameterKey' --output text | tr '\t' '\n')"
fi
PARAMS=()
set_param() { PARAMS+=("ParameterKey=$1,ParameterValue=$2"); }
keep_param() {  # a parameter the stack does not have yet takes the template default
  if grep -qx "$1" <<< "$CURRENT_KEYS"; then PARAMS+=("ParameterKey=$1,UsePreviousValue=true"); fi
}

CURRENT_DOMAIN="$(out DomainName)"
if [[ -n "$CURRENT_DOMAIN" && "$CURRENT_DOMAIN" != "$DOMAIN" ]]; then
  echo "!! The stack serves $CURRENT_DOMAIN; this run would switch it to $DOMAIN (set DOMAIN to keep it)."
  confirm_stack "to switch it to $DOMAIN"
fi
set_param DomainName "$DOMAIN"
if [[ -n "${ALERT_EMAIL:-}" ]]; then set_param AlertEmail "$ALERT_EMAIL"; else keep_param AlertEmail; fi
if [[ -n "${INSTANCE_TYPE:-}" ]]; then set_param InstanceType "$INSTANCE_TYPE"; else keep_param InstanceType; fi
if [[ -n "${BACKUP_RETENTION_DAYS:-}" ]]; then
  set_param BackupRetentionDays "$BACKUP_RETENTION_DAYS"
else
  keep_param BackupRetentionDays
fi
# Auto deploy from GitHub Actions (.github/workflows/deploy.yml): the repo
# whose `production` environment may assume the deploy role ("none" removes
# the role), and an existing GitHub OIDC provider of the account, if any
# (an account has at most one per URL).
if [[ -n "${GITHUB_REPO:-}" ]]; then
  set_param GitHubRepo "$([[ "$GITHUB_REPO" == none ]] || echo "$GITHUB_REPO")"
else
  keep_param GitHubRepo
fi
if [[ -n "${GITHUB_OIDC_PROVIDER_ARN:-}" ]]; then
  set_param GitHubOidcProviderArn "$GITHUB_OIDC_PROVIDER_ARN"
else
  keep_param GitHubOidcProviderArn
fi
if [[ -n "${MONTHLY_BUDGET_USD:-}" ]]; then
  set_param MonthlyBudgetUsd "$MONTHLY_BUDGET_USD"
else
  keep_param MonthlyBudgetUsd
fi

# Off hours "STOP-START" in whole hours of SCHEDULE_TZ ("none" = always on).
if [[ -n "${OFF_HOURS:-}" ]]; then
  if [[ "$OFF_HOURS" == none ]]; then
    set_param StopHour ""
    set_param StartHour ""
  elif [[ "$OFF_HOURS" =~ ^([0-9]{1,2})-([0-9]{1,2})$ ]]; then
    set_param StopHour "$((10#${BASH_REMATCH[1]}))"
    set_param StartHour "$((10#${BASH_REMATCH[2]}))"
  else
    echo "OFF_HOURS must look like 21-6 (stop at 21:00, start at 06:00) or be none." >&2
    exit 1
  fi
else
  keep_param StopHour
  keep_param StartHour
fi
if [[ -n "${SCHEDULE_TZ:-}" ]]; then set_param ScheduleTimezone "$SCHEDULE_TZ"; else keep_param ScheduleTimezone; fi

# The AMI is pinned: resolved once at creation, then kept, because a new
# image replaces the instance. REFRESH_AMI=1 opts in to the latest image.
if [[ "$TYPE" == CREATE || "${REFRESH_AMI:-0}" == 1 ]]; then
  set_param AmiId "$(awsx ssm get-parameter \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)"
else
  keep_param AmiId
fi

# Buckets kept from an earlier stack of the same name are reused, not re-created.
if [[ "$TYPE" == CREATE ]]; then
  ACCOUNT="$(awsx sts get-caller-identity --query Account --output text)"
  for spec in "AccessLogBucketExists=$STACK-access-logs-$ACCOUNT" "BackupBucketExists=$STACK-backups-$ACCOUNT"; do
    if awsx s3api head-bucket --bucket "${spec#*=}" > /dev/null 2>&1; then
      echo "==> Reusing retained bucket ${spec#*=}"
      set_param "${spec%%=*}" true
    else
      set_param "${spec%%=*}" false
    fi
  done
else
  keep_param AccessLogBucketExists
  keep_param BackupBucketExists
fi

# ── Change set ─────────────────────────────────────────────────────────
CHANGE_SET="provision-$(date -u +%Y%m%d%H%M%S)"
EXECUTED=0
discard_change_set() {
  [[ "$EXECUTED" == 1 ]] || awsx cloudformation delete-change-set \
    --stack-name "$STACK" --change-set-name "$CHANGE_SET" > /dev/null 2>&1 || true
}
trap discard_change_set EXIT

summary() {
  echo "    Elastic IP : $(out PublicIp)"
  echo "    Instance   : $(out InstanceId)"
  echo "    Backups    : s3://$(out BackupBucket) (weekly, retained)"
  local role
  role="$(out DeployRoleArn)"
  if [[ -n "$role" ]]; then echo "    Deploy role: $role"; fi
}

echo "==> Preparing $TYPE change set for $STACK ($REGION, profile $PROFILE, $DOMAIN)"
awsx cloudformation create-change-set \
  --stack-name "$STACK" \
  --change-set-name "$CHANGE_SET" \
  --change-set-type "$TYPE" \
  --template-body "file://$REPO_DIR/infra/aws/template.yml" \
  --capabilities CAPABILITY_IAM \
  --parameters "${PARAMS[@]}" \
  --tags Key=Project,Value=centriminds > /dev/null
if ! awsx cloudformation wait change-set-create-complete \
  --stack-name "$STACK" --change-set-name "$CHANGE_SET" 2> /dev/null; then
  REASON="$(awsx cloudformation describe-change-set --stack-name "$STACK" \
    --change-set-name "$CHANGE_SET" --query StatusReason --output text)"
  if [[ "$REASON" == *"didn't contain changes"* || "$REASON" == *"No updates are to be performed"* ]]; then
    echo "==> No changes; the stack is up to date."
    summary
    exit 0
  fi
  echo "Change set failed: $REASON" >&2
  exit 1
fi

awsx cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table

BACKUP_KEY=""
if [[ "$TYPE" == UPDATE ]]; then
  REPLACEMENT="$(awsx cloudformation describe-change-set --stack-name "$STACK" \
    --change-set-name "$CHANGE_SET" --output text \
    --query "Changes[?ResourceChange.LogicalResourceId=='Instance'].ResourceChange.Replacement")"
  if [[ "$REPLACEMENT" == True || "$REPLACEMENT" == Conditional ]]; then
    echo "!! This change replaces the EC2 instance, and with it the disk that holds the"
    echo "   database and uploads. The new instance starts empty; the data comes back"
    echo "   from the backup taken next."
    confirm_stack "to back up and continue"
    if [[ "${SKIP_BACKUP:-0}" == 1 ]]; then
      echo "!! SKIP_BACKUP=1: replacing without a backup"
    else
      echo "==> Backing up the data first"
      BACKUP_OUT="$("$(dirname "$0")/backup-now.sh")" || {
        echo "$BACKUP_OUT"
        echo "Backup failed; nothing changed. (An instance that never had the app deployed" >&2
        echo "has no data: re-run with SKIP_BACKUP=1.)" >&2
        exit 1
      }
      echo "$BACKUP_OUT"
      BACKUP_KEY="$(grep -Eo 'weekly/centriminds-[0-9TZ]+\.tar\.gz' <<< "$BACKUP_OUT" | tail -1)"
    fi
  fi
fi

echo "==> Applying change set $CHANGE_SET"
awsx cloudformation execute-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET"
EXECUTED=1
if [[ "$TYPE" == CREATE ]]; then
  awsx cloudformation wait stack-create-complete --stack-name "$STACK"
else
  awsx cloudformation wait stack-update-complete --stack-name "$STACK"
fi

echo "==> Stack ready"
summary
if [[ -n "$BACKUP_KEY" ]]; then
  echo "    Next       : ./deploy/aws/deploy.sh"
  echo "                 ./deploy/aws/restore.sh $BACKUP_KEY"
elif [[ "$TYPE" == CREATE ]]; then
  echo "    Next       : point the A records of $DOMAIN and www.$DOMAIN at $(out PublicIp)"
  echo "                 (Hostinger: HOSTINGER_API_TOKEN=... ./deploy/hostinger/set-dns.sh $DOMAIN $(out PublicIp))"
  echo "                 ./deploy/aws/deploy.sh"
fi
if [[ -n "$(out DeployRoleArn)" ]]; then
  echo "    GitHub     : store the deploy role above as the AWS_DEPLOY_ROLE_ARN secret of the"
  echo "                 repository's production environment (never in a committed file)"
fi
