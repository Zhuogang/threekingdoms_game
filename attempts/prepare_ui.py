# prepare_ui.py icons <folder>   -> icons/<name>-{128,64,32}.png (square, centred, padded)
# prepare_ui.py paper <folder>   -> pieces/*.png, scroll-left/right/middle.png, paper-tile.png
# Works on the selected sheet of an S6 folder; nothing is repainted.
import sys, os, json, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage
mode, d = sys.argv[1], sys.argv[2]
if mode == 'icons':
    pj = json.load(open(f'{d}/poses.json')); os.makedirs(f'{d}/icons', exist_ok=True); out = []
    for p in pj['poses']:
        im = Image.open(f"{d}/{p['path']}").convert('RGBA'); side = int(max(im.size) * 1.12)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
        for px in (128, 64, 32):
            sq.resize((px, px), Image.LANCZOS).save(f"{d}/icons/{p['name']}-{px}.png", optimize=True)
        out.append(p['name'])
    json.dump(dict(icons=out, sizes=[128, 64, 32], preparation='Each icon cropped from the selected sheet, centred on a transparent square with 6% margin, resized with Lanczos. No repainting.'), open(f'{d}/icons/icons.json', 'w'), indent=2)
    print(d, len(out), 'icons')
elif mode == 'paper':
    im = Image.open(f'{d}/selected.png').convert('RGBA'); a = np.asarray(im)
    lab, n = ndimage.label(a[..., 3] > 8); objs = ndimage.find_objects(lab)
    boxes = sorted([(s[1].start, s[0].start, s[1].stop, s[0].stop) for s in objs if (s[1].stop - s[1].start) * (s[0].stop - s[0].start) > 20000], key=lambda b: (b[1] // 300, b[0]))
    names = {}
    for b in boxes:
        x0, y0, x1, y1 = b; w, h = x1 - x0, y1 - y0
        if w > 1000: names['scroll'] = b
        elif x0 < 700: names['panel'] = b
        elif h < 200: names['plaque'] = b
        else: names['dialog'] = b
    os.makedirs(f'{d}/pieces', exist_ok=True)
    for k, b in names.items(): im.crop(b).save(f'{d}/pieces/{k}.png', optimize=True)
    # Scroll: two roller ends and a repeatable middle strip.
    sc = im.crop(names['scroll']); w, h = sc.size; end = int(w * 0.06)
    sc.crop((0, 0, end, h)).save(f'{d}/pieces/scroll-left.png'); sc.crop((w - end, 0, w, h)).save(f'{d}/pieces/scroll-right.png')
    mid = sc.crop((w // 2 - 128, 0, w // 2 + 128, h)); m = np.asarray(mid).astype(float)
    k = 32; t = np.linspace(0, 1, k)[None, :, None]   # cross-fade the ends so the strip tiles
    m[:, :k] = m[:, :k] * t + m[:, -k:] * (1 - t); mid = Image.fromarray(m[:, :-k].round().astype(np.uint8), 'RGBA'); mid.save(f'{d}/pieces/scroll-middle.png')
    # Panel paper: centre square made seamless by blending with a half-offset copy.
    pn = np.asarray(im.crop(names['panel']).convert('RGB')).astype(float); H, W = pn.shape[:2]; s = min(H, W) - 40
    c = pn[(H - s) // 2:(H - s) // 2 + s, (W - s) // 2:(W - s) // 2 + s]
    sh = np.roll(np.roll(c, s // 2, 0), s // 2, 1)
    y, x = np.mgrid[0:s, 0:s] / (s - 1); wgt = (np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y)) * 2).clip(0, 1)[..., None]
    tile = c * wgt + sh * (1 - wgt); Image.fromarray(tile.round().astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f'{d}/pieces/paper-tile.png')
    json.dump(dict(pieces={k: list(map(int, b)) for k, b in names.items()}, derived=['scroll-left.png', 'scroll-right.png', 'scroll-middle.png (256px wide, cross-faded to tile)', 'paper-tile.png (512px, seamless by half-offset blend)'],
                   preparation='Pieces cut from the selected sheet by alpha components; scroll ends 6% of its width; no repainting except the tiling blends noted.'), open(f'{d}/pieces/pieces.json', 'w'), indent=2)
    print(d, sorted(names))

# Match repository formatting for generated metadata.
metadata = f'{d}/icons/icons.json' if mode == 'icons' else f'{d}/pieces/pieces.json'
subprocess.run(['node', 'node_modules/prettier/bin/prettier.cjs', '--write', metadata], check=True)
