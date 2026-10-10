"""Cribby nursery unit: a Raspberry Pi 4 box with a Logitech Brio 100 housed in a hood on top.

Two parts, printed flat side down with no supports:
  base.stl  the Pi tray: walls, port openings, 4 locating pegs (no screws needed)
  lid.stl   the lid plate, with the camera hood on top (front window, open back)

Dimensions come from published specs, not measurements:
  Pi 4 board 85 x 56 mm, mounting holes at (3.5, 3.5) (61.5, 3.5) (3.5, 52.5) (61.5, 52.5)
  Brio 100 front face 72.9 x 31.9 mm (Logitech spec; the 66.6 mm depth includes the clip)
The camera slides into the hood from the back, so its body depth and clip do not matter.
Clearances are generous; a strip of tape across the hood's back holds the camera snug.

Run: uv run --no-project --with manifold3d --with numpy python hardware/case/cribby_case.py
"""

import os
import struct

import numpy as np
from manifold3d import CrossSection, Manifold

OUT = os.path.dirname(os.path.abspath(__file__))
SEG = 64

# --- Pi 4 ---------------------------------------------------------------------------------
BOARD_L, BOARD_W, BOARD_T = 85.0, 56.0, 1.4
HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
USBC_X, HDMI0_X, HDMI1_X, AUDIO_X = 11.2, 26.0, 39.5, 53.5  # centers along the long edge (y = 0)

WALL, FLOOR = 2.2, 2.0
CLR = 1.0  # gap around the board
STANDOFF_H = 3.0
INNER_L = BOARD_L + 2 * CLR + 1.0  # USB/Ethernet stick out ~2 mm past the board's end
INNER_W = BOARD_W + 2 * CLR
OUT_L, OUT_W = INNER_L + 2 * WALL, INNER_W + 2 * WALL
BASE_H = 27.0  # tallest part (double USB) is ~16 mm above the board
REBATE_D, REBATE_W = 2.0, 1.0  # step at the top of the walls that the lid drops into
FIT = 0.2  # lid clearance per side

BX, BY = WALL + CLR, WALL + CLR  # board origin
BZ = FLOOR + STANDOFF_H  # underside of the board
TOP = BZ + BOARD_T  # top of the board

# --- Brio 100 hood ----------------------------------------------------------------------------
CAM_W, CAM_H = 72.9, 31.9
CAM_CLR = 1.5  # per side
CAM_CLR_TOP = 2.5  # extra headroom: the clip wraps over the top of the camera onto its face
HOOD_WALL = 2.4
HOOD_DEPTH = 32.0
WINDOW_W, WINDOW_H = 66.0, 26.0  # front opening; the lip keeps the camera from falling out
LID_T = REBATE_D


def box(x, y, z, at=(0, 0, 0)):
    return Manifold.cube([x, y, z]).translate(list(at))


def cyl(h, r, at=(0, 0, 0)):
    return Manifold.cylinder(h, r, r, SEG).translate(list(at))


def rounded_rect(w, h, r):
    """2D rectangle w x h (origin at its bottom-left) with corner radius r."""
    r = min(r, w / 2, h / 2)
    c = CrossSection.circle(r, SEG)
    return CrossSection.batch_hull([c.translate([x, y]) for x in (r, w - r) for y in (r, h - r)])


def along_y(section, depth, y0):
    """Extrude a section drawn in the x-z plane so it runs from y0 to y0 + depth."""
    return section.extrude(depth).rotate([90, 0, 0]).translate([0, y0 + depth, 0])


def base():
    shell = box(OUT_L, OUT_W, BASE_H) - box(INNER_L, INNER_W, BASE_H, (WALL, WALL, FLOOR))
    # Step inside the top of the walls for the lid.
    shell -= box(INNER_L + 2 * REBATE_W, INNER_W + 2 * REBATE_W, REBATE_D,
                 (WALL - REBATE_W, WALL - REBATE_W, BASE_H - REBATE_D))

    for hx, hy in HOLES:
        shell += cyl(STANDOFF_H, 3.0, (BX + hx, BY + hy, FLOOR))
        shell += cyl(BOARD_T + 1.0, 1.15, (BX + hx, BY + hy, BZ))  # peg through the 2.7 mm hole

    cuts = [
        # USB x4 + Ethernet: the whole far end.
        box(WALL + 2, BOARD_W - 2, 17.5, (OUT_L - WALL - 1, BY + 1, TOP - 0.5)),
        # USB-C power, 2x micro HDMI, audio: one slot along the near long side.
        box(BOARD_L - 23, WALL + 2, 12.0, (BX + USBC_X - 8, -1, TOP - 3.0)),
        # microSD card (under the board at the other end).
        box(WALL + 2, 16.0, TOP + 1.0 - FLOOR, (-1, BY + BOARD_W / 2 - 8, FLOOR)),
    ]
    # Vent slots in the floor.
    for i in range(5):
        cuts.append(box(3.0, 30.0, FLOOR + 2, (BX + 14 + i * 7, BY + 13, -1)))
    for c in cuts:
        shell -= c
    return shell


def lid():
    lid_l = INNER_L + 2 * REBATE_W - 2 * FIT
    lid_w = INNER_W + 2 * REBATE_W - 2 * FIT
    plate = box(lid_l, lid_w, LID_T)

    # Camera hood on top, front face flush with the front edge (the GPIO side, away from the cables).
    in_w, in_h = CAM_W + 2 * CAM_CLR, CAM_H + CAM_CLR + CAM_CLR_TOP
    out_w, out_h = in_w + 2 * HOOD_WALL, in_h + HOOD_WALL + 1.2
    hx = (lid_l - out_w) / 2
    y0 = lid_w - HOOD_DEPTH
    # Rounded top corners, flat bottom so the whole hood sits on the lid.
    profile = rounded_rect(out_w, out_h, 10.0) + CrossSection.square([out_w, out_h / 2])
    hood = along_y(profile, HOOD_DEPTH, y0).translate([hx, 0, LID_T])
    tunnel = along_y(rounded_rect(in_w, in_h, in_h / 2), HOOD_DEPTH - HOOD_WALL + 1, y0 - 1)
    tunnel = tunnel.translate([hx + HOOD_WALL, 0, LID_T + 1.2])
    window = along_y(rounded_rect(WINDOW_W, WINDOW_H, WINDOW_H / 2), HOOD_WALL + 2, lid_w - HOOD_WALL - 1)
    window = window.translate([hx + HOOD_WALL + (in_w - WINDOW_W) / 2, 0,
                               LID_T + 1.2 + (in_h - WINDOW_H) / 2])

    part = plate + hood - tunnel - window
    # Vent slots in the open part of the lid, behind the hood.
    for i in range(6):
        part -= box(3.0, y0 - 10, LID_T + 2, (14 + i * 11, 5, -1))
    return part


def write_stl(manifold, path):
    mesh = manifold.to_mesh()
    verts = np.asarray(mesh.vert_properties)[:, :3]
    tris = np.asarray(mesh.tri_verts)
    with open(path, "wb") as f:
        f.write(b"Cribby case".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            va, vb, vc = verts[a], verts[b], verts[c]
            n = np.cross(vb - va, vc - va)
            n = n / (np.linalg.norm(n) or 1)
            f.write(struct.pack("<12fH", *n, *va, *vb, *vc, 0))


if __name__ == "__main__":
    for name, part in (("base", base()), ("lid", lid())):
        path = os.path.join(OUT, f"{name}.stl")
        write_stl(part, path)
        lo, hi = np.array(part.bounding_box()[:3]), np.array(part.bounding_box()[3:])
        print(f"{name}.stl  {hi[0]-lo[0]:.1f} x {hi[1]-lo[1]:.1f} x {hi[2]-lo[2]:.1f} mm, "
              f"genus {part.genus()}, {part.num_tri()} triangles")
