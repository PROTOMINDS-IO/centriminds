#!/usr/bin/env bash
# Point <domain> and www.<domain> at an IP via the Hostinger DNS API.
#
#   HOSTINGER_API_TOKEN=... ./deploy/hostinger/set-dns.sh example.com 1.2.3.4
#
# Optional: a convenience for zones hosted at Hostinger. With any other DNS
# provider, set the two A records (@ and www -> the stack's Elastic IP) there
# by hand, and remove AAAA records and a www CNAME for the same reason as
# below.
#
# Token: https://hpanel.hostinger.com/profile/api
# Removes AAAA and www CNAME records first: a stale AAAA (e.g. from an old
# VPS) makes Let's Encrypt validate over IPv6 against the wrong host and the
# certificate issuance fails.
set -euo pipefail
DOMAIN="${1:?usage: set-dns.sh <domain> <ipv4>}"
IP="${2:?usage: set-dns.sh <domain> <ipv4>}"
: "${HOSTINGER_API_TOKEN:?set HOSTINGER_API_TOKEN}"
API="https://developers.hostinger.com/api/dns/v1/zones/$DOMAIN"

call() {
  curl -fsS -X "$1" "$API" \
    -H "Authorization: Bearer $HOSTINGER_API_TOKEN" \
    -H "Content-Type: application/json" ${2:+-d "$2"}
}

echo "==> Current records for $DOMAIN (@ and www)"
call GET | python3 -c 'import json,sys
for r in json.load(sys.stdin):
    if r["name"] in ("@","www"):
        print("   ", r["name"], r["type"], [x["content"] for x in r["records"]])'

echo "==> Removing AAAA @/www and CNAME www"
call DELETE '{"filters":[{"name":"@","type":"AAAA"},{"name":"www","type":"AAAA"},{"name":"www","type":"CNAME"}]}' >/dev/null || true

echo "==> Setting A @ and www -> $IP (overwrite)"
call PUT "{\"overwrite\":true,\"zone\":[
  {\"name\":\"@\",\"type\":\"A\",\"ttl\":300,\"records\":[{\"content\":\"$IP\"}]},
  {\"name\":\"www\",\"type\":\"A\",\"ttl\":300,\"records\":[{\"content\":\"$IP\"}]}]}" >/dev/null

echo "==> Done. Verify propagation: dig +short $DOMAIN @1.1.1.1"
