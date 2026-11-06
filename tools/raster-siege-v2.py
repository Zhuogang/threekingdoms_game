"""Rasterize V2 review SVGs with librsvg, without Chromium.

Run after measure-siege-v2.mjs with ~/simple_ML_practices/.venv/bin/python.
Pillow composes the same painting patches; librsvg draws the actual SSR SVG.
These static images do not measure Chromium rendering or frame scheduling.
"""
import argparse
import ctypes
import json
import re
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / '.artifacts/siege/v2-scenes'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--revision', choices=['v2', 'v3'], default='v2')
parser.add_argument('--scene', help='Render just one scene; default: all review SVGs')
args = parser.parse_args()
DIRECTORY = ROOT / f'.artifacts/siege/{args.revision}-scenes'

rsvg = ctypes.CDLL('librsvg-2.so.2')
cairo = ctypes.CDLL('libcairo.so.2')
gobject = ctypes.CDLL('libgobject-2.0.so.0')
PTR = ctypes.c_void_p
rsvg.rsvg_handle_new.restype = PTR
rsvg.rsvg_handle_set_base_uri.argtypes = [PTR, ctypes.c_char_p]
rsvg.rsvg_handle_write.argtypes = [PTR, ctypes.c_char_p, ctypes.c_size_t, PTR]
rsvg.rsvg_handle_write.restype = ctypes.c_int
rsvg.rsvg_handle_close.argtypes = [PTR, PTR]
rsvg.rsvg_handle_close.restype = ctypes.c_int
rsvg.rsvg_handle_render_cairo.argtypes = [PTR, PTR]
rsvg.rsvg_handle_render_cairo.restype = ctypes.c_int
cairo.cairo_image_surface_create.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
cairo.cairo_image_surface_create.restype = PTR
cairo.cairo_create.argtypes = [PTR]
cairo.cairo_create.restype = PTR
cairo.cairo_surface_write_to_png.argtypes = [PTR, ctypes.c_char_p]
cairo.cairo_surface_write_to_png.restype = ctypes.c_int
cairo.cairo_destroy.argtypes = [PTR]
cairo.cairo_surface_destroy.argtypes = [PTR]
gobject.g_object_unref.argtypes = [PTR]

results = []
paths = [DIRECTORY / f'{args.scene}.svg'] if args.scene else sorted(DIRECTORY.glob('*.svg'))
for path in paths:
    started = time.perf_counter()
    meta = json.loads(path.with_suffix('.json').read_text())
    composite = ROOT / 'docs/siege/chencang/art/s2-01-full-map/composite.webp'
    painting = Image.open(composite).convert('RGBA')
    for patch in meta['patchesResolved']:
        patch_path = ROOT / patch['href'].split('?')[0].lstrip('/')
        piece = Image.open(patch_path).convert('RGBA')
        layer = Image.new('RGBA', painting.size)
        layer.paste(piece, tuple(patch['at']))
        if 'opacity' in patch:
            layer.putalpha(layer.getchannel('A').point(lambda n: round(n * patch['opacity'])))
        if 'clip' in patch:
            box = tuple(patch['clip'])
            clipped = layer.crop(box)
            layer = Image.new('RGBA', painting.size)
            layer.paste(clipped, box[:2])
        painting = Image.alpha_composite(painting, layer)
    paint_path = path.with_name(f'{path.stem}-painting.png')
    painting.save(paint_path)
    source = path.read_text().replace(composite.as_uri(), paint_path.as_uri())

    # This environment's GdkPixbuf has no WebP loader. Converted portraits live
    # only in the artifact directory; approved art and metadata stay untouched.
    def png_href(match):
        target = Path(match.group(1))
        png = DIRECTORY / target.with_suffix('.png').name
        Image.open(target).save(png)
        return f'href="{png.as_uri()}"'

    source = re.sub(r'href="file://([^\"]+\.webp)"', png_href, source)
    for target in re.findall(r'href="file://([^\"]+)"', source):
        if not Path(target).is_file():
            raise FileNotFoundError(target)
    source = source.replace('width="3072" height="1536"', 'width="1536" height="768"', 1)
    handle = rsvg.rsvg_handle_new()
    # librsvg restricts external image reads to the base URI's subtree. All
    # referenced approved art and composed paintings live under this root.
    rsvg.rsvg_handle_set_base_uri(handle, (ROOT / 'siege-review.svg').as_uri().encode())
    data = source.encode()
    assert rsvg.rsvg_handle_write(handle, data, len(data), None)
    assert rsvg.rsvg_handle_close(handle, None)
    surface = cairo.cairo_image_surface_create(0, 1536, 768)
    context = cairo.cairo_create(surface)
    assert rsvg.rsvg_handle_render_cairo(handle, context)
    output = path.with_suffix('.png')
    assert cairo.cairo_surface_write_to_png(surface, str(output).encode()) == 0
    cairo.cairo_destroy(context)
    cairo.cairo_surface_destroy(surface)
    gobject.g_object_unref(handle)
    # Keep the original inspection filename for planner links.
    Image.open(output).save(path.with_name(f'{path.stem}-half.png'))
    result = {
        'scene': path.stem, 'size': [1536, 768], 'units': len(meta['units']),
        'seconds': round(time.perf_counter() - started, 3),
    }
    results.append(result)
    print(json.dumps(result), flush=True)

report = ROOT / f'.artifacts/siege/{args.revision}-raster-{args.scene or "all"}.json'
report.write_text(json.dumps(results, indent=2) + '\n')
