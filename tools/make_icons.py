#!/usr/bin/env python3
"""국기 놀이 아이콘 생성: 180/192/512 PNG"""
import struct, zlib, math, os, sys

OUT = os.path.join(os.path.dirname(__file__), '..')

def save_png(path, pixels, w, h):
    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    rows = b''.join(b'\x00' + bytes(pixels[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    idat = zlib.compress(rows, 9)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))

def lerp(a, b, t): return a + (b - a) * t
def clamp(v, lo, hi): return max(lo, min(hi, v))
def dist(x, y, cx, cy): return math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

def render(size):
    px = [0] * (size * size * 4)
    cx = cy = size / 2
    r = size / 2

    for y in range(size):
        for x in range(size):
            d = dist(x + 0.5, y + 0.5, cx, cy)
            # 원형 클리핑
            alpha = clamp(r - d + 1.0, 0, 1)
            if alpha <= 0:
                continue

            # 배경: 따뜻한 크림색 #FFFBF0
            br, bg, bb = 255, 251, 240

            # 지구 그라디언트: 하늘색 #A8D8F0 → 흰색
            nx = (x + 0.5 - cx) / r
            ny = (y + 0.5 - cy) / r
            globe_a = max(0.0, min(1.0, 1.0 - (abs(nx) + abs(ny)) * 0.6))
            sky_r, sky_g, sky_b = 168, 216, 240
            gr = lerp(br, sky_r, globe_a)
            gg = lerp(bg, sky_g, globe_a)
            gb = lerp(bb, sky_b, globe_a)

            # 대륙 타원들 (녹색 #5BBF6A)
            land_r, land_g, land_b = 91, 191, 106
            is_land = False
            # 중앙 큰 대륙
            lx = (x + 0.5 - cx * 0.9) / (r * 0.35)
            ly = (y + 0.5 - cy * 1.05) / (r * 0.28)
            if lx * lx + ly * ly < 1.0: is_land = True
            # 왼쪽 대륙
            lx2 = (x + 0.5 - cx * 0.42) / (r * 0.22)
            ly2 = (y + 0.5 - cy * 1.0) / (r * 0.18)
            if lx2 * lx2 + ly2 * ly2 < 1.0: is_land = True
            # 오른쪽 대륙
            lx3 = (x + 0.5 - cx * 1.42) / (r * 0.18)
            ly3 = (y + 0.5 - cy * 0.9) / (r * 0.22)
            if lx3 * lx3 + ly3 * ly3 < 1.0: is_land = True
            # 아래 대륙
            lx4 = (x + 0.5 - cx * 1.1) / (r * 0.15)
            ly4 = (y + 0.5 - cy * 1.42) / (r * 0.19)
            if lx4 * lx4 + ly4 * ly4 < 1.0: is_land = True
            # 위 작은 대륙
            lx5 = (x + 0.5 - cx * 0.72) / (r * 0.13)
            ly5 = (y + 0.5 - cy * 0.52) / (r * 0.11)
            if lx5 * lx5 + ly5 * ly5 < 1.0: is_land = True

            if is_land:
                fr, fg, fb = land_r, land_g, land_b
            else:
                fr, fg, fb = int(gr), int(gg), int(gb)

            # 외곽 테두리 (어두운 green #3B9A4E)
            rim = max(0.0, r - d)
            border_a = clamp((2.5 - rim) * 0.6, 0, 1)
            border_r, border_g, border_b = 59, 154, 78
            fr = int(lerp(fr, border_r, border_a))
            fg = int(lerp(fg, border_g, border_a))
            fb = int(lerp(fb, border_b, border_a))

            a = int(alpha * 255)
            i = (y * size + x) * 4
            px[i], px[i+1], px[i+2], px[i+3] = fr, fg, fb, a

    return px

for size in [180, 192, 512]:
    path = os.path.join(OUT, f'icon-{size}.png')
    px = render(size)
    save_png(path, px, size, size)
    print(f'  생성: icon-{size}.png  ({size}×{size})')

print('아이콘 생성 완료.')
