# -*- coding: utf-8 -*-
"""Real 3D (Blender/Cycles) character + scenes.

Coordinates: the old 2D canvas (720px, y down) maps to Blender metres:
    X = (x - 360) / 100,   Z = (720 - y) / 100,   Y = depth (negative = toward camera)
so the existing 2D choreography (hand targets etc.) drives the 3D rig directly.
"""
import math, random
import bpy
from mathutils import Vector, Quaternion, Euler

RES = 600
TAU = math.pi * 2

def P(x, y, d=0.0):
    return Vector(((x - 360) / 100.0, d, (720 - y) / 100.0))

# ───────────────────────── materials ─────────────────────────
MATS = {}

def principled(name, color, rough=0.5, metal=0.0, sss=0.0, coat=0.0, sheen=0.0, transmission=0.0,
               ior=1.45, emission=None, estr=0.0, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    def setin(key, val):
        if key in b.inputs:
            b.inputs[key].default_value = val
    setin('Base Color', (*color, 1.0))
    setin('Roughness', rough)
    setin('Metallic', metal)
    setin('Subsurface Weight', sss)
    if sss > 0:
        setin('Subsurface Radius', (0.9, 0.35, 0.2))
        setin('Subsurface Scale', 0.08)
    setin('Coat Weight', coat)
    setin('Sheen Weight', sheen)
    setin('Transmission Weight', transmission)
    setin('IOR', ior)
    setin('Alpha', alpha)
    if emission is not None:
        setin('Emission Color', (*emission, 1.0))
        setin('Emission Strength', estr)
    MATS[name] = m
    return m

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def tile_material(name, base, grout, scale=6.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.0
    brick.inputs['Color1'].default_value = (*base, 1)
    brick.inputs['Color2'].default_value = (*[min(1, c * 1.04) for c in base], 1)
    brick.inputs['Mortar'].default_value = (*grout, 1)
    brick.inputs['Scale'].default_value = scale
    brick.inputs['Mortar Size'].default_value = 0.025
    brick.inputs['Brick Width'].default_value = 0.5
    brick.inputs['Row Height'].default_value = 0.5
    nt.links.new(brick.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.25
    MATS[name] = m
    return m

def noise_material(name, c1, c2, scale=40.0, rough=0.9, bump=0.3):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m

def emission_material(name, color, strength):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*color, 1); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    MATS[name] = m
    return m

def M():
    return {
        'skin': principled('skin', srgb('#F4BE96'), rough=0.42, sss=0.0, sheen=0.3),
        'hair': principled('hair', srgb('#3A2519'), rough=0.35, sheen=0.4, coat=0.2),
        'shirt': principled('shirt', srgb('#22B3A3'), rough=0.7, sheen=0.5),
        'white': principled('white', srgb('#F7F7F4'), rough=0.65, sheen=0.5),
        'pants': principled('pants', srgb('#34507E'), rough=0.75, sheen=0.3),
        'eye': principled('eye', srgb('#1B1420'), rough=0.08, coat=1.0),
        'eyehi': emission_material('eyehi', (1, 1, 1), 6.0),
        'mouth': principled('mouth', srgb('#A8384C'), rough=0.4),
        'tongue': principled('tongue', srgb('#F07C8C'), rough=0.4),
        'teeth': principled('teeth', srgb('#FFFFFF'), rough=0.3),
        'cheek': principled('cheek', srgb('#FF8C9E'), rough=0.6, alpha=0.55),
        'brow': principled('brow', srgb('#3A2519'), rough=0.6),
        'water': principled('water', srgb('#9ED9FF'), rough=0.02, transmission=1.0, ior=1.33,
                            emission=srgb('#6FC8FF'), estr=0.25),
        'chrome': principled('chrome', srgb('#E6ECF1'), rough=0.12, metal=1.0),
        'ceramic': principled('ceramic', srgb('#FFFFFF'), rough=0.18, coat=0.6),
        'basin': principled('basin', srgb('#DCE7EF'), rough=0.2, coat=0.5),
        'plantpot': principled('plantpot', srgb('#F2A86E'), rough=0.6),
        'leaf': principled('leaf', srgb('#3FAF72'), rough=0.45, sss=0.1),
        'wood': noise_material('wood', srgb('#B67A45'), srgb('#8A5530'), scale=8, rough=0.55, bump=0.1),
        'soil': noise_material('soil', srgb('#E6C48E'), srgb('#C79A5E'), scale=90, rough=0.95, bump=0.6),
        'sand': noise_material('sand', srgb('#F2D29C'), srgb('#E0B77A'), scale=12, rough=0.95, bump=0.15),
        'mat_green': principled('mat_green', srgb('#23806F'), rough=0.85, sheen=0.8),
        'gold': principled('gold', srgb('#F0C75E'), rough=0.3, metal=1.0),
        'kaaba': principled('kaaba', srgb('#15151A'), rough=0.6),
        'teal_dot': principled('teal_dot', srgb('#1F8F7F'), rough=0.4),
        'lantern': emission_material('lantern', srgb('#FFD27A'), 8.0),
        'window': emission_material('window', srgb('#BFE8FF'), 2.2),
        'soap': principled('soap', srgb('#FF9FC0'), rough=0.3, sss=0.3, coat=0.5),
        'miswak': principled('miswak', srgb('#A87444'), rough=0.7),
        'bubble': principled('bubble', srgb('#FFFFFF'), rough=0.0, transmission=1.0, ior=1.1, alpha=0.6),
        'dust': principled('dust', srgb('#E9CD98'), rough=1.0, alpha=0.7),
        'sun': emission_material('sun', srgb('#FFE58A'), 6.0),
        'cloud': principled('cloud', srgb('#FFFFFF'), rough=0.9, sss=0.2),
    }

# ───────────────────────── primitives ─────────────────────────
def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj

def sphere(name, loc, radius, mat, scale=(1, 1, 1), seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=radius, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o

def box(name, loc, size, mat, bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        md = o.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = 5
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o

def cylinder(name, loc, radius, depth, mat, rot=(0, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o

def curve_tube(name, pts, radius, mat, res=24):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = 6; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.resolution_u = res
    o = bpy.data.objects.new(name, cu); link(o)
    o.data.materials.append(mat)
    return o

def set_curve(o, pts):
    sp = o.data.splines[0]
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p

def lathe(name, profile, mat, segs=56, scale_y=0.62):
    """revolve (r, z) profile around Z -> smooth mesh"""
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for k in range(segs):
            a = k / segs * TAU
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a) * scale_y, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            a, b = rings[i][k], rings[i][(k + 1) % segs]
            c, d = rings[i + 1][(k + 1) % segs], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); link(o)
    for p in me.polygons: p.use_smooth = True
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    o.data.materials.append(mat)
    return o

TORSO_PROFILE = [(0.001, 3.62), (0.34, 3.6), (0.7, 3.52), (0.92, 3.36), (1.0, 3.1), (0.98, 2.7), (0.93, 2.2),
                 (0.95, 1.4), (0.98, 0.35), (0.001, 0.3)]

class MetaFamily:
    """A metaball object: capsules + balls that blend smoothly (organic 3D body)."""
    def __init__(self, name, mat, resolution=0.06):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = resolution
        self.mb.render_resolution = resolution * 0.6
        self.mb.threshold = 0.6
        self.obj = bpy.data.objects.new(name, self.mb)
        link(self.obj)
        self.obj.data.materials.append(mat)
        self.els = {}

    def capsule(self, key, radius, stiff=2.0):
        e = self.mb.elements.new(type='CAPSULE'); e.radius = radius; e.stiffness = stiff
        self.els[key] = e; return e

    def ball(self, key, radius, stiff=2.0):
        e = self.mb.elements.new(type='BALL'); e.radius = radius; e.stiffness = stiff
        self.els[key] = e; return e

    def ellipsoid(self, key, radius, size=(1, 1, 1), stiff=2.0):
        e = self.mb.elements.new(type='ELLIPSOID'); e.radius = radius; e.stiffness = stiff
        e.size_x, e.size_y, e.size_z = size
        self.els[key] = e; return e

    def span(self, key, a, b, radius=None):
        """place capsule between points a and b"""
        e = self.els[key]
        a, b = Vector(a), Vector(b)
        mid = (a + b) / 2
        d = b - a
        L = max(d.length, 1e-4)
        e.co = mid
        e.size_x = L / 2
        e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
        if radius is not None: e.radius = radius
        e.hide = False

    def place(self, key, co, rot=None, radius=None, size=None):
        e = self.els[key]
        e.co = Vector(co)
        if rot is not None: e.rotation = rot
        if radius is not None: e.radius = radius
        if size is not None: e.size_x, e.size_y, e.size_z = size
        e.hide = False

    def hide(self, key, hidden=True):
        self.els[key].hide = hidden

# ───────────────────────── IK ─────────────────────────
def ik3(root, target, l1, l2, pole):
    """2-bone IK in 3D. pole: direction hint for the middle joint."""
    root, target, pole = Vector(root), Vector(target), Vector(pole)
    d = target - root
    dist = min(max(d.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    dn = d.normalized()
    end = root + dn * dist
    a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0))
    pn = (pole - dn * pole.dot(dn))
    if pn.length < 1e-6:
        pn = Vector((0, -1, 0)) - dn * dn.y
    pn.normalize()
    joint = root + dn * a + pn * h
    return joint, end

# ───────────────────────── character ─────────────────────────
class Character:
    UA, FA = 1.05, 1.0          # arm lengths (≈ 2D 108/104 px)
    TH, SH = 1.02, 1.0          # leg lengths

    def __init__(self, mats, outfit='shirt', k=1.0, torso_scale=1.0, head_scale=1.0):
        self.m = mats
        self.k = k
        self.UA = 1.05 * k; self.FA = 1.0 * k
        self.torso_scale = torso_scale; self.head_scale = head_scale
        cloth = mats['white'] if outfit == 'dish' else mats['shirt']
        self.outfit = outfit
        self.cloth = MetaFamily('Cloth', cloth, 0.07)
        self.skin = MetaFamily('Skin', mats['skin'], 0.05)
        self.legs = MetaFamily('Legs', mats['white'] if outfit == 'dish' else mats['pants'], 0.07)
        c = self.cloth
        self.torso = lathe('Torso', TORSO_PROFILE, cloth)
        self.collar = lathe('Collar', [(0.001, 3.66), (0.36, 3.64), (0.42, 3.58), (0.36, 3.54), (0.001, 3.55)],
                            principled('collar', srgb('#178C80' if outfit == 'shirt' else '#E4E8EC'), rough=0.6), scale_y=0.8)
        self.collar.parent = self.torso
        for s in 'RL':
            c.ball('shoulder' + s, 0.5, stiff=2.2)
            c.capsule('ua' + s, 0.3)
            c.ball('cuff' + s, 0.26)
            c.capsule('sleeve' + s, 0.26)      # long sleeves (dishdasha)
        sk = self.skin
        sk.capsule('neck', 0.46)
        for s in 'RL':
            sk.capsule('fa' + s, 0.2)
            sk.ellipsoid('hand' + s, 1.0, (0.28, 0.2, 0.3))
            sk.capsule('thumb' + s, 0.07)
            sk.capsule('finger' + s, 0.065)
            for k in range(4):
                sk.capsule('f%d' % k + s, 0.058)
            sk.ellipsoid('foot' + s, 1.0, (0.36, 0.2, 0.15))
        for s in 'RL':
            self.legs.capsule('th' + s, 0.36)
            self.legs.capsule('sh' + s, 0.32)
        # head (mesh parts parented to an empty)
        self.head = bpy.data.objects.new('HeadRoot', None); link(self.head)
        def child(o):
            o.parent = self.head; return o
        child(sphere('Head', (0, 0, 0), 0.95, mats['skin'], scale=(1.0, 0.95, 1.03)))
        # hair: cap + fringe
        hair = child(sphere('Hair', (0, 0.08, 0.2), 1.0, mats['hair'], scale=(1.02, 1.0, 0.93)))
        self.hair = hair
        self.fringe = child(sphere('Fringe', (0.05, -0.55, 0.62), 0.5, mats['hair'], scale=(1.45, 0.62, 0.52)))
        self.fringe.rotation_euler = (0.35, 0, -0.12)
        for s, sx in (('R', -1), ('L', 1)):
            child(sphere('Ear' + s, (sx * 0.93, 0.05, -0.05), 0.2, mats['skin'], scale=(0.6, 0.9, 1.25)))
        self.eyes = {}
        for s, sx in (('R', -1), ('L', 1)):
            e = child(sphere('Eye' + s, (sx * 0.34, -0.83, 0.02), 0.13, mats['eye'], scale=(1.0, 0.7, 1.25)))
            hi = sphere('EyeHi' + s, (sx * 0.34 - 0.04, -0.93, 0.08), 0.035, mats['eyehi'])
            hi.parent = e; hi.location = (-0.3, -0.12, 0.35)
            hi.scale = (0.3, 0.3, 0.3)
            self.eyes[s] = e
            b = child(sphere('Brow' + s, (sx * 0.36, -0.82, 0.33), 0.12, mats['brow'], scale=(1.4, 0.4, 0.32)))
            b.rotation_euler = (0, sx * 0.15, 0)
            self.eyes['brow' + s] = b
        child(sphere('Nose', (0, -0.95, -0.2), 0.1, mats['skin'], scale=(1.0, 0.8, 0.8)))
        self.cheeks = {}
        for s, sx in (('R', -1), ('L', 1)):
            ck = child(sphere('Cheek' + s, (sx * 0.56, -0.74, -0.28), 0.17, mats['cheek'], scale=(1.1, 0.35, 0.75)))
            self.cheeks[s] = ck
            puff = child(sphere('Puff' + s, (sx * 0.62, -0.55, -0.35), 0.3, mats['skin']))
            puff.scale = (0.001, 0.001, 0.001)
            self.cheeks['puff' + s] = puff
        # mouth: smile tube + open ellipsoid
        self.smile = curve_tube('Smile', [(-0.22, -0.94, -0.43), (0, -0.99, -0.53), (0.22, -0.94, -0.43)], 0.032, mats['mouth'])
        self.smile.parent = self.head
        self.mouth_open = child(sphere('MouthOpen', (0, -0.92, -0.5), 0.16, mats['mouth'], scale=(1.2, 0.35, 0.8)))
        self.tongue = sphere('Tongue', (0, 0, -0.35), 0.1, mats['tongue'], scale=(1.2, 0.5, 0.5)); self.tongue.parent = self.mouth_open
        self.tongue.location = (0, -0.25, -0.35)
        self.teeth = child(box('Teeth', (0, -0.95, -0.44), (0.3, 0.05, 0.06), mats['teeth'], bevel=0.02))
        # kuma cap
        self.cap = child(sphere('Cap', (0, 0.04, 0.66), 1.0, mats['white'], scale=(1.0, 1.0, 0.5)))
        self.cap_dots = []
        for k in range(9):
            ang = -math.pi / 2 + (k - 4) * 0.33
            d = child(sphere('CapDot%d' % k, (math.cos(ang) * 0.93, math.sin(ang) * 0.93 + 0.04, 0.5), 0.05, mats['teal_dot']))
            self.cap_dots.append(d)
        self.show_cap(False)
        self.props = {}

    # --------------------------------------------------------------
    def show_cap(self, on):
        for o in [self.cap] + self.cap_dots:
            o.hide_render = not on
        self.fringe.hide_render = on

    def set_face(self, eyes='open', blink=0.0, mouth='smile', mouth_open=0.0, puff=0.0, puff_side=0.0, brows=0.0):
        closed = eyes in ('closed', 'happy') or blink > 0.5
        for s in 'RL':
            e = self.eyes[s]
            e.scale = (1.0, 0.7, 0.18 if closed else (1.45 if eyes == 'wide' else 1.25))
            e.location.z = 0.02 - (0.06 if eyes == 'look_down' else 0)
            self.eyes['brow' + s].location.z = 0.33 + brows * 0.12
        for s, sx in (('R', -1), ('L', 1)):
            pf = puff * (1 + 0.6 * sx * puff_side)
            self.cheeks['puff' + s].scale = (0.55 * pf + 0.001, 0.5 * pf + 0.001, 0.5 * pf + 0.001)
            self.cheeks[s].scale = (1.1 + 0.6 * pf, 0.35, 0.75 + 0.3 * pf)
        self.smile.hide_render = mouth not in ('smile', 'puff')
        self.smile.scale = (0.55, 1, 0.4) if mouth == 'puff' else (1, 1, 1)
        self.mouth_open.hide_render = mouth not in ('open', 'speak', 'o', 'grin')
        o = mouth_open if mouth != 'grin' else 0.5
        if mouth == 'o':
            self.mouth_open.scale = (0.55, 0.35, 0.6 + 0.3 * o)
        else:
            self.mouth_open.scale = (1.2, 0.35, 0.2 + 0.9 * o)
        self.teeth.hide_render = mouth != 'grin'
        self.tongue.hide_render = o < 0.35

    def set_head(self, center, yaw=0.0, pitch=0.0, roll=0.0):
        self.head.location = Vector(center)
        q = Quaternion((0, 0, 1), yaw) @ Quaternion((1, 0, 0), pitch) @ Quaternion((0, 1, 0), roll)
        self.head.rotation_mode = 'QUATERNION'
        self.head.rotation_quaternion = q
        hs = self.head_scale
        self.head.scale = (hs, hs, hs)

    # --------------------------------------------------------------
    def arm(self, side, shoulder, hand, pole, sleeves='rolled', hand_dir=None, shape='open', hand_up=None):
        ua, fa = self.UA, self.FA
        elbow, end = ik3(shoulder, hand, ua, fa, pole)
        c, sk = self.cloth, self.skin
        sx = -1 if side == 'R' else 1
        c.place('shoulder' + side, Vector(shoulder) + Vector((-sx * 0.16, 0.05, -0.06)), radius=0.5 * self.k)
        if sleeves == 'rolled':
            c.span('ua' + side, shoulder, elbow, 0.38 * self.k)
            c.place('cuff' + side, elbow, radius=0.34 * self.k)
            c.hide('sleeve' + side)
            sk.span('fa' + side, elbow - (end - elbow).normalized() * 0.05, end, 0.24 * self.k)
        else:
            c.span('ua' + side, shoulder, elbow, 0.38 * self.k)
            c.place('cuff' + side, elbow, radius=0.34 * self.k)
            cuff_end = elbow + (end - elbow) * 0.85
            c.span('sleeve' + side, elbow, cuff_end, 0.34 * self.k)
            sk.span('fa' + side, cuff_end - (end - elbow).normalized() * 0.05, end, 0.2 * self.k)
        d = Vector(hand_dir) if hand_dir is not None else (end - elbow)
        d.normalize()
        self.hand(side, end, d, shape, hand_up)
        return elbow, end

    def hand(self, side, wrist, d, shape='open', up=None):
        sk = self.skin
        from mathutils import Matrix
        up = Vector(up) if up is not None else Vector((0, -1, 0))
        x = Vector(d).normalized()
        z = (up - x * up.dot(x))
        if z.length < 1e-4: z = Vector((0, 0, 1)) - x * x.z
        z.normalize()
        y = z.cross(x)
        rot = Matrix((x, y, z)).transposed().to_quaternion()
        c = Vector(wrist) + x * 0.14
        sx = -1 if side == 'R' else 1
        for k in range(4): sk.hide('f%d' % k + side)
        sk.hide('finger' + side)
        if shape == 'fist':
            sk.place('hand' + side, c, rot, radius=1.0, size=(0.2, 0.2, 0.19))
        elif shape == 'cup':
            sk.place('hand' + side, c, rot, radius=1.0, size=(0.22, 0.23, 0.1))
            for k in range(4):
                oy = (k - 1.5) * 0.085
                a0 = c + x * 0.16 + y * oy
                sk.span('f%d' % k + side, a0, a0 + x * 0.16 + z * 0.1, 0.055)
        elif shape == 'point':
            sk.place('hand' + side, c, rot, radius=1.0, size=(0.19, 0.2, 0.17))
            sk.span('finger' + side, c + x * 0.12 + y * sx * 0.06, c + x * 0.45 + y * sx * 0.06, 0.06)
        else:  # open / flat
            sk.place('hand' + side, c, rot, radius=1.0, size=(0.22, 0.23, 0.1))
            spread = 0.03 if shape == 'flat' else 0.08
            for k in range(4):
                oy = (k - 1.5) * 0.085
                L = 0.26 - abs(k - 1.3) * 0.035
                a0 = c + x * 0.16 + y * oy
                sk.span('f%d' % k + side, a0, a0 + x * L + y * oy * spread * 4, 0.056)
        tb = c - x * 0.02 + y * sx * 0.2
        sk.span('thumb' + side, tb, tb + x * 0.16 + y * sx * 0.07 + z * 0.04, 0.065)

    def torso_front(self, base=Vector((0, 0.05, -0.2)), lean=0.0, yaw=0.0):
        ts = self.torso_scale
        tw = getattr(self, 'torso_width', 1.0)
        self.torso.location = base
        self.torso.scale = (ts * tw, ts * tw, ts)
        self.torso.rotation_euler = Euler((0, lean, yaw), 'XYZ')
        up = Vector((math.sin(lean), 0, math.cos(lean)))
        top = Vector(base) + up * 3.55 * ts
        self.skin.span('neck', top - up * 0.3 * ts, top + up * 0.4 * ts, 0.46 * ts)
        return top

    def legs_front(self, hip_z, foot_z, spread=0.55):
        for s, sx in (('R', -1), ('L', 1)):
            hip = Vector((sx * spread, 0.05, hip_z))
            knee = Vector((sx * spread * 0.98, 0.0, (hip_z + foot_z) / 2))
            ank = Vector((sx * spread * 0.95, 0.05, foot_z + 0.15))
            self.legs.span('th' + s, hip, knee, 0.4)
            self.legs.span('sh' + s, knee, ank, 0.35)
            self.skin.place('foot' + s, ank + Vector((0, -0.2, -0.08)), Quaternion((0, 0, 1), 0), radius=1.0, size=(0.3, 0.42, 0.16))

    def leg(self, side, hip, ankle, pole, foot='flat', radius=0.34, face=Vector((-1, 0, 0))):
        knee, ank = ik3(hip, ankle, self.TH * self.k, self.SH * self.k, pole)
        self.legs.span('th' + side, hip, knee, radius)
        self.legs.span('sh' + side, knee, ank, radius * 0.9)
        f = Vector(face).normalized()
        from mathutils import Matrix
        if foot == 'toes':
            d = (f + Vector((0, 0, -1.6))).normalized()
            c = ank + d * 0.22 * self.k
        elif foot == 'back':
            d = (-f + Vector((0, 0, -0.15))).normalized()
            c = ank + d * 0.22 * self.k
        else:
            d = (f + Vector((0, 0, -0.1))).normalized()
            c = ank + d * 0.2 * self.k + Vector((0, 0, -0.06))
        rot = Vector((1, 0, 0)).rotation_difference(d)
        self.skin.place('foot' + side, c, rot, radius=1.0, size=(0.34 * self.k, 0.17 * self.k, 0.13 * self.k))
        return knee, ank

    def hide_legs(self):
        for s in 'RL':
            self.legs.hide('th' + s); self.legs.hide('sh' + s); self.skin.hide('foot' + s)

# ───────────────────────── scene setup ─────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 10
    sc.render.use_persistent_data = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.05
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 6
    sc.cycles.transparent_max_bounces = 6
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Punchy'
    except Exception:
        pass
    sc.view_settings.exposure = 0.0
    # world
    w = bpy.data.worlds.new('World'); sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.72, 1.0, 1)
    bg.inputs['Strength'].default_value = 0.5
    return sc

def camera(sc, loc=(0, -14, 5.0), look=(0, 0, 3.4), lens=85, ortho=False):
    cam = bpy.data.cameras.new('Cam'); cam.lens = lens
    cam.sensor_fit = 'VERTICAL'
    o = bpy.data.objects.new('Cam', cam); link(o)
    o.location = loc
    d = Vector(look) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    # choose sensor so the plane y=0 spans 7.2 m vertically (matches the 2D canvas)
    dist = d.length
    cam.sensor_height = 7.2 * cam.lens / dist
    sc.camera = o
    return o

def area_light(name, loc, look, energy, size=4.0, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); link(o)
    o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

def studio_lights():
    area_light('Key', (-5, -8, 9), (0, 0, 3.5), 2600, 5, (1.0, 0.94, 0.86))
    area_light('Fill', (7, -7, 4), (0, 0, 3), 500, 8, (0.8, 0.9, 1.0))
    area_light('Rim', (3, 6, 8), (0, 0, 4), 1500, 4, (1.0, 0.95, 0.9))

# ─── sets ───
def set_bathroom(m):
    wall = box('Wall', (0, 3.0, 4), (14, 0.2, 10), tile_material('tiles', srgb('#7CC6E6'), srgb('#CBEAF7'), 6.0), bevel=0)
    counter = box('Counter', (0, -0.6, 0.55), (9.5, 2.6, 1.3), m['ceramic'], bevel=0.12)
    # basin (sunken look: darker ellipse + rim)
    rim = sphere('BasinRim', (0.4, -0.95, 1.2), 1.0, m['ceramic'], scale=(2.05, 0.85, 0.08))
    basin = sphere('Basin', (0.4, -0.95, 1.24), 1.0, principled('basin_in', srgb('#9FB9CC'), rough=0.15, coat=0.6), scale=(1.8, 0.7, 0.04))
    drain = cylinder('Drain', (0.4, -0.95, 1.29), 0.09, 0.02, m['chrome'])
    pot = cylinder('Pot', (-2.65, 0.3, 1.55), 0.34, 0.6, m['plantpot'])
    for k, ang in enumerate([-0.9, -0.45, 0, 0.45, 0.9]):
        lf = sphere('Leaf%d' % k, (-2.65 + math.sin(ang) * 0.35, 0.3, 2.3 + math.cos(ang) * 0.2), 0.16, m['leaf'], scale=(1, 0.5, 3.2))
        lf.rotation_euler = (0, ang, 0)
    return {}

def make_faucet(m, outlet=(1.2, 2.52)):
    ox, oz = outlet
    pipe = curve_tube('Faucet', [(2.6, -1.0, 1.2), (2.6, -1.0, 2.3), (ox + 0.25, -1.0, oz + 0.55), (ox, -1.0, oz + 0.05)], 0.13, m['chrome'])
    base = cylinder('FaucetBase', (2.6, -1.0, 1.25), 0.24, 0.12, m['chrome'])
    handle = box('FaucetHandle', (2.95, -1.0, 2.0), (0.45, 0.12, 0.12), m['chrome'], bevel=0.04)
    return pipe

class Water:
    """stream + droplet pool"""
    def __init__(self, m, n_drops=40):
        self.m = m
        self.stream = cylinder('Stream', (0, 0, 0), 0.085, 1.0, m['water'], verts=24)
        disp = self.stream.modifiers.new('wave', 'WAVE'); disp.height = 0.012; disp.width = 0.3; disp.narrowness = 1.0
        self.wave = disp
        self.drops = [sphere('Drop%d' % i, (0, 0, -50), 0.06, m['water'], seg=16) for i in range(n_drops)]
        self.di = 0

    def set_stream(self, top, bottom, on=True, t=0.0, radius=0.085):
        if not on or top[2] - bottom < 0.02:
            self.stream.hide_render = True; return
        self.stream.hide_render = False
        L = top[2] - bottom
        self.stream.location = (top[0], top[1], bottom + L / 2)
        self.stream.scale = (radius / 0.085, radius / 0.085, L)
        self.wave.time_offset = -t * 40

    def begin(self):
        self.di = 0

    def drop(self, loc, r=0.06, stretch=1.0):
        if self.di >= len(self.drops): return
        d = self.drops[self.di]; self.di += 1
        d.location = loc; d.scale = (r / 0.06, r / 0.06, r / 0.06 * stretch)
        d.hide_render = False

    def end(self):
        for d in self.drops[self.di:]:
            d.hide_render = True

def set_shower(m):
    box('Wall', (0, 3.0, 4), (14, 0.2, 10), tile_material('tiles_b', srgb('#D6E8F7'), srgb('#FFFFFF'), 6.0), bevel=0)
    box('Floor', (0, 0, -0.1), (14, 8, 0.2), tile_material('floor_b', srgb('#BFD6E8'), srgb('#EAF3FA'), 4.0), bevel=0)
    arm = curve_tube('ShowerArm', [(0.0, 2.9, 7.4), (0.0, 1.5, 7.5), (0.0, 0.3, 7.1)], 0.08, m['chrome'])
    head = cylinder('ShowerHead', (0, 0.1, 6.95), 0.6, 0.16, m['chrome'])
    return head

def set_desert(m):
    w = bpy.context.scene.world
    nt = w.node_tree
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'
        sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(200)
        nt.links.new(sky.outputs['Color'], nt.nodes['Background'].inputs['Color'])
        nt.nodes['Background'].inputs['Strength'].default_value = 0.35
    except Exception:
        pass
    back = box('Backdrop', (0, 6, 4), (30, 0.2, 14), principled('sky', srgb('#BFE6FF'), rough=1, emission=srgb('#BFE6FF'), estr=0.6), bevel=0)
    for k, (x, y, s) in enumerate([(-6, 4, 3.5), (0, 5, 4.2), (6, 4, 3.8)]):
        dn = sphere('Dune%d' % k, (x, y, -s * 0.65), s, m['sand'], scale=(1.8, 1, 1))
    box('Ground', (0, 0, -0.1), (30, 12, 0.2), m['sand'], bevel=0)
    sun = sphere('Sun', (4.2, 5.8, 6.2), 0.55, m['sun'])
    for k, (x, z) in enumerate([(-2.5, 6.4), (1.6, 6.9)]):
        for j, (dx, dz, r) in enumerate([(-0.45, -0.05, 0.4), (0, 0.1, 0.55), (0.45, -0.05, 0.4)]):
            sphere('Cloud%d_%d' % (k, j), (x + dx, 5.6, z + dz), r, m['cloud'])
    # palm
    trunk = curve_tube('Palm', [(-3.1, 2.2, 0), (-3.0, 2.2, 1.4), (-2.85, 2.2, 3.0)], 0.12, principled('trunk', srgb('#8E6440'), rough=0.9))
    for k in range(6):
        ang = k / 6 * TAU
        lf = sphere('Frond%d' % k, (-2.85 + math.cos(ang) * 0.6, 2.2 + math.sin(ang) * 0.3, 3.0), 0.2, m['leaf'], scale=(4.0, 1.0, 0.5))
        lf.rotation_euler = (0, 0.4, ang)
    # tray
    tray = box('Tray', (0, -0.9, 0.55), (6.2, 2.4, 1.1), m['wood'], bevel=0.14)
    soil = box('Soil', (0, -0.95, 1.12), (5.7, 2.0, 0.08), m['soil'], bevel=0.03)
    return soil

def set_masjid(m, kaaba=False, floor_z=0.0):
    box('Wall', (0, 3.0, 4), (16, 0.2, 10), principled('wallwarm', srgb('#F7E7CF'), rough=0.9), bevel=0)
    box('Floor', (0, 0, floor_z - 0.1), (16, 8, 0.2), principled('floorwarm', srgb('#E6C9A0'), rough=0.8), bevel=0)
    # arch window (emissive)
    win = box('Window', (2.0, 2.88, 4.6), (1.6, 0.05, 2.6), MATS.get('window') or m['window'], bevel=0)
    top = sphere('WindowTop', (2.0, 2.88, 5.9), 0.8, m['window'], scale=(1, 0.06, 1.1))
    frame = box('WinFrame', (2.0, 2.93, 4.6), (1.85, 0.05, 2.85), principled('frame', srgb('#E1B878'), rough=0.5), bevel=0.03)
    # lantern
    curve_tube('Chain', [(-1.8, 1.5, 7.3), (-1.8, 1.5, 6.6), (-1.8, 1.5, 6.0)], 0.02, m['gold'])
    lan = sphere('Lantern', (-1.8, 1.5, 5.6), 0.32, m['lantern'], scale=(1, 1, 1.4))
    l = bpy.data.lights.new('LanternLight', 'POINT'); l.energy = 120; l.color = (1, 0.8, 0.5)
    lo = bpy.data.objects.new('LanternLight', l); link(lo); lo.location = (-1.8, 1.2, 5.3)
    # prayer mat
    matt = box('PrayerMat', (0.1, -0.2, floor_z + 0.03), (6.0, 2.2, 0.06), m['mat_green'], bevel=0.02)
    border = box('MatBorder', (0.1, -0.2, floor_z + 0.025), (6.2, 2.4, 0.05), m['gold'], bevel=0.02)
    if kaaba:
        k = box('Kaaba', (-2.7, 2.6, 3.4), (0.7, 0.7, 0.75), m['kaaba'], bevel=0.01)
        box('KaabaBand', (-2.7, 2.58, 3.55), (0.72, 0.72, 0.08), m['gold'], bevel=0)
        l2 = bpy.data.lights.new('KaabaGlow', 'POINT'); l2.energy = 60; l2.color = (1, 0.9, 0.6)
        lo2 = bpy.data.objects.new('KaabaGlow', l2); link(lo2); lo2.location = (-2.7, 2.0, 3.6)
    return matt

def render_to(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
