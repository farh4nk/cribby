# Where Presage runs (measured 2026-10-10)

**Short version:** a Raspberry Pi 4 cannot feed the Presage bridge 25 fps. Run the daemon (and
Presage) on a laptop and let the Pi be the camera unit. A Pi 5-class board should fit it all in one box.

## What we measured (Pi 4, Logitech Brio 101, `CRADLEECHO_DIAG=1`)
| Setup | Frames reaching the bridge | `kFrameRateTooLow` |
|---|---|---|
| Pi runs everything, 480x360 | 20-27 /s | most of the time |
| Pi, 320x240 (smaller frames do not help) | 23-24 /s | most of the time |
| Pi, + CPU governor `performance`, no browser open, frames written from a thread | 20-25 /s | about half |
| **Mac runs Presage, Pi streams the camera** | **29 /s** | **none** |

On the Pi the bridge's mediapipe threads alone use ~2.5 of 4 cores; the camera, face gate, preview
and the rest of the daemon need the remainder, so the Presage SDK sits right at its 25 fps limit.

## Run it: Pi = camera, Mac = Presage
1. Pi (camera only, no Presage credits spent there):
   `CRADLEECHO_SOURCE=mock CRADLEECHO_STREAM_FPS=30 docker compose up -d --no-deps daemon`
2. Mac (same arm64 image runs natively on Apple Silicon; needs `daemon/.env` with `PRESAGE_API_KEY`):
   ```
   docker run -d --name mac-presage -p 8000:8000 --env-file daemon/.env \
     -e CRADLEECHO_CAMERA=http://<pi-tailscale-ip>:8000/video_feed \
     -e CRADLEECHO_SOURCE=presage \
     -e CRADLEECHO_PRESAGE_CMD="/opt/bridge/bridge --stdin 480x360" \
     -e CRADLEECHO_PRESAGE_FPS=1000 -e CRADLEECHO_PRESAGE_PACE_FPS=30 \
     -e PRESAGE_FACE_METRICS=1 \
     -e CRADLEECHO_GATE_CHEST_ROOM=1.0 --restart unless-stopped \
     cradleecho-daemon:latest
   ```
3. Run the web app on the Mac (`cd web && npm run dev`); it talks to `localhost:8000`.
4. Turn the camera on/off from the UI switch (it switches the Pi's camera too only if you point the
   UI at the Pi; the Mac daemon's switch only stops Presage and its view of the stream).

Add `-e CRADLEECHO_DIAG=1` to either side to log pipeline rates every 5 s (`DIAG ...` lines).
Pi tip: `echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor` (resets on reboot).

## Pointing the UI at both machines
Set `NEXT_PUBLIC_EDGE_URL=http://<pi-tailscale-ip>:8000` in `web/.env.local`. Speaker/mic/night-vision
calls (`/ws/talk`, `/ws/listen`, `/api/audio/capabilities`, `/api/night-vision`, `/api/soothe/*`) then go
to the Pi; telemetry, source, simulate and the camera switch stay on `NEXT_PUBLIC_DAEMON_URL` (the Mac,
which owns Presage and its credits). Unset, everything goes to the daemon as before.

## Why PRESAGE_FPS=1000 and PRESAGE_PACE_FPS=30 on the Mac (measured 2026-10-10)
The Pi's stream reaches the Mac at 30 fps on average but in bursts: a third of frame gaps are under
17 ms and some exceed 150 ms. The bridge timestamps frames on arrival, so Presage saw a low frame
rate. Two fixes:
- `PRESAGE_FPS=1000` turns off the daemon's frame throttle. At 60 it dropped the second frame of
  every burst, so only ~20 of 30 frames/s reached the bridge.
- `PRESAGE_PACE_FPS=30` queues a few frames and writes them to the bridge on a steady 30 fps clock,
  repeating the last frame when the network stalls.

Result over ~2 minutes with a person in frame: 30.0 frames/s to the bridge in every window, zero
`kFrameRateTooLow` (it fired constantly before), confidence 1.00, breathing 17-22/min, heart rate
58-97 bpm. About 3-15 of the 30 frames/s are repeats; Presage still reported full confidence.

## Teammate talks, Mac speakers play it (two-way audio "talk" on the Mac route)
Docker on a Mac has no sound card, so the Mac daemon plays talk audio through PulseAudio on the Mac:
1. `brew install pulseaudio`, then start it with network audio limited to this Mac and Docker:
   ```
   pulseaudio --daemonize=yes --exit-idle-time=-1 \
     --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1;192.168.65.0/24;172.16.0.0/12 auth-anonymous=0"
   ```
   (not started at login; run it again after a reboot). `pactl list short sinks` should show the speakers.
2. Run the Mac container with `-e PULSE_SERVER=tcp:host.docker.internal:4713` (aplay then uses ALSA's
   `pulse` device; the image ships `libasound2-plugins`).
3. Publish the Mac over Tailscale HTTPS (browsers only allow the mic on HTTPS):
   ```
   tailscale serve --bg --https=443   http://127.0.0.1:3000
   tailscale serve --bg --https=8443  http://127.0.0.1:8000
   tailscale serve --bg --https=10000 http://127.0.0.1:8001
   ```
4. The teammate opens `https://<mac>.<tailnet>.ts.net/` and holds the talk button.

Verified 2026-10-10: a tone sent over `wss://<mac>.ts.net:8443/ws/talk` started the talkback player in the
container and played through PulseAudio. `next.config.ts` allows `*.ts.net` origins for `npm run dev`.

## Still open
- With stable fps Presage now reports `kChestNotVisible`: it wants more of the chest in view
  (camera further back / tilted down). Heart rate needs a steady signal after that.
- The Pi-only mode still works for demos with simulated data.
