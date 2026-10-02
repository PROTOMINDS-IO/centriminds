# Self-hosting

CentriMinds runs anywhere Docker runs. This page covers the backend's
settings and the reference deployment on AWS that Protominds operates.

## Configuration

Backend environment variables (`backend/app/config.py`):

| Variable | Default | |
| --- | --- | --- |
| `APP_ENV` | `development` | `production` refuses a weak `JWT_SECRET` and disables the API docs. |
| `JWT_SECRET` | dev placeholder | ≥ 32 random characters in production (`openssl rand -hex 32`). |
| `JWT_ALGORITHM` | `HS256` | `HS256`, `HS384` or `HS512`. |
| `JWT_EXPIRE_DAYS` | `7` | Session length (1–90). |
| `ALLOW_REGISTRATION` | `true` | `false` closes sign-up (the default on AWS). |
| `REGISTRATION_EMAILS` | empty | Comma-separated addresses that may sign up; empty lets anyone. Production needs it whenever sign-up is open. |
| `CORS_ORIGINS` | localhost | Comma-separated. |
| `DATA_DIR` | `./data` | SQLite database and uploads (`/data` in Docker). |
| `MAX_UPLOAD_MB` | `100` | Upload size cap (also enforced by nginx and Caddy). |
| `AUTH_ATTEMPTS_PER_MINUTE` | `10` | Sign-in/sign-up attempts per client IP. |
| `DEMO_EMAIL` | empty | The shared demo login: its password, name and sessions cannot be changed. |

## On AWS

One EC2 instance runs the Compose stack (`deploy/aws/docker-compose.yml`);
Caddy terminates TLS with Let's Encrypt. The infrastructure is one
CloudFormation stack (`infra/aws/template.yml`).

```mermaid
flowchart LR
    user(["Users"]) -- "HTTPS :443" --> eip["Elastic IP"]
    dns["DNS<br/>A @, www → EIP"] -.-> eip
    subgraph ec2["EC2 (Amazon Linux, SSM only, no SSH)"]
        caddy["Caddy"] --> nginx["frontend<br/>nginx"] --> api["backend<br/>FastAPI"]
        api --> ebs[("encrypted EBS<br/>SQLite + uploads")]
        timer["systemd timers<br/>weekly backup · hourly report"]
    end
    eip --> caddy
    timer -- "verified archive" --> s3[("S3 backups<br/>versioned, Object Lock,<br/>retained")]
    timer -- "backup age" --> cw["CloudWatch alarm<br/>→ email"]
    you(["Operator"]) -- "deploy/aws/*.sh<br/>(SSM, S3 bundle)" --> ec2
```

Prerequisites: AWS CLI v2 with credentials, `python3`, `git` and `curl`.
The scripts read their settings from the environment (all listed at the top
of `deploy/aws/env.sh`):

| Variable | Default | |
| --- | --- | --- |
| `DOMAIN` | `centriminds.de` | Apex domain the app is served on; `www.` redirects to it. **Set your own.** |
| `AWS_PROFILE` | `centriminds` | AWS CLI profile; empty (`AWS_PROFILE=`) uses the CLI's default credentials. |
| `AWS_REGION` | `eu-central-1` | Region of the stack. |
| `STACK` | `centriminds` | Stack name, also the prefix of its bucket names. |
| `ALERT_EMAIL` | keeps current | Address for backup alarms (`provision.sh`). |
| `INSTANCE_TYPE` | `t3.small` | EC2 size (`provision.sh`; a change is a stop/start, data kept). |
| `BACKUP_RETENTION_DAYS` | `90` | How long weekly backups are kept (`provision.sh`). |
| `REFRESH_AMI` | `0` | `1` moves to the newest Amazon Linux, which replaces the instance (`provision.sh`). |
| `REGISTRATION_EMAILS` | keeps current | Who may sign up, or `none` (`deploy.sh`). |
| `DEMO_EMAIL` | keeps current | The shared demo login, reset nightly, or `none` (`deploy.sh`). |
| `GITHUB_REPO` | keeps current | `owner/repo` whose `production` environment may deploy, or `none` (`provision.sh`). |
| `GITHUB_OIDC_PROVIDER_ARN` | keeps current | The account's existing GitHub OIDC provider, if it has one (`provision.sh`). |
| `MONTHLY_BUDGET_USD` | keeps current | Monthly cost alert to `ALERT_EMAIL`; `0` for none (`provision.sh`). |
| `SKIP_PREDEPLOY_BACKUP`, `SKIP_BACKUP` | `0` | Skip the safety backup before a deploy, or before a replacement or teardown. |

```bash
export DOMAIN=example.com AWS_PROFILE=myprofile
ALERT_EMAIL=ops@example.com ./deploy/aws/provision.sh   # 1. stack → prints the Elastic IP
# 2. point the A records of @ and www at that IP at your DNS provider
#    (for Hostinger: HOSTINGER_API_TOKEN=… ./deploy/hostinger/set-dns.sh "$DOMAIN" <EIP>)
./deploy/aws/deploy.sh                                   # 3. build + start; re-run to redeploy
```

`provision.sh` applies every change through a CloudFormation change set and
shows it first. Settings you do not pass keep their values. A change that
would replace the instance, and with it the disk holding the data, stops for
confirmation, takes a backup first and prints the commands that bring the
data back. Grow the 30 GB volume in place (`aws ec2 modify-volume`, then
`growpart` and `xfs_growfs`) rather than in the template.

Sign-up is closed after the first deploy. To let people create accounts,
deploy with the addresses that may sign up; each person then registers with
a password of their own. Close it again with `none`. The app refuses to
start in production with sign-up open to anyone.

```bash
REGISTRATION_EMAILS=you@example.com,colleague@example.com ./deploy/aws/deploy.sh
REGISTRATION_EMAILS=none ./deploy/aws/deploy.sh
```

### Demo account and sample data

`python -m app.demo` adds a made-up decanter and three analysed run-ups to
an account. Everything in it is synthetic (the Cyclo template with invented
values, sweeps generated from its own order lines), so a public instance
carries no customer data.

```bash
REGISTRATION_EMAILS=demo@example.com ./deploy/aws/deploy.sh   # 1. let the demo login sign up
#                                                               2. sign up on the site with its password
REGISTRATION_EMAILS=none DEMO_EMAIL=demo@example.com ./deploy/aws/deploy.sh   # 3. lock it, reset nightly
./deploy/aws/demo-seed.sh client@example.com                   # sample projects for an invited account, once
```

With `DEMO_EMAIL` set, that account's password, name and sessions cannot be
changed, and a timer resets it to the sample data every night at 03:30 UTC.
Invited accounts are never reset. Locally: `python -m app.demo seed --email
you@example.com` (add `--create` with `DEMO_PASSWORD` set to create it).

### Auto deploy from GitHub

`.github/workflows/deploy.yml` deploys `main` after CI passed on it. The job
runs in the repository's `production` environment, so it waits for that
environment's reviewer; the deployment history and logs are public, the
right to deploy is not. AWS access is GitHub OIDC (no stored keys): the
stack's `DeployRole` trusts only that environment and can only do what
`deploy.sh` does. The workflow masks the account id, bucket names, instance
id and IP before anything prints them.

```bash
GITHUB_REPO=owner/repo ./deploy/aws/provision.sh   # creates DeployRole, prints its ARN
```

Then, in the repository's settings (admin): create the environment
`production` with yourself as required reviewer and `main` as the only
deployment branch, and add the printed ARN as its secret
`AWS_DEPLOY_ROLE_ARN`. Optional environment variables: `AWS_REGION`,
`STACK`. Never commit the ARN: it contains the account id.

Other hosts work too: any machine with Docker can run
`deploy/aws/docker-compose.yml` (or the root `docker-compose.yml` behind a
TLS proxy of your own; tell nginx about that proxy as `real-ip.conf` does).

### Backups (data only)

The application is rebuilt from Git; only the data is backed up: the SQLite
database and the uploaded `.odx` files.

- **Weekly**: every Sunday 02:30 UTC a systemd timer takes a consistent
  snapshot (SQLite online backup while the app keeps running), verifies
  every checksum in the archive and uploads it to
  `s3://<stack>-backups-<account>/weekly/`. It runs in a one-off container
  on the data volume, so it also works while the app is down.
- **Before every deploy**: the same backup goes to `pre-deploy/` (kept 30
  days), so a bad migration can be rolled back. The deploy stops if the
  backup fails.
- **Storage**: encrypted, versioned, TLS-only, Object Lock (governance, 30
  days), weekly backups kept 90 days. The bucket is retained if the stack is
  deleted, the instance can write backups but never delete them, and access
  is logged.
- **Monitoring**: the instance reports the age of its newest backup and its
  disk use every hour; alarms email `ALERT_EMAIL` if the backup passes 8 days,
  the reports stop or the disk is more than 80 % full. A failed host is
  recovered automatically, and `MONTHLY_BUDGET_USD` adds a cost alert.
  Container logs are capped at 30 MB each. Uptime is best watched from
  outside (any HTTP monitor on `https://<domain>/api/health`).

```bash
./deploy/aws/backup-now.sh                                            # back up now
./deploy/aws/restore.sh                                               # list backups
./deploy/aws/restore.sh weekly/centriminds-20261004T023412Z.tar.gz    # restore one
```

A restore takes a safety backup, verifies the archive, stops the app, swaps
the data in and starts the app again; the replaced data stays on the volume
under `/data/.pre-restore-<utc>/`. Locally the same module works on its own:
`python -m app.backup create --out <dir>`, `verify <archive>` and
`restore <archive> --force` (with the app stopped).

`./deploy/aws/teardown.sh` takes a final backup, then deletes the instance.
The backup and access-log buckets are retained on purpose, and
`provision.sh` picks them up again if the stack is created anew.
