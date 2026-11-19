#!/usr/bin/env python3
"""Compact-format data/*.json: objects are indented, but short arrays and small objects stay on one line.
Usage: python3 tools/fmt.py            (formats every file in data/)
       python3 tools/fmt.py --stdin F  (reads JSON from stdin, writes data/F.json)"""
import json, os, sys, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = 160
def one(v): return json.dumps(v, ensure_ascii=False, separators=(', ', ': '))
def fmt(v, ind=0):
    pad = '  ' * ind
    s = one(v)
    if len(s) + len(pad) <= W and (not isinstance(v, dict) or ind > 1 or len(v) <= 3): return s
    if isinstance(v, dict):
        items = [f'{pad}  {json.dumps(k, ensure_ascii=False)}: {fmt(x, ind + 1)}' for k, x in v.items()]
        return '{\n' + ',\n'.join(items) + f'\n{pad}}}'
    if isinstance(v, list):
        items = [f'{pad}  {fmt(x, ind + 1)}' for x in v]
        return '[\n' + ',\n'.join(items) + f'\n{pad}]'
    return s
def write(name, data):
    open(os.path.join(ROOT, 'data', name + '.json'), 'w', encoding='utf-8').write(fmt(data) + '\n')
if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--stdin':
        write(sys.argv[2], json.load(sys.stdin))
    else:
        for p in sorted(glob.glob(os.path.join(ROOT, 'data', '*.json'))):
            write(os.path.basename(p)[:-5], json.load(open(p, encoding='utf-8')))
