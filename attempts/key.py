# key.py <in.png> <out.png> [preview.png]
# Deterministic magenta key. Alpha is the estimated magenta share of each pixel:
#  - near the background (within NEAR px), from p = (r+b)/2 - g, which is ~0 for
#    the warm/neutral foreground (snow, timber, rope, ink) and ~248 for magenta;
#  - everywhere, from q = b - g and from m = min(r,b) - g (shaded magenta), which is below 25 for snow (even its blue-grey
#    shadows), timber, red canvas, pine and ink, and ~247 for magenta.
# Edge colours are then un-mixed from the measured background colour, and
# fully opaque pixels are kept exactly as generated.
import sys, numpy as np
from PIL import Image
src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float64)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
m = np.minimum(r, b) - g
p = (r + b) / 2 - g
bgmask = m > 215
bg = np.median(src[bgmask], axis=0)
span = (bg[0] + bg[2]) / 2 - bg[1]
NEAR = 3
near = bgmask.copy()
for _ in range(NEAR):
    n = near.copy()
    n[1:] |= near[:-1]; n[:-1] |= near[1:]; n[:, 1:] |= near[:, :-1]; n[:, :-1] |= near[:, 1:]
    near = n
a_p = 1 - np.clip((p - 18) / (span - 18 - 8), 0, 1)
# q = b - g: magenta share for ink/timber mixes; snow shadows stay under Q0.
Q0 = 25
q = b - g
a_q = 1 - np.clip((q - Q0) / (bg[2] - bg[1] - Q0 - 8), 0, 1)
a = np.where(near, np.minimum(a_p, a_q), a_q)
# Shaded magenta: ImageGen darkens the background inside frames (ladder rungs,
# lattice), e.g. (226,38,180). Nothing in these sheets is truly pink, so a
# pixel whose red and blue both clearly exceed green is background however dark.
M0, M1 = 40, 110
a_m = 1 - np.clip((m - M0) / (M1 - M0), 0, 1)
a = np.minimum(a, a_m)
a[bgmask] = 0
f = (src - (1 - a)[..., None] * bg) / np.maximum(a, 1e-3)[..., None]
f = np.clip(f, 0, 255)
# Un-mixing blows up noise as alpha falls (a 5% pixel can come out pure green),
# so faint edge pixels get a neutral ink tone instead, and the faintest go.
a[a < 0.12] = 0
ink = np.repeat((0.6 * (0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]))[..., None], 3, axis=2)
w = np.clip((a - 0.12) / (0.5 - 0.12), 0, 1)[..., None]
f = np.where((a < 0.5)[..., None], w * f + (1 - w) * ink, f)
# A partial pixel that is itself magenta-tinted is shaded background mixed with
# ink, so its un-mixed colour is noise (it comes out green): use the ink tone.
f = np.where(((a < 1) & (m > M0))[..., None], ink, f)
f = np.where((a >= 1)[..., None], src, f)
f[a <= 0] = 0
out = np.dstack([f, a * 255]).round().astype(np.uint8)
Image.fromarray(out, 'RGBA').save(sys.argv[2], optimize=True)
print(sys.argv[2].split('/')[-1], 'bg', bg.round().astype(int).tolist(), 'opaque', int((a >= 1).sum()), 'edge', int(((a > 0) & (a < 1)).sum()))
if len(sys.argv) > 3:
    im = Image.fromarray(out, 'RGBA'); w, h = im.size
    pv = Image.new('RGB', (w, h * 2), (40, 40, 44)); pv.paste((236, 232, 220), (0, h, w, 2 * h))
    pv.paste(im, (0, 0), im); pv.paste(im, (0, h), im); pv.save(sys.argv[3])
