# shellcheck shell=bash
# Run shell commands on the stack's instance via SSM and wait for the result.
# Sourced by deploy scripts after env.sh:
#
#   ssm_run [--progress] "<comment>" "cmd1" "cmd2" ...
#
# The commands run as one script on the instance (a `cd` or a variable
# carries over to the next one), for up to 30 minutes. --progress prints the
# command id and its status every 15 s, for long runs like a deploy (Ctrl-C
# stops waiting, not the command). Prints the command's stdout and stderr,
# and fails unless it succeeded.
ssm_run() {
  local progress=0
  if [[ "${1:-}" == --progress ]]; then progress=1; shift; fi
  local comment="$1"; shift
  local instance params cmd_id status
  instance="$(require_out InstanceId)" || return 1
  # JSON-encode the commands, so quotes and $ in them arrive unchanged.
  params="$(python3 -c 'import json,sys; print(json.dumps({"commands": sys.argv[1:]}))' "$@")"
  cmd_id="$(awsx ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript \
    --comment "$comment" --timeout-seconds 1800 --parameters "$params" \
    --query 'Command.CommandId' --output text)"
  (( progress )) && echo "    command id: $cmd_id"
  while true; do
    status="$(awsx ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance" \
      --query Status --output text 2>/dev/null || echo Pending)"
    (( progress )) && echo "    status: $status"
    [[ "$status" =~ ^(Success|Failed|Cancelled|TimedOut)$ ]] && break
    if (( progress )); then sleep 15; else sleep 5; fi
  done
  awsx ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance" \
    --query '[StandardOutputContent,StandardErrorContent]' --output text
  [[ "$status" == "Success" ]]
}
