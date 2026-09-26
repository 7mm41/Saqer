import cairo, sys
from rig import *
def grid(frames, out, cols=3, scale=0.5):
    n=len(frames); rows=(n+cols-1)//cols
    g=cairo.ImageSurface(cairo.FORMAT_ARGB32,int(W*scale*cols),int(H*scale*rows)); c=cairo.Context(g)
    for i,f in enumerate(frames):
        c.save(); c.translate((i%cols)*W*scale,(i//cols)*H*scale); c.scale(scale,scale); c.set_source_surface(f,0,0); c.paint(); c.restore()
    g.write_to_png(out)
