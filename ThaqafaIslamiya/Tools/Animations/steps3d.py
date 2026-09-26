# -*- coding: utf-8 -*-
"""3D choreography for every lesson step (Blender/Cycles), with 2D cairo overlays for UI-like effects."""
import math, random
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
import rig3d as R3
from rig3d import P, Vector
import rig as R2          # 2D overlay helpers (sparkles, counters, speech waves, ...)

TAU = math.pi * 2
UP = -math.pi / 2
STEPS = {}

def step(id, seconds, scene):
    def deco(fn):
        STEPS[id] = (seconds, scene, fn)
        return fn
    return deco

def kf(t, keys):
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = R2.ease_io((t - t0) / (t1 - t0)) if t1 > t0 else 1
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * u for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * u
    return keys[-1][1]

def cyc(t, n):
    x = t * n; i = min(int(x), n - 1); return i, x - i

def blink(t, times=(0.31, 0.83)):
    return 1.0 if any(abs(t - b) < 0.03 for b in times) else 0.0

# ═══════════════════════ stage ═══════════════════════
class Stage:
    def __init__(self, scene):
        self.scene = scene
        sc = R3.reset_scene()
        self.sc = sc
        m = R3.M(); self.m = m
        side = scene.startswith('masjid')
        full = scene == 'full'
        if side:
            cam = R3.camera(sc, loc=(0, -16, 4.6), look=(0, 0, 3.7))
            cam.data.sensor_height *= 1.12
        elif full:
            cam = R3.camera(sc, loc=(0, -18, 5.4), look=(0, 0, 4.4))
            cam.data.sensor_height *= 1.32
        elif scene == 'feet':
            R3.camera(sc, loc=(0, -12, 5.6), look=(0, 0, 3.0))
        else:
            R3.camera(sc)
        R3.studio_lights()
        self.water = None
        if scene == 'sink':
            R3.set_bathroom(m); R3.make_faucet(m)
        elif scene in ('shower', 'full'):
            R3.set_shower(m)
        elif scene == 'desert':
            R3.set_desert(m)
        elif scene.startswith('masjid'):
            R3.set_masjid(m, kaaba=scene == 'masjid_kaaba', floor_z=0.75)
        elif scene == 'feet':
            build_feet(self, m)
        self.water = R3.Water(m, 60)
        # extra pools
        self.bubbles = [R3.sphere('Bub%d' % i, (0, 0, -50), 0.1, m['bubble'], seg=16) for i in range(18)]
        self.dust = [R3.sphere('Dust%d' % i, (0, 0, -50), 0.08, m['dust'], seg=12) for i in range(40)]
        if scene == 'feet':
            self.ch = None
            return
        if side:
            ch = R3.Character(m, outfit='dish', k=1.0, torso_scale=0.6, head_scale=0.83)
            ch.UA, ch.FA, ch.TH, ch.SH = 0.98, 0.98, 1.2, 1.18
            ch.torso_width = 1.12
            ch.show_cap(True)
        else:
            ch = R3.Character(m, outfit='shirt')
            if not full: ch.hide_legs()
        self.ch = ch
        self.miswak = R3.cylinder('Miswak', (0, 0, -50), 0.06, 0.9, m['miswak'], rot=(0, math.pi / 2, 0))
        self.soap = R3.box('Soap', (0, 0, -50), (0.45, 0.28, 0.2), m['soap'], bevel=0.08)
        for o in (self.miswak, self.soap): o.hide_render = True

    # ---------- projection for 2D overlays (returns 720-canvas coords) ----------
    def proj(self, v):
        co = world_to_camera_view(self.sc, self.sc.camera, Vector(v))
        return (co.x * 720, (1 - co.y) * 720)

    # ---------- pools ----------
    def begin(self):
        self.water.begin(); self.bi = 0; self.di = 0

    def bubble(self, loc, r):
        if self.bi < len(self.bubbles):
            b = self.bubbles[self.bi]; self.bi += 1
            b.location = loc; s = r / 0.1; b.scale = (s, s, s); b.hide_render = False

    def dustp(self, loc, r):
        if self.di < len(self.dust):
            b = self.dust[self.di]; self.di += 1
            b.location = loc; s = r / 0.08; b.scale = (s, s, s); b.hide_render = False

    def end(self):
        self.water.end()
        for b in self.bubbles[self.bi:]: b.hide_render = True
        for b in self.dust[self.di:]: b.hide_render = True

# ═══════════════════════ front-view helpers ═══════════════════════
HEAD_DY = 27                      # head sits 27px lower than in the 2D rig
SHOULDER = {'R': P(255, 395, -0.1), 'L': P(465, 395, -0.1)}
POLE = {'R': Vector((-1.6, -0.7, -1)), 'L': Vector((1.6, -0.7, -1))}
REST = {'R': (292, 560), 'L': (428, 560)}
NORMALS = {'cam': Vector((0, -1, 0)), 'up': Vector((0, 0, 1)), 'down': Vector((0, 0, -1)), 'in': Vector((0, 1, 0))}

def fdir(a):
    """2D finger angle (screen, y down) -> 3D direction in the XZ plane"""
    return Vector((math.cos(a), -0.25, -math.sin(a)))

def face_pt(x, y, depth=-1.15):
    return P(x, y + HEAD_DY, depth)

def pose_front(st, t, hands, eyes='open', mouth='smile', mouth_open=0.0, puff=0.0, puff_side=0.0,
               brows=0.0, tilt=0.0, full=False, sleeves='rolled'):
    """hands: {'R': (pos3d, shape, angle, normal)}"""
    ch = st.ch
    base = Vector((0, 0.05, -0.2 + (2.9 if full else 0)))
    top = ch.torso_front(base=base)
    head = P(360, 235 + HEAD_DY, -0.05) + Vector((0, 0, 2.9 if full else 0))
    ch.set_head(head, roll=tilt)
    ch.set_face(eyes=eyes, blink=blink(t), mouth=mouth, mouth_open=mouth_open, puff=puff, puff_side=puff_side, brows=brows)
    if full:
        ch.legs_front(hip_z=2.9, foot_z=0.1, spread=0.5)
    out = {}
    for s in 'RL':
        pos, shape, ang, nrm = hands[s]
        sh = SHOULDER[s] + Vector((0, 0, 2.9 if full else 0))
        out[s] = ch.arm(s, sh, pos, POLE[s], sleeves=sleeves, hand_dir=fdir(ang) if ang is not None else None,
                        shape=shape, hand_up=NORMALS.get(nrm, nrm) if isinstance(nrm, str) else nrm)
    return out

def hp(x, y, d=-0.95, full=False):
    v = P(x, y, d)
    if full: v.z += 2.9
    return v

def rest(side, shape='open'):
    x, y = REST[side]
    return (hp(x, y, -0.9), shape, -0.3 if side == 'R' else math.pi + 0.3, 'up')

STREAM = (478, 515)
def stream_on(st, t, bottom_y):
    st.water.set_stream(Vector((1.2, -1.0, 2.52)), (720 - bottom_y) / 100.0, True, t)

def stream_off(st):
    st.water.set_stream(None, 0, False)

def falling(st, sources, t, length=1.2, n=3, seed=9, size=0.055):
    r = random.Random(seed)
    for (sx, sy, sz) in sources:
        for k in range(n):
            ph = (t * 1.6 + k / n + r.random()) % 1.0
            st.water.drop(Vector((sx + r.uniform(-0.06, 0.06), sy, sz - ph * ph * length)), size * (1 - 0.3 * ph), 1.4)

def splash(st, c, t, n=6, spread=0.35, seed=3):
    r = random.Random(seed)
    for k in range(n):
        ph = (t * 2.0 + k / n) % 1.0
        vx = r.uniform(-1, 1) * spread; vy = r.uniform(-1, 1) * spread * 0.5
        st.water.drop(Vector((c[0] + vx * ph, c[1] + vy * ph, c[2] + 0.5 * ph * (1 - ph) * 2.2)), 0.04 * (1 - ph * 0.5))

def counter_overlay(i, u):
    return lambda ctx, st: R2.counter_dots(ctx, i, 3, u)

# ═══════════════════════ WUDU ═══════════════════════
@step('wudu_01', 3.0, 'sink')
def wudu_01(st, t):
    st.begin()
    bob = math.sin(TAU * t) * 0.04
    pose_front(st, t, {'R': (hp(452, 522, -1.0) + Vector((0, 0, bob)), 'cup', 0.25, 'up'),
                       'L': (hp(510, 524, -1.0) + Vector((0, 0, bob)), 'cup', math.pi - 0.25, 'up')}, eyes='look_down')
    stream_on(st, t, 505 - bob * 100)
    for k in range(5):
        st.water.drop(Vector((1.1 + 0.05 * k, -1.0, 2.12 + bob)), 0.06)
    falling(st, [(0.9, -1.0, 1.9 + bob), (1.55, -1.0, 1.9 + bob)], t, 0.6, 2)
    st.end()
    return lambda ctx, s: R2.sparkle(ctx, (545, 470), 10 + 4 * math.sin(TAU * t * 2), 0.8, '#FFFFFF')

@step('wudu_02', 3.0, 'sink')
def wudu_02(st, t):
    st.begin()
    pose_front(st, t, {'R': (hp(315, 520, -1.0), 'flat', -0.2, 'up'), 'L': (hp(405, 520, -1.0), 'flat', math.pi + 0.2, 'up')},
               eyes='happy', mouth='speak', mouth_open=0.25 + 0.35 * abs(math.sin(TAU * t * 3)))
    stream_off(st); st.end()
    def ov(ctx, s):
        R2.glow(ctx, s.proj(P(360, 262, -0.9)), 240, R2.hexc('#FFF2B8'), 0.35)
        R2.sparkles_ring(ctx, s.proj(P(360, 262, -0.9)), t, r=175, n=7, size=14)
    return ov

@step('wudu_03', 3.0, 'sink')
def wudu_03(st, t):
    st.begin()
    dx = math.sin(TAU * t * 3) * 14
    hand = hp(300 + dx, 318 + HEAD_DY, -1.15)
    pose_front(st, t, {'R': (hand, 'fist', 0.0, 'cam'), 'L': rest('L')}, mouth='grin')
    st.miswak.hide_render = False
    st.miswak.location = hand + Vector((0.42, -0.08, 0.02))
    stream_off(st); st.end()
    return lambda ctx, s: R2.sparkle(ctx, s.proj(P(400, 300 + HEAD_DY, -1.1)), 9, 0.6 + 0.4 * math.sin(TAU * t * 6), '#FFFFFF')

def rub(t, n, cx, cy, depth=-1.0, full=False):
    i, u = cyc(t, n)
    r = math.sin(TAU * u * 2)
    hands = {'R': (hp(cx - 26 + 14 * r, cy + 4 * r, depth, full), 'flat', -0.15 + 0.2 * r, Vector((0.3, -0.2, 1))),
             'L': (hp(cx + 28 - 14 * r, cy + 6 - 4 * r, depth - 0.05, full), 'flat', math.pi + 0.15 + 0.2 * r, Vector((-0.3, -0.2, 1)))}
    return i, u, hands

@step('wudu_04', 4.5, 'sink')
def wudu_04(st, t):
    st.begin()
    i, u, hands = rub(t, 3, 478, 520)
    pose_front(st, t, hands, eyes='look_down')
    stream_on(st, t, 505)
    r = random.Random(i)
    for k in range(8):
        ph = (u * 1.5 + k / 8) % 1
        st.bubble(Vector((0.95 + r.uniform(0, 0.5), -1.1 + r.uniform(-0.1, 0.1), 2.2 + ph * 0.6)), (0.05 + r.uniform(0, 0.06)) * (1 - ph * 0.5))
    falling(st, [(1.05, -1.0, 1.75), (1.4, -1.0, 1.72)], t, 0.5, 2)
    st.end()
    return counter_overlay(i, u)

@step('wudu_05', 4.5, 'sink')
def wudu_05(st, t):
    st.begin()
    i, u = cyc(t, 3)
    streamp = (470, 515); mouth = (348, 306 + HEAD_DY)
    xy = kf(u, [(0, REST['R']), (0.12, streamp), (0.22, streamp), (0.36, mouth), (0.44, mouth), (0.56, REST['R']), (1, REST['R'])])
    depth = kf(u, [(0, -0.9), (0.12, -1.0), (0.3, -1.05), (0.36, -1.25), (0.44, -1.25), (0.56, -0.9), (1, -0.9)])
    puff = kf(u, [(0, 0), (0.4, 0), (0.46, 1), (0.8, 1), (0.86, 0), (1, 0)])
    mouth_s = 'puff' if puff > 0.1 else ('o' if 0.84 < u < 0.97 else 'smile')
    tilt = kf(u, [(0, 0), (0.82, 0), (0.88, -0.12), (0.97, -0.12), (1, 0)])
    pose_front(st, t, {'R': (hp(xy[0], xy[1], depth), 'cup', kf(u, [(0, -0.3), (0.3, -0.2), (0.4, 0.0), (1, -0.3)]), 'up'), 'L': rest('L')},
               mouth=mouth_s, mouth_open=0.5, puff=puff, puff_side=math.sin(TAU * u * 6) if 0.46 < u < 0.8 else 0, tilt=tilt)
    stream_on(st, t, 500 if 0.1 < u < 0.26 else 585)
    if 0.84 < u < 0.99:
        ph = (u - 0.84) / 0.15
        for k in range(7):
            q = min(max(ph * 1.4 - k * 0.08, 0), 1)
            if 0 < q < 1:
                st.water.drop(Vector((0.02 + 0.3 * q, -1.2, 4.1 - 2.4 * q * q)), 0.05)
    if 0.18 < u < 0.4:
        st.water.drop(hp(xy[0], xy[1] - 12, depth - 0.02), 0.09, 0.5)
    st.end()
    return counter_overlay(i, u)

@step('wudu_06', 3.5, 'sink')
def wudu_06(st, t):
    st.begin(); u = t
    streamp = (470, 515); nose = (348, 282 + HEAD_DY)
    xy = kf(u, [(0, REST['R']), (0.15, streamp), (0.28, streamp), (0.42, nose), (0.6, nose), (0.72, REST['R']), (1, REST['R'])])
    depth = kf(u, [(0, -0.9), (0.15, -1.0), (0.3, -1.05), (0.42, -1.3), (0.6, -1.3), (0.72, -0.9), (1, -0.9)])
    pose_front(st, t, {'R': (hp(xy[0], xy[1], depth), 'cup', kf(u, [(0, -0.3), (0.35, -0.25), (0.45, -0.05), (0.7, -0.05), (1, -0.3)]), 'up'),
                       'L': rest('L')},
               eyes='closed' if 0.42 < u < 0.62 else 'open', tilt=kf(u, [(0, 0), (0.62, 0), (0.7, -0.1), (0.9, -0.1), (1, 0)]))
    stream_on(st, t, 500 if 0.12 < u < 0.3 else 585)
    if 0.66 < u < 0.95:
        ph = (u - 0.66) / 0.29
        for k in range(8):
            q = min(max(ph * 1.3 - k * 0.05, 0), 1)
            if 0 < q < 1:
                ang = math.radians(60 + k * 8)
                st.water.drop(Vector((0.06 + math.cos(ang) * 0.9 * q, -1.25, 4.35 - math.sin(ang) * 0.3 * q - 2.2 * q * q)), 0.045)
    st.end()
    return None

def face_wash_pose(u, src=None, dusty=False):
    top = {'R': (328, 205 + HEAD_DY), 'L': (392, 205 + HEAD_DY)}
    bot = {'R': (338, 318 + HEAD_DY), 'L': (382, 318 + HEAD_DY)}
    src = src or {'R': (454, 512), 'L': (504, 514)}
    hands = {}
    for s in 'RL':
        xy = kf(u, [(0, REST[s]), (0.14, src[s]), (0.26, src[s]), (0.4, top[s]), (0.46, top[s]), (0.7, bot[s]), (0.84, REST[s]), (1, REST[s])])
        d = kf(u, [(0, -0.9), (0.14, -1.0), (0.26, -1.0), (0.4, -1.12), (0.7, -1.12), (0.84, -0.9), (1, -0.9)])
        cup = u < 0.4
        ang = (-0.2 if s == 'R' else math.pi + 0.2) if cup else (UP + 0.15 if s == 'R' else UP - 0.15)
        nrm = 'up' if cup else Vector((0, 1, 0))
        hands[s] = (hp(xy[0], xy[1], d), 'cup' if cup else 'flat', ang, nrm)
    eyes = 'closed' if 0.38 < u < 0.82 else 'open'
    return hands, eyes

@step('wudu_07', 4.5, 'sink')
def wudu_07(st, t):
    st.begin()
    i, u = cyc(t, 3)
    hands, eyes = face_wash_pose(u)
    pose_front(st, t, hands, eyes=eyes)
    stream_on(st, t, 500 if 0.1 < u < 0.3 else 585)
    if 0.6 < u < 0.98:
        falling(st, [(-0.15, -1.1, 3.55), (0.15, -1.1, 3.55), (0, -1.1, 3.5)], u * 2, 1.6, 2)
    if 0.45 < u < 0.75:
        for k in range(6):
            st.water.drop(face_pt(320 + k * 16, 260 + (k % 3) * 25, -1.02), 0.04)
    st.end()
    return counter_overlay(i, u)

def arm_wash(st, t, side):
    st.begin()
    i, u = cyc(t, 3)
    other = 'L' if side == 'R' else 'R'
    held = hp(460, 498, -1.05) if side == 'R' else hp(500, 498, -1.05)
    hands = {side: (held, 'open', 0.05 if side == 'R' else math.pi - 0.05, 'up')}
    elbow, wrist = R3.ik3(SHOULDER[side], held, st.ch.UA, st.ch.FA, POLE[side])
    p = kf(u, [(0, 0.05), (0.55, 0.95), (0.75, 0.95), (1, 0.05)])
    rp = wrist.lerp(elbow, p) + Vector((0, -0.18, 0.2))
    d = elbow - wrist
    hands[other] = (rp, 'flat', math.atan2(-d.z, d.x) + (0.2 if side == 'R' else -0.2), Vector((0, -0.3, 1)))
    pose_front(st, t, hands, eyes='look_down')
    stream_on(st, t, 485)
    falling(st, [(elbow.x, elbow.y - 0.1, elbow.z - 0.2), (wrist.lerp(elbow, 0.5).x, wrist.y - 0.1, wrist.z - 0.2)], t * 1.5, 0.9, 2)
    st.end()
    def ov(ctx, s):
        for k in range(4):
            R2.sparkle(ctx, s.proj(wrist.lerp(elbow, (k + 0.5) / 4) + Vector((0, -0.3, 0.15))), 6, 0.5 + 0.5 * math.sin(TAU * t * 2 + k), '#FFFFFF')
        R2.counter_dots(ctx, i, 3, u)
    return ov

@step('wudu_08', 4.5, 'sink')
def wudu_08(st, t): return arm_wash(st, t, 'R')

@step('wudu_09', 4.5, 'sink')
def wudu_09(st, t): return arm_wash(st, t, 'L')

@step('wudu_10', 3.5, 'sink')
def wudu_10(st, t):
    st.begin(); u = t
    start = {'R': (318, 175 + HEAD_DY), 'L': (402, 175 + HEAD_DY)}
    topp = {'R': (332, 128 + HEAD_DY), 'L': (388, 128 + HEAD_DY)}
    src = {'R': (454, 512), 'L': (504, 514)}
    hands = {}
    on_head = 0.36 < u < 0.74
    for s in 'RL':
        xy = kf(u, [(0, REST[s]), (0.14, src[s]), (0.24, src[s]), (0.4, start[s]), (0.62, topp[s]), (0.72, start[s]), (0.86, REST[s]), (1, REST[s])])
        d = kf(u, [(0, -0.9), (0.14, -1.0), (0.24, -1.0), (0.4, -1.0), (0.62, -0.3), (0.72, -1.0), (0.86, -0.9), (1, -0.9)])
        hands[s] = (hp(xy[0], xy[1], d), 'flat', (UP + 0.25 if s == 'R' else UP - 0.25) if on_head else (-0.2 if s == 'R' else math.pi + 0.2),
                    Vector((0, 0.3, -1)) if on_head else 'up')
    pose_front(st, t, hands, eyes='happy' if on_head else 'open')
    stream_on(st, t, 500 if 0.1 < u < 0.26 else 585)
    st.end()
    def ov(ctx, s):
        if on_head:
            for k in range(4):
                R2.sparkle(ctx, s.proj(P(300 + k * 40, 120 + HEAD_DY, -0.6)), 9, 0.8, '#FFFFFF')
    return ov

@step('wudu_11', 3.5, 'sink')
def wudu_11(st, t):
    st.begin(); u = t
    ear = {'R': (262, 250 + HEAD_DY), 'L': (458, 250 + HEAD_DY)}
    src = {'R': (454, 512), 'L': (504, 514)}
    on_ear = 0.34 < u < 0.84
    hands = {}
    for s in 'RL':
        c = (math.cos(TAU * u * 4) * 6, math.sin(TAU * u * 4) * 6) if 0.4 < u < 0.78 else (0, 0)
        e = (ear[s][0] + c[0] + (-18 if s == 'R' else 18), ear[s][1] + c[1])
        xy = kf(u, [(0, REST[s]), (0.14, src[s]), (0.22, src[s]), (0.38, e), (0.8, e), (0.9, REST[s]), (1, REST[s])])
        d = kf(u, [(0, -0.9), (0.14, -1.0), (0.22, -1.0), (0.38, -0.25), (0.8, -0.25), (0.9, -0.9), (1, -0.9)])
        hands[s] = (hp(xy[0], xy[1], d), 'point' if on_ear else 'open',
                    (0.0 if s == 'R' else math.pi) if on_ear else None, 'cam')
    pose_front(st, t, hands)
    stream_on(st, t, 500 if 0.1 < u < 0.24 else 585)
    st.end()
    def ov(ctx, s):
        if on_ear:
            for side, sx in (('R', -1), ('L', 1)):
                c = s.proj(P(ear[side][0] + sx * 40, ear[side][1], -0.3))
                for k in range(3):
                    a = TAU * (t * 2 + k / 3)
                    R2.sparkle(ctx, (c[0] + math.cos(a) * 18, c[1] + math.sin(a) * 18), 7, 0.9, '#FFFFFF')
    return ov

# ─── feet close-up (3D) ───
def build_feet(st, m):
    R3.box('Wall', (0, 3.0, 4), (14, 0.2, 10), R3.tile_material('tiles', R3.srgb('#7CC6E6'), R3.srgb('#CBEAF7'), 6.0), bevel=0)
    R3.box('Floor', (0, 0, -0.1), (14, 8, 0.2), R3.tile_material('floor_b', R3.srgb('#A9CFE3'), R3.srgb('#E6F2F9'), 4.0), bevel=0)
    R3.box('Trough', (0, -0.4, 0.3), (7.5, 2.8, 0.6), m['ceramic'], bevel=0.15)
    R3.sphere('TroughIn', (0, -0.4, 0.62), 1.0, R3.principled('basin_in', R3.srgb('#9FB9CC'), rough=0.15, coat=0.6), scale=(3.4, 1.2, 0.04))
    R3.curve_tube('LowFaucet', [(-3.9, 2.8, 3.1), (-2.5, 2.0, 3.1), (-1.7, 0.2, 3.0), (-1.55, -0.4, 2.7)], 0.14, m['chrome'])
    st.leg = R3.MetaFamily('FootSkin', m['skin'], 0.05)
    L = st.leg
    L.capsule('shin', 0.5); L.ellipsoid('foot', 1.0, (1.1, 0.5, 0.36)); L.ball('heel', 0.55); L.ball('instep', 0.6); L.ball('wristball', 0.4)
    for k in range(5):
        L.ball('toe%d' % k, 0.17 - k * 0.012)
    L.capsule('fa', 0.34); L.ellipsoid('hand', 1.0, (0.45, 0.4, 0.2))
    for k in range(4): L.capsule('f%d' % k, 0.11)
    L.capsule('thumb', 0.12)
    st.pants = R3.MetaFamily('Trousers', m['pants'], 0.07)
    st.pants.capsule('leg', 0.72); st.pants.ball('cuff', 0.66)
    st.sleeve = R3.MetaFamily('Sleeve', m['shirt'], 0.07)
    st.sleeve.capsule('arm', 0.62); st.sleeve.ball('cuff', 0.55)
    st.other = R3.MetaFamily('OtherLeg', m['pants'], 0.08)
    st.other.capsule('leg', 0.75)
    st.otherfoot = R3.MetaFamily('OtherFoot', m['skin'], 0.07)
    st.otherfoot.capsule('shin', 0.48); st.otherfoot.ellipsoid('foot', 1.0, (1.0, 0.5, 0.34))

def feet_pose(st, t, mirror):
    st.begin()
    i, u = cyc(t, 3)
    sx = -1 if mirror else 1
    V = lambda x, y, z: Vector((x * sx, y, z))
    L = st.leg
    ank = V(1.1, -0.4, 1.3)
    L.span('shin', V(1.35, -0.3, 4.2), ank, 0.5)
    L.place('heel', V(1.2, -0.4, 1.0), radius=0.66)
    L.place('instep', V(0.55, -0.42, 1.25), radius=0.62)
    L.place('foot', V(0.0, -0.45, 0.98), radius=1.0, size=(1.35, 0.72, 0.5))
    for k in range(5):
        L.place('toe%d' % k, V(-0.98 + k * 0.05, -0.8 + k * 0.18, 0.95 - k * 0.03), radius=0.27 - k * 0.022)
    st.pants.span('leg', V(1.5, -0.3, 8.0), V(1.38, -0.3, 4.4), 0.72)
    st.pants.place('cuff', V(1.37, -0.3, 4.3), radius=0.72)
    st.other.span('leg', V(3.2, 0.9, 8.0), V(3.1, 0.9, 1.6), 0.72)
    st.otherfoot.span('shin', V(3.1, 0.9, 2.0), V(3.0, 0.9, 1.0), 0.48)
    st.otherfoot.place('foot', V(2.6, 0.7, 0.8), radius=1.0, size=(1.0, 0.5, 0.32))
    p = kf(u, [(0, 0.0), (0.55, 1.0), (0.7, 1.0), (1, 0.0)])
    hand = V(-0.55, -0.95, 1.55).lerp(V(0.75, -0.9, 1.85), p)
    # الكتف خارج الإطار أعلى الصورة، ذراع بطول طبيعي ومرفق منثنٍ للخارج
    shoulder = V(1.2, -2.2, 7.4)
    elbow, wrist = R3.ik3(shoulder, hand, 3.0, 2.5, V(-2.5, -1.5, 0.5))
    st.sleeve.span('arm', shoulder, elbow, 0.66); st.sleeve.place('cuff', elbow, radius=0.62)
    L.span('fa', elbow, wrist, 0.44)
    L.place('wristball', wrist, radius=0.4)
    L.place('hand', wrist + V(-0.3, -0.05, -0.1), radius=1.0, size=(0.55, 0.5, 0.24))
    for k in range(4):
        a0 = wrist + V(-0.65, -0.27 + k * 0.18, -0.18)
        L.span('f%d' % k, a0, a0 + V(-0.42, 0, -0.1), 0.13)
    L.span('thumb', wrist + V(-0.3, -0.48, -0.05), wrist + V(-0.62, -0.6, -0.15), 0.14)
    st.water.set_stream(V(-1.55, -0.4, 2.62), 1.3, True, t, radius=0.12)
    r = random.Random(4)
    for k in range(10):
        ph = (t * 2 + k / 10) % 1
        st.water.drop(V(-1.55 + r.uniform(-0.8, 0.8) * ph, -0.4 + r.uniform(-0.5, 0.2), 1.25 + 0.6 * ph * (1 - ph) * 2), 0.07 * (1 - ph * 0.5))
    for k in range(5):
        ph = (t * 1.5 + k / 5) % 1
        st.water.drop(V(-0.6 + k * 0.4, -0.95, 0.9 - ph * 0.35), 0.06)
    st.end()
    return counter_overlay(i, u)

@step('wudu_12', 4.5, 'feet')
def wudu_12(st, t): return feet_pose(st, t, False)

@step('wudu_13', 4.5, 'feet')
def wudu_13(st, t): return feet_pose(st, t, True)

# ═══════════════════════ GHUSL ═══════════════════════
SHOWER_HEAD = Vector((0, 0.1, 6.95))

def shower(st, t, intensity=1.0, spread=1.2, offset=0.0, n=34, full=False, bottom=0.2):
    if intensity <= 0: return
    r = random.Random(11)
    top = SHOWER_HEAD + Vector((offset, 0, 0))
    if full: top = top + Vector((0, 0, 1.6))
    for k in range(int(n * intensity)):
        ox = r.uniform(-1, 1)
        ph = (t * 2.2 + r.random()) % 1.0
        x = top.x + ox * 0.4 + ox * spread * ph
        z = top.z - 0.15 - ph * (top.z - bottom)
        st.water.drop(Vector((x, -0.9 + r.uniform(-0.4, 0.3), z)), 0.035, 3.2)

@step('ghusl_01', 3.5, 'shower')
def ghusl_01(st, t):
    st.begin()
    i, u, hands = rub(t, 2, 360, 470, -1.05)
    pose_front(st, t, hands, eyes='look_down')
    shower(st, t, 0.8, 0.8)
    r = random.Random(i)
    for k in range(8):
        ph = (u * 1.5 + k / 8) % 1
        st.bubble(Vector((-0.3 + r.uniform(0, 0.6), -1.15, 2.55 + ph * 0.8)), (0.05 + r.uniform(0, 0.06)) * (1 - 0.4 * ph))
    st.end(); return None

@step('ghusl_02', 3.5, 'shower')
def ghusl_02(st, t):
    st.begin()
    i, u, hands = rub(t, 3, 360, 480, -1.05)
    pose_front(st, t, hands, eyes='look_down')
    st.soap.hide_render = False
    st.soap.location = hp(360, 468, -1.12) + Vector((0, 0, 0.05 * math.sin(TAU * t * 6)))
    st.soap.rotation_euler = (0.3, 0, 0.1 * math.sin(TAU * t * 6))
    r = random.Random(7)
    for k in range(18):
        ph = (t * 1.2 + k / 18) % 1
        st.bubble(Vector((-0.6 + r.uniform(0, 1.2), -1.2 + r.uniform(-0.2, 0.2), 2.4 + ph * 1.8)), (0.05 + r.uniform(0, 0.09)) * (1 - 0.4 * ph))
    st.end()
    return lambda ctx, s: [R2.sparkle(ctx, (280 + k * 80, 330 + 20 * math.sin(TAU * t + k)), 10, 0.8, '#FFFFFF') for k in range(3)]

@step('ghusl_03', 4.0, 'shower')
def ghusl_03(st, t):
    st.begin(); u = t
    src = (390, 160); mouth = (348, 306 + HEAD_DY); nose = (348, 282 + HEAD_DY)
    xy = kf(u, [(0, REST['R']), (0.1, src), (0.18, src), (0.3, mouth), (0.42, mouth), (0.5, src), (0.58, src), (0.7, nose), (0.8, nose), (0.9, REST['R']), (1, REST['R'])])
    d = kf(u, [(0, -0.9), (0.1, -1.1), (0.3, -1.25), (0.42, -1.25), (0.5, -1.1), (0.7, -1.3), (0.8, -1.3), (0.9, -0.9), (1, -0.9)])
    puff = kf(u, [(0, 0), (0.3, 0), (0.34, 1), (0.44, 1), (0.48, 0), (1, 0)])
    pose_front(st, t, {'R': (hp(xy[0], xy[1], d), 'cup', kf(u, [(0, -0.3), (0.3, 0.0), (0.45, -0.3), (0.7, -0.05), (1, -0.3)]), 'up'), 'L': rest('L')},
               mouth='puff' if puff > 0.1 else 'smile', puff=puff, puff_side=math.sin(TAU * u * 14),
               eyes='closed' if 0.68 < u < 0.82 else 'open')
    shower(st, t, 0.45, 0.5, 0.4)
    st.end(); return None

@step('ghusl_04', 4.0, 'shower')
def ghusl_04(st, t):
    st.begin()
    hands, eyes = face_wash_pose(t, src={'R': (320, 160), 'L': (400, 160)})
    pose_front(st, t, hands, eyes=eyes)
    shower(st, t, 0.6, 0.6)
    if 0.6 < t < 0.98:
        falling(st, [(-0.15, -1.1, 3.55), (0.15, -1.1, 3.55)], t * 2, 1.6, 2)
    st.end(); return None

@step('ghusl_05', 4.5, 'shower')
def ghusl_05(st, t):
    st.begin()
    i, u = cyc(t, 3)
    src = {'R': (330, 470), 'L': (390, 470)}
    upp = {'R': (332, 95), 'L': (388, 95)}
    tilt = kf(u, [(0, -0.2), (0.35, -0.2), (0.45, 0.7), (0.6, 0.7), (1, -0.2)])
    hands = {}
    for s in 'RL':
        xy = kf(u, [(0, src[s]), (0.35, upp[s]), (0.6, upp[s]), (1, src[s])])
        d = kf(u, [(0, -1.05), (0.35, -0.6), (0.6, -0.6), (1, -1.05)])
        hands[s] = (hp(xy[0], xy[1], d), 'cup', tilt if s == 'R' else math.pi - tilt, 'up')
    pose_front(st, t, hands, eyes='closed' if 0.4 < u < 0.8 else 'open')
    if 0.42 < u < 0.85:
        ph = (u - 0.42) / 0.43
        r = random.Random(i + 20)
        for k in range(18):
            q = min(max(ph * 1.6 - r.random() * 0.6, 0), 1)
            if 0 < q < 1:
                st.water.drop(Vector((r.uniform(-0.95, 0.95), -0.5 + r.uniform(-0.4, 0.2), 6.0 - q * 3.0)), 0.06, 1.5)
    elif u < 0.4:
        z = 2.5 + (6.2 - 2.5) * min(u / 0.35, 1)
        st.water.drop(Vector((0, -0.95, z)), 0.16, 0.35)
    st.end()
    return counter_overlay(i, u)

def half_glow(ctx, st, x0, x1, z0, z1, a=1.0):
    p0 = st.proj(Vector((x0, -1, z1))); p1 = st.proj(Vector((x1, -1, z0)))
    R2.rrect(ctx, p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1], 40)
    ctx.set_source(R2.lin_grad(p0[0], 0, p1[0], 0, [(0, R2.hexc('#5CC4FF', 0)), (0.5, R2.hexc('#5CC4FF', 0.35 * a)), (1, R2.hexc('#5CC4FF', 0))]))
    ctx.fill()

@step('ghusl_06', 4.0, 'shower')
def ghusl_06(st, t):
    st.begin(); u = t
    wig = math.sin(TAU * u * 4) * 16
    rp = (280, 195 + HEAD_DY + wig); lp = (440, 195 + HEAD_DY + wig)
    hands = {'R': (hp(*kf(u, [(0, REST['R']), (0.1, rp), (0.45, rp), (0.55, REST['R']), (1, REST['R'])]), kf(u, [(0, -0.9), (0.1, -0.35), (0.45, -0.35), (0.55, -0.9), (1, -0.9)])), 'flat', UP + 0.5, Vector((1, 0.3, 0))),
             'L': (hp(*kf(u, [(0, REST['L']), (0.5, REST['L']), (0.6, lp), (0.92, lp), (1, REST['L'])]), kf(u, [(0, -0.9), (0.5, -0.9), (0.6, -0.35), (0.92, -0.35), (1, -0.9)])), 'flat', UP - 0.5, Vector((-1, 0.3, 0)))}
    pose_front(st, t, hands, eyes='closed')
    active = -1 if u < 0.5 else 1
    shower(st, t, 0.7, 0.4, 0.7 * active)
    st.end()
    return lambda ctx, s: half_glow(ctx, s, active * 0.5 - 0.45, active * 0.5 + 0.45, 4.0, 5.9)

@step('ghusl_07', 4.0, 'shower')
def ghusl_07(st, t):
    st.begin(); u = t
    wig = math.sin(TAU * u * 4) * 8
    rp = (318, 340 + wig); lp = (402, 340 + wig)
    hands = {'R': (hp(*kf(u, [(0, REST['R']), (0.1, rp), (0.45, rp), (0.55, REST['R']), (1, REST['R'])]), kf(u, [(0, -0.9), (0.1, -0.6), (0.45, -0.6), (0.55, -0.9), (1, -0.9)])), 'flat', UP + 1.0, Vector((1, 0.4, 0))),
             'L': (hp(*kf(u, [(0, REST['L']), (0.5, REST['L']), (0.6, lp), (0.92, lp), (1, REST['L'])]), kf(u, [(0, -0.9), (0.5, -0.9), (0.6, -0.6), (0.92, -0.6), (1, -0.9)])), 'flat', UP - 1.0, Vector((-1, 0.4, 0)))}
    pose_front(st, t, hands, eyes='happy')
    active = -1 if u < 0.5 else 1
    shower(st, t, 0.6, 0.3, 0.3 * active)
    st.end()
    return lambda ctx, s: half_glow(ctx, s, active * 0.25 - 0.3, active * 0.25 + 0.3, 3.3, 4.0)

@step('ghusl_08', 4.5, 'full')
def ghusl_08(st, t):
    st.begin(); u = t
    active = 'R' if u < 0.5 else 'L'
    lu = (u % 0.5) / 0.5
    y = kf(lu, [(0, 420), (0.45, 590), (0.55, 590), (1, 420)])
    if active == 'R':
        hands = {'L': (hp(300, y, -1.0, True), 'flat', math.radians(-80), Vector((1, -0.3, 0))), 'R': (hp(250, 590, -0.5, True), 'open', math.radians(-100), 'cam')}
    else:
        hands = {'R': (hp(420, y, -1.0, True), 'flat', math.radians(-100), Vector((-1, -0.3, 0))), 'L': (hp(470, 590, -0.5, True), 'open', math.radians(-80), 'cam')}
    pose_front(st, t, hands, eyes='happy', full=True)
    shower(st, t, 1.0, 0.5, -0.6 if active == 'R' else 0.6, full=True)
    st.end()
    x = -0.6 if active == 'R' else 0.6
    return lambda ctx, s: half_glow(ctx, s, x - 0.6, x + 0.6, 3.0, 6.4)

@step('ghusl_09', 4.5, 'full')
def ghusl_09(st, t):
    st.begin(); u = t
    active = 'R' if u < 0.5 else 'L'
    lu = (u % 0.5) / 0.5
    y = kf(lu, [(0, 560), (0.45, 600), (0.55, 600), (1, 560)])
    if active == 'R':
        hands = {'R': (hp(300, y, -0.9, True), 'flat', math.radians(-95), 'cam'), 'L': (hp(440, 540, -0.9, True), 'open', None, 'cam')}
    else:
        hands = {'L': (hp(420, y, -0.9, True), 'flat', math.radians(-85), 'cam'), 'R': (hp(280, 540, -0.9, True), 'open', None, 'cam')}
    pose_front(st, t, hands, eyes='look_down', full=True)
    shower(st, t, 1.0, 0.3, -0.5 if active == 'R' else 0.5, full=True)
    st.end()
    x = -0.5 if active == 'R' else 0.5
    return lambda ctx, s: half_glow(ctx, s, x - 0.45, x + 0.45, 0.0, 3.0)

@step('ghusl_10', 4.0, 'full')
def ghusl_10(st, t):
    st.begin(); u = t
    hands = {'R': (hp(*kf(u, [(0, (300, 420)), (0.5, (330, 590)), (1, (300, 420))]), -1.0, True), 'flat', math.radians(-60), 'cam'),
             'L': (hp(*kf(u, [(0, (420, 590)), (0.5, (390, 420)), (1, (420, 590))]), -1.0, True), 'flat', math.radians(-120), 'cam')}
    pose_front(st, t, hands, eyes='happy', full=True)
    shower(st, t, 1.6, 1.4, 0, n=40, full=True)
    st.end()
    return lambda ctx, s: R2.sparkles_ring(ctx, s.proj(Vector((0, -1, 4.5))), t, r=230, n=8, size=12)

# ═══════════════════════ TAYAMMUM ═══════════════════════
@step('tayammum_01', 3.5, 'sink')
def tayammum_01(st, t):
    st.begin()
    sh = 0.5 + 0.5 * math.sin(TAU * t)
    hands = {'R': (hp(262 - 10 * sh, 515 - 10 * sh, -0.8), 'flat', math.radians(-150), 'up'),
             'L': (hp(458 + 10 * sh, 515 - 10 * sh, -0.8), 'flat', math.radians(-30), 'up')}
    pose_front(st, t, hands, eyes='wide', brows=1.0, mouth='o', mouth_open=0.4)
    stream_off(st)
    ph = (t * 1.3) % 1.0
    st.water.drop(Vector((1.2, -1.0, 2.45 - ph * 1.2)), 0.07, 1.3)
    st.end()
    return lambda ctx, s: R2.question_mark(ctx, s.proj(P(470, 150, -0.5)), t)

def tray_hands(u, up_xy, down_xy):
    hands = {}
    for s in 'RL':
        xy = kf(u, [(0, up_xy[s]), (0.28, up_xy[s]), (0.4, down_xy[s]), (0.6, down_xy[s]), (0.8, up_xy[s]), (1, up_xy[s])])
        d = kf(u, [(0, -1.1), (0.28, -1.1), (0.4, -1.3), (0.6, -1.3), (0.8, -1.1), (1, -1.1)])
        hands[s] = (hp(xy[0], xy[1], d), 'flat', UP + (0.2 if s == 'R' else -0.2), Vector((0, -1, 0.35)))
    return hands

def dust_burst(st, centers, p, seed=4):
    if p <= 0 or p >= 1: return
    r = random.Random(seed)
    for c in centers:
        for k in range(14):
            ang = r.uniform(0, TAU); sp = r.uniform(0.3, 0.8)
            st.dustp(Vector((c.x + math.cos(ang) * sp * p, c.y + math.sin(ang) * 0.3 * p, c.z + r.uniform(0.2, 0.8) * p)), r.uniform(0.04, 0.09) * (1.2 - p))

@step('tayammum_02', 3.5, 'desert')
def tayammum_02(st, t):
    st.begin(); u = t
    xy = kf(u, [(0, (300, 520)), (0.3, (300, 570)), (0.6, (330, 570)), (0.8, (300, 520)), (1, (300, 520))])
    d = kf(u, [(0, -1.0), (0.3, -1.3), (0.6, -1.3), (0.8, -1.0), (1, -1.0)])
    pose_front(st, t, {'R': (hp(xy[0], xy[1], d), 'flat', UP + 0.3, Vector((0, -1, 0.3))), 'L': rest('L')}, eyes='look_down')
    if 0.3 < u < 0.65:
        dust_burst(st, [hp(315, 580, -1.3)], (u - 0.3) / 0.35)
    st.end()
    return lambda ctx, s: [R2.sparkle(ctx, s.proj(Vector((-2.2 + k * 1.1, -1.3, 1.25))), 10, 0.5 + 0.5 * math.sin(TAU * t * 2 + k), '#FFFFFF') for k in range(5)]

@step('tayammum_03', 3.5, 'desert')
def tayammum_03(st, t):
    st.begin()
    pose_front(st, t, {'R': (hp(315, 520, -1.0), 'flat', -0.2, 'up'), 'L': (hp(405, 520, -1.0), 'flat', math.pi + 0.2, 'up')},
               eyes='happy', mouth='speak', mouth_open=0.25 + 0.35 * abs(math.sin(TAU * t * 3)))
    st.end()
    def ov(ctx, s):
        R2.heart_glow(ctx, s.proj(Vector((0, -1.3, 2.7))), t)
        R2.sparkles_ring(ctx, s.proj(P(360, 262, -0.9)), t, r=170, n=6, size=12)
    return ov

def strike(st, t, seed):
    st.begin(); u = t
    up_xy = {'R': (318, 470), 'L': (402, 470)}; dn = {'R': (318, 575), 'L': (402, 575)}
    pose_front(st, t, tray_hands(u, up_xy, dn), eyes='look_down')
    dust_burst(st, [hp(318, 585, -1.3), hp(402, 585, -1.3)], (u - 0.4) / 0.35, seed)
    st.end(); return None

@step('tayammum_04', 3.0, 'desert')
def tayammum_04(st, t): return strike(st, t, 4)

@step('tayammum_05', 3.5, 'desert')
def tayammum_05(st, t):
    st.begin()
    hands, eyes = face_wash_pose(t, src={'R': (330, 470), 'L': (390, 470)})
    pose_front(st, t, hands, eyes=eyes)
    if 0.45 < t < 0.85:
        r = random.Random(3)
        for k in range(10):
            q = ((t - 0.45) / 0.4 * 1.5 + k / 10) % 1
            st.dustp(Vector((-0.4 + r.uniform(0, 0.8), -1.2, 3.6 - q * 1.2)), 0.035)
    st.end(); return None

@step('tayammum_06', 3.0, 'desert')
def tayammum_06(st, t): return strike(st, t, 9)

@step('tayammum_07', 4.0, 'desert')
def tayammum_07(st, t):
    st.begin(); u = t
    first = u < 0.5; lu = (u % 0.5) / 0.5
    held_side, wiper = ('R', 'L') if first else ('L', 'R')
    held = hp(330, 470, -1.1) if first else hp(392, 470, -1.1)
    elbow, wrist = R3.ik3(SHOULDER[held_side], held, st.ch.UA, st.ch.FA, POLE[held_side])
    p = kf(lu, [(0, 0), (0.6, 1), (1, 0)])
    tip = held + (held - elbow).normalized() * 0.35
    wp = tip.lerp(wrist, p) + Vector((0, -0.12, 0.15))
    d = (elbow - held)
    hands = {held_side: (held, 'flat', math.atan2(-(held - elbow).z, (held - elbow).x), Vector((0, -0.2, 1))),
             wiper: (wp, 'flat', math.atan2(-d.z, d.x), Vector((0, -0.2, 1)))}
    pose_front(st, t, hands, eyes='look_down')
    r = random.Random(5)
    for k in range(6):
        q = (lu * 2 + k / 6) % 1
        st.dustp(wp + Vector((r.uniform(-0.15, 0.15), -0.1, -0.2 - q * 0.6)), 0.03)
    st.end(); return None

# ═══════════════════════ SALAH (side view) ═══════════════════════
RAD = math.radians
STAND = dict(knee=0.0, P=(380, 430), torso=0.0, head=0.0, hand=(376, 556), ankle=(382, 628), foot='flat')
RUKU = dict(knee=1.0, P=(405, 438), torso=RAD(86), head=RAD(-25), hand=(318, 538), ankle=(400, 628), foot='flat')
KNEEL = dict(knee=0.0, P=(388, 545), torso=0.0, head=0.0, hand=(342, 572), ankle=(448, 632), foot='toes')
HANDS = dict(knee=0.0, P=(400, 548), torso=RAD(55), head=RAD(-25), hand=(250, 634), ankle=(460, 632), foot='toes')
SUJUD = dict(knee=0.0, P=(400, 548), torso=RAD(98), head=RAD(-12), hand=(250, 634), ankle=(460, 632), foot='toes')
SIT = dict(knee=0.85, P=(415, 578), torso=RAD(-3), head=0.0, hand=(325, 600), ankle=(430, 640), foot='back')

def Pz(xy, d=0.0):
    x, y = xy
    return P(380 + 1.2 * (x - 380), 665 + 1.2 * (y - 665), d)

def pose_lerp(a, b, u):
    out = {}
    for k in a:
        va, vb = a[k], b[k]
        if isinstance(va, tuple): out[k] = tuple(x + (y - x) * u for x, y in zip(va, vb))
        elif isinstance(va, (int, float)): out[k] = va + (vb - va) * u
        else: out[k] = va if u < 0.5 else vb
    return out

def pose_track(t, keys):
    if t <= keys[0][0]: return dict(keys[0][1])
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            return pose_lerp(p0, p1, R2.ease_io((t - t0) / (t1 - t0)) if t1 > t0 else 1)
    return dict(keys[-1][1])

def pose_side(st, t, pose, speak=0.0, eyes='open'):
    ch = st.ch
    hip = Pz(pose['P'])
    a = pose['torso']
    up = Vector((-math.sin(a), 0, math.cos(a)))
    base = hip - up * 0.25
    top = ch.torso_front(base=base, lean=-a)
    ts = ch.torso_scale
    ha = a + pose['head']
    hup = Vector((-math.sin(ha), 0, math.cos(ha)))
    head = top + hup * (0.25 + 0.83 * 0.95)
    ch.set_head(head, yaw=-math.pi / 2, pitch=ha * 0.9)
    ch.set_face(eyes=eyes, blink=blink(t, (0.27, 0.77)), mouth='speak' if speak > 0.05 else 'smile', mouth_open=speak * 0.8)
    shoulder = hip + up * 1.62
    hand = Pz(pose['hand'])
    knees = {}
    for s, dy in (('L', -0.32), ('R', 0.32)):
        hp_ = hip + Vector((0, dy * 0.75, 0))
        ank = Pz(pose['ankle']) + Vector((0, dy * 0.75, 0))
        knees[s], _ = ch.leg(s, hp_, ank, Vector((-1, 0, 0.2)), foot=pose['foot'], radius=0.44)
    for s, dy in (('L', -0.6), ('R', 0.6)):
        sh = shoulder + Vector((0, dy, 0))
        tg = hand + Vector((0, dy * 0.8, 0))
        kw = pose.get('knee', 0.0)
        if kw > 0:
            on_knee = knees[s] + Vector((-0.05, dy * 0.2 - 0.12 * (1 if dy < 0 else -1), 0.28))
            tg = tg.lerp(on_knee, kw)
        ch.arm(s, sh, tg, Vector((0.5, dy, 0.3)), sleeves='long', hand_dir=None, shape='open', hand_up=Vector((0, 0, 1)))
    a_ = -(ha)
    mouth = head + Vector((-0.78, -0.05, -0.3))
    return {'mouth': mouth, 'chest': shoulder + Vector((-0.6, -0.6, -0.3))}

def talk(t, rate=3.0):
    return 0.2 + 0.8 * abs(math.sin(TAU * t * rate))

def salah_frame(st, t, pose, speak=0.0, waves=0.0, heart=False, sparkles=False, burst=False, eyes='open'):
    st.begin()
    info = pose_side(st, t, pose, speak, eyes)
    st.end()
    def ov(ctx, s):
        m = s.proj(info['mouth'])
        if waves > 0: R2.speech_waves(ctx, m, t, waves, direction=-1)
        if heart: R2.heart_glow(ctx, s.proj(info['chest']), t)
        if sparkles: R2.sparkles_ring(ctx, s.proj(Vector((0.1, -1, 3.2))), t, r=200, n=7, size=13)
        if burst:
            ph = (t * 1.5) % 1
            for k in range(8):
                ang = math.pi + RAD(-60 + k * 17)
                R2.sparkle(ctx, (m[0] + math.cos(ang) * (30 + 90 * ph), m[1] + math.sin(ang) * (30 + 90 * ph)), 12 * (1 - ph) + 3, 1 - ph)
    return ov

S = 'masjid'
@step('salah_01', 3.0, S)
def salah_01(st, t): return salah_frame(st, t, STAND, sparkles=True)
@step('salah_02', 3.0, 'masjid_kaaba')
def salah_02(st, t): return salah_frame(st, t, STAND, heart=True)
@step('salah_03', 3.0, 'masjid_kaaba')
def salah_03(st, t): return salah_frame(st, t, STAND, speak=talk(t), waves=0.8)
@step('salah_04', 3.0, S)
def salah_04(st, t): return salah_frame(st, t, STAND, speak=talk(t, 2), waves=1.4)
@step('salah_05', 3.0, S)
def salah_05(st, t): return salah_frame(st, t, STAND, speak=talk(t), waves=0.8)
@step('salah_06', 3.0, 'masjid_kaaba')
def salah_06(st, t): return salah_frame(st, t, STAND, speak=talk(t), waves=0.8)
@step('salah_07', 3.0, 'masjid_kaaba')
def salah_07(st, t): return salah_frame(st, t, STAND, speak=talk(t), waves=0.6, heart=True)
@step('salah_08', 3.0, S)
def salah_08(st, t): return salah_frame(st, t, STAND, speak=talk(t, 1.5), waves=1.2, burst=True)
@step('salah_09', 3.0, S)
def salah_09(st, t): return salah_frame(st, t, STAND, speak=talk(t) * 0.5, waves=0.35)
@step('salah_10', 3.0, S)
def salah_10(st, t): return salah_frame(st, t, STAND, speak=talk(t), waves=0.8)

@step('salah_11', 4.5, S)
def salah_11(st, t):
    p = pose_track(t, [(0, STAND), (0.12, STAND), (0.32, RUKU), (0.82, RUKU), (1.0, STAND)])
    inr = 0.34 < t < 0.8
    return salah_frame(st, t, p, speak=talk(t) if inr else 0, waves=0.6 if inr else 0)

@step('salah_12', 3.5, S)
def salah_12(st, t):
    p = pose_track(t, [(0, RUKU), (0.15, RUKU), (0.4, STAND), (0.85, STAND), (1.0, RUKU)])
    on = 0.1 < t < 0.8
    return salah_frame(st, t, p, speak=talk(t) if on else 0, waves=0.7 if on else 0)

@step('salah_13', 6.0, S)
def salah_13(st, t):
    p = pose_track(t, [(0, STAND), (0.08, STAND), (0.24, KNEEL), (0.34, HANDS), (0.44, SUJUD), (0.8, SUJUD), (0.86, HANDS), (0.92, KNEEL), (1.0, STAND)])
    ins = 0.46 < t < 0.78
    return salah_frame(st, t, p, speak=talk(t) if ins else 0, waves=0.5 if ins else 0, eyes='closed' if ins else 'open')

@step('salah_14', 4.0, S)
def salah_14(st, t):
    p = pose_track(t, [(0, SUJUD), (0.1, SUJUD), (0.3, HANDS), (0.42, SIT), (0.85, SIT), (1.0, SUJUD)])
    return salah_frame(st, t, p, sparkles=0.45 < t < 0.85)

@step('salah_15', 4.5, S)
def salah_15(st, t):
    p = pose_track(t, [(0, SIT), (0.1, SIT), (0.22, HANDS), (0.34, SUJUD), (0.84, SUJUD), (0.92, HANDS), (1.0, SIT)])
    ins = 0.36 < t < 0.82
    return salah_frame(st, t, p, speak=talk(t) if ins else 0, waves=0.5 if ins else 0, eyes='closed' if ins else 'open')

@step('salah_16', 5.0, S)
def salah_16(st, t):
    p = pose_track(t, [(0, SUJUD), (0.08, SUJUD), (0.18, HANDS), (0.28, KNEEL), (0.42, STAND), (0.8, STAND), (0.9, KNEEL), (0.95, HANDS), (1.0, SUJUD)])
    on = 0.44 < t < 0.78
    return salah_frame(st, t, p, speak=talk(t) if on else 0, waves=0.7 if on else 0)

@step('salah_17', 3.5, S)
def salah_17(st, t): return salah_frame(st, t, SIT, speak=talk(t), waves=0.7)

def full_rakah(st, t):
    p = pose_track(t, [(0, STAND), (0.14, STAND), (0.26, RUKU), (0.38, RUKU), (0.48, STAND), (0.54, STAND),
                       (0.64, KNEEL), (0.7, HANDS), (0.76, SUJUD), (0.9, SUJUD), (0.95, KNEEL), (1.0, STAND)])
    reading = t < 0.14 or 0.27 < t < 0.37 or 0.77 < t < 0.89
    return salah_frame(st, t, p, speak=talk(t) if reading else 0, waves=0.6 if reading else 0)

@step('salah_18', 7.0, S)
def salah_18(st, t): return full_rakah(st, t)
@step('salah_19', 7.0, S)
def salah_19(st, t): return full_rakah(st, t)
@step('salah_20', 3.5, S)
def salah_20(st, t): return salah_frame(st, t, SIT, speak=talk(t), waves=0.7, heart=True)

@step('salah_21', 3.5, S)
def salah_21(st, t):
    p = dict(SIT); p['head'] = RAD(4) * math.sin(TAU * t)
    return salah_frame(st, t, p, speak=talk(t) * 0.6 if t < 0.5 else 0, waves=0.5 if t < 0.5 else 0, sparkles=True, heart=t > 0.5)

COVERS = {'lesson_wudu': 'wudu_07', 'lesson_ghusl': 'ghusl_10', 'lesson_tayammum': 'tayammum_04', 'lesson_salah': 'salah_13'}
