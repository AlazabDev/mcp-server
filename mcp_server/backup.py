"""Expose the attached Daftra backup using its original verified CSV reader."""
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent/'az_mcp/daftra/backup-skill'
def module():
    spec=importlib.util.spec_from_file_location('alazab_daftra_backup',ROOT/'scripts/inspect_backup.py')
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj

def execute(operation,args):
    reader=module();folder=ROOT/'assets/source'
    if operation=='inventory':return {'source':'attached_historical_backup','live':False,'inventory':reader.inspect(folder)}
    name=args['table'];path=folder/name
    if path.parent!=folder or name not in {p.name for p in folder.glob('*.csv')}:raise ValueError('UNKNOWN_BACKUP_TABLE')
    headers,rows,_=reader.read_table(path.read_bytes());fields=args.get('fields') or headers;filters=args.get('filters') or {};query=args.get('search','').casefold()
    if any(f not in headers for f in [*fields,*filters]):raise ValueError('UNKNOWN_BACKUP_COLUMN')
    found=[r for r in rows if all(r.get(k)==v for k,v in filters.items()) and (not query or any(query in str(v).casefold() for v in r.values()))]
    start=args.get('offset',0);limit=args.get('limit',20)
    return {'source':'attached_historical_backup','live':False,'table':name,'total_matches':len(found),'offset':start,'rows':[{k:r[k] for k in fields} for r in found[start:start+limit]]}
