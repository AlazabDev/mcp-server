#!/usr/bin/env python3
"""Daftra live API evidence collector. Python stdlib only; read-only GET allowlist."""
import argparse, collections, datetime, hashlib, json, os, pathlib, re, ssl, sys, time
from urllib.parse import urlparse, urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = pathlib.Path(__file__).resolve().parent
METHODS = {'get','post','put','patch','delete','head','options','trace'}
# GET alone is not enough: only collection/list and site_info routes, never action endpoints.
ACTION_WORDS = re.compile(r'(update|delete|convert|trigger|activate|deactivate|assign|send|change|add|create|edit|lock|unlock|restore|cancel|approve|reject|generate|issue|refund|transfer|close|open|sync|import|export|logout|login|refresh)', re.I)
SENSITIVE = re.compile(r'(token|secret|password|passwd|apikey|api_key|authorization|cookie|credential|private_key)', re.I)

def read_env(path):
    out={}
    if not path.is_file(): return out
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        s=raw.strip()
        if not s or s.startswith('#'):continue
        if s.startswith('export '): s=s[7:]
        if '=' not in s:continue
        k,v=s.split('=',1);k=k.strip();v=v.strip()
        if len(v)>1 and v[0]==v[-1] and v[0] in "\"'":v=v[1:-1]
        out[k]=v
    return out

def dump(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf-8')

def types(data,prefix='',out=None,limit=20000):
    if out is None:out={}
    if len(out)>=limit:return out
    typ='null' if data is None else 'boolean' if isinstance(data,bool) else 'integer' if isinstance(data,int) else 'number' if isinstance(data,float) else 'object' if isinstance(data,dict) else 'array' if isinstance(data,list) else 'string'
    if prefix:out.setdefault(prefix,{'observed_types':[]}); t=out[prefix]['observed_types']; t.append(typ) if typ not in t else None
    if isinstance(data,dict):
        for k,v in data.items():
            if not SENSITIVE.search(k): types(v,f'{prefix}.{k}' if prefix else k,out,limit)
    elif isinstance(data,list):
        for v in data[:10]:types(v,f'{prefix}[]',out,limit)
    return out

def ids(data,prefix='',out=None,limit=1000):
    if out is None:out={}
    if isinstance(data,dict):
        for k,v in data.items():
            p=f'{prefix}.{k}' if prefix else k
            if (k.lower()=='id' or k.lower().endswith('_id')) and isinstance(v,(str,int)) and not isinstance(v,bool):
                a=out.setdefault(p,[])
                if len(a)<limit and v not in a:a.append(v)
            if not SENSITIVE.search(k):ids(v,p,out,limit)
    elif isinstance(data,list):
        for v in data[:100]:ids(v,prefix+'[]',out,limit)
    return out

def redacted_json(data):
    if isinstance(data,dict):return {k:('[REDACTED]' if SENSITIVE.search(k) else redacted_json(v)) for k,v in data.items()}
    if isinstance(data,list):return [redacted_json(v) for v in data]
    return data

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--env',default=str(ROOT/'.env'))
    ap.add_argument('--spec',default=str(ROOT/'daftra_openapi.json'))
    ap.add_argument('--out',default=str(ROOT/'evidence'))
    ap.add_argument('--run',action='store_true',help='Perform live safe GET requests (default catalog only)')
    ap.add_argument('--max-requests',type=int,default=140)
    ap.add_argument('--delay',type=float,default=0.35)
    ap.add_argument('--timeout',type=int,default=20)
    args=ap.parse_args()
    env={**read_env(pathlib.Path(args.env)),**os.environ}
    spec=json.loads(pathlib.Path(args.spec).read_text(encoding='utf-8'))
    out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
    base=env.get('DAFTRA_BASE_URL','').strip().rstrip('/')
    if not base:
        sub=env.get('DAFTRA_SUBDOMAIN','').strip()
        domain=env.get('DAFTRA_API_DOMAIN','daftara.com').strip()
        if not sub: sys.exit('ERROR: Configure DAFTRA_BASE_URL or DAFTRA_SUBDOMAIN in .env')
        base=f'https://{sub}.{domain}/api2'
    if not base.endswith('/api2'):
        base += '/api2' if urlparse(base).path in ('','/') else ''
    parsed=urlparse(base)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
        sys.exit('ERROR: Base URL must be HTTPS with no embedded credentials')
    if not (parsed.hostname=='daftara.com' or parsed.hostname.endswith('.daftara.com') or parsed.hostname=='daftra.com' or parsed.hostname.endswith('.daftra.com')):
        print('ERROR: Unexpected API host. Verify .env DAFTRA_BASE_URL against Daftra account.',file=sys.stderr);sys.exit(2)
    key=env.get('DAFTRA_API_KEY','').strip();token=env.get('DAFTRA_ACCESS_TOKEN','').strip()
    mode=env.get('DAFTRA_AUTH_MODE','').lower().strip()
    if mode in ('bearer','token','oauth'):
        if not token:sys.exit('ERROR: DAFTRA_AUTH_MODE bearer but DAFTRA_ACCESS_TOKEN empty')
        auth={'Authorization':'Bearer '+token}
    elif mode in ('apikey','api_key','key'):
        if not key:sys.exit('ERROR: DAFTRA_AUTH_MODE apikey but DAFTRA_API_KEY empty')
        auth={'apikey':key}
    elif token:auth={'Authorization':'Bearer '+token}
    elif key:auth={'apikey':key}
    else:sys.exit('ERROR: No configured DAFTRA_ACCESS_TOKEN or DAFTRA_API_KEY')
    catalog=[]; eligible=[]
    for path,item in spec['paths'].items():
        if not isinstance(item,dict):continue
        for method,op in item.items():
            if method.lower() not in METHODS or not isinstance(op,dict):continue
            params=[{'name':p.get('name'),'in':p.get('in'),'required':p.get('required',False),'type':p.get('schema',{}).get('type')} for p in (item.get('parameters',[])+op.get('parameters',[])) if isinstance(p,dict)]
            safe=method.lower()=='get' and not ACTION_WORDS.search(path) and not re.search(r'\{(?!format\})[^}]+\}',path)
            # Conservative: no dynamic path variables or parameterized calls on this baseline pass.
            row={'method':method.upper(),'path':path,'summary':op.get('summary'),'operationId':op.get('operationId'),'parameters':params,'expected_responses':list(op.get('responses',{})),'eligible_read_only':bool(safe)}
            catalog.append(row)
            if safe:eligible.append(row)
    dump(out/'operations-catalog.json',catalog)
    dump(out/'run-config.json',{'api_host':parsed.hostname,'api_base_path':parsed.path,'authentication':'bearer' if 'Authorization' in auth else 'apikey','operations':len(catalog),'eligible_safe_get':len(eligible),'live_mode':args.run,'timestamp_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    if not args.run:
        print(f'CATALOG_ONLY operations={len(catalog)} eligible_safe_get={len(eligible)} output={out}')
        print('Run with --run for live API requests. No requests made.');return
    summary=[]
    for row in eligible[:max(args.max_requests,0)]:
        path=row['path'].replace('{format}', '.json')
        url=base+path
        # Baseline deliberately does not pass query variables or mutate resources.
        headers={'Accept':'application/json','User-Agent':'Alazab-Daftra-Audit/1.0',**auth}
        start=time.monotonic();http=None;body=b'';error=None;ct=''
        try:
            with urlopen(Request(url,headers=headers,method='GET'),timeout=args.timeout,context=ssl.create_default_context()) as resp:
                http=resp.status;ct=resp.headers.get('Content-Type','');body=resp.read(8_000_001)
        except HTTPError as exc:
            http=exc.code;ct=exc.headers.get('Content-Type','');body=exc.read(8_000_001)
        except (URLError,TimeoutError,ValueError) as exc:error=type(exc).__name__+': '+str(exc)[:300]
        body_truncated=len(body)>8_000_000
        try:payload=json.loads(body) if not body_truncated else None
        except (ValueError,UnicodeDecodeError):payload=None
        # Never persist unredacted token-bearing payloads.
        slug=re.sub(r'[^a-z0-9]+','_',row['path'].lower()).strip('_')[:85]
        digest=hashlib.sha256(row['path'].encode()).hexdigest()[:10]
        folder=out/'responses'/f'{slug}_{digest}'
        if payload is not None:dump(folder/'response.json',redacted_json(payload))
        elif body: (folder/'response.txt').parent.mkdir(parents=True,exist_ok=True);(folder/'response.txt').write_text(body[:2000].decode('utf-8','replace'),encoding='utf-8')
        observed=types(redacted_json(payload)) if payload is not None else {}
        found=ids(redacted_json(payload)) if payload is not None else {}
        dump(folder/'fields.json',observed);dump(folder/'identifiers.json',found)
        metadata={'method':'GET','path':row['path'],'http_status':http,'content_type':ct,'elapsed_ms':round((time.monotonic()-start)*1000),'valid_json':payload is not None,'body_truncated':body_truncated,'error':error,'observed_success':bool(200<=http<300) if http else False,'timestamp_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        dump(folder/'metadata.json',metadata)
        summary.append({**metadata,'evidence_folder':str(folder.relative_to(out))})
        print(f'{http or "ERR":>3} {row["path"]}',flush=True)
        if http in (401,403):print('Auth/access failure: stopping further requests.');break
        time.sleep(max(0,args.delay))
    dump(out/'operations-report.json',summary)
    counts=collections.Counter(str(r['http_status']) for r in summary)
    print('RESULT',json.dumps({'tested':len(summary),'http_statuses':dict(counts),'out':str(out)},ensure_ascii=False))

if __name__=='__main__': main()
