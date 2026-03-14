#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# install-agent.sh — Install OVPN Agent on an OpenVPN server
# ──────────────────────────────────────────────────────────────────────────────
# Usage:
#   curl -sSL https://your-server/install-agent.sh | sudo bash
#   OR: sudo bash apps/agent/scripts/install-agent.sh
#
# Requires: Node.js 24+, pnpm (or npm)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

AGENT_DIR="/opt/ovpn-agent"
AGENT_ENV="/etc/openvpn-agent/.env"
BIN_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/ovpn-agent.service"

echo "🚀 Installing OVPN Agent..."

# ── 1. Create directories ────────────────────────────────────────────────────
mkdir -p "$(dirname "${AGENT_ENV}")"
mkdir -p "${AGENT_DIR}"

# ── 2. Copy built agent files ────────────────────────────────────────────────
cp -r dist/ "${AGENT_DIR}/"
cp package.json "${AGENT_DIR}/"

# ── 3. Configure .env ────────────────────────────────────────────────────────
if [ ! -f "${AGENT_ENV}" ]; then
  cp .env.example "${AGENT_ENV}"
  echo "⚠️  Created ${AGENT_ENV}. Please configure it before starting the agent."
else
  echo "✓ ${AGENT_ENV} already exists — skipping"
fi

chmod 600 "${AGENT_ENV}"

# ── 4. Symlink CLI scripts to /usr/local/bin ─────────────────────────────────
for script in openvpn-login openvpn-connect openvpn-disconnect; do
  TARGET="${BIN_DIR}/${script}"
  cat > "${TARGET}" << EOF
#!/usr/bin/env bash
OVPN_ENV_PATH="${AGENT_ENV}" exec node "${AGENT_DIR}/dist/bin/${script}.js" "\$@"
EOF
  chmod +x "${TARGET}"
  echo "✓ Installed ${TARGET}"
done

# ── 5. Create systemd service for the polling agent daemon ───────────────────
cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=OVPN Agent — VPN Management Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${AGENT_DIR}
EnvironmentFile=${AGENT_ENV}
ExecStart=/usr/bin/node ${AGENT_DIR}/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ovpn-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "✓ Systemd service created at ${SERVICE_FILE}"

# ── 6. Print OpenVPN server.conf instructions ────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Installation complete!"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Edit ${AGENT_ENV} and set:"
echo "     AGENT_MANAGER_URL, AGENT_NODE_ID, AGENT_SECRET_TOKEN, VPN_TOKEN"
echo ""
echo "  2. Add to /etc/openvpn/server.conf:"
echo ""
echo "     # Authentication via OVPN Manager"
echo "     username-as-common-name"
echo "     auth-user-pass-verify ${BIN_DIR}/openvpn-login via-file"
echo "     client-connect ${BIN_DIR}/openvpn-connect"
echo "     client-disconnect ${BIN_DIR}/openvpn-disconnect"
echo "     script-security 2"
echo ""
echo "  3. Enable and start the agent daemon:"
echo "     systemctl enable --now ovpn-agent.service"
echo ""
echo "  4. Restart OpenVPN:"
echo "     systemctl restart openvpn@server"
echo "═══════════════════════════════════════════════════════"
