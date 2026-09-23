"""Validate the documentary proposal, not runtime content or licensed art permission."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
plan = json.loads((HERE / 'catalogue.json').read_text())
items = {row['id']: row for row in plan['items']}
assert len(items) == len(plan['items']), 'duplicate item IDs'
assert len({t['id'] for t in plan['transforms']}) == len(plan['transforms'])
assert len({p['id'] for p in plan['potions']}) == 64
with (HERE / 'icon-audit.csv').open() as stream:
    audit = list(csv.DictReader(stream))
assert len(audit) == 6982
assert len({(a['category'], int(a['number'])) for a in audit}) == 6982
index = json.loads((ROOT / 'docs/reference-assets/kenmi-premium-icons-index.json').read_text())
by_category = {c['category']: c for c in index['categories']}
for a in audit:
    c = by_category[a['category']]
    assert 1 <= int(a['number']) <= c['iconCount']
    assert int(a['cell']) in c['iconCells'][int(a['number']) - 1]
    assert a['source'] == c['source']
    assert a['disposition'] in {'selected', 'alternate', 'reference', 'excluded', 'deferred'}
for c in by_category.values():
    assert hashlib.sha256((ROOT / c['source']).read_bytes()).hexdigest() == c['sha256']
for key, icon in plan['icons'].items():
    raw = (ROOT / icon['source']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == icon['sha256'], key
    if 'crop' in icon:
        assert raw[:8] == b'\x89PNG\r\n\x1a\n', key
        width, height = int.from_bytes(raw[16:20], 'big'), int.from_bytes(raw[20:24], 'big')
        x, y, w, h = icon['crop']
        assert x >= 0 and y >= 0 and w == h == 16 and x + w <= width and y + h <= height, key
    else:
        rows = icon['grid']
        assert rows and all(len(r) == len(rows[0]) for r in rows), key
        assert all(p == '.' or p in icon['palette'] for r in rows for p in r), key
for item in items.values():
    assert item['icon'] in plan['icons']
    assert len(item['alternates']) <= 3
    assert all(k in plan['icons'] for k in item['alternates'])
    assert item['source'] and item['tier'] and item['effect']
    assert item['stack'] > 0 and item['sell'] >= 0
    assert all(ref in items and count > 0 for ref, count in item['inputs'].items()), item['id']
    assert all(ref in items for ref in item['potions'])
for t in plan['transforms']:
    assert all(ref in items and n > 0 for ref, n in {**t['inputs'], **t['outputs']}.items()), t['id']
    assert t['seconds'] >= 0
    target = next(iter(t['outputs']))
    if t['id'].split(':', 1)[1] == target.split(':', 1)[1]:
        assert t['inputs'] == items[target]['inputs'], t['id']
for p in plan['potions']:
    row = items[p['id']]
    expected = {p['base']: 1, p['active']: p['activeCount'], p['modifier']: 1, 'item:empty_vial': 1}
    assert row['inputs'] == expected, p['id']
    assert row['seconds'] == p['brewSeconds']
# Existing inventories are roots; new co-products are only reachable through their process.
produced = {i for t in plan['transforms'] if t['status'] != 'existing unchanged' for i in t['outputs']}
depths = {i: 0 for i, r in items.items() if r['status'] == 'existing unchanged' or i not in produced or r['buy'] is not None}
for _ in range(len(items)):
    before = dict(depths)
    for t in plan['transforms']:
        if t['status'] == 'existing unchanged' or not all(i in depths for i in t['inputs']):
            continue
        depth = 1 + max(depths[i] for i in t['inputs'])
        for i in t['outputs']:
            if i not in depths or depth < depths[i]:
                depths[i] = depth
    if depths == before:
        break
assert set(depths) == set(items), sorted(set(items) - set(depths))
for id, r in items.items():
    assert depths[id] == r['depth'], (id, depths[id], r['depth'])
assert max(depths.values()) == 5
# Final HTML embeds the exact same catalogue, so file:// viewing needs no JSON fetch.
page = (HERE / 'index.html').read_text()
embedded = page.split('const data=', 1)[1].split(';const audit=', 1)[0]
assert json.loads(embedded.replace('<\\/', '</')) == plan, 'stale HTML catalogue'
assert all(f"`{i}`" in (ROOT / 'docs/63-food-alchemy-content-plan.md').read_text() for i in items)
# Shop-procurement bounds include every co-product in batch sale revenue.
costs = {i: float(r['buy']) for i, r in items.items() if r['buy'] is not None}
for _ in range(len(items)):
    changed = False
    for t in plan['transforms']:
        if not all(i in costs for i in t['inputs']):
            continue
        cost = sum(costs[i] * n for i, n in t['inputs'].items())
        for i, n in t['outputs'].items():
            if i not in costs or cost / n < costs[i]:
                costs[i] = cost / n
                changed = True
    if not changed:
        break
for t in plan['transforms']:
    if t['status'] == 'existing unchanged' or not all(i in costs for i in t['inputs']):
        continue
    cost = sum(costs[i] * n for i, n in t['inputs'].items())
    sale = sum(items[i]['sell'] * n for i, n in t['outputs'].items())
    assert sale <= cost, ('shop craft resale loop', t['id'], cost, sale)
assert not any(i in items for i in ['item:raw_frog', 'item:raw_insect', 'item:raw_snail', 'item:cooked_frog', 'item:cooked_insect', 'item:cooked_snail'])
assert sum(i.startswith('item:captured_') for i in items) == 6
print(f"PASS: {len(items)} master rows; {len(plan['transforms'])} transforms; 64 potions; 6982 classified icons; source hashes/crops; graph depth ≤5; HTML parity")
print('Limit: structural proposal checks, not runtime reachability, gameplay balance, or owner approval.')
