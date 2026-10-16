"""Encode generated artwork as lightweight local WebP assets; no compositing or retouching."""
import json
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def encode(source, name):
    filename = name.lower().replace(' ', '-').replace("'", '') + '.webp'
    target = ROOT / 'assets' / 'forms' / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.thumbnail((1000, 750), Image.Resampling.LANCZOS)
        image.convert('RGB').save(target, 'WEBP', quality=86, method=6)
    return str(target)

if __name__ == '__main__':
    if sys.argv[1] == '--manifest':
        entries = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
        for entry in entries:
            target = ROOT / 'assets' / 'forms' / (entry['name'].lower().replace(' ', '-').replace("'", '') + '.webp')
            if not target.exists():
                encode(entry['source'], entry['name'])
        print(f'{len(entries)} form images prepared.')
    else:
        print(encode(sys.argv[1], sys.argv[2]))
