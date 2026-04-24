import sqlite3
conn = sqlite3.connect('server/data/finance.db', timeout=5)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# WAL mode - reads committed + uncommitted
cur.execute("SELECT id, code, name, parent_id, account_set_id FROM accounts WHERE account_set_id = '7d0ab121-b62c-461d-97d1-fb8404f771ab'")
rows = cur.fetchall()
ids = [r['id'] for r in rows]
print(f"Rows: {len(rows)} | Unique IDs: {len(set(ids))}")

from collections import Counter
c = Counter(ids)
dups = [(k, v) for k, v in c.items() if v > 1]
print(f"Duplicates: {len(dups)}")
for k, v in dups:
    matching = [r for r in rows if r['id'] == k]
    for r in matching:
        print(f"  {v}x code={r['code']} name={r['name']} parent_id={r['parent_id']}")
