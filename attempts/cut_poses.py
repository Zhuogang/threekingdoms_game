# cut_poses.py <keyed-sheet.png> <out-dir> <cols> <rows> <unit-scale> <name,name,...>
# Cuts a keyed pose sheet into one PNG per cell, cropped to the figure, with
# its foot anchor; also writes a game-size copy (unit-scale, e.g. 36/300 so a
# soldier is 36px tall). Islands under 64 px of alpha are dropped (stray
# specks); nothing is repainted. Writes <out-dir>/poses.json.
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

sheet, out, cols, rows, scale, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]), sys.argv[6].split(',')
im = Image.open(sheet).convert('RGBA'); W, H = im.size; a = np.asarray(im)[..., 3]
os.makedirs(f'{out}/poses', exist_ok=True); os.makedirs(f'{out}/poses-game', exist_ok=True)
poses = []
for k, name in enumerate(names):
    c, r = k % cols, k // cols
    x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
    y0, y1 = round(r * H / rows), round((r + 1) * H / rows)
    cell = a[y0:y1, x0:x1] > 0
    lab, n = ndimage.label(cell)
    sizes = ndimage.sum(cell, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 64])
    ys, xs = np.nonzero(keep)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = np.asarray(im)[y0:y1, x0:x1].copy(); crop[~keep] = 0
    crop = crop[by0:by1, bx0:bx1]
    low = keep[max(by0, by1 - 12):by1]
    fx = float(np.nonzero(low)[1].mean()) - bx0
    anchor = [round(fx, 1), int(by1 - by0)]
    img = Image.fromarray(crop, 'RGBA'); img.save(f'{out}/poses/{name}.png', optimize=True)
    gw, gh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img.resize((gw, gh), Image.LANCZOS).save(f'{out}/poses-game/{name}.png', optimize=True)
    poses.append(dict(name=name, cell=[x0, y0, x1 - x0, y1 - y0], box=[int(x0 + bx0), int(y0 + by0), int(bx1 - bx0), int(by1 - by0)],
                      anchor=anchor, path=f'poses/{name}.png', game=dict(path=f'poses-game/{name}.png', size=[gw, gh], anchor=[round(anchor[0] * scale, 1), round(anchor[1] * scale, 1)]),
                      droppedIslands=int(sum(1 for s in sizes if s < 64))))
json.dump(dict(sheet=os.path.basename(sheet), cols=cols, rows=rows, gameScale=scale,
               preparation='Cut per cell from the keyed sheet; alpha islands under 64 px dropped; cropped to the figure; anchor is the foot point (mean x of the lowest 12 rows, bottom edge); game copy scaled by gameScale. No repainting.',
               poses=poses), open(f'{out}/poses.json', 'w'), indent=2)
print(out, len(poses), 'poses', [p['game']['size'] for p in poses][:3])
