"""Builds a one-frame-per-step overview image of all animations."""
import sys, cairo
from rig import W, H
from steps import STEPS
from grid import grid
PICK = {'wudu_04': .1, 'wudu_05': .13, 'wudu_06': .17, 'wudu_07': .19, 'wudu_08': .13, 'wudu_09': .13, 'wudu_10': .55,
        'wudu_11': .6, 'wudu_12': .1, 'wudu_13': .1, 'ghusl_05': .15, 'ghusl_06': .3, 'ghusl_07': .3,
        'tayammum_04': .5, 'tayammum_05': .6, 'tayammum_06': .5, 'salah_11': .5, 'salah_12': .6, 'salah_13': .6,
        'salah_14': .6, 'salah_15': .6, 'salah_16': .6, 'salah_18': .3, 'salah_19': .72}
frames = []
for sid, (sec, fn) in STEPS.items():
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H); c = cairo.Context(s)
    fn(c, PICK.get(sid, 0.45)); frames.append(s)
grid(frames, sys.argv[1], cols=8, scale=0.22)
