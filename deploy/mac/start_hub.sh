#!/usr/bin/env bash
# Start everything the Mac "home hub" runs for the demo (measured setup, 2026-10-10):
#   Pi (camera only) --Ethernet cable--> Mac: Presage in Docker, dashboard, analytics, talk audio.
#
#   deploy/mac/start_hub.sh          start (or restart) every piece; safe to run again
#   deploy/mac/start_hub.sh status   show what is running
#
# Needs: Docker Desktop, the cradleecho-daemon image (deploy/pi/build_and_ship.sh builds it),
# daemon/.env with PRESAGE_API_KEY, .env with DATABASE_URL + GEMINI_API_KEY, `brew install
# pulseaudio`, Tailscale with HTTPS certificates on, and the Pi on the cable (eth0 link-local).
# The web dashboard runs separately: `cd web && npm run dev` (or `npm run build && npm start`).
set -euo pipefail
cd "$(dirname "$0")/../.."
LOGS="${TMPDIR:-/tmp}/cribby-hub"
mkdir -p "$LOGS"

status() {
  echo "pulseaudio:   $(pgrep -q pulseaudio && echo running || echo stopped)"
  echo "camera relay: $(pgrep -qf pi_cable_relay.py && echo running || echo stopped)"
  echo "mac-presage:  $(docker ps --filter name=mac-presage --format '{{.Status}}' 2>/dev/null || echo '?')"
  echo "analytics:    $(curl -s -m3 -o /dev/null -w '%{http_code}' localhost:8001/api/health || echo down)"
  echo "worker:       $(pgrep -qf backend.services.ingestion_worker && echo running || echo stopped)"
  echo "camera:       $(curl -s -m3 localhost:8000/api/camera || echo daemon down)"
  tailscale serve status 2>/dev/null | grep -E '^https' || echo "tailscale serve: off"
}
[[ "${1:-}" == "status" ]] && { status; exit 0; }

echo "==> PulseAudio (talk audio -> Mac speakers; only this Mac and Docker may connect)"
pgrep -q pulseaudio || pulseaudio --daemonize=yes --exit-idle-time=-1 \
  --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1;192.168.65.0/24;172.16.0.0/12 auth-anonymous=0"

echo "==> Camera relay (Pi on the cable -> 127.0.0.1:8090 for Docker)"
pkill -f pi_cable_relay.py 2>/dev/null || true
nohup python3 deploy/mac/pi_cable_relay.py > "$LOGS/relay.log" 2>&1 &

echo "==> Presage daemon container (mac-presage)"
docker rm -f mac-presage >/dev/null 2>&1 || true
docker run -d --name mac-presage --restart unless-stopped -p 8000:8000 --env-file daemon/.env \
  -e PULSE_SERVER=tcp:host.docker.internal:4713 \
  -e CRADLEECHO_CAMERA=http://host.docker.internal:8090/video_feed \
  -e CRADLEECHO_SOURCE=presage -e PRESAGE_FACE_METRICS=1 \
  -e CRADLEECHO_PRESAGE_CMD="/opt/bridge/bridge --stdin 480x360" \
  -e CRADLEECHO_PRESAGE_FPS=1000 -e CRADLEECHO_PRESAGE_PACE_FPS=30 -e CRADLEECHO_GATE_CHEST_ROOM=1.0 \
  -e CRADLEECHO_DIAG=1 cradleecho-daemon:latest >/dev/null

echo "==> Analytics API + ingestion worker (Tiger Data, Gemini)"
UVR=(uv run --no-project --with-requirements backend/requirements.txt)
pkill -f "uvicorn backend.api.app" 2>/dev/null || true
pkill -f backend.services.ingestion_worker 2>/dev/null || true
nohup "${UVR[@]}" uvicorn backend.api.app:app --port 8001 > "$LOGS/api.log" 2>&1 &
TELEMETRY_WS_URL=ws://localhost:8000/ws/telemetry nohup "${UVR[@]}" python -m backend.services.ingestion_worker > "$LOGS/worker.log" 2>&1 &

echo "==> Tailscale HTTPS (tailnet only): web 443, daemon 8443, analytics 10000"
tailscale serve --bg --https=443 http://127.0.0.1:3000 >/dev/null
tailscale serve --bg --https=8443 http://127.0.0.1:8000 >/dev/null
tailscale serve --bg --https=10000 http://127.0.0.1:8001 >/dev/null

sleep 15
status
echo "Logs: $LOGS. Dashboard: start it with 'cd web && npm run dev', then open"
echo "  https://$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || echo '<mac>.<tailnet>.ts.net')"
