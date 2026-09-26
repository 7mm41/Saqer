import sys, cairo
from rig import W,H
from steps import STEPS
from grid import grid
ids=sys.argv[1].split(','); ts=[float(x) for x in sys.argv[2].split(',')]; out=sys.argv[3]
fr=[]
for i in ids:
    for t in ts:
        s=cairo.ImageSurface(cairo.FORMAT_ARGB32,W,H); c=cairo.Context(s); STEPS[i][1](c,t); fr.append(s)
grid(fr,out,cols=len(ts),scale=float(sys.argv[4]) if len(sys.argv)>4 else 0.3)
