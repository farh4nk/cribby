# Cribby nursery unit case (3D print)

A two-part case that turns the Raspberry Pi 4 and the Logitech Brio 100 webcam into one unit: the Pi sits in a tray and the camera is housed in a hood on top of the lid.

| File | What it is |
|---|---|
| `base.stl` | Pi 4 tray, 92 × 62 × 27 mm. Four pegs locate the board (no screws). Openings for USB/Ethernet, USB-C power, micro HDMI, audio and microSD. Vent slots in the floor. |
| `lid.stl` | Lid plate with the camera hood, 90 × 60 × 42 mm. Drops into a step at the top of the base walls. The front window shows the lens, LED and mic; the back is open for the camera and its cable. |
| `cribby_case.py` | Generates both STLs. All dimensions are constants at the top of the file. |

## Print

- PLA, 0.2 mm layers, 15–20% infill, **no supports**.
- Print both parts in the orientation they come in (flat side down).
- Roughly 5–6 hours for both on a typical printer; check your slicer.

## Assemble

1. Take any HAT off the Pi. The tray fits a bare Pi 4 only.
2. Set the Pi onto the four pegs, with the USB/Ethernet end at the large opening.
3. Slide the Brio into the hood from the back until its face meets the window.
4. Route the camera cable around the outside to a Pi USB port, then drop the lid in.
5. If anything is loose, put a strip of tape across the back of the hood and over the lid seam.

## Dimensions and what is not verified

The model uses published dimensions, not measurements of our hardware:

- **Pi 4:** board 85 × 56 mm; mounting holes at (3.5, 3.5), (61.5, 3.5), (3.5, 52.5) and (61.5, 52.5) mm; standard port positions.
- **Brio 100:** front face 72.9 × 31.9 mm ([Logitech specification](https://support.logi.com/hc/en-001/articles/16131342728471-Specification-Brio-100-Webcam)). The listed 66.6 mm depth includes the clip, so the hood is open at the back and the camera's depth does not matter.

Not verified until the first print:

- **Hood fit:** it assumes the face is a pill shape, with 1.5 mm of slack per side and 2.5 mm of headroom for the clip that wraps over the top. If it is tight, sand the inside of the hood. If it is loose, tape it.
- **Camera position:** the clip's front tab sits between the face and the window lip, so the camera may sit 2–3 mm further back.
- **Lid fit:** the lid is a friction fit with 0.2 mm of play per side.

## Change the model

Edit the constants in `cribby_case.py`, for example `CAM_CLR` for the hood fit or `FIT` for the lid, then regenerate:

```sh
uv run --no-project --with manifold3d --with numpy python hardware/case/cribby_case.py
```
