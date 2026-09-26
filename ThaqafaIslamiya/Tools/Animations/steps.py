# -*- coding: utf-8 -*-
"""Animation definitions: one function per lesson step. f(ctx, t) with t in [0,1) looping."""
import math
from rig import *

R = math.radians
UP = -math.pi / 2
STEPS = {}      # id -> (seconds, fn)

def step(id, seconds=3.0):
    def deco(fn):
        STEPS[id] = (seconds, fn)
        return fn
    return deco

def kf(t, keys):
    """keyframes [(time, value)], value float or tuple; eased interpolation"""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = ease_io((t - t0) / (t1 - t0)) if t1 > t0 else 1
            if isinstance(v0, tuple):
                return tuple(lerp(a, b, u) for a, b in zip(v0, v1))
            return lerp(v0, v1, u)
    return keys[-1][1]

def cyc(t, n):
    """split t into n cycles -> (index, local t)"""
    x = t * n
    i = min(int(x), n - 1)
    return i, x - i

STREAM_X = 480
REST = {'R': (292, 562), 'L': (428, 562)}

# ═════════════════════ front scene helper ═════════════════════
def front_scene(ctx, t, s, bg=bg_bathroom, scene='sink', flow=1.0, stream_bottom=585, drip=False,
                behind=None, overlay=None, tray_dent=None, arm_order=('R', 'L')):
    bg(ctx, t)
    if behind: behind(ctx)
    draw_front(ctx, s, t)
    if scene == 'sink':
        counter(ctx)
        faucet(ctx, flow, t, outlet=(STREAM_X, 468), bottom=stream_bottom, drip=drip)
    elif scene == 'tray':
        soil_tray(ctx, t, dent=tray_dent)
    arms = {}
    for side in arm_order:
        arms[side] = draw_arm(ctx, s, side)
    if overlay: overlay(ctx, arms)
    return arms

def base_front(t, **kw):
    s = Front(**kw)
    s.blink = blink_at(t, (0.31, 0.83))
    s.hands = dict(REST)
    s.hand_shape = {'R': 'open', 'L': 'open'}
    s.hand_abs = {'R': None, 'L': None}
    s.elbow_up = {}
    return s

# ═════════════════════ WUDU ═════════════════════
@step('wudu_01')
def wudu_01(ctx, t):
    s = base_front(t, eyes='look_down')
    bob = math.sin(TAU * t) * 4
    s.hands = {'R': (458, 522 + bob), 'L': (506, 524 + bob)}
    s.hand_shape = {'R': 'cup', 'L': 'cup'}
    s.hand_abs = {'R': 0.25, 'L': math.pi - 0.25}
    def ov(ctx, a):
        ellipse(ctx, (482, 512 + bob), 34, 10, hexc('#8FD6FA', 0.85))
        ellipse(ctx, (474, 509 + bob), 14, 3, (1, 1, 1, 0.8))
        falling_drops(ctx, [(452, 530 + bob), (512, 532 + bob)], t, length=50, n=2, size=5)
        sparkle(ctx, (540, 470), 10 + 4 * math.sin(TAU * t * 2), 0.8, '#FFFFFF')
    front_scene(ctx, t, s, stream_bottom=505 + bob, overlay=ov)

@step('wudu_02')
def wudu_02(ctx, t):
    s = base_front(t, eyes='happy', mouth='speak')
    s.mouth_open = 0.25 + 0.35 * abs(math.sin(TAU * t * 3))
    s.hands = {'R': (315, 555), 'L': (405, 555)}
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': -0.2, 'L': math.pi + 0.2}
    def behind(ctx):
        glow(ctx, (360, 250), 230, hexc('#FFF2B8'), 0.8)
    def ov(ctx, a):
        sparkles_ring(ctx, (360, 240), t, r=170, n=7, size=14)
    front_scene(ctx, t, s, flow=0, behind=behind, overlay=ov)

@step('wudu_03')
def wudu_03(ctx, t):
    s = base_front(t, eyes='open', mouth='grin')
    dx = math.sin(TAU * t * 3) * 14
    hand = (292 + dx, 318)
    s.hands = {'R': hand, 'L': REST['L']}
    s.hand_shape = {'R': 'fist', 'L': 'open'}
    s.hand_abs = {'R': -0.1, 'L': None}
    def ov(ctx, a):
        miswak(ctx, (hand[0] + 14, hand[1] - 6), math.pi)
        draw_hand(ctx, a['R'][1], a['R'][0], 'fist', 'R', abs_angle=-0.1)
        sparkle(ctx, (395, 300), 9, 0.6 + 0.4 * math.sin(TAU * t * 6), '#FFFFFF')
    front_scene(ctx, t, s, flow=0, overlay=ov)

def rub_hands(ctx, t, s, center, n_cycles=3, foam=True):
    i, u = cyc(t, n_cycles)
    rub = math.sin(TAU * u * 2)
    cx, cy = center
    s.hands = {'R': (cx - 22 + 14 * rub, cy + 4 * rub), 'L': (cx + 26 - 14 * rub, cy + 6 - 4 * rub)}
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': -0.15 + 0.2 * rub, 'L': math.pi + 0.15 + 0.2 * rub}
    return i, u

@step('wudu_04', 4.5)
def wudu_04(ctx, t):
    s = base_front(t, eyes='look_down')
    i, u = rub_hands(ctx, t, s, (478, 520))
    def ov(ctx, a):
        r = rng(i)
        for k in range(8):
            ph = (u * 1.5 + k / 8) % 1
            bubble(ctx, (456 + r.uniform(0, 50), 505 - ph * 60 + r.uniform(-10, 10)), 5 + r.uniform(0, 7), 1 - ph)
        falling_drops(ctx, [(470, 545), (500, 548)], t, length=40, n=2, size=5)
        counter_dots(ctx, i, 3, u)
    front_scene(ctx, t, s, stream_bottom=505, overlay=ov)

@step('wudu_05', 4.5)
def wudu_05(ctx, t):
    s = base_front(t, eyes='open')
    i, u = cyc(t, 3)
    stream = (STREAM_X - 8, 515)
    mouth = (352, 306)
    pos = kf(u, [(0, REST['R']), (0.12, stream), (0.22, stream), (0.36, mouth), (0.44, mouth), (0.56, REST['R']), (1, REST['R'])])
    s.hands['R'] = pos
    s.hand_shape['R'] = 'cup'
    s.hand_abs['R'] = kf(u, [(0, -0.3), (0.3, -0.2), (0.4, 0.0), (1, -0.3)])
    puff = kf(u, [(0, 0), (0.4, 0), (0.46, 1), (0.8, 1), (0.86, 0), (1, 0)])
    s.puff = puff
    s.puff_side = math.sin(TAU * u * 6) if 0.46 < u < 0.8 else 0
    s.mouth = 'puff' if puff > 0.1 else ('o' if 0.84 < u < 0.97 else 'smile')
    s.mouth_open = 0.5
    s.tilt = kf(u, [(0, 0), (0.82, 0), (0.88, 0.12), (0.97, 0.12), (1, 0)])
    def ov(ctx, a):
        if 0.84 < u < 0.99:
            ph = (u - 0.84) / 0.15
            for k in range(6):
                q = clamp(ph * 1.4 - k * 0.08)
                if 0 < q < 1:
                    drop(ctx, (362 + 30 * q, 305 + 260 * q * q), 5, 1 - q * 0.5)
        if 0.18 < u < 0.26:
            ellipse(ctx, stream, 20, 6, hexc('#8FD6FA', 0.8))
        counter_dots(ctx, i, 3, u)
    front_scene(ctx, t, s, stream_bottom=500 if 0.1 < u < 0.26 else 585, overlay=ov)

@step('wudu_06', 3.5)
def wudu_06(ctx, t):
    s = base_front(t, eyes='open')
    stream = (STREAM_X - 8, 515)
    nose = (350, 282)
    u = t
    s.hands['R'] = kf(u, [(0, REST['R']), (0.15, stream), (0.28, stream), (0.42, nose), (0.6, nose), (0.72, REST['R']), (1, REST['R'])])
    s.hand_shape['R'] = 'cup'
    s.hand_abs['R'] = kf(u, [(0, -0.3), (0.35, -0.25), (0.45, -0.05), (0.7, -0.05), (1, -0.3)])
    s.eyes = 'closed' if 0.42 < u < 0.62 else 'open'
    s.mouth = 'smile'
    s.tilt = kf(u, [(0, 0), (0.62, 0), (0.7, 0.1), (0.9, 0.1), (1, 0)])
    def ov(ctx, a):
        if 0.66 < u < 0.95:
            ph = (u - 0.66) / 0.29
            for k in range(8):
                q = clamp(ph * 1.3 - k * 0.05)
                if 0 < q < 1:
                    ang = R(60 + k * 8)
                    drop(ctx, (366 + math.cos(ang) * 90 * q, 285 + math.sin(ang) * 30 * q + 220 * q * q), 4.5, 1 - q)
        if 0.42 < u < 0.6:
            for k in range(3):
                ph = ((u - 0.42) / 0.18 + k / 3) % 1
                circle(ctx, (362, 270 - ph * 16), 3 + 2 * ph, hexc('#BDEBFF', 1 - ph))
    front_scene(ctx, t, s, stream_bottom=500 if 0.12 < u < 0.3 else 585, overlay=ov)

def face_wash(ctx, t, s, u, dusty=False):
    stream = (STREAM_X - 2, 512)
    top = {'R': (328, 205), 'L': (392, 205)}
    bot = {'R': (338, 318), 'L': (382, 318)}
    if dusty:
        src = {'R': (330, 470), 'L': (390, 470)}
    else:
        src = {'R': (stream[0] - 24, stream[1]), 'L': (stream[0] + 26, stream[1] + 2)}
    for side in ('R', 'L'):
        s.hands[side] = kf(u, [(0, REST[side]), (0.14, src[side]), (0.26, src[side]), (0.4, top[side]), (0.46, top[side]), (0.7, bot[side]), (0.84, REST[side]), (1, REST[side])])
    cupping = u < 0.4
    s.hand_shape = {'R': 'cup' if cupping else 'flat', 'L': 'cup' if cupping else 'flat'}
    s.hand_abs = {'R': (-0.2 if cupping else UP + 0.15), 'L': (math.pi + 0.2 if cupping else UP - 0.15)}
    s.eyes = 'closed' if 0.38 < u < 0.82 else 'open'
    s.wet = 0 if dusty else kf(u, [(0, 0.3), (0.5, 0.3), (0.62, 1), (1, 0.6)])
    s.mouth = 'smile'

@step('wudu_07', 4.5)
def wudu_07(ctx, t):
    s = base_front(t)
    i, u = cyc(t, 3)
    face_wash(ctx, t, s, u)
    def ov(ctx, a):
        if 0.6 < u < 0.98:
            falling_drops(ctx, [(345, 330), (375, 332), (360, 336)], u * 2, length=200, n=2, size=5)
        counter_dots(ctx, i, 3, u)
    front_scene(ctx, t, s, stream_bottom=500 if 0.1 < u < 0.3 else 585, overlay=ov)

def arm_wash(ctx, t, side):
    """side = which arm is washed ('R' character right = viewer left)."""
    s = base_front(t, eyes='look_down')
    i, u = cyc(t, 3)
    other = 'L' if side == 'R' else 'R'
    held = (STREAM_X - 18, 498) if side == 'R' else (STREAM_X + 20, 498)
    s.hands[side] = held
    s.hand_shape[side] = 'open'
    s.hand_abs[side] = 0.05 if side == 'R' else math.pi - 0.05
    elbow, wrist = ik(SH[side], held, UA, FA, 1)
    e2, _ = ik(SH[side], held, UA, FA, -1)
    elbow = elbow if elbow[1] > e2[1] else e2
    p = kf(u, [(0, 0.05), (0.55, 0.95), (0.75, 0.95), (1, 0.05)])
    rub_pos = lerp2(wrist, elbow, p)
    s.hands[other] = (rub_pos[0], rub_pos[1] - 16)
    s.hand_shape[other] = 'flat'
    s.hand_abs[other] = math.atan2(elbow[1] - wrist[1], elbow[0] - wrist[0]) + (0.2 if side == 'R' else -0.2)
    order = (side, other)
    def ov(ctx, a):
        falling_drops(ctx, [(elbow[0], elbow[1] + 18), (lerp(wrist[0], elbow[0], 0.5), wrist[1] + 20)], t * 1.5, length=90, n=2, size=5)
        for k in range(4):
            sparkle(ctx, lerp2(wrist, elbow, (k + 0.5) / 4 + 0.02 * math.sin(TAU * t * 3 + k)), 6, 0.5 + 0.5 * math.sin(TAU * t * 2 + k), '#FFFFFF')
        counter_dots(ctx, i, 3, u)
    front_scene(ctx, t, s, stream_bottom=485, overlay=ov, arm_order=order)

@step('wudu_08', 4.5)
def wudu_08(ctx, t): arm_wash(ctx, t, 'R')

@step('wudu_09', 4.5)
def wudu_09(ctx, t): arm_wash(ctx, t, 'L')

@step('wudu_10', 3.5)
def wudu_10(ctx, t):
    s = base_front(t, eyes='happy')
    u = t
    start = {'R': (316, 170), 'L': (404, 170)}
    top = {'R': (330, 118), 'L': (390, 118)}
    wet_src = {'R': (STREAM_X - 24, 512), 'L': (STREAM_X + 24, 514)}
    for side in ('R', 'L'):
        s.hands[side] = kf(u, [(0, REST[side]), (0.14, wet_src[side]), (0.24, wet_src[side]), (0.4, start[side]), (0.62, top[side]), (0.72, start[side]), (0.86, REST[side]), (1, REST[side])])
    on_head = 0.36 < u < 0.74
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': UP + 0.25 if on_head else -0.2, 'L': UP - 0.25 if on_head else math.pi + 0.2}
    s.wet = kf(u, [(0, 0.2), (0.45, 0.2), (0.62, 1), (1, 0.6)])
    s.eyes = 'happy' if on_head else 'open'
    def ov(ctx, a):
        if on_head:
            for k in range(4):
                sparkle(ctx, (300 + k * 40, 130 + 10 * math.sin(TAU * t * 2 + k)), 9, 0.8, '#FFFFFF')
    front_scene(ctx, t, s, stream_bottom=500 if 0.1 < u < 0.26 else 585, overlay=ov)

@step('wudu_11', 3.5)
def wudu_11(ctx, t):
    s = base_front(t, eyes='open')
    u = t
    ear = {'R': (262, 250), 'L': (458, 250)}
    wet_src = {'R': (STREAM_X - 24, 512), 'L': (STREAM_X + 24, 514)}
    for side in ('R', 'L'):
        circ = (math.cos(TAU * u * 4) * 7, math.sin(TAU * u * 4) * 7) if 0.4 < u < 0.78 else (0, 0)
        e = (ear[side][0] + circ[0], ear[side][1] + circ[1])
        s.hands[side] = kf(u, [(0, REST[side]), (0.14, wet_src[side]), (0.22, wet_src[side]), (0.38, e), (0.8, e), (0.9, REST[side]), (1, REST[side])])
    on_ear = 0.34 < u < 0.84
    s.hand_shape = {'R': 'point' if on_ear else 'open', 'L': 'point' if on_ear else 'open'}
    s.hand_abs = {'R': (0.35 if on_ear else None), 'L': (math.pi - 0.35 if on_ear else None)}
    s.mouth = 'smile'
    def ov(ctx, a):
        if on_ear:
            for side, sx in (('R', -1), ('L', 1)):
                for k in range(3):
                    ang = TAU * (t * 2 + k / 3)
                    sparkle(ctx, (ear[side][0] + sx * 30 + math.cos(ang) * 18, ear[side][1] + math.sin(ang) * 18), 7, 0.9, '#FFFFFF')
    front_scene(ctx, t, s, stream_bottom=500 if 0.1 < u < 0.24 else 585, overlay=ov)

# ─── feet close-up ───
def big_foot(ctx, heel=(500, 606), toe_x=170, ankle=(452, 470), shade=False):
    col_l, col, col_d = (SKIN_D, SKIN_D, hexc('#C98E6C')) if shade else (SKIN_L, SKIN, SKIN_D)
    hx, hy = heel
    ctx.move_to(hx + 10, hy - 40)                      # back of heel
    ctx.curve_to(hx + 18, hy - 5, hx - 10, hy, hx - 40, hy)
    ctx.line_to(toe_x + 40, hy)                        # sole
    ctx.curve_to(toe_x - 10, hy, toe_x - 18, hy - 40, toe_x + 10, hy - 52)   # toe tip
    ctx.curve_to(toe_x + 90, hy - 70, ankle[0] - 90, ankle[1] + 40, ankle[0] - 38, ankle[1])  # instep
    ctx.line_to(ankle[0] + 40, ankle[1] - 10)
    ctx.curve_to(ankle[0] + 44, ankle[1] + 50, hx + 16, hy - 70, hx + 10, hy - 40)
    ctx.close_path()
    ctx.set_source(lin_grad(toe_x, hy - 80, hx, hy, [(0, col_l), (0.55, col), (1, col_d)])); ctx.fill()
    # toes
    for k in range(5):
        x = toe_x + 6 + k * 21
        ellipse(ctx, (x, hy - 40 + k * 4), 15 - k * 1.2, 13 - k, col)
        ellipse(ctx, (x - 4, hy - 46 + k * 4), 6 - k * 0.6, 4, (1, 1, 1, 0.35))
    circle(ctx, (ankle[0] + 18, ankle[1] + 44), 13, col_d[:3] + (0.5,))

def foot_scene(ctx, t, mirror=False):
    i, u = cyc(t, 3)
    ctx.save()
    if mirror:
        ctx.translate(W, 0); ctx.scale(-1, 1)
    ctx.set_source(lin_grad(0, 0, 0, H, [(0, hexc('#E6F6FB')), (1, hexc('#CFEAF3'))])); ctx.paint()
    ctx.set_line_width(2); rgba(ctx, hexc('#FFFFFF', 0.6))
    for x in range(0, W + 1, 90):
        ctx.move_to(x, 0); ctx.line_to(x, 520); ctx.stroke()
    for y in range(0, 521, 90):
        ctx.move_to(0, y); ctx.line_to(W, y); ctx.stroke()
    ctx.set_source(lin_grad(0, 520, 0, H, [(0, hexc('#B9D7E6')), (1, hexc('#8FB8CC'))])); ctx.rectangle(0, 520, W, H - 520); ctx.fill()
    # low basin
    rrect(ctx, 40, 600, 640, 110, 30); ctx.set_source(lin_grad(0, 600, 0, 710, [(0, hexc('#FFFFFF')), (1, hexc('#D2DDE6'))])); ctx.fill()
    ellipse(ctx, (360, 606), 300, 20, hexc('#A9BDCB'))
    # wall faucet (left)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.set_line_width(26)
    ctx.set_source(lin_grad(0, 300, 0, 326, [(0, hexc('#F7FBFF')), (1, hexc('#8A9EAE'))]))
    ctx.move_to(0, 312); ctx.line_to(200, 312); ctx.curve_to(246, 312, 258, 330, 258, 352); ctx.stroke()
    ellipse(ctx, (258, 360), 16, 6, hexc('#7E93A5'))
    # other leg (behind, shaded)
    limb(ctx, [(640, -20), (636, 470)], 130, hexc('#2A4266'))
    limb(ctx, [(636, 420), (630, 520)], 86, SKIN_D)
    ellipse(ctx, (600, 596), 110, 24, SKIN_D)
    # washed leg
    ankle = (452, 470)
    limb(ctx, [(500, -40), (486, 190)], 150, PANTS)
    limb(ctx, [(486, 170), (484, 222)], 162, hexc('#2A4266'))       # rolled cuff
    limb(ctx, [(484, 214), (ankle[0] + 2, ankle[1] + 10)], 96, SKIN_D)
    limb(ctx, [(484, 214), (ankle[0] + 2, ankle[1] + 10)], 84, SKIN)
    big_foot(ctx, ankle=ankle)
    # water
    water_stream(ctx, (258, 366), 548, t, 1.0, width=22)
    # hand rubbing from toes to ankle
    p = kf(u, [(0, 0.0), (0.55, 1.0), (0.7, 1.0), (1, 0.0)])
    hp = lerp2((250, 545), (440, 505), p)
    shoulder = (760, 60)
    elbow, end = ik(shoulder, hp, 250, 250, -1)
    limb(ctx, [shoulder, elbow], 86, SHIRT_D); limb(ctx, [shoulder, elbow], 74, SHIRT)
    limb(ctx, [elbow, end], 66, SKIN_D); limb(ctx, [elbow, end], 56, SKIN)
    circle(ctx, lerp2(shoulder, elbow, 0.92), 44, SHIRT_D)
    ctx.save(); ctx.translate(*end); ctx.rotate(math.pi + 0.3); ctx.scale(2.3, 2.3)
    ellipse(ctx, (14, 0), 27, 17, SKIN)
    for k in range(4):
        limb(ctx, [(28, -10 + k * 6.6), (42, -10 + k * 6.6)], 6.5, SKIN)
    ellipse(ctx, (8, -15), 12, 6, SKIN, rot=0.5)
    ctx.restore()
    for k in range(3):
        sparkle(ctx, (lerp(220, 440, (k + 0.5) / 3), 520 + 8 * math.sin(TAU * t * 2 + k)), 9, 0.5 + 0.5 * math.sin(TAU * t * 3 + k), '#FFFFFF')
    falling_drops(ctx, [(230, 606), (330, 606), (470, 600)], t * 1.4, length=30, n=2, size=6)
    splash(ctx, (250, 560), t, 1.0, n=9, spread=70)
    ctx.restore()
    counter_dots(ctx, i, 3, u)

@step('wudu_12', 4.5)
def wudu_12(ctx, t): foot_scene(ctx, t, mirror=False)

@step('wudu_13', 4.5)
def wudu_13(ctx, t): foot_scene(ctx, t, mirror=True)

# ═════════════════════ GHUSL ═════════════════════
def shower_front(ctx, t, s, spray=1.0, spread=150, overlay=None, full=False, target=None, arm_order=('R', 'L')):
    bg_shower(ctx, t)
    if full:
        ctx.save(); ctx.translate(108, 62); ctx.scale(0.7, 0.7)
    draw_front(ctx, s, t)
    arms = {}
    for side in arm_order:
        arms[side] = draw_arm(ctx, s, side)
    if full:
        ctx.restore()
    shower_head(ctx, (360 + (target or 0), 40), t, spread=spread, intensity=spray)
    if overlay: overlay(ctx, arms)
    return arms

@step('ghusl_01', 3.5)
def ghusl_01(ctx, t):
    s = base_front(t, eyes='look_down', sleeves='rolled')
    i, u = rub_hands(ctx, t, s, (360, 470), n_cycles=2)
    def ov(ctx, a):
        r = rng(i)
        for k in range(8):
            ph = (u * 1.5 + k / 8) % 1
            bubble(ctx, (330 + r.uniform(0, 60), 460 - ph * 70), 5 + r.uniform(0, 7), 1 - ph)
    shower_front(ctx, t, s, spray=0.7, spread=110, overlay=ov)

@step('ghusl_02', 3.5)
def ghusl_02(ctx, t):
    s = base_front(t, eyes='look_down', sleeves='rolled')
    i, u = rub_hands(ctx, t, s, (360, 480), n_cycles=3)
    def ov(ctx, a):
        soap(ctx, (360, 470 + 6 * math.sin(TAU * t * 6)), 0.1 * math.sin(TAU * t * 6))
        draw_hand(ctx, a['L'][1], a['L'][0], 'flat', 'L', abs_angle=s.hand_abs['L'])
        r = rng(7)
        for k in range(16):
            ph = (t * 1.2 + k / 16) % 1
            bubble(ctx, (300 + r.uniform(0, 120), 470 - ph * 180 + r.uniform(-10, 10)), 5 + r.uniform(0, 10), 1 - ph)
        for k in range(3):
            sparkle(ctx, (280 + k * 80, 360 + 20 * math.sin(TAU * t + k)), 10, 0.8, '#FFFFFF')
    shower_front(ctx, t, s, spray=0.0, overlay=ov)

@step('ghusl_03', 4.0)
def ghusl_03(ctx, t):
    s = base_front(t, eyes='open', sleeves='rolled')
    u = t
    src = (390, 150)
    mouth = (352, 306); nose = (350, 282)
    s.hands['R'] = kf(u, [(0, REST['R']), (0.1, src), (0.18, src), (0.3, mouth), (0.42, mouth), (0.5, src), (0.58, src), (0.7, nose), (0.8, nose), (0.9, REST['R']), (1, REST['R'])])
    s.hand_shape['R'] = 'cup'
    s.hand_abs['R'] = kf(u, [(0, -0.3), (0.3, 0.0), (0.45, -0.3), (0.7, -0.05), (1, -0.3)])
    s.puff = kf(u, [(0, 0), (0.3, 0), (0.34, 1), (0.44, 1), (0.48, 0), (1, 0)])
    s.puff_side = math.sin(TAU * u * 14)
    s.mouth = 'puff' if s.puff > 0.1 else 'smile'
    s.eyes = 'closed' if 0.68 < u < 0.82 else 'open'
    def ov(ctx, a):
        if 0.46 < u < 0.52 or 0.82 < u < 0.9:
            base = (360, 310) if u < 0.6 else (360, 290)
            for k in range(5):
                q = ((u * 10) + k / 5) % 1
                drop(ctx, (base[0] + 20 * q, base[1] + 150 * q * q), 4.5, 1 - q)
    shower_front(ctx, t, s, spray=0.35, spread=60, target=30, overlay=ov)

@step('ghusl_04', 4.0)
def ghusl_04(ctx, t):
    s = base_front(t, sleeves='rolled')
    u = t
    face_wash(ctx, t, s, u)
    for side in ('R', 'L'):
        s.hands[side] = kf(u, [(0, REST[side]), (0.14, (360 + (-40 if side == 'R' else 40), 150)), (0.26, (360 + (-40 if side == 'R' else 40), 150)), (0.4, {'R': (328, 205), 'L': (392, 205)}[side]), (0.46, {'R': (328, 205), 'L': (392, 205)}[side]), (0.7, {'R': (338, 318), 'L': (382, 318)}[side]), (0.84, REST[side]), (1, REST[side])])
    def ov(ctx, a):
        if 0.6 < u < 0.98:
            falling_drops(ctx, [(345, 330), (375, 332)], u * 2, length=200, n=2, size=5)
    shower_front(ctx, t, s, spray=0.5, spread=80, overlay=ov)

@step('ghusl_05', 4.5)
def ghusl_05(ctx, t):
    s = base_front(t, sleeves='rolled')
    i, u = cyc(t, 3)
    src = {'R': (330, 470), 'L': (390, 470)}
    up = {'R': (330, 92), 'L': (392, 92)}
    for side in ('R', 'L'):
        s.hands[side] = kf(u, [(0, src[side]), (0.35, up[side]), (0.6, up[side]), (1, src[side])])
    tilt = kf(u, [(0, -0.2), (0.35, -0.2), (0.45, 0.7), (0.6, 0.7), (1, -0.2)])
    s.hand_shape = {'R': 'cup', 'L': 'cup'}
    s.hand_abs = {'R': tilt, 'L': math.pi - tilt}
    s.eyes = 'closed' if 0.4 < u < 0.8 else 'open'
    s.wet = kf(u, [(0, 0.3), (0.45, 0.3), (0.6, 1), (1, 0.5)])
    def ov(ctx, a):
        if 0.42 < u < 0.85:
            ph = (u - 0.42) / 0.43
            r = rng(i + 20)
            for k in range(14):
                q = clamp(ph * 1.6 - r.random() * 0.6)
                if 0 < q < 1:
                    x = 360 + r.uniform(-90, 90)
                    drop(ctx, (x, 110 + q * 260), 5, 1 - q)
            ellipse(ctx, (360, 128), 70 * (1 - ph), 16 * (1 - ph), hexc('#8FD6FA', 0.6 * (1 - ph)))
        elif u < 0.4:
            ellipse(ctx, (361, lerp(470, 92, clamp(u / 0.35)) - 6), 26, 8, hexc('#8FD6FA', 0.8))
        counter_dots(ctx, i, 3, u)
    shower_front(ctx, t, s, spray=0.0, overlay=ov)

def side_highlight(ctx, x0, x1, y0, y1, a):
    ctx.save()
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, 40)
    ctx.set_source(lin_grad(x0, 0, x1, 0, [(0, hexc('#7FD3FF', 0)), (0.5, hexc('#5CC4FF', 0.45 * a)), (1, hexc('#7FD3FF', 0))]))
    ctx.fill(); ctx.restore()

@step('ghusl_06', 4.0)
def ghusl_06(ctx, t):
    s = base_front(t, sleeves='rolled', eyes='closed')
    u = t
    rpos = (282, 185 + 18 * math.sin(TAU * u * 4)); lpos = (438, 185 + 18 * math.sin(TAU * u * 4))
    s.hands['R'] = kf(u, [(0, REST['R']), (0.1, rpos), (0.45, rpos), (0.55, REST['R']), (1, REST['R'])])
    s.hands['L'] = kf(u, [(0, REST['L']), (0.5, REST['L']), (0.6, lpos), (0.92, lpos), (1, REST['L'])])
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': UP + 0.6, 'L': UP - 0.6}
    s.wet = 1
    active = 'R' if u < 0.5 else 'L'
    def ov(ctx, a):
        x = 250 if active == 'R' else 390
        side_highlight(ctx, x, x + 80, 120, 330, 1)
        falling_drops(ctx, [(x + 20, 150), (x + 50, 180)], t * 2, length=160, n=3, size=5)
    shower_front(ctx, t, s, spray=0.5, spread=60, target=(-70 if active == 'R' else 70), overlay=ov)

@step('ghusl_07', 4.0)
def ghusl_07(ctx, t):
    s = base_front(t, sleeves='rolled', eyes='happy', head=(360, 225))
    u = t
    rpos = (330, 330 + 8 * math.sin(TAU * u * 4)); lpos = (392, 330 + 8 * math.sin(TAU * u * 4))
    s.hands['R'] = kf(u, [(0, REST['R']), (0.1, rpos), (0.45, rpos), (0.55, REST['R']), (1, REST['R'])])
    s.hands['L'] = kf(u, [(0, REST['L']), (0.5, REST['L']), (0.6, lpos), (0.92, lpos), (1, REST['L'])])
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': UP + 1.2, 'L': UP - 1.2}
    s.wet = 0.8
    active = 'R' if u < 0.5 else 'L'
    def ov(ctx, a):
        x = 310 if active == 'R' else 370
        side_highlight(ctx, x, x + 50, 300, 380, 1)
        falling_drops(ctx, [(x + 25, 350)], t * 2, length=120, n=3, size=5)
    shower_front(ctx, t, s, spray=0.5, spread=50, target=(-20 if active == 'R' else 20), overlay=ov)

FULL = lambda p: (108 + p[0] * 0.7, 62 + p[1] * 0.7)

@step('ghusl_08', 4.5)
def ghusl_08(ctx, t):
    s = base_front(t, sleeves='rolled', full=True, eyes='happy')
    u = t
    active = 'R' if u < 0.5 else 'L'
    lu = (u % 0.5) / 0.5
    y = kf(lu, [(0, 420), (0.45, 600), (0.55, 600), (1, 420)])
    if active == 'R':
        s.hands['L'] = (300, y); s.hands['R'] = (262, 600)
    else:
        s.hands['R'] = (420, y); s.hands['L'] = (458, 600)
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': R(80), 'L': R(100)}
    s.wet = 0.8
    def ov(ctx, a):
        x0 = FULL((225, 0))[0] if active == 'R' else FULL((360, 0))[0]
        side_highlight(ctx, x0, x0 + 85, FULL((0, 340))[1], FULL((0, 640))[1], 1)
    shower_front(ctx, t, s, spray=0.8, spread=60, full=True, target=(-45 if active == 'R' else 45), overlay=ov,
                 arm_order=(('R', 'L') if active == 'R' else ('L', 'R')))

@step('ghusl_09', 4.5)
def ghusl_09(ctx, t):
    s = base_front(t, sleeves='rolled', full=True, eyes='look_down')
    u = t
    active = 'R' if u < 0.5 else 'L'
    lu = (u % 0.5) / 0.5
    y = kf(lu, [(0, 560), (0.45, 640), (0.55, 640), (1, 560)])
    if active == 'R':
        s.hands['R'] = (300, y); s.hands['L'] = (440, 560)
    else:
        s.hands['L'] = (420, y); s.hands['R'] = (280, 560)
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': R(95), 'L': R(85)}
    def ov(ctx, a):
        x0 = FULL((280, 0))[0] if active == 'R' else FULL((372, 0))[0]
        side_highlight(ctx, x0, x0 + 55, FULL((0, 600))[1], FULL((0, 930))[1], 1)
        cx = FULL((308 if active == 'R' else 412, 0))[0]
        falling_drops(ctx, [(cx, FULL((0, 700))[1])], t * 2, length=110, n=3, size=5)
    shower_front(ctx, t, s, spray=0.8, spread=90, full=True, target=(-35 if active == 'R' else 35), overlay=ov)

@step('ghusl_10', 4.0)
def ghusl_10(ctx, t):
    s = base_front(t, sleeves='rolled', full=True, eyes='happy', wet=1)
    u = t
    s.hands['R'] = kf(u, [(0, (300, 400)), (0.5, (330, 620)), (1, (300, 400))])
    s.hands['L'] = kf(u, [(0, (420, 620)), (0.5, (390, 400)), (1, (420, 620))])
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': R(60), 'L': R(120)}
    def ov(ctx, a):
        side_highlight(ctx, FULL((200, 0))[0], FULL((520, 0))[0], FULL((0, 120))[1], FULL((0, 930))[1], 0.9)
        sparkles_ring(ctx, (360, 420), t, r=230, n=8, size=12)
    shower_front(ctx, t, s, spray=1.0, spread=190, full=True, overlay=ov)

# ═════════════════════ TAYAMMUM ═════════════════════
@step('tayammum_01', 3.5)
def tayammum_01(ctx, t):
    s = base_front(t, eyes='wide', brows=1.0, mouth='o', mouth_open=0.4)
    shrug = 0.5 + 0.5 * math.sin(TAU * t)
    s.hands = {'R': (268 - 10 * shrug, 520 - 10 * shrug), 'L': (452 + 10 * shrug, 520 - 10 * shrug)}
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': R(-150), 'L': R(-30)}
    def ov(ctx, a):
        question_mark(ctx, (478, 150), t)
    front_scene(ctx, t, s, flow=0, drip=True, overlay=ov)

@step('tayammum_02', 3.5)
def tayammum_02(ctx, t):
    s = base_front(t, eyes='look_down', mouth='smile')
    u = t
    touch = (300, 578)
    s.hands['R'] = kf(u, [(0, (300, 520)), (0.3, touch), (0.6, (330, 578)), (0.8, (300, 520)), (1, (300, 520))])
    s.hands['L'] = (428, 540)
    s.hand_shape = {'R': 'flat', 'L': 'open'}
    s.hand_abs = {'R': UP + 0.3, 'L': None}
    def ov(ctx, a):
        for k in range(5):
            sparkle(ctx, (180 + k * 90, 575 + 8 * math.sin(TAU * t * 2 + k)), 10, 0.5 + 0.5 * math.sin(TAU * t * 2 + k), '#FFFFFF')
        if 0.3 < u < 0.65:
            dust_puff(ctx, [(315, 580)], (u - 0.3) / 0.35)
    front_scene(ctx, t, s, bg=bg_outdoor, scene='tray', overlay=ov)

@step('tayammum_03', 3.5)
def tayammum_03(ctx, t):
    s = base_front(t, eyes='happy', mouth='speak')
    s.mouth_open = 0.25 + 0.35 * abs(math.sin(TAU * t * 3))
    s.hands = {'R': (315, 545), 'L': (405, 545)}
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': -0.2, 'L': math.pi + 0.2}
    def behind(ctx):
        glow(ctx, (360, 250), 230, hexc('#FFF2B8'), 0.8)
    def ov(ctx, a):
        heart_glow(ctx, (360, 440), t)
        sparkles_ring(ctx, (360, 250), t, r=170, n=6, size=12)
    front_scene(ctx, t, s, bg=bg_outdoor, scene='tray', behind=behind, overlay=ov)

def strike(ctx, t, seed=4):
    s = base_front(t, eyes='look_down')
    u = t
    up = {'R': (318, 470), 'L': (402, 470)}
    down = {'R': (318, 580), 'L': (402, 580)}
    for side in ('R', 'L'):
        s.hands[side] = kf(u, [(0, up[side]), (0.28, up[side]), (0.4, down[side]), (0.6, down[side]), (0.8, up[side]), (1, up[side])])
    s.hand_shape = {'R': 'flat', 'L': 'flat'}
    s.hand_abs = {'R': UP + 0.2, 'L': UP - 0.2}
    s.dusty = kf(u, [(0, 0), (0.4, 0), (0.45, 1), (0.95, 1), (1, 0)])
    dent = [(318, 588), (402, 588)] if 0.4 < u < 0.98 else None
    def ov(ctx, a):
        dust_puff(ctx, [(318, 585), (402, 585)], (u - 0.4) / 0.35, seed=seed)
        if 0.62 < u < 0.9:
            for side in ('R', 'L'):
                h = a[side][1]
                for k in range(3):
                    q = ((u - 0.62) / 0.28 + k / 3) % 1
                    circle(ctx, (h[0] + (k - 1) * 10, h[1] + 20 + q * 50), 3, SOIL_D[:3] + (1 - q,))
    front_scene(ctx, t, s, bg=bg_outdoor, scene='tray', tray_dent=dent, overlay=ov)

@step('tayammum_04', 3.0)
def tayammum_04(ctx, t): strike(ctx, t, 4)

@step('tayammum_05', 3.5)
def tayammum_05(ctx, t):
    s = base_front(t)
    u = t
    face_wash(ctx, t, s, u, dusty=True)
    s.dusty = 1
    def ov(ctx, a):
        if 0.45 < u < 0.85:
            for k in range(10):
                q = ((u - 0.45) / 0.4 * 1.5 + k / 10) % 1
                circle(ctx, (320 + (k * 17) % 80, 300 + q * 120), 2.5, SOIL_D[:3] + ((1 - q) * 0.8,))
    front_scene(ctx, t, s, bg=bg_outdoor, scene='tray', overlay=ov)

@step('tayammum_06', 3.0)
def tayammum_06(ctx, t): strike(ctx, t, 9)

@step('tayammum_07', 4.0)
def tayammum_07(ctx, t):
    s = base_front(t, eyes='look_down')
    u = t
    s.dusty = 1
    first = u < 0.5
    lu = (u % 0.5) / 0.5
    if first:  # wipe back of right hand with left
        held = (330, 470)
        s.hands['R'] = held; s.hand_abs['R'] = R(10); s.hand_shape['R'] = 'flat'
        el, _ = ik(SH['R'], held, UA, FA, 1); e2, _ = ik(SH['R'], held, UA, FA, -1)
        el = el if el[1] > e2[1] else e2
        wrist = lerp2(held, el, 0.18)
        p = kf(lu, [(0, 0), (0.6, 1), (1, 0)])
        s.hands['L'] = lerp2((held[0] + 40, held[1] - 18), (wrist[0], wrist[1] - 18), p)
        s.hand_abs['L'] = R(180); s.hand_shape['L'] = 'flat'
        order = ('R', 'L')
    else:
        held = (392, 470)
        s.hands['L'] = held; s.hand_abs['L'] = R(170); s.hand_shape['L'] = 'flat'
        el, _ = ik(SH['L'], held, UA, FA, 1); e2, _ = ik(SH['L'], held, UA, FA, -1)
        el = el if el[1] > e2[1] else e2
        wrist = lerp2(held, el, 0.18)
        p = kf(lu, [(0, 0), (0.6, 1), (1, 0)])
        s.hands['R'] = lerp2((held[0] - 40, held[1] - 18), (wrist[0], wrist[1] - 18), p)
        s.hand_abs['R'] = R(0); s.hand_shape['R'] = 'flat'
        order = ('L', 'R')
    def ov(ctx, a):
        for k in range(6):
            q = (lu * 2 + k / 6) % 1
            circle(ctx, (s.hands[order[1]][0] + (k - 3) * 6, s.hands[order[1]][1] + 24 + q * 60), 2.5, SOIL_D[:3] + (1 - q,))
    front_scene(ctx, t, s, bg=bg_outdoor, scene='tray', overlay=ov, arm_order=order)

# ═════════════════════ SALAH (side view) ═════════════════════
STAND = dict(P=(380, 430), torso=0.0, head=0.0, hand=(376, 556), ankle=(382, 628), foot='flat')
RUKU = dict(P=(405, 438), torso=R(86), head=R(-25), hand=(318, 538), ankle=(400, 628), foot='flat')
KNEEL = dict(P=(388, 545), torso=0.0, head=0.0, hand=(342, 572), ankle=(448, 632), foot='toes')
HANDS = dict(P=(400, 548), torso=R(55), head=R(-25), hand=(250, 634), ankle=(460, 632), foot='toes')
SUJUD = dict(P=(400, 548), torso=R(98), head=R(-12), hand=(250, 634), ankle=(460, 632), foot='toes')
SIT = dict(P=(415, 578), torso=R(-3), head=0.0, hand=(325, 600), ankle=(430, 640), foot='back')

def pose_lerp(a, b, u):
    out = {}
    for k in a:
        va, vb = a[k], b[k]
        if isinstance(va, tuple):
            out[k] = tuple(lerp(x, y, u) for x, y in zip(va, vb))
        elif isinstance(va, (int, float)):
            out[k] = lerp(va, vb, u)
        else:
            out[k] = va if u < 0.5 else vb
    return out

def pose_track(t, keys):
    """keys: [(time, pose)]"""
    if t <= keys[0][0]: return dict(keys[0][1])
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = ease_io((t - t0) / (t1 - t0)) if t1 > t0 else 1
            return pose_lerp(p0, p1, u)
    return dict(keys[-1][1])

def salah_scene(ctx, t, pose, speak=0.0, waves=0.0, kaaba=False, heart=False, sparkles=False, burst=False, eyes='open'):
    bg_masjid(ctx, t, kaaba=kaaba)
    # zoom the child + mat a little so the movement reads clearly on phones
    ctx.save(); ctx.translate(380, 665); ctx.scale(1.2, 1.2); ctx.translate(-380, -665)
    prayer_mat(ctx)
    s = Side(**pose)
    s.speak = speak
    s.eyes = eyes
    s.blink = blink_at(t, (0.27, 0.77))
    info = draw_side(ctx, s, t)
    if waves > 0:
        speech_waves(ctx, info['mouth'], t, waves, direction=-1)
    if heart:
        heart_glow(ctx, (info['chest'][0] - 30, info['chest'][1]), t)
    if sparkles:
        sparkles_ring(ctx, (380, 380), t, r=190, n=7, size=13)
    if burst:
        ph = (t * 1.5) % 1
        m = info['mouth']
        for k in range(8):
            ang = math.pi + R(-60 + k * 17)
            sparkle(ctx, (m[0] + math.cos(ang) * (30 + 90 * ph), m[1] + math.sin(ang) * (30 + 90 * ph)), 12 * (1 - ph) + 3, 1 - ph)
    ctx.restore()
    return info

def talk(t, rate=3.0):
    return 0.2 + 0.8 * abs(math.sin(TAU * t * rate))

@step('salah_01', 3.0)
def salah_01(ctx, t): salah_scene(ctx, t, STAND, sparkles=True)

@step('salah_02', 3.0)
def salah_02(ctx, t): salah_scene(ctx, t, STAND, kaaba=True, heart=True)

@step('salah_03', 3.0)
def salah_03(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t), waves=0.8, kaaba=True)

@step('salah_04', 3.0)
def salah_04(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t, 2), waves=1.4)

@step('salah_05', 3.0)
def salah_05(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t), waves=0.8)

@step('salah_06', 3.0)
def salah_06(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t), waves=0.8, kaaba=True)

@step('salah_07', 3.0)
def salah_07(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t), waves=0.6, heart=True, kaaba=True)

@step('salah_08', 3.0)
def salah_08(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t, 1.5), waves=1.2, burst=True)

@step('salah_09', 3.0)
def salah_09(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t) * 0.5, waves=0.35)

@step('salah_10', 3.0)
def salah_10(ctx, t): salah_scene(ctx, t, STAND, speak=talk(t), waves=0.8)

@step('salah_11', 4.5)
def salah_11(ctx, t):
    pose = pose_track(t, [(0, STAND), (0.12, STAND), (0.32, RUKU), (0.82, RUKU), (1.0, STAND)])
    inr = 0.34 < t < 0.8
    salah_scene(ctx, t, pose, speak=talk(t) if inr else 0, waves=0.6 if inr else 0)

@step('salah_12', 3.5)
def salah_12(ctx, t):
    pose = pose_track(t, [(0, RUKU), (0.15, RUKU), (0.4, STAND), (0.85, STAND), (1.0, RUKU)])
    salah_scene(ctx, t, pose, speak=talk(t) if 0.1 < t < 0.8 else 0, waves=0.7 if 0.1 < t < 0.8 else 0)

@step('salah_13', 6.0)
def salah_13(ctx, t):
    pose = pose_track(t, [(0, STAND), (0.08, STAND), (0.24, KNEEL), (0.34, HANDS), (0.44, SUJUD),
                          (0.8, SUJUD), (0.86, HANDS), (0.92, KNEEL), (1.0, STAND)])
    ins = 0.46 < t < 0.78
    salah_scene(ctx, t, pose, speak=talk(t) if ins else 0, waves=0.5 if ins else 0, eyes='closed' if ins else 'open')

@step('salah_14', 4.0)
def salah_14(ctx, t):
    pose = pose_track(t, [(0, SUJUD), (0.1, SUJUD), (0.3, HANDS), (0.42, SIT), (0.85, SIT), (1.0, SUJUD)])
    salah_scene(ctx, t, pose, sparkles=0.45 < t < 0.85)

@step('salah_15', 4.5)
def salah_15(ctx, t):
    pose = pose_track(t, [(0, SIT), (0.1, SIT), (0.22, HANDS), (0.34, SUJUD), (0.84, SUJUD), (0.92, HANDS), (1.0, SIT)])
    ins = 0.36 < t < 0.82
    salah_scene(ctx, t, pose, speak=talk(t) if ins else 0, waves=0.5 if ins else 0, eyes='closed' if ins else 'open')

@step('salah_16', 5.0)
def salah_16(ctx, t):
    pose = pose_track(t, [(0, SUJUD), (0.08, SUJUD), (0.18, HANDS), (0.28, KNEEL), (0.42, STAND),
                          (0.8, STAND), (0.9, KNEEL), (0.95, HANDS), (1.0, SUJUD)])
    st = 0.44 < t < 0.78
    salah_scene(ctx, t, pose, speak=talk(t) if st else 0, waves=0.7 if st else 0)

@step('salah_17', 3.5)
def salah_17(ctx, t): salah_scene(ctx, t, SIT, speak=talk(t), waves=0.7)

def full_rakah(ctx, t):
    pose = pose_track(t, [(0, STAND), (0.14, STAND), (0.26, RUKU), (0.38, RUKU), (0.48, STAND), (0.54, STAND),
                          (0.64, KNEEL), (0.7, HANDS), (0.76, SUJUD), (0.9, SUJUD), (0.95, KNEEL), (1.0, STAND)])
    reading = t < 0.14 or 0.27 < t < 0.37 or 0.77 < t < 0.89
    salah_scene(ctx, t, pose, speak=talk(t) if reading else 0, waves=0.6 if reading else 0)

@step('salah_18', 7.0)
def salah_18(ctx, t): full_rakah(ctx, t)

@step('salah_19', 7.0)
def salah_19(ctx, t): full_rakah(ctx, t)

@step('salah_20', 3.5)
def salah_20(ctx, t): salah_scene(ctx, t, SIT, speak=talk(t), waves=0.7, heart=True)

@step('salah_21', 3.5)
def salah_21(ctx, t):
    pose = dict(SIT)
    pose['head'] = R(4) * math.sin(TAU * t)
    salah_scene(ctx, t, pose, speak=talk(t) * 0.6 if t < 0.5 else 0, waves=0.5 if t < 0.5 else 0, sparkles=True, heart=t > 0.5)

COVERS = {'lesson_wudu': 'wudu_07', 'lesson_ghusl': 'ghusl_10', 'lesson_tayammum': 'tayammum_04', 'lesson_salah': 'salah_13'}
