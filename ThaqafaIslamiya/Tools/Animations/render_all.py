import sys, os, subprocess, cairo, shutil
import imageio_ffmpeg
from rig import W, H
from steps import STEPS, COVERS
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
FPS = 24
only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
for sid, (sec, fn) in STEPS.items():
    if only and sid not in only: continue
    n = int(round(sec * FPS))
    path = os.path.join(OUT, sid + '.mp4')
    p = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                          '-movflags', '+faststart', '-an', path], stdin=subprocess.PIPE)
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    for f in range(n):
        ctx = cairo.Context(surf)
        ctx.set_operator(cairo.OPERATOR_SOURCE); ctx.set_source_rgba(1, 1, 1, 1); ctx.paint(); ctx.set_operator(cairo.OPERATOR_OVER)
        fn(ctx, f / n)
        surf.flush()
        p.stdin.write(bytes(surf.get_data()))
    p.stdin.close(); p.wait()
    print(sid, n, os.path.getsize(path) // 1024, 'KB', flush=True)
for cover, src in COVERS.items():
    shutil.copy(os.path.join(OUT, src + '.mp4'), os.path.join(OUT, cover + '.mp4'))
