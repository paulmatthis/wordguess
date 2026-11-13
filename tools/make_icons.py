#!/usr/bin/env python3
"""Draws the app icon (four rounded tiles) as PNGs, no dependencies."""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "icons")

BG = (43, 45, 49)
BLUE = (46, 158, 79)
AMBER = (233, 162, 59)
SLATE = (17, 18, 20)
TILES = [(0, 0, BLUE), (1, 0, SLATE), (0, 1, AMBER), (1, 1, BLUE)]


def inside(px, py, x, y, size, r):
    dx = max(x + r - px, 0, px - (x + size - r))
    dy = max(y + r - py, 0, py - (y + size - r))
    return dx * dx + dy * dy <= r * r


def render(n):
    pad, gap = n * 0.2, n * 0.06
    size = (n - 2 * pad - gap) / 2
    r = size * 0.2
    rows = []
    for py in range(n):
        row = bytearray([0])
        for px in range(n):
            color = BG
            for cx, cy, c in TILES:
                x = pad + cx * (size + gap)
                y = pad + cy * (size + gap)
                if x <= px < x + size and y <= py < y + size and inside(px + .5, py + .5, x, y, size, r):
                    color = c
                    break
            row += bytes(color)
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))


def write(n):
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(render(n), 9))
           + chunk(b"IEND", b""))
    with open(os.path.join(OUT, f"icon-{n}.png"), "wb") as f:
        f.write(png)


os.makedirs(OUT, exist_ok=True)
for n in (180, 192, 512):
    write(n)
print("icons written")
