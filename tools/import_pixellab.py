#!/usr/bin/env python3
"""Import a PixelLab character export (zip or png+json) into assets/.

  python3 tools/import_pixellab.py <export.zip> <file_prefix> [--dir south-east] [--anim "Breathing Idle"]

Writes:
  assets/<prefix>.png            still sprite (first idle frame, tight-cropped, square)
  assets/<prefix>_portrait.png   96x96 head-and-shoulders crop
  assets/<prefix>_idle.png       horizontal strip of the idle frames (same crop as the still)
  assets/src/<prefix>/...        the original export, for later animations (run, other directions)
and prints the "anim" JSON to paste into data/heroes.json or data/enemies.json.
"""
import argparse, json, os, shutil, sys, tempfile, zipfile, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(src):
    tmp = tempfile.mkdtemp()
    if src.endswith('.zip'):
        zipfile.ZipFile(src).extractall(tmp)
    else:
        shutil.copy(src, tmp); j = src[:-4] + '.json'
        if os.path.exists(j): shutil.copy(j, tmp)
    js = glob.glob(os.path.join(tmp, '**', '*.json'), recursive=True)
    meta = json.load(open(js[0], encoding='utf-8'))
    png = os.path.join(os.path.dirname(js[0]), meta['spritesheet']['path'])
    return tmp, meta, Image.open(png).convert('RGBA')

def frames(meta, sheet, anim, direction):
    ss = meta['spritesheet']; cw, ch = ss['cell_size']['width'], ss['cell_size']['height']
    rows = ss['rows']
    row = next((r for r in rows if r['type'] == 'animation' and r.get('animation') == anim and r.get('direction') == direction), None)
    if row is None:
        rot = next(r for r in rows if r['type'] == 'rotations')
        i = rot['directions'].index(direction)
        return [sheet.crop((i * cw, rot['row'] * ch, (i + 1) * cw, (rot['row'] + 1) * ch))], False
    y = row['row'] * ch
    return [sheet.crop((i * cw, y, (i + 1) * cw, y + ch)) for i in range(row['frame_count'])], True

def union_box(imgs, pad=2):
    boxes = [im.getbbox() for im in imgs if im.getbbox()]
    l = min(b[0] for b in boxes); t = min(b[1] for b in boxes); r = max(b[2] for b in boxes); b = max(b[3] for b in boxes)
    w, h = r - l, b - t; side = max(w, h) + pad * 2
    cx, cy = (l + r) // 2, (t + b) // 2
    return (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('prefix')
    ap.add_argument('--dir', default='south-east'); ap.add_argument('--anim', default='Breathing Idle')
    ap.add_argument('--fps', type=int, default=6)
    a = ap.parse_args()
    tmp, meta, sheet = load(a.src)
    fr, animated = frames(meta, sheet, a.anim, a.dir)
    box = union_box(fr)
    crops = [f.crop(box) for f in fr]
    side = crops[0].width
    out = os.path.join(ROOT, 'assets')
    crops[0].save(os.path.join(out, a.prefix + '.png'))
    # portrait: 48x48 around the head, scaled x2 (integer, stays crisp) to 96x96
    still = crops[0]; bb = still.getbbox(); px = still.load()
    xs = [x for y in range(bb[1], min(bb[1] + 16, bb[3])) for x in range(still.width) if px[x, y][3] > 0]
    hx = (min(xs) + max(xs)) // 2 if xs else (bb[0] + bb[2]) // 2
    src = Image.new('RGBA', (still.width + 48, still.height + 48)); src.paste(still, (24, 24))
    por = src.crop((hx + 24 - 24, bb[1] + 24 - 3, hx + 24 + 24, bb[1] + 24 + 45)).resize((96, 96), Image.NEAREST)
    por.save(os.path.join(out, a.prefix + '_portrait.png'))
    anim = None
    if animated and len(crops) > 1:
        strip = Image.new('RGBA', (side * len(crops), side))
        for i, c in enumerate(crops): strip.paste(c, (i * side, 0))
        strip.save(os.path.join(out, a.prefix + '_idle.png'))
        anim = {"idle": {"file": a.prefix + "_idle", "frames": len(crops), "fps": a.fps}}
    dst = os.path.join(out, 'src', a.prefix); os.makedirs(dst, exist_ok=True)
    for f in glob.glob(os.path.join(tmp, '**', '*.*'), recursive=True): shutil.copy(f, dst)
    print(f'still {side}x{side}, portrait 96x96, frames {len(crops)}')
    print('"anim": ' + json.dumps(anim))

if __name__ == '__main__':
    main()
