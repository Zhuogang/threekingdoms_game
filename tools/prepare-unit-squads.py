"""Package the approved small formations as transparent, padded runtime WebP icons.

Run with Python + Pillow. Originals and their generation prompts stay in docs.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/v0.3/assets/units-formations-ink-02.json'
data = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
keys = ['infantry-small', 'cavalry-small', 'archer-small', 'boat-transport']
entries = []
for key in keys:
    entry = next(item for item in data['entries'] if item['key'] == key)
    source = Image.open(ROOT / entry['path']).convert('RGBA')
    # Ignore near-invisible generation noise when framing the visible squad.
    bounds = source.getchannel('A').point(lambda alpha: 255 if alpha > 16 else 0).getbbox()
    bounds = (max(0, bounds[0] - 12), max(0, bounds[1] - 12),
              min(source.width, bounds[2] + 12), min(source.height, bounds[3] + 12))
    cropped = source.crop(bounds)
    cropped.thumbnail((224, 224), Image.Resampling.LANCZOS)
    icon = Image.new('RGBA', (256, 256))
    icon.paste(cropped, ((256 - cropped.width) // 2, (256 - cropped.height) // 2))
    path = f'assets/v03/units/{key}-ink-02.webp'
    target = ROOT / 'public' / path
    target.parent.mkdir(parents=True, exist_ok=True)
    icon.save(target, 'WEBP', lossless=True, method=6)
    entries.append({
        'key': key, 'source': entry['path'], 'path': path,
        'sourceCrop': list(bounds), 'width': 256, 'height': 256,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    })
(ROOT / 'docs/v0.3/assets/unit-squads-runtime.json').write_text(
    json.dumps({'sourceManifest': 'units-formations-ink-02.json',
                'scope': 'Stage 1 task 1: small squads only; boats are the water state of land troops.',
                'entries': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(entries, indent=2))
