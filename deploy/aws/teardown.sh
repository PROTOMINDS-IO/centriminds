#!/usr/bin/env bash
# Delete a CentriMinds stack and everything it owns, then list leftovers
# that live outside CloudFormation: resources named centriminds* and any
# unattached EBS volume in the region.
#
#   ./deploy/aws/teardown.sh                          # the current stack
#   STACK=<name> ./deploy/aws/teardown.sh             # another stack
#
# The instance and its EBS volume are deleted, after a final data backup
# (SKIP_BACKUP=1 skips it, e.g. when the app was never deployed). The backup
# and access-log buckets are retained by CloudFormation (they hold customer
# data and its audit trail) and show up in the leftover scan; provision.sh
# reuses them if the stack is created again. Delete them by hand only when
# the data may go.
set -euo pipefail
source "$(dirname "$0")/env.sh"

if ! awsx cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  echo "==> Stack $STACK not found in $REGION — skipping delete, checking leftovers only."
else
  awsx cloudformation describe-stack-resources --stack-name "$STACK" \
    --query 'StackResources[].[ResourceType,PhysicalResourceId]' --output table
  confirm_stack "to delete it and ALL resources above"

  BACKUPS="$(out BackupBucket)"
  if [[ "${SKIP_BACKUP:-0}" != 1 && -n "$BACKUPS" ]]; then
    echo "==> Final data backup"
    "$(dirname "$0")/backup-now.sh" || {
      echo "Backup failed; nothing deleted. (App never deployed? Re-run with SKIP_BACKUP=1.)" >&2
      exit 1
    }
  fi

  # CloudFormation cannot delete a non-empty bucket. Only the deploy bucket
  # is emptied: backups and access logs are retained on purpose. It is
  # versioned, so `s3 rm` would only add delete markers: every version and
  # every marker is deleted instead, 500 per request (a request takes 1000).
  BUCKET="$(out DeployBucket)"
  if [[ -n "$BUCKET" ]]; then
    echo "==> Emptying s3://$BUCKET"
    for kind in Versions DeleteMarkers; do
      while :; do
        batch="$(awsx s3api list-object-versions --bucket "$BUCKET" --max-items 500 \
          --query "{Objects: ${kind}[:500].{Key: Key, VersionId: VersionId}}" --output json)"
        [[ "$batch" == *'"Key"'* ]] || break
        awsx s3api delete-objects --bucket "$BUCKET" --delete "$batch" >/dev/null
      done
    done
  fi

  echo "==> Deleting stack $STACK"
  awsx cloudformation delete-stack --stack-name "$STACK"
  awsx cloudformation wait stack-delete-complete --stack-name "$STACK"
  echo "==> Stack deleted"
fi

# Anything below survived the stack (manual resources, DELETE_FAILED retains).
echo "==> Leftover scan ($REGION)"
awsx ec2 describe-instances \
  --filters "Name=tag:Name,Values=centriminds*" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output text | sed 's/^/  instance: /'
awsx ec2 describe-addresses --filters "Name=tag:Name,Values=centriminds*" \
  --query 'Addresses[].[AllocationId,PublicIp]' --output text | sed 's/^/  eip (billed while idle): /'
awsx ec2 describe-volumes --filters "Name=status,Values=available" \
  --query 'Volumes[].[VolumeId,Size]' --output text | sed 's/^/  unattached volume: /'
awsx ec2 describe-security-groups --filters "Name=group-name,Values=centriminds*" \
  --query 'SecurityGroups[].[GroupId,GroupName]' --output text | sed 's/^/  security group: /'
awsx s3api list-buckets --query "Buckets[?starts_with(Name,'centriminds')].Name" --output text \
  | tr '\t' '\n' | sed '/^$/d;s/^/  bucket: /'
echo "==> Done. Empty scan output above = nothing left."
