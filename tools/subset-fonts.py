"""Regenerate bundled fonts after catalog/content edits. Install fonttools and brotli in .artifacts/fonttools first."""
from pathlib import Path
import urllib.request
import sys,json,hashlib
sys.path.insert(0,str(Path('.artifacts/fonttools').resolve()))
from fontTools import subset
source_root=Path('.artifacts/font-sources');source_root.mkdir(parents=True,exist_ok=True)
for name,url in [('source-sans.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf'),('noto-serif-sc.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf'),('SourceSans3-OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/OFL.txt'),('NotoSerifSC-OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt')]:
 if not (source_root/name).exists():urllib.request.urlretrieve(url,source_root/name)
root=Path('public/fonts');root.mkdir(exist_ok=True)
corpus=''.join(p.read_text(encoding='utf-8') for p in Path('src/v03').rglob('*') if p.suffix in ['.ts','.tsx'])
characters=set(corpus)
portrait_manifest=json.loads(Path('public/assets/v03/portraits/manifest.json').read_text(encoding='utf-8'))
name_characters={ord(c) for entry in portrait_manifest['entries'] for c in entry['chinese']}
metadata={}
for source,name,allowed in [('source-sans.ttf','source-sans-3.woff2',lambda c:ord(c)<0x3000),('noto-serif-sc.ttf','noto-serif-sc.woff2',lambda c:ord(c)>=0x3000)]:
 options=subset.Options();options.flavor='woff2';options.recalc_timestamp=False
 font=subset.load_font(str(Path('.artifacts/font-sources')/source),options)
 subsetter=subset.Subsetter(options=options);subsetter.populate(unicodes=sorted(set(ord(c) for c in characters if allowed(c))))
 subsetter.subset(font)
 if source=='noto-serif-sc.ttf':
  missing=name_characters-set(font.getBestCmap())
  if missing:raise RuntimeError('Missing officer name glyphs: '+''.join(chr(c) for c in sorted(missing)))
 subset.save_font(font,str(root/name),options)
 data=(root/name).read_bytes();metadata[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
for name in ['SourceSans3-OFL.txt','NotoSerifSC-OFL.txt']:
 text=(Path('.artifacts/font-sources')/name).read_text(encoding='utf-8')
 (root/name).write_text('\n'.join(line.rstrip() for line in text.splitlines())+'\n',encoding='utf-8')
(root/'manifest.json').write_text(json.dumps({'source':'https://github.com/google/fonts','corpus':'src/v03/**/*.ts and tsx','characterCount':len(characters),'officerNameCharacterCount':len(name_characters),'officerNamesCovered':True,'files':metadata},indent=2)+'\n')
print(json.dumps(metadata))
