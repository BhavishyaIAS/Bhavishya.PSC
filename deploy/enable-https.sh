#!/usr/bin/env bash
#
# Move the site from the bare IP to a domain with HTTPS (Let's Encrypt).
# First point the domain's DNS A record(s) at this droplet, then:
#
#   ssh root@YOUR_IP 'bash /home/deploy/bhavishya-psc/deploy/enable-https.sh example.com you@example.com'
#
# Add WWW=1 to also serve www.example.com (needs its own A/CNAME record).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
DOMAIN="${1:?usage: enable-https.sh DOMAIN EMAIL}"
EMAIL="${2:?usage: enable-https.sh DOMAIN EMAIL}"
APP=/home/deploy/bhavishya-psc
ENV_FILE="$APP/backend/.env"
NAMES="$DOMAIN"; CERT_ARGS=(-d "$DOMAIN")
if [ "${WWW:-0}" = 1 ]; then NAMES="$DOMAIN www.$DOMAIN"; CERT_ARGS+=(-d "www.$DOMAIN"); fi

IP=$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')
RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
if [ "$RESOLVED" != "$IP" ]; then
  echo "$DOMAIN resolves to '${RESOLVED:-nothing}', not this server ($IP). Fix DNS first (it can take a while to propagate)."
  exit 1
fi

echo "==> nginx: serving $NAMES"
sed -i "s/^\(\s*server_name\) .*;/\1 $NAMES;/" /etc/nginx/sites-available/bhavishya
nginx -t -q && systemctl reload nginx

echo "==> Certificate"
certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" "${CERT_ARGS[@]}"

echo "==> Django: secure cookies, new host"
HOSTS="$(echo "$NAMES" | tr ' ' ','),$IP,127.0.0.1,localhost"
ORIGINS=$(for n in $NAMES; do printf 'https://%s,' "$n"; done | sed 's/,$//')
set_env() { if grep -q "^$1=" "$ENV_FILE"; then sed -i "s#^$1=.*#$1=$2#" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi; }
set_env ALLOWED_HOSTS "$HOSTS"
set_env CSRF_TRUSTED_ORIGINS "$ORIGINS"
set_env COOKIE_SECURE true
set_env SITE_URL "https://$DOMAIN"
systemctl restart bhavishya-api

sleep 3
echo "==> https://$DOMAIN -> $(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")"
echo "Done. Everyone will need to log in again (the old cookies weren't Secure)."
echo "Update the DEPLOY_HOST / DEPLOY_KNOWN_HOSTS GitHub secrets only if you change how GitHub reaches the server (the IP still works)."
