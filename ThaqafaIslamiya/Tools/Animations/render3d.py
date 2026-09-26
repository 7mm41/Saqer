"""Render 3D step animations: python3 render3d.py OUTDIR [ids] [--preview t1,t2 --res N]"""
import sys, os, io, subprocess, argparse, time, hashlib
import cairo
import rig3d as R3
import steps3d as S3
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('ids', nargs='?')
ap.add_argument('--preview'); ap.add_argument('--res', type=int, default=600); ap.add_argument('--fps', type=int, default=15)
ap.add_argument('--samples', type=int, default=10)
a = ap.parse_args()
R3.RES = a.res
os.makedirs(a.out, exist_ok=True)
ids = a.ids.split(',') if a.ids else list(S3.STEPS)
TMP = '/tmp/r3d_frame.png'

def frame(st, fn, t):
    ov = fn(st, t)
    R3.render_to(TMP)
    surf = cairo.ImageSurface.create_from_png(TMP)
    out = cairo.ImageSurface(cairo.FORMAT_ARGB32, a.res, a.res)
    ctx = cairo.Context(out); ctx.set_source_surface(surf, 0, 0); ctx.paint()
    if ov:
        ctx.save(); ctx.scale(a.res / 720, a.res / 720); ov(ctx, st); ctx.restore()
    return out

for sid in ids:
    sec, scene, fn = S3.STEPS[sid]
    st = S3.Stage(scene)
    st.sc.cycles.samples = a.samples
    st.sc.render.resolution_x = st.sc.render.resolution_y = a.res
    t0 = time.time()
    if a.preview:
        for i, t in enumerate(float(x) for x in a.preview.split(',')):
            frame(st, fn, t).write_to_png(os.path.join(a.out, f'{sid}_{i}.png'))
        print(sid, 'preview', round(time.time() - t0, 1), flush=True)
        continue
    import imageio_ffmpeg
    n = int(round(sec * a.fps))
    path = os.path.join(a.out, sid + '.mp4')
    p = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra',
                          '-s', f'{a.res}x{a.res}', '-r', str(a.fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
                          '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', path], stdin=subprocess.PIPE)
    for f in range(n):
        s = frame(st, fn, f / n); s.flush(); p.stdin.write(bytes(s.get_data()))
        if f == 0: s.write_to_png(os.path.join(a.out, sid + '.jpg.png'))
    p.stdin.close(); p.wait()
    print(sid, n, 'frames', round(time.time() - t0, 1), 's', os.path.getsize(path) // 1024, 'KB', flush=True)
