# Security

## Reporting a vulnerability

Please report security problems privately, not in an issue or a pull
request: with *Report a vulnerability* on the
[repository's Security tab](https://github.com/protominds-io/centriminds/security)
(GitHub's private vulnerability reporting), or by email to
[info@protominds.io](mailto:info@protominds.io) with "Security" in the
subject. Describe what you found, how to reproduce it and which commit or
deployment it affects. You will get an acknowledgement and hear back when a
fix is on `main`.

Fixes are made on `main` and deployed from there; older commits are not
maintained, and there are no separate releases to patch.

## Running your own instance

The protections below assume a deployment like ours. If you host
CentriMinds yourself:

- **Keep it updated**: pull `main` and redeploy when it changes, and keep
  the host's operating system and Docker patched (on the AWS instance,
  Amazon Linux: `sudo dnf upgrade` in a Systems Manager session).
- **Set `JWT_SECRET`** to a random value of at least 32 characters
  (`openssl rand -hex 32`) and `APP_ENV=production`, which refuses to start
  without one. The local `docker-compose.yml` uses a development secret and
  is not meant to be exposed. The AWS scripts generate the secret on the
  instance.
- **Close sign-up**: `ALLOW_REGISTRATION=false`, or open it only to the
  addresses in `REGISTRATION_EMAILS`.
- **Put TLS in front**: the containers speak plain HTTP. On AWS, Caddy
  terminates TLS and sends HSTS; elsewhere, use a reverse proxy of your own
  and do not publish the frontend's port directly to the internet.
- **Tell nginx about that proxy**: the sign-in rate limit counts per client
  IP, which nginx decides. It ignores `X-Forwarded-For` from clients, so
  behind a proxy every request would count as the proxy's until it is
  listed with `set_real_ip_from` (see `frontend/nginx.conf`; on AWS,
  `deploy/aws/real-ip.conf`). Trust only addresses that nothing but the
  proxy can connect from.

## How the application is protected

- **Accounts**: passwords are hashed with bcrypt (at least 8 characters, at
  most bcrypt's 72 bytes). Sign-in and sign-up are rate limited per client
  IP, as nginx determines it (a client cannot set it with a header). In
  production sign-up is closed (`ALLOW_REGISTRATION=false`) or open only to
  the addresses in `REGISTRATION_EMAILS`; the API refuses to start with
  sign-up open to anyone.
- **Sessions**: one signed JWT per sign-in, valid for `JWT_EXPIRE_DAYS`
  (7 by default) and kept in the browser's local storage. Each token carries
  the account's session version, and the API refuses it once that has moved
  on: changing the password signs the account out on every other device,
  and *Sign out everywhere* (Settings) ends every session, the current one
  included. In production the API refuses to start without a random
  `JWT_SECRET` of at least 32 characters; the deploy scripts generate it on
  the instance, and it never leaves it.
- **Data**: every project belongs to one account. The API checks ownership
  on each request and answers 404 for anyone else's project, so its
  existence does not leak.
- **Browser**: a Content-Security-Policy that allows scripts only from the
  app's own origin (no inline scripts), plus `nosniff`, referrer,
  permissions and opener policies (`frontend/security-headers.conf`), and
  HSTS from Caddy. The app makes no third-party requests; its fonts are
  self-hosted.
- **Uploads**: the size is capped by Caddy, nginx and the API
  (`MAX_UPLOAD_MB`). `.odx` files are parsed as data, with limits on their
  size and axes, and never executed.
- **Infrastructure**: containers run as non-root users. The instance has no
  SSH (AWS Systems Manager only) and uses IMDSv2 with a hop limit of 1, so
  the containers cannot reach its credentials. Backups are encrypted,
  versioned and protected by S3 Object Lock (governance mode, 30 days); the
  instance can write them but not delete them.
- **Repository**: no secrets are committed. CI scans every commit with
  gitleaks (`.gitleaks.toml`), and `.env` files are ignored by Git.

## Known limitations

- Sessions end all at once, not one device at a time, and there is no list
  of where the account is signed in. Signing out forgets the token in that
  browser only: a copy taken earlier stays valid until it expires or the
  account's sessions are ended (by a password change or *Sign out
  everywhere*).
- Rate limits are counted inside the API process. That is exact for the
  single instance this is deployed on; several instances would need a shared
  store.
