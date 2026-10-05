"""Regenerate the geometric DojoFlow PNG icons using Python's standard library."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'icons'
INK = '#14171e'


def rgb(color):
    return bytes.fromhex(color.removeprefix('#'))


def make_icon(size):
    scale = 4
    side = size * scale
    factor = side / 512
    pixels = bytearray(rgb(INK) * side * side)

    def span(y, x0, x1, color):
        x0, x1 = max(0, x0), min(side, x1)
        if x1 > x0 and 0 <= y < side:
            pixels[(y * side + x0) * 3:(y * side + x1) * 3] = color * (x1 - x0)

    def circle(radius, color):
        radius *= factor
        center = side / 2
        for y in range(max(0, int(center - radius)), min(side, math.ceil(center + radius))):
            half = math.sqrt(max(0, radius * radius - (y + 0.5 - center) ** 2))
            span(y, math.ceil(center - half), math.ceil(center + half), rgb(color))

    def polygon(points, color):
        points = [(x * factor, y * factor) for x, y in points]
        color = rgb(color)
        for y in range(max(0, int(min(p[1] for p in points))), min(side, math.ceil(max(p[1] for p in points)))):
            scan = y + 0.5
            xs = []
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                if min(y1, y2) <= scan < max(y1, y2):
                    xs.append(x1 + (scan - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for i in range(0, len(xs), 2):
                span(y, math.ceil(xs[i]), math.ceil(xs[i + 1]), color)

    circle(208, '#263243')
    circle(194, INK)
    polygon([(140, 157), (216, 133), (256, 168), (296, 133), (372, 157), (401, 230),
             (350, 251), (328, 205), (328, 369), (184, 369), (184, 205), (162, 251), (111, 230)], '#ede6d6')
    polygon([(216, 133), (287, 278), (256, 295), (195, 141)], '#263243')
    polygon([(296, 133), (317, 142), (237, 300), (212, 283)], '#9ba3ae')
    polygon([(181, 283), (331, 283), (331, 317), (181, 317)], '#d14836')
    polygon([(253, 300), (281, 298), (317, 365), (288, 379)], '#d14836')
    polygon([(191, 397), (321, 397), (321, 407), (191, 407)], '#c9a227')

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter: none
        for x in range(size):
            for channel in range(3):
                total = sum(pixels[((y * scale + dy) * side + x * scale + dx) * 3 + channel]
                            for dy in range(scale) for dx in range(scale))
                raw.append(round(total / (scale * scale)))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for dimension, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
        (OUT / name).write_bytes(make_icon(dimension))
        print(name)
