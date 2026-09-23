"""Import a curated selection of project-tagged Eagle images; leave libraries untouched."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SELECTED = {
    'tenennium': ['MSN6O1T0NFHRE', 'MSN6PU3JOCWGM'],
    'step-or-sink-2': ['MEBH26D4A1LK3', 'MEBH26D46T7G2', 'MEEBXV0N97QN8'],
    'sheepy-sleep': ['MEBGYICDINO0Z', 'MEBGYICC0UE7N'],
    'bubble-office': ['MEEAKKYTVSMFN', 'MEEAL8K5CEP8A'],
    'dengdongdeng': ['MFI5ROXGDNH10', 'MFJ5WZ4AHX58D'],
    'send-me-2-the-missing': ['MEBJQABZQKJP2', 'MEHA0CM7CDTZ9'],
    'one-step-away': ['MTSDBKMLEU5WM', 'MTSWL17RMKN3J'],
    'irisvista': ['MQ0BMR5QYSQA8'],
    'attic': ['MSOHR91HCCZ07'],
}

def fingerprint(image):
    return hashlib.sha256(image.convert('RGB').resize((64, 64)).tobytes()).hexdigest()

def main():
    libraries = [Path('D:/Eagle库/我的作品集.library'), Path('D:/Eagle库/纯纯素材仓库.library')]
    works = {w['id']: w for w in json.loads((ROOT / 'public/works.json').read_text(encoding='utf-8'))}
    result, audit = {}, []
    for work, ids in SELECTED.items():
        result[work] = []
        w = works[work]
        existing = [w.get('image', '')] + w.get('images', []) + [b['src'] for b in w.get('blocks', []) if b.get('type') == 'image']
        hashes = set()
        for src in existing:
            if not src or src.startswith(('http:', 'https:')):
                continue
            path = ROOT / 'public' / src
            if path.is_file():
                with Image.open(path) as image:
                    hashes.add(fingerprint(image))
        for eagle_id in ids:
            folder = next(lib / 'images' / (eagle_id + '.info') for lib in libraries if (lib / 'images' / (eagle_id + '.info')).is_dir())
            data = json.loads((folder / 'metadata.json').read_text(encoding='utf-8'))
            with Image.open(folder / (data['name'] + '.' + data['ext'])) as image:
                signature = fingerprint(image)
                if signature in hashes:
                    continue
                hashes.add(signature)
                image.thumbnail((1600, 1600))
                target = ROOT / 'public/parts/portfolio' / f'eagle-{eagle_id.lower()}.webp'
                image.save(target, 'WEBP', quality=88)
            result[work].append({'src': './parts/portfolio/' + target.name, 'caption': data['name']})
            audit.append({'work': work, 'eagle_id': eagle_id, 'name': data['name'], 'library': folder.parents[1].name, 'tags': data.get('tags', []), 'output': target.relative_to(ROOT).as_posix()})
    (ROOT / 'public/folio-media.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'assets/folio-media-sources.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sizes = {}
    for path in (ROOT / 'public/parts/portfolio').iterdir():
        if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
            with Image.open(path) as image:
                sizes['./parts/portfolio/' + path.name] = list(image.size)
    (ROOT / 'public/folio-image-sizes.json').write_text(json.dumps(sizes, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(audit)} images for {sum(bool(v) for v in result.values())} projects')

if __name__ == '__main__':
    main()
