# -*- coding: utf-8 -*-
"""Vector character rig + scenes rendered with cairo (720x720)."""
import math, random
import cairo

W = H = 720
TAU = math.pi * 2

# ───────────── helpers ─────────────
def hexc(h, a=1.0):
    h = h.lstrip('#')
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)

def lerp(a, b, t): return a + (b - a) * t
def lerp2(p, q, t): return (lerp(p[0], q[0], t), lerp(p[1], q[1], t))
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(t):
    t = clamp(t); return t * t * (3 - 2 * t)
def ease_io(t):
    t = clamp(t); return 0.5 - 0.5 * math.cos(math.pi * t)
def seg(t, a, b):
    """progress of t inside [a,b] eased"""
    if b <= a: return 1.0 if t >= b else 0.0
    return ease_io((t - a) / (b - a))

def ik(root, target, l1, l2, bend=1):
    """2-bone IK; returns (joint, clamped_target). bend=+1/-1 side."""
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy)
    d = clamp(d, abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3)
    a = math.atan2(dy, dx)
    cosb = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    b = math.acos(clamp(cosb, -1, 1))
    ang = a + bend * b
    joint = (root[0] + l1 * math.cos(ang), root[1] + l1 * math.sin(ang))
    end = (root[0] + d * math.cos(a), root[1] + d * math.sin(a))
    return joint, end

def rgba(ctx, c): ctx.set_source_rgba(*c)

def limb(ctx, pts, width, color):
    ctx.save()
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_width(width)
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    rgba(ctx, color)
    ctx.stroke()
    ctx.restore()

def circle(ctx, c, r, color):
    ctx.arc(c[0], c[1], r, 0, TAU); rgba(ctx, color); ctx.fill()

def ellipse(ctx, c, rx, ry, color=None, rot=0.0, fill=True):
    ctx.save(); ctx.translate(*c); ctx.rotate(rot); ctx.scale(rx, ry)
    ctx.arc(0, 0, 1, 0, TAU); ctx.restore()
    if color is not None:
        rgba(ctx, color)
        ctx.fill() if fill else ctx.stroke()

def rrect(ctx, x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    ctx.close_path()

def lin_grad(x0, y0, x1, y1, stops):
    g = cairo.LinearGradient(x0, y0, x1, y1)
    for off, col in stops: g.add_color_stop_rgba(off, *col)
    return g

def rad_grad(cx, cy, r, stops, fx=None, fy=None):
    g = cairo.RadialGradient(fx if fx is not None else cx, fy if fy is not None else cy, 0, cx, cy, r)
    for off, col in stops: g.add_color_stop_rgba(off, *col)
    return g

def soft_shadow(ctx, c, rx, ry, a=0.18):
    ctx.save(); ctx.translate(*c); ctx.scale(rx, ry)
    ctx.set_source(rad_grad(0, 0, 1, [(0, (0, 0, 0, a)), (1, (0, 0, 0, 0))]))
    ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore()

def glow(ctx, c, r, col, a=0.5):
    ctx.set_source(rad_grad(c[0], c[1], r, [(0, col[:3] + (a,)), (1, col[:3] + (0,))]))
    ctx.arc(c[0], c[1], r, 0, TAU); ctx.fill()

def drop(ctx, c, s, a=1.0):
    """water droplet (tear shape) size s"""
    x, y = c
    ctx.move_to(x, y - s * 1.6)
    ctx.curve_to(x + s * 0.2, y - s * 0.9, x + s, y - s * 0.3, x + s, y + s * 0.2)
    ctx.arc(x, y + s * 0.2, s, 0, math.pi)
    ctx.curve_to(x - s, y - s * 0.3, x - s * 0.2, y - s * 0.9, x, y - s * 1.6)
    ctx.close_path()
    ctx.set_source(lin_grad(x - s, y - s, x + s, y + s, [(0, hexc('#BDEBFF', a)), (1, hexc('#3AA7E8', a))]))
    ctx.fill()
    circle(ctx, (x - s * 0.35, y), s * 0.28, (1, 1, 1, 0.8 * a))

def sparkle(ctx, c, s, a=1.0, col='#FFE27A'):
    x, y = c
    # simpler 4-point star
    ctx.save(); ctx.translate(x, y)
    ctx.new_path()
    pts = []
    for k in range(8):
        r = s if k % 2 == 0 else s * 0.28
        ang = -math.pi / 2 + k * math.pi / 4
        pts.append((r * math.cos(ang), r * math.sin(ang)))
    ctx.move_to(*pts[0])
    for p in pts[1:]: ctx.line_to(*p)
    ctx.close_path(); rgba(ctx, hexc(col, a)); ctx.fill()
    ctx.restore()

def bubble(ctx, c, r, a=1.0):
    ctx.arc(c[0], c[1], r, 0, TAU)
    ctx.set_source(rad_grad(c[0], c[1], r, [(0, (1, 1, 1, 0.15 * a)), (0.8, (0.85, 0.95, 1, 0.35 * a)), (1, (1, 1, 1, 0.9 * a))]))
    ctx.fill()
    circle(ctx, (c[0] - r * 0.35, c[1] - r * 0.35), r * 0.22, (1, 1, 1, 0.9 * a))

def rng(seed):
    return random.Random(seed)

# ───────────── palette ─────────────
SKIN = hexc('#F5C9A6'); SKIN_D = hexc('#E4A882'); SKIN_L = hexc('#FFE1C9')
HAIR = hexc('#3A2A22'); HAIR_L = hexc('#5A4032')
SHIRT = hexc('#2FB5A7'); SHIRT_D = hexc('#1F8F84'); SHIRT_L = hexc('#6FD6CA')
DISH = hexc('#FBFBFB'); DISH_D = hexc('#DCE3EA')
PANTS = hexc('#35507A')
EYE = hexc('#2B2230'); CHEEK = hexc('#FF8FA3', 0.45); MOUTH = hexc('#B64B5C')
WATER = hexc('#6CC7F5'); WATER_L = hexc('#D8F3FF')
SOIL = hexc('#D9B27C'); SOIL_D = hexc('#B98B55'); SOIL_L = hexc('#EED3A6')

# ───────────── backgrounds ─────────────
def bg_bathroom(ctx, t):
    ctx.set_source(lin_grad(0, 0, 0, H, [(0, hexc('#E6F6FB')), (1, hexc('#CFEAF3'))])); ctx.paint()
    # tiles
    ctx.set_line_width(2); rgba(ctx, hexc('#FFFFFF', 0.55))
    for x in range(0, W + 1, 90):
        ctx.move_to(x, 0); ctx.line_to(x, 560); ctx.stroke()
    for y in range(0, 561, 90):
        ctx.move_to(0, y); ctx.line_to(W, y); ctx.stroke()
    # window light
    ctx.set_source(lin_grad(0, 0, W, H, [(0, (1, 1, 1, 0.45)), (0.5, (1, 1, 1, 0)), (1, (1, 1, 1, 0))])); ctx.paint()
    # plant
    ctx.save(); ctx.translate(95, 470)
    rrect(ctx, -30, 20, 60, 70, 14); rgba(ctx, hexc('#F2B880')); ctx.fill()
    for k, ang in enumerate([-0.9, -0.45, 0, 0.45, 0.9]):
        ctx.save(); ctx.rotate(ang + 0.05 * math.sin(TAU * t + k))
        ellipse(ctx, (0, -35), 13, 42, hexc('#59C08A' if k % 2 else '#3FA873'))
        ctx.restore()
    ctx.restore()

def counter(ctx):
    # counter top + front (sink)
    ctx.set_source(lin_grad(0, 555, 0, 720, [(0, hexc('#FFFFFF')), (0.08, hexc('#F1F5F8')), (1, hexc('#D5DEE6'))]))
    rrect(ctx, -20, 555, W + 40, 200, 26); ctx.fill()
    rgba(ctx, hexc('#FFFFFF', 0.9)); ctx.set_line_width(3)
    ctx.move_to(0, 560); ctx.line_to(W, 560); ctx.stroke()
    # basin
    ellipse(ctx, (400, 585), 190, 26, hexc('#B7C7D4'))
    ellipse(ctx, (400, 589), 176, 20, None)
    ctx.set_source(lin_grad(0, 570, 0, 610, [(0, hexc('#9FB3C4')), (1, hexc('#E3ECF2'))])); ctx.fill()
    ellipse(ctx, (400, 592), 10, 4, hexc('#7F94A6'))

def faucet(ctx, flow=1.0, t=0.0, outlet=(480, 468), bottom=585, drip=False):
    ox, oy = outlet
    # pipe from counter
    base_x = 620
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_width(26)
    ctx.set_source(lin_grad(base_x - 13, 0, base_x + 13, 0, [(0, hexc('#9DB0BF')), (0.4, hexc('#F7FBFF')), (1, hexc('#8A9EAE'))]))
    ctx.move_to(base_x, 575); ctx.line_to(base_x, 470)
    ctx.curve_to(base_x, 420, ox + 10, 420, ox, oy - 12)
    ctx.stroke()
    rrect(ctx, base_x - 30, 560, 60, 22, 8); ctx.set_source(lin_grad(0, 560, 0, 582, [(0, hexc('#E9F1F7')), (1, hexc('#9DB0BF'))])); ctx.fill()
    # handle
    rrect(ctx, base_x + 8, 520, 44, 14, 7); rgba(ctx, hexc('#AFC1CF')); ctx.fill()
    # outlet ring
    ellipse(ctx, (ox, oy - 4), 16, 6, hexc('#7E93A5'))
    if flow > 0:
        water_stream(ctx, (ox, oy), bottom, t, flow)
    if drip:
        ph = (t * 1.3) % 1.0
        drop(ctx, (ox, oy + 6 + ph * (bottom - oy - 10)), 7, 1 - ph * 0.3)

def water_stream(ctx, top, bottom, t, flow=1.0, width=18):
    x, y0 = top
    if bottom <= y0 + 4: return
    w = width * flow
    ctx.save()
    ctx.move_to(x - w / 2, y0)
    steps = 12
    for i in range(steps + 1):
        yy = lerp(y0, bottom, i / steps)
        wob = math.sin(TAU * (t * 3 + i * 0.35)) * 1.6
        ctx.line_to(x - w / 2 - i * 0.25 + wob, yy)
    for i in range(steps, -1, -1):
        yy = lerp(y0, bottom, i / steps)
        wob = math.sin(TAU * (t * 3 + i * 0.35 + 0.3)) * 1.6
        ctx.line_to(x + w / 2 + i * 0.25 + wob, yy)
    ctx.close_path()
    ctx.set_source(lin_grad(x - w, 0, x + w, 0, [(0, hexc('#5FBDF0', 0.85)), (0.45, hexc('#E8F8FF', 0.95)), (1, hexc('#45A9E6', 0.85))]))
    ctx.fill()
    # highlights moving down
    for k in range(4):
        ph = (t * 2.2 + k / 4) % 1
        yy = lerp(y0, bottom, ph)
        ellipse(ctx, (x - w * 0.15, yy), 2.2, 9, (1, 1, 1, 0.8))
    ctx.restore()
    splash(ctx, (x, bottom), t, flow)

def splash(ctx, c, t, amount=1.0, n=7, spread=38, seed=3):
    r = rng(seed)
    for k in range(n):
        ph = (t * 2.0 + k / n) % 1.0
        vx = r.uniform(-1, 1) * spread
        vy = r.uniform(0.6, 1.0) * 55
        x = c[0] + vx * ph
        y = c[1] - vy * ph * (1 - ph) * 2.2
        drop(ctx, (x, y), 4.2 * amount * (1 - ph * 0.4), (1 - ph) * amount)

def falling_drops(ctx, sources, t, length=120, n=3, size=6, seed=9, amount=1.0):
    r = rng(seed)
    for (sx, sy) in sources:
        for k in range(n):
            ph = (t * 1.6 + k / n + r.random()) % 1.0
            drop(ctx, (sx + r.uniform(-8, 8), sy + ph * ph * length), size, (1 - ph) * amount)

def bg_masjid(ctx, t, kaaba=False):
    ctx.set_source(lin_grad(0, 0, 0, H, [(0, hexc('#FFF4E2')), (1, hexc('#F6DDBB'))])); ctx.paint()
    # arch window
    ctx.save()
    ax, ay, aw, ah = 470, 110, 170, 300
    ctx.move_to(ax, ay + ah); ctx.line_to(ax, ay + 90)
    ctx.curve_to(ax, ay + 20, ax + aw / 2, ay - 20, ax + aw / 2, ay - 40)
    ctx.curve_to(ax + aw / 2, ay - 20, ax + aw, ay + 20, ax + aw, ay + 90)
    ctx.line_to(ax + aw, ay + ah); ctx.close_path()
    ctx.set_source(lin_grad(0, ay - 40, 0, ay + ah, [(0, hexc('#8FD3F4')), (1, hexc('#D9F1FA'))])); ctx.fill_preserve()
    rgba(ctx, hexc('#E7C38E')); ctx.set_line_width(12); ctx.stroke()
    # lattice
    ctx.set_line_width(2); rgba(ctx, hexc('#FFFFFF', 0.6))
    for i in range(1, 4):
        ctx.move_to(ax + aw * i / 4, ay); ctx.line_to(ax + aw * i / 4, ay + ah); ctx.stroke()
    ctx.restore()
    # lantern
    sway = math.sin(TAU * t) * 0.04
    ctx.save(); ctx.translate(200, 0); ctx.rotate(sway)
    rgba(ctx, hexc('#C99A5B')); ctx.set_line_width(3); ctx.move_to(0, 0); ctx.line_to(0, 110); ctx.stroke()
    glow(ctx, (0, 150), 70, hexc('#FFD27A'), 0.45)
    rrect(ctx, -22, 110, 44, 70, 14); ctx.set_source(lin_grad(-22, 0, 22, 0, [(0, hexc('#E3A94F')), (0.5, hexc('#FFE3A3')), (1, hexc('#D18E3A'))])); ctx.fill()
    ctx.restore()
    if kaaba:
        # distant kaaba on horizon at left
        ctx.save(); ctx.translate(90, 380)
        glow(ctx, (30, 20), 90, hexc('#FFE9A8'), 0.6)
        rrect(ctx, 0, 0, 62, 58, 4); rgba(ctx, hexc('#1E1E24')); ctx.fill()
        ctx.rectangle(0, 14, 62, 7); rgba(ctx, hexc('#E2B64B')); ctx.fill()
        ctx.restore()
    # floor + prayer mat
    ctx.set_source(lin_grad(0, 600, 0, H, [(0, hexc('#EACDA2')), (1, hexc('#DDBB8C'))]))
    ctx.rectangle(0, 610, W, H - 610); ctx.fill()

def prayer_mat(ctx):
    ctx.save()
    ctx.move_to(110, 640); ctx.line_to(640, 640); ctx.line_to(680, 690); ctx.line_to(70, 690); ctx.close_path()
    ctx.set_source(lin_grad(0, 640, 0, 690, [(0, hexc('#2E8B7A')), (1, hexc('#1E6E61'))])); ctx.fill()
    rgba(ctx, hexc('#F4D27A')); ctx.set_line_width(3)
    ctx.move_to(130, 648); ctx.line_to(620, 648); ctx.line_to(650, 682); ctx.line_to(100, 682); ctx.close_path(); ctx.stroke()
    ctx.restore()

def bg_outdoor(ctx, t):
    ctx.set_source(lin_grad(0, 0, 0, H, [(0, hexc('#BFE7FF')), (0.6, hexc('#FFF1D6')), (1, hexc('#F7D9A8'))])); ctx.paint()
    glow(ctx, (590, 120), 120, hexc('#FFF3B0'), 0.9)
    circle(ctx, (590, 120), 42, hexc('#FFE27A'))
    # clouds
    for (cx, cy, s) in [(160 + 20 * math.sin(TAU * t), 110, 1.0), (430 - 15 * math.sin(TAU * t), 70, 0.7)]:
        for dx, dy, r in [(-40, 10, 30), (0, 0, 42), (40, 12, 30)]:
            circle(ctx, (cx + dx * s, cy + dy * s), r * s, (1, 1, 1, 0.9))
    # dunes
    ctx.move_to(0, 470); ctx.curve_to(180, 400, 330, 470, 480, 430); ctx.curve_to(600, 400, 680, 440, W, 430)
    ctx.line_to(W, H); ctx.line_to(0, H); ctx.close_path()
    ctx.set_source(lin_grad(0, 400, 0, H, [(0, hexc('#F0CF9A')), (1, hexc('#E2B579'))])); ctx.fill()
    # palm
    ctx.save(); ctx.translate(90, 470)
    rgba(ctx, hexc('#9A6B42')); ctx.set_line_width(14); ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.move_to(0, 0); ctx.curve_to(8, -60, 4, -110, 16, -160); ctx.stroke()
    for k, ang in enumerate([-2.6, -2.0, -1.2, -0.5, 0.2]):
        ctx.save(); ctx.translate(16, -160); ctx.rotate(ang + 0.05 * math.sin(TAU * t + k))
        ellipse(ctx, (45, 0), 50, 11, hexc('#3FA873' if k % 2 else '#59C08A'))
        ctx.restore()
    ctx.restore()

def soil_tray(ctx, t=0, dust=0.0, dent=None):
    # wooden tray with clean soil in front of child
    ctx.set_source(lin_grad(0, 560, 0, 720, [(0, hexc('#C98F58')), (1, hexc('#9E6A3C'))]))
    rrect(ctx, 40, 565, 640, 200, 30); ctx.fill()
    ellipse(ctx, (360, 585), 300, 34, None)
    ctx.set_source(lin_grad(0, 555, 0, 620, [(0, SOIL_L), (1, SOIL)])); ctx.fill()
    r = rng(5)
    for _ in range(90):
        x = r.uniform(80, 640); y = r.uniform(566, 608)
        if ((x - 360) / 295) ** 2 + ((y - 585) / 30) ** 2 < 1:
            circle(ctx, (x, y), r.uniform(1, 2.4), SOIL_D[:3] + (0.6,))
    if dent:
        for d in dent:
            ellipse(ctx, d, 34, 9, SOIL_D[:3] + (0.55,))

def dust_puff(ctx, centers, p, seed=4):
    """p in 0..1 life of puff"""
    if p <= 0 or p >= 1: return
    r = rng(seed)
    for c in centers:
        for k in range(14):
            ang = r.uniform(math.pi * 1.05, math.pi * 1.95)
            sp = r.uniform(30, 80)
            x = c[0] + math.cos(ang) * sp * p
            y = c[1] + math.sin(ang) * sp * p
            circle(ctx, (x, y), r.uniform(4, 9) * (0.6 + p), SOIL_L[:3] + ((1 - p) * 0.8,))

def bg_shower(ctx, t):
    ctx.set_source(lin_grad(0, 0, 0, H, [(0, hexc('#E3F1FF')), (1, hexc('#C9DFF5'))])); ctx.paint()
    ctx.set_line_width(2); rgba(ctx, hexc('#FFFFFF', 0.6))
    for x in range(0, W + 1, 72):
        ctx.move_to(x, 0); ctx.line_to(x, H); ctx.stroke()
    for y in range(0, H + 1, 72):
        ctx.move_to(0, y); ctx.line_to(W, y); ctx.stroke()
    # steam
    for k in range(5):
        ph = (t * 0.5 + k / 5) % 1
        circle(ctx, (120 + k * 120, 600 - ph * 520), 40 + ph * 30, (1, 1, 1, 0.18 * (1 - ph)))

def shower_head(ctx, pos=(360, 40), t=0.0, targets=None, spread=150, intensity=1.0, bottom=700, seed=11):
    x, y = pos
    rgba(ctx, hexc('#AFC1CF')); ctx.set_line_width(14); ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.move_to(W + 10, 0); ctx.line_to(x + 60, 0); ctx.curve_to(x + 30, 0, x, 5, x, y - 10); ctx.stroke()
    ellipse(ctx, (x, y), 58, 18, None)
    ctx.set_source(lin_grad(x - 58, 0, x + 58, 0, [(0, hexc('#9DB0BF')), (0.5, hexc('#F4F9FC')), (1, hexc('#8A9EAE'))])); ctx.fill()
    if intensity <= 0: return
    r = rng(seed)
    n = int(46 * intensity)
    for k in range(n):
        ox = r.uniform(-1, 1)
        ph = (t * 2.2 + r.random()) % 1.0
        x0 = x + ox * 45
        x1 = x + ox * spread
        yy = y + 12 + ph * (bottom - y)
        xx = lerp(x0, x1, ph)
        ctx.set_line_width(5); ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        rgba(ctx, hexc('#2E95DA', 0.7 * intensity))
        ctx.move_to(xx, yy); ctx.line_to(xx + (x1 - x0) * 0.05, yy + 26); ctx.stroke()
        rgba(ctx, (1, 1, 1, 0.7 * intensity)); ctx.set_line_width(2)
        ctx.move_to(xx - 1, yy + 2); ctx.line_to(xx - 1 + (x1 - x0) * 0.05, yy + 14); ctx.stroke()


# ───────────── FRONT CHARACTER ─────────────
class Front:
    """State for front-facing child."""
    def __init__(self, **kw):
        self.head = (360, 235)
        self.tilt = 0.0
        self.eyes = 'open'        # open / closed / happy / look_down / wide
        self.blink = 0.0
        self.mouth = 'smile'      # smile / open / puff / o / grin / speak
        self.mouth_open = 0.0
        self.puff = 0.0           # cheeks 0..1
        self.puff_side = 0.0      # -1 left(viewer) .. +1 right
        self.brows = 0.0          # raised amount
        self.hands = {'R': (300, 560), 'L': (420, 560)}  # R = character right (viewer left)
        self.hand_shape = {'R': 'open', 'L': 'open'}      # open / cup / point / fist / flat
        self.hand_rot = {'R': 0.0, 'L': 0.0}
        self.sleeves = 'rolled'   # rolled / long
        self.outfit = 'shirt'     # shirt / dish
        self.wet = 0.0            # hair/face shine
        self.cap = False
        self.full = False
        self.arm_front = {'R': True, 'L': True}
        self.__dict__.update(kw)

SH = {'R': (262, 378), 'L': (458, 378)}
UA, FA = 108, 104

def draw_front(ctx, s: Front, t=0.0, after_arms=None):
    hx, hy = s.head
    ctx.save()
    # ---- body ----
    shirt, shirt_d, shirt_l = (DISH, DISH_D, hexc('#FFFFFF')) if s.outfit == 'dish' else (SHIRT, SHIRT_D, SHIRT_L)
    bottom = 640 if s.full else 760
    if s.full:
        # legs
        for sx in (-52, 52):
            limb(ctx, [(360 + sx, 600), (360 + sx * 0.95, 880)], 70, PANTS if s.outfit == 'shirt' else DISH)
            ellipse(ctx, (360 + sx * 1.1, 905), 46, 22, SKIN)
            ellipse(ctx, (360 + sx * 1.1, 900), 40, 14, SKIN_L)
    ctx.move_to(262, 372)
    ctx.curve_to(300, 330, 420, 330, 458, 372)
    ctx.curve_to(495, 420, 505, 560, 490, bottom)
    ctx.line_to(230, bottom)
    ctx.curve_to(215, 560, 225, 420, 262, 372)
    ctx.close_path()
    ctx.set_source(lin_grad(230, 0, 490, 0, [(0, shirt_d), (0.35, shirt), (0.7, shirt), (1, shirt_d)])); ctx.fill()
    # collar / placket
    ctx.move_to(328, 336); ctx.curve_to(340, 372, 380, 372, 392, 336)
    rgba(ctx, shirt_d); ctx.set_line_width(6); ctx.stroke()
    if s.outfit == 'dish':
        # Omani dishdasha tassel (farrusha)
        limb(ctx, [(360, 360), (360, 450)], 5, hexc('#D9B98A'))
        circle(ctx, (360, 456), 7, hexc('#D9B98A'))
    # neck
    rrect(ctx, 338, 300, 44, 50, 16); rgba(ctx, SKIN_D); ctx.fill()
    # ---- arms behind? (none; arms drawn after head) ----
    # ---- head ----
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(s.tilt); ctx.translate(-hx, -hy)
    # ears
    for sx in (-1, 1):
        ellipse(ctx, (hx + sx * 92, hy + 12), 20, 26, SKIN)
        ellipse(ctx, (hx + sx * 92, hy + 12), 10, 15, SKIN_D)
    # face
    ellipse(ctx, (hx, hy), 94, 100, None)
    ctx.set_source(rad_grad(hx - 20, hy - 30, 130, [(0, SKIN_L), (0.6, SKIN), (1, SKIN_D)])); ctx.fill()
    # hair
    ctx.save()
    ctx.move_to(hx - 98, hy + 5)
    ctx.curve_to(hx - 110, hy - 110, hx - 40, hy - 125, hx + 5, hy - 118)
    ctx.curve_to(hx + 80, hy - 120, hx + 112, hy - 70, hx + 98, hy + 5)
    ctx.curve_to(hx + 92, hy - 40, hx + 70, hy - 66, hx + 40, hy - 64)
    ctx.curve_to(hx + 10, hy - 88, hx - 30, hy - 60, hx - 55, hy - 72)
    ctx.curve_to(hx - 80, hy - 55, hx - 92, hy - 30, hx - 98, hy + 5)
    ctx.close_path()
    ctx.set_source(lin_grad(hx, hy - 125, hx, hy, [(0, HAIR_L), (1, HAIR)])); ctx.fill()
    if s.wet > 0:
        for k, (dx, dy) in enumerate([(-50, -95), (-10, -108), (35, -100), (70, -78)]):
            ellipse(ctx, (hx + dx, hy + dy), 10, 4, (1, 1, 1, 0.55 * s.wet), rot=-0.3)
    ctx.restore()
    if s.cap:
        # Omani kuma
        ctx.move_to(hx - 96, hy - 30); ctx.curve_to(hx - 96, hy - 140, hx + 96, hy - 140, hx + 96, hy - 30)
        ctx.curve_to(hx + 40, hy - 45, hx - 40, hy - 45, hx - 96, hy - 30); ctx.close_path()
        ctx.set_source(lin_grad(hx, hy - 140, hx, hy - 30, [(0, hexc('#FFFFFF')), (1, hexc('#E9EEF3'))])); ctx.fill()
        rgba(ctx, hexc('#2E8B7A')); ctx.set_line_width(3)
        for k in range(-3, 4):
            circle(ctx, (hx + k * 24, hy - 62 - (9 - k * k)), 4, hexc('#2E8B7A'))
    # brows
    by = hy - 30 - s.brows * 10
    for sx in (-1, 1):
        ctx.move_to(hx + sx * 50, by + 2); ctx.curve_to(hx + sx * 40, by - 8, hx + sx * 22, by - 8, hx + sx * 14, by)
        rgba(ctx, HAIR); ctx.set_line_width(6); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.stroke()
    # eyes
    ey = hy + 8
    closed = s.eyes == 'closed' or s.blink > 0.5
    for sx in (-1, 1):
        ex = hx + sx * 36
        if closed or s.eyes == 'happy':
            ctx.move_to(ex - 14, ey); ctx.curve_to(ex - 8, ey + (8 if closed else -9), ex + 8, ey + (8 if closed else -9), ex + 14, ey)
            rgba(ctx, EYE); ctx.set_line_width(5); ctx.stroke()
        else:
            dy = 6 if s.eyes == 'look_down' else 0
            rs = 1.15 if s.eyes == 'wide' else 1.0
            ellipse(ctx, (ex, ey + dy), 12 * rs, 15 * rs, EYE)
            circle(ctx, (ex - 4, ey + dy - 5), 4.5, (1, 1, 1, 1))
            circle(ctx, (ex + 4, ey + dy + 4), 2, (1, 1, 1, 0.8))
    # nose
    ctx.move_to(hx - 5, hy + 34); ctx.curve_to(hx, hy + 40, hx + 5, hy + 40, hx + 8, hy + 34)
    rgba(ctx, SKIN_D); ctx.set_line_width(4); ctx.stroke()
    # cheeks
    for sx in (-1, 1):
        pf = s.puff * (1 + 0.6 * sx * s.puff_side)
        ellipse(ctx, (hx + sx * (60 + 8 * pf), hy + 40), 17 + 10 * pf, 11 + 7 * pf, CHEEK)
    if s.puff > 0:
        for sx in (-1, 1):
            pf = s.puff * (1 + 0.6 * sx * s.puff_side)
            ellipse(ctx, (hx + sx * (70 + 4 * pf), hy + 48), 10 + 18 * pf, 12 + 20 * pf, SKIN)
            ellipse(ctx, (hx + sx * (70 + 6 * pf), hy + 44), 12 + 8 * pf, 8 + 5 * pf, CHEEK)
    # mouth
    my = hy + 62
    if s.mouth == 'smile':
        ctx.move_to(hx - 24, my - 4); ctx.curve_to(hx - 10, my + 12, hx + 10, my + 12, hx + 24, my - 4)
        rgba(ctx, MOUTH); ctx.set_line_width(5); ctx.stroke()
    elif s.mouth in ('open', 'speak', 'o', 'grin'):
        o = s.mouth_open if s.mouth != 'grin' else 0.7
        if s.mouth == 'o':
            ellipse(ctx, (hx, my + 2), 9, 10 + 4 * o, MOUTH)
        else:
            ctx.move_to(hx - 22, my - 3)
            ctx.curve_to(hx - 12, my + 6 + 22 * o, hx + 12, my + 6 + 22 * o, hx + 22, my - 3)
            ctx.curve_to(hx + 8, my + 1, hx - 8, my + 1, hx - 22, my - 3)
            ctx.close_path(); rgba(ctx, MOUTH); ctx.fill()
            if s.mouth == 'grin':
                ctx.rectangle(hx - 15, my - 1, 30, 7); rgba(ctx, (1, 1, 1, 1)); ctx.fill()
            elif o > 0.35:
                ellipse(ctx, (hx, my + 4 + 12 * o), 9, 4 + 3 * o, hexc('#FF9AA8'))
    elif s.mouth == 'puff':
        ctx.move_to(hx - 12, my); ctx.curve_to(hx - 4, my + 4, hx + 4, my + 4, hx + 12, my)
        rgba(ctx, MOUTH); ctx.set_line_width(5); ctx.stroke()
    if s.wet > 0:
        for (dx, dy) in [(-60, 20), (55, 30), (-20, 80), (30, 88)]:
            drop(ctx, (hx + dx, hy + dy), 5, 0.8 * s.wet)
    ctx.restore()  # head rotation
    if after_arms is None:
        pass
    ctx.restore()

def draw_arm(ctx, s: Front, side, hand=None):
    sh = SH[side]
    target = hand or s.hands[side]
    e1, end = ik(sh, target, UA, FA, bend=1)
    e2, _ = ik(sh, target, UA, FA, bend=-1)
    # prefer the lower / outer elbow (natural arm)
    out = -1 if side == 'R' else 1
    score = lambda e: e[1] + 0.6 * out * e[0]
    elbow = e1 if score(e1) > score(e2) else e2
    if getattr(s, 'elbow_up', {}).get(side):
        elbow = e2 if elbow is e1 else e1
    shirt, shirt_d = (DISH, DISH_D) if s.outfit == 'dish' else (SHIRT, SHIRT_D)
    if s.sleeves == 'rolled':
        limb(ctx, [sh, elbow], 44, shirt_d)
        limb(ctx, [sh, elbow], 36, shirt)
        limb(ctx, [elbow, end], 32, SKIN_D)
        limb(ctx, [elbow, end], 26, SKIN)
        # cuff
        cx = lerp2(sh, elbow, 0.92)
        circle(ctx, cx, 22, shirt_d)
    else:
        limb(ctx, [sh, elbow, end], 42, shirt_d)
        limb(ctx, [sh, elbow, end], 35, shirt)
        cuff = lerp2(elbow, end, 0.82)
        limb(ctx, [cuff, end], 36, shirt_d)
    draw_hand(ctx, end, elbow, s.hand_shape[side], side, s.hand_rot[side],
              abs_angle=getattr(s, 'hand_abs', {}).get(side))
    if getattr(s, 'dusty', 0) > 0:
        circle(ctx, end, 22, SOIL[:3] + (0.35 * s.dusty,))
    return elbow, end

def draw_hand(ctx, pos, elbow, shape, side, rot_extra=0.0, abs_angle=None, tint=None):
    ang = math.atan2(pos[1] - elbow[1], pos[0] - elbow[0]) + rot_extra
    if abs_angle is not None:
        ang = abs_angle
    ctx.save(); ctx.translate(*pos); ctx.rotate(ang); ctx.scale(1.3, 1.3)
    mirror = 1 if side == 'R' else -1
    if shape == 'point':
        ellipse(ctx, (8, 0), 19, 17, SKIN)
        limb(ctx, [(16, -4 * mirror), (38, -6 * mirror)], 10, SKIN)
        ellipse(ctx, (14, 8 * mirror), 10, 7, SKIN_D)
    elif shape == 'fist':
        ellipse(ctx, (10, 0), 20, 18, SKIN)
        for k in range(3):
            ellipse(ctx, (22, -9 + k * 9), 6, 5, SKIN_D)
    elif shape == 'cup':
        ellipse(ctx, (12, 0), 24, 21, SKIN)
        ellipse(ctx, (16, 0), 15, 12, SKIN_D)
        ellipse(ctx, (4, -14 * mirror), 10, 6, SKIN, rot=0.4 * mirror)
    elif shape == 'flat':
        ellipse(ctx, (14, 0), 27, 17, SKIN)
        for k in range(4):
            limb(ctx, [(28, -10 + k * 6.6), (40, -10 + k * 6.6)], 6, SKIN)
        ellipse(ctx, (6, -16 * mirror), 12, 6, SKIN, rot=0.5 * mirror)
    else:  # open
        ellipse(ctx, (12, 0), 23, 19, SKIN)
        for k in range(4):
            limb(ctx, [(24, -11 + k * 7.3), (38, -12 + k * 8)], 7, SKIN)
        limb(ctx, [(4, -15 * mirror), (16, -26 * mirror)], 8, SKIN)
    ctx.restore()

def draw_arms(ctx, s, sides=('R', 'L')):
    out = {}
    for side in sides:
        out[side] = draw_arm(ctx, s, side)
    return out

def blink_at(t, times=(0.37,), dur=0.06):
    for b in times:
        if abs(t - b) < dur / 2:
            return 1.0
    return 0.0


# ───────────── SIDE CHARACTER (faces left) ─────────────
TOR = 150; NECK = 26; HEADR = 66
S_UA, S_FA = 84, 84
S_TH, S_SH = 100, 98
GROUND = 648

class Side:
    def __init__(self, **kw):
        self.P = (380, 440)         # hip
        self.torso = 0.0            # radians, 0 upright, +forward (towards -x)
        self.head = 0.0             # extra head tilt forward
        self.hand = (360, 560)      # hand target
        self.knee_ground = None
        self.ankle = (390, 628)     # ankle target
        self.foot = 'flat'          # flat / toes (upright on toes) / back (lying along ground)
        self.speak = 0.0
        self.eyes = 'open'
        self.blink = 0.0
        self.elbow_bend = -1        # sign for arm bend
        self.knee_bend = 1
        self.__dict__.update(kw)

def fwd(a):
    """direction vector for torso angle (facing left)"""
    return (-math.sin(a), -math.cos(a))

def draw_side(ctx, s: Side, t=0.0):
    P = s.P
    d = fwd(s.torso)
    shoulder = (P[0] + d[0] * TOR * 0.82, P[1] + d[1] * TOR * 0.82)
    neck = (P[0] + d[0] * TOR, P[1] + d[1] * TOR)
    hd = fwd(s.torso + s.head)
    head = (neck[0] + hd[0] * (NECK + HEADR * 0.8), neck[1] + hd[1] * (NECK + HEADR * 0.8))
    # shadow
    soft_shadow(ctx, (P[0] - 40, GROUND + 6), 170, 16, 0.22)
    # ---- far leg (slightly darker, offset) ----
    knee, ank = ik(P, s.ankle, S_TH, S_SH, bend=-s.knee_bend if True else 1)
    # knee should point forward (-x): choose bend so knee x < line
    k1, _ = ik(P, s.ankle, S_TH, S_SH, bend=1)
    k2, _ = ik(P, s.ankle, S_TH, S_SH, bend=-1)
    knee = k1 if k1[0] < k2[0] else k2
    if s.knee_bend < 0:
        knee = k2 if knee is k1 else k1
    def leg(offx, dark):
        col = DISH_D if dark else DISH
        kx = (knee[0] + offx, knee[1]); ax = (ank[0] + offx, ank[1]); px = (P[0] + offx, P[1])
        limb(ctx, [px, kx, ax], 70, hexc('#C9D3DC') if dark else hexc('#E1E8EE'))
        limb(ctx, [px, kx, ax], 62, col)
        foot(ax, kx, dark)
    def foot(a, k, dark):
        colf = SKIN_D if dark else SKIN
        if s.foot == 'toes':
            # foot upright, toes on ground pointing forward
            tip = (a[0] - 10, GROUND - 2)
            limb(ctx, [a, tip], 26, colf)
            limb(ctx, [tip, (tip[0] - 16, GROUND - 2)], 18, colf)
        elif s.foot == 'back':
            tip = (a[0] + 44, GROUND - 6)
            limb(ctx, [a, tip], 26, colf)
        else:
            tip = (a[0] - 44, GROUND - 8)
            limb(ctx, [(a[0] + 8, a[1]), tip], 26, colf)
    leg(14, True)
    # ---- far arm ----
    def arm(offx, dark):
        sh = (shoulder[0] + offx, shoulder[1])
        tg = (s.hand[0] + offx * 0.6, s.hand[1])
        e1, _ = ik(sh, tg, S_UA, S_FA, 1)
        e2, _ = ik(sh, tg, S_UA, S_FA, -1)
        # elbow backward (x larger) normally
        el = e1 if (e1[0] > e2[0]) == (s.elbow_bend < 0) else e2
        _, end = ik(sh, tg, S_UA, S_FA, 1)
        col = DISH_D if dark else DISH
        limb(ctx, [sh, el, end], 38, hexc('#C9D3DC') if dark else hexc('#D6DEE6'))
        limb(ctx, [sh, el, end], 31, col)
        ellipse(ctx, end, 15, 13, SKIN_D if dark else SKIN)
        return el, end
    arm(10, True)
    # ---- torso ----
    ctx.save(); ctx.translate(*P); ctx.rotate(-s.torso)
    ctx.move_to(-46, 20); ctx.curve_to(-64, -60, -58, -TOR + 14, -26, -TOR)
    ctx.line_to(30, -TOR); ctx.curve_to(62, -TOR + 24, 64, -40, 50, 24)
    ctx.curve_to(14, 40, -24, 38, -46, 20); ctx.close_path()
    ctx.set_source(lin_grad(-60, 0, 62, 0, [(0, hexc('#FFFFFF')), (0.55, DISH), (1, DISH_D)])); ctx.fill()
    # farrusha tassel
    limb(ctx, [(-40, -TOR + 22), (-46, -TOR + 80)], 4, hexc('#D9B98A'))
    circle(ctx, (-46, -TOR + 84), 5, hexc('#D9B98A'))
    ctx.restore()
    # near leg
    leg(-6, False)
    # ---- head ----
    hx, hy = head
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(s.torso + s.head))
    rrect(ctx, -16, 30, 34, 40, 12); rgba(ctx, SKIN_D); ctx.fill()  # neck
    ellipse(ctx, (0, 0), HEADR, HEADR * 1.05, None)
    ctx.set_source(rad_grad(-20, -20, 90, [(0, SKIN_L), (0.7, SKIN), (1, SKIN_D)])); ctx.fill()
    # nose
    ctx.move_to(-HEADR + 4, -2); ctx.curve_to(-HEADR - 12, 8, -HEADR - 6, 16, -HEADR + 6, 16); rgba(ctx, SKIN); ctx.fill()
    # kuma cap
    ctx.move_to(-HEADR - 2, -18); ctx.curve_to(-HEADR, -HEADR * 1.25, HEADR, -HEADR * 1.25, HEADR + 2, -12)
    ctx.curve_to(20, -30, -30, -30, -HEADR - 2, -18); ctx.close_path()
    ctx.set_source(lin_grad(0, -HEADR * 1.2, 0, -12, [(0, hexc('#FFFFFF')), (1, hexc('#E6EBF0'))])); ctx.fill()
    for k in range(-2, 3):
        circle(ctx, (k * 20, -44 - (6 - k * k)), 3.5, hexc('#2E8B7A'))
    # hair back
    ctx.move_to(HEADR - 4, -14); ctx.curve_to(HEADR + 8, 10, HEADR, 30, HEADR - 14, 36)
    ctx.curve_to(HEADR - 8, 12, HEADR - 20, -6, HEADR - 4, -14); rgba(ctx, HAIR); ctx.fill()
    # ear
    ellipse(ctx, (14, 6), 12, 16, SKIN_D)
    # eye
    closed = s.eyes == 'closed' or s.blink > 0.5
    if closed:
        ctx.move_to(-38, 2); ctx.curve_to(-32, 9, -24, 9, -18, 2); rgba(ctx, EYE); ctx.set_line_width(4); ctx.stroke()
    else:
        ellipse(ctx, (-28, 2), 8, 11, EYE); circle(ctx, (-30, -2), 3, (1, 1, 1, 1))
    ctx.move_to(-40, -16); ctx.curve_to(-34, -22, -24, -22, -18, -18); rgba(ctx, HAIR); ctx.set_line_width(4); ctx.stroke()
    ellipse(ctx, (-32, 22), 11, 7, CHEEK)
    # mouth
    if s.speak > 0.05:
        ellipse(ctx, (-50, 34), 7, 3 + 7 * s.speak, MOUTH)
    else:
        ctx.move_to(-56, 32); ctx.curve_to(-50, 38, -44, 38, -40, 34); rgba(ctx, MOUTH); ctx.set_line_width(4); ctx.stroke()
    ctx.restore()
    # near arm
    arm(-4, False)
    a = -(s.torso + s.head)
    mx, my = -62, 30
    mouth = (hx + mx * math.cos(a) - my * math.sin(a), hy + mx * math.sin(a) + my * math.cos(a))
    return {'head': head, 'mouth': mouth, 'shoulder': shoulder, 'neck': neck, 'chest': lerp2(P, shoulder, 0.75)}

def speech_waves(ctx, origin, t, strength=1.0, direction=-1, col='#2E8B7A'):
    x, y = origin
    for k in range(3):
        ph = (t * 1.5 + k / 3) % 1
        r = 18 + ph * 60 * strength
        ctx.save()
        ctx.arc(x, y, r, math.pi - 0.5 if direction < 0 else -0.5, math.pi + 0.5 if direction < 0 else 0.5)
        rgba(ctx, hexc(col, (1 - ph) * 0.8)); ctx.set_line_width(5); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.stroke()
        ctx.restore()

def heart_glow(ctx, c, t, col='#FF7FA0'):
    pulse = 0.5 + 0.5 * math.sin(TAU * t)
    glow(ctx, c, 70 + 15 * pulse, hexc('#FFD6E2'), 0.7)
    x, y = c; s = 22 + 4 * pulse
    ctx.move_to(x, y + s * 0.9)
    ctx.curve_to(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35)
    ctx.curve_to(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9)
    rgba(ctx, hexc(col)); ctx.fill()

def sparkles_ring(ctx, c, t, r=150, n=6, size=12):
    for k in range(n):
        ang = TAU * (k / n + t * 0.15)
        tw = 0.5 + 0.5 * math.sin(TAU * (t * 2 + k / n))
        sparkle(ctx, (c[0] + math.cos(ang) * r, c[1] + math.sin(ang) * r * 0.8), size * (0.6 + 0.6 * tw), 0.4 + 0.6 * tw)


def counter_dots(ctx, n_done, total=3, t_in_cycle=0.0, col='#2FB5A7'):
    """glass progress dots at the top (for repeated actions)"""
    cx = W / 2; y = 46; gap = 46
    x0 = cx - gap * (total - 1) / 2
    rrect(ctx, x0 - 34, y - 26, gap * (total - 1) + 68, 52, 26)
    rgba(ctx, (1, 1, 1, 0.55)); ctx.fill_preserve(); rgba(ctx, (1, 1, 1, 0.9)); ctx.set_line_width(2); ctx.stroke()
    for i in range(total):
        c = (x0 + gap * i, y)
        if i < n_done:
            circle(ctx, c, 15, hexc(col))
            drop(ctx, (c[0], c[1] + 2), 6, 1.0)
        elif i == n_done:
            circle(ctx, c, 15, hexc(col, 0.25 + 0.5 * t_in_cycle))
        else:
            circle(ctx, c, 13, (0.6, 0.7, 0.75, 0.35))

def question_mark(ctx, c, t):
    ctx.save()
    bob = math.sin(TAU * t) * 6
    ctx.select_font_face('DejaVu Sans', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(90)
    glow(ctx, (c[0] + 25, c[1] - 30 + bob), 70, hexc('#FFE27A'), 0.6)
    ctx.move_to(c[0], c[1] + bob); ctx.text_path('?')
    rgba(ctx, hexc('#F29F3D')); ctx.fill()
    ctx.restore()

def miswak(ctx, pos, ang=0.0):
    ctx.save(); ctx.translate(*pos); ctx.rotate(ang)
    rrect(ctx, -70, -7, 120, 14, 7); ctx.set_source(lin_grad(0, -7, 0, 7, [(0, hexc('#C9965E')), (1, hexc('#8A5A2E'))])); ctx.fill()
    for k in range(6):
        limb(ctx, [(-70, -5 + k * 2), (-84, -7 + k * 3)], 2.5, hexc('#F3E3C4'))
    ctx.restore()

def soap(ctx, pos, ang=0.0):
    ctx.save(); ctx.translate(*pos); ctx.rotate(ang)
    rrect(ctx, -26, -16, 52, 32, 12); ctx.set_source(lin_grad(0, -16, 0, 16, [(0, hexc('#FFD1E0')), (1, hexc('#F59BB8'))])); ctx.fill()
    ctx.restore()
