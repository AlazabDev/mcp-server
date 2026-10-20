#!/usr/bin/env python3
"""Read-only Daftra CSV/ZIP inventory. Preserves identifiers and source bytes."""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path

KEYS = {'Clients.csv':'ClientNumber','Suppliers.csv':'SupplierNumber','Products.csv':'id','Invoices.csv':'InvoiceNo','Purchase_orders.csv':'PurchaseOrderNo','Projects.csv':'ID'}
JOINS = [('Invoice_items.csv','no','Invoices.csv','InvoiceNo'),('Purchase_order_items.csv','no','Purchase_orders.csv','PurchaseOrderNo'),('Invoices.csv','ClientNo','Clients.csv','ClientNumber'),('Purchase_orders.csv','SupplierNo','Suppliers.csv','SupplierNumber'),('Client_contacts.csv','ClientNumber','Clients.csv','ClientNumber'),('Supplier_contacts.csv','supplier_number','Suppliers.csv','SupplierNumber')]

def read_table(blob):
    text = blob.decode('utf-8-sig')
    # The supplied export places a BOM AFTER the header, before the first value.
    # Remove line-leading BOMs before CSV parsing so quoted first fields parse correctly.
    cleaned, count = re.subn(r'(?m)^\ufeff', '', text)
    reader = csv.DictReader(io.StringIO(cleaned, newline=''))
    rows = list(reader)
    malformed = [i+2 for i,r in enumerate(rows) if None in r or any(v is None for v in r.values())]
    if malformed:
        raise ValueError(f'Invalid CSV record widths at record positions {malformed[:10]}')
    return reader.fieldnames or [], rows, count

def inspect(source):
    p = Path(source)
    if p.is_dir():
        blobs = {f.name:f.read_bytes() for f in sorted(p.glob('*.csv'))}
    else:
        with zipfile.ZipFile(p) as z:
            blobs = {}
            for info in z.infolist():
                if info.is_dir() or not info.filename.lower().endswith('.csv'):
                    continue
                name = Path(info.filename).name
                if name in blobs:
                    raise ValueError('Ambiguous repeated basename: '+name)
                blobs[name] = z.read(info)
    tables = {}
    report = {'files':{},'joins':[],'total_rows':0}
    for name,blob in sorted(blobs.items()):
        headers,rows,boms = read_table(blob)
        tables[name] = rows
        entry = {'rows':len(rows),'columns':headers,'sha256':hashlib.sha256(blob).hexdigest(),'line_leading_boms_removed_in_memory':boms}
        if name in KEYS:
            key = KEYS[name]
            if key not in headers: raise ValueError(f'{name}: missing key {key}')
            counts = Counter(r[key].strip() for r in rows)
            entry['key'] = key
            entry['duplicate_nonblank_keys'] = {k:v for k,v in counts.items() if k and v>1}
            entry['blank_key_rows'] = counts.get('',0)
        if 'CurrencyCode' in headers:
            entry['currency_counts'] = dict(Counter(r['CurrencyCode'].strip() or '(blank)' for r in rows))
        if 'Date' in headers:
            dates = [r['Date'].strip() for r in rows if r['Date'].strip()]
            entry['date_values_lexical_min_max'] = [min(dates),max(dates)] if dates else []
        report['files'][name] = entry
        report['total_rows'] += len(rows)
    for child,ck,parent,pk in JOINS:
        if child not in tables or parent not in tables: continue
        counts = Counter(r[pk].strip() for r in tables[parent] if r[pk].strip())
        keys = [r[ck].strip() for r in tables[child]]
        report['joins'].append({'child':child,'child_key':ck,'parent':parent,'parent_key':pk,
            'matched_rows':sum(bool(k) and counts[k]>0 for k in keys),
            'unmatched_rows':sum(bool(k) and counts[k]==0 for k in keys),
            'blank_child_rows':sum(not k for k in keys),
            'ambiguous_rows':sum(bool(k) and counts[k]>1 for k in keys)})
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', default=str(Path(__file__).resolve().parents[1]/'assets/source'))
    args = parser.parse_args()
    print(json.dumps(inspect(args.source),ensure_ascii=False,indent=2))
