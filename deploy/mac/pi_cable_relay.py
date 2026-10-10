"""Camera relay for the Mac hub (deploy/mac/start_hub.sh): forward 127.0.0.1:8090 on the Mac to the Pi's daemon over the Ethernet cable (link-local IPv6),
so the Docker container (which can't use link-local addresses) reaches the camera at
host.docker.internal:8090."""
import asyncio, os

# The Pi's link-local address on the cable (stable: derived from its hardware address) and the
# Mac's cable interface. Override with PI_ADDR / PI_IFACE.
PI = (f"{os.environ.get('PI_ADDR', 'fe80::2ecf:67ff:fe80:188f')}%{os.environ.get('PI_IFACE', 'en7')}", 8000)

async def pipe(r, w):
    try:
        while data := await r.read(65536):
            w.write(data); await w.drain()
    except Exception:
        pass
    finally:
        w.close()

async def handle(cr, cw):
    try:
        pr, pw = await asyncio.open_connection(*PI)
    except Exception as e:
        print("pi connect failed:", e, flush=True); cw.close(); return
    await asyncio.gather(pipe(cr, pw), pipe(pr, cw))

async def main():
    srv = await asyncio.start_server(handle, "127.0.0.1", 8090)
    print("relay listening on :8090 ->", PI, flush=True)
    async with srv:
        await srv.serve_forever()
asyncio.run(main())
