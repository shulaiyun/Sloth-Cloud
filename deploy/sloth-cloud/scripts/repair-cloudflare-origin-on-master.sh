#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@192.168.16.220}"
REMOTE_PASS="${REMOTE_PASS:-Atygcvb689*}"
MASTER_IP="${MASTER_IP:-192.168.16.220}"
PROBE_HOST="${PROBE_HOST:-app-45.shulaiyun.top}"
CONFLICT_LOCAL_IP="${CONFLICT_LOCAL_IP:-192.168.16.101/32}"

REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail

MASTER_IP="${MASTER_IP:?}"
PROBE_HOST="${PROBE_HOST:?}"
CONFLICT_LOCAL_IP="${CONFLICT_LOCAL_IP:?}"

# Never bind the workstation LAN IP on master loopback.
ip addr del "${CONFLICT_LOCAL_IP}" dev lo 2>/dev/null || true
systemctl disable --now sloth-cloud-origin-alias.service 2>/dev/null || true
rm -f /etc/systemd/system/sloth-cloud-origin-alias.service || true
rm -rf /etc/systemd/system/sloth-cloud-origin-alias.service.d || true

rm -f /etc/systemd/system/cloudflared.service.d/10-origin-rewrite.conf || true

# Clean up stale DNAT fallback rules left by earlier troubleshooting.
while iptables -t nat -C OUTPUT -p tcp -d 192.168.16.101 --dport 80 -j DNAT --to-destination 127.0.0.1:80 2>/dev/null; do
  iptables -t nat -D OUTPUT -p tcp -d 192.168.16.101 --dport 80 -j DNAT --to-destination 127.0.0.1:80 || true
done
while iptables -t nat -C OUTPUT -p tcp -d 192.168.16.101 --dport 80 -j DNAT --to-destination "${MASTER_IP}:80" 2>/dev/null; do
  iptables -t nat -D OUTPUT -p tcp -d 192.168.16.101 --dport 80 -j DNAT --to-destination "${MASTER_IP}:80" || true
done

mkdir -p /etc/systemd/resolved.conf.d
cat >/etc/systemd/resolved.conf.d/10-sloth-cloud.conf <<'EOF_RESOLVED'
[Resolve]
DNS=1.1.1.1 8.8.8.8
FallbackDNS=1.0.0.1 8.8.4.4
EOF_RESOLVED

if [ -f /etc/cloudflared/config.yml ]; then
  if grep -q '^protocol:' /etc/cloudflared/config.yml; then
    sed -i 's/^protocol:.*/protocol: http2/' /etc/cloudflared/config.yml
  else
    printf '\nprotocol: http2\n' >> /etc/cloudflared/config.yml
  fi
fi

systemctl daemon-reload
systemctl restart systemd-resolved || true
systemctl restart cloudflared
sleep 5

echo "=== lo aliases ==="
ip addr show dev lo | sed -n '1,40p'
echo
echo "=== cloudflared drop-ins ==="
ls -l /etc/systemd/system/cloudflared.service.d || true
echo
echo "=== cloudflared status ==="
systemctl status cloudflared --no-pager -l | sed -n '1,80p'
echo
echo "=== cloudflared logs ==="
journalctl -u cloudflared -n 80 --no-pager
echo
echo "=== master origin probe ==="
curl -sv --max-time 10 -H "Host: ${PROBE_HOST}" http://${MASTER_IP} 2>&1 | sed -n '1,40p' || true
EOS
)

export CONFLICT_LOCAL_IP MASTER_IP PROBE_HOST
printf '%s\n' "$REMOTE_SCRIPT" \
  | sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
      "CONFLICT_LOCAL_IP='$CONFLICT_LOCAL_IP' MASTER_IP='$MASTER_IP' PROBE_HOST='$PROBE_HOST' bash -s"
