"""Verify bundled font cmaps against all 98 names, rather than relying on system fallback."""
from pathlib import Path
import sys, json, hashlib
sys.path.insert(0, str(Path('.artifacts/fonttools').resolve()))
from fontTools.ttLib import TTFont

root = Path('public/fonts')
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
people = json.loads(Path('public/assets/v03/portraits/manifest.json').read_text(encoding='utf-8'))['entries']
font = TTFont(root / 'noto-serif-sc.woff2')
cmap = font.getBestCmap()
characters = {c for person in people for c in person['chinese']}
missing = ''.join(sorted(c for c in characters if ord(c) not in cmap))
assert not missing, 'Missing names: ' + missing
for name, metadata in manifest['files'].items():
    data = (root / name).read_bytes()
    assert len(data) == metadata['bytes']
    assert hashlib.sha256(data).hexdigest() == metadata['sha256']
for character in '祎叡恪瑾瓒懿谡琬':
    assert ord(character) in cmap, character
report = {'officers': len(people), 'nameCharacters': len(characters), 'missing': missing,
          'rareCharacters': '祎叡恪瑾瓒懿谡琬', 'files': manifest['files']}
if len(sys.argv) > 1:
    output = Path(sys.argv[1]); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'officers': len(people), 'nameCharacters': len(characters), 'missing': missing}))
