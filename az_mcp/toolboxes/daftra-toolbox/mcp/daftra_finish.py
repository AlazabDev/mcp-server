#!/usr/bin/env python3
"""Daftra WSL evidence collector: full pagination for proven collection endpoints.
No writes to Daftra; resumes saved pages; never silently marks failed runs complete.
"""
import argparse, collections, datetime, hashlib, json, os, pathlib, re, ssl, sys, time
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT=pathlib.Path(__file__).resolve().parent
SKIP_ACTION=re.compile(r'update|delete|convert|trigger|activate|deactivate|assign|send|change|add|create|edit|lock|unlock|restore|cancel|approve|reject|generate|issue|refund|transfer|close|open|sync|import|export|logout|login|refresh',re.I)
MASK=re.compile(r'^(?:.*(?:token|secret|password|passwd|apikey|authorization|cookie|credential|private_key).*)$',re.I)

def envload(path):
    vals={}
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        line=line.strip()
        if not line or line.startswith('#'):continue
        if line.startswith('export '):line=line[7:]
        if '=' not in line:continue
        k,v=line.split('=',1);v=v.strip();vals[k.strip()]=v[1:-1] if len(v)>1 and v[0]==v[-1] and v[0] in "\"'" else v
    return {**vals,**os.environ}

def save(p,o):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp')
    tmp.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(p)

def redact(v):
    if isinstance(v,dict):return {k:('[REDACTED]' if MASK.match(k) else redact(a)) for k,a in v.items()}
    if isinstance(v,list):return [redact(a) for a in v]
    return v

def identifiers(v, p='', out=None):
    if out is None:out={}
    if isinstance(v,dict):
        for k,x in v.items():
            at=(p+'.'+k).strip('.')
            if (k.lower()=='id' or k.lower().endswith('_id')) and isinstance(x,(str,int)) and not isinstance(x,bool):
                d=out.setdefault(at,set());d.add(str(x))
            if not MASK.match(k):identifiers(x,at,out)
    elif isinstance(v,list):
        for x in v:identifiers(x,p+'[]',out)
    return out

def shape(v, p='', out=None):
    if out is None:out={}
    typ='null' if v is None else 'bool' if isinstance(v,bool) else 'integer' if isinstance(v,int) else 'number' if isinstance(v,float) else 'object' if isinstance(v,dict) else 'array' if isinstance(v,list) else 'string'
    if p:out.setdefault(p,set()).add(typ)
    if isinstance(v,dict):
        for k,x in v.items():
            if not MASK.match(k):shape(x,(p+'.'+k).strip('.'),out)
    elif isinstance(v,list):
        for x in v:shape(x,p+'[]',out)
    return out

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--limit',type=int,default=100)
    parser.add_argument('--max-pages',type=int,default=500)
    parser.add_argument('--timeout',type=int,default=120)
    parser.add_argument('--retries',type=int,default=5)
    parser.add_argument('--delay',type=float,default=0.2)
    args=parser.parse_args()
    if args.limit<1 or args.max_pages<1 or args.retries<1:sys.exit('Invalid numeric parameters')
    cfg=envload(ROOT/'.env')
    base=cfg.get('DAFTRA_BASE_URL','').strip().rstrip('/')
    if not base:
        sub=cfg.get('DAFTRA_SUBDOMAIN','').strip()
        if not sub:sys.exit('DAFTRA_BASE_URL and DAFTRA_SUBDOMAIN absent')
        domain=cfg.get('DAFTRA_API_DOMAIN','daftara.com').strip()
        base=f'https://{sub}.{domain}/api2'
    if urlparse(base).path in ('','/'):base+='/api2'
    u=urlparse(base)
    if u.scheme!='https' or not u.hostname or not u.path.rstrip('/').endswith('/api2'):sys.exit('Invalid API base URL')
    if not any(u.hostname==d or u.hostname.endswith('.'+d) for d in ('daftara.com','daftra.com')):sys.exit('Unexpected API host')
    mode=cfg.get('DAFTRA_AUTH_MODE','').lower().strip();tok=cfg.get('DAFTRA_ACCESS_TOKEN','');key=cfg.get('DAFTRA_API_KEY','')
    if mode in ('bearer','oauth','token'):auth={'Authorization':'Bearer '+tok} if tok else None
    elif mode in ('apikey','api_key','key'):auth={'apikey':key} if key else None
    else:auth={'Authorization':'Bearer '+tok} if tok else ({'apikey':key} if key else None)
    if not auth:sys.exit('Missing credentials')
    evidence=ROOT/'evidence'; src=evidence/'responses'; output=evidence/'collections_full';output.mkdir(parents=True,exist_ok=True)
    spec=json.loads((ROOT/'daftra_openapi.json').read_text(encoding='utf-8'))
    known={}
    for file in src.glob('*/metadata.json'):
        meta=json.loads(file.read_text(encoding='utf-8'))
        if meta.get('http_status')==200 and meta.get('method')=='GET':known[meta['path']]=file.parent
    # Only endpoints already proven HTTP 200, with a flat non-action collection GET.
    candidates=[]
    for path,item in spec['paths'].items():
        if path not in known or 'get' not in item:continue
        if SKIP_ACTION.search(path) or re.search(r'\{(?!format\})[^}]+\}',path):continue
        body_path=known[path]/'response.json'
        if not body_path.exists():continue
        body=json.loads(body_path.read_text(encoding='utf-8'))
        if not isinstance(body,dict) or not isinstance(body.get('data'),list):continue
        candidates.append(path)
    reports=[]
    print('DISCOVERED_PROVEN_COLLECTIONS',len(candidates),'(products handled separately)',flush=True)
    for path in candidates:
        if path=='/products{format}':
            reports.append({'path':path,'state':'EXISTING_PRODUCTS_FULL','location':'evidence/products_full/report.json'})
            continue
        slug=re.sub('[^a-z0-9]+','_',path.lower()).strip('_')[:65]+'_'+hashlib.sha256(path.encode()).hexdigest()[:8]
        dest=output/slug; pages=dest/'pages';pages.mkdir(parents=True,exist_ok=True)
        all_records=[];seen=set();success=True;failure=None;complete=False;count_pages=0
        for page in range(1,args.max_pages+1):
            file=pages/f'page-{page:05d}.json'
            if file.exists():
                payload=json.loads(file.read_text(encoding='utf-8'))
                if not isinstance(payload,dict) or not isinstance(payload.get('data'),list):failure=f'Invalid saved page {page}';success=False;break
                records=payload['data']
            else:
                query=urlencode({'page':page,'limit':args.limit})
                url=f'{base}{path.replace("{format}",".json")}?{query}'
                payload=None
                for attempt in range(args.retries):
                    try:
                        with urlopen(Request(url,headers={'Accept':'application/json','User-Agent':'Alazab-Collection-Audit/1.0',**auth},method='GET'),timeout=args.timeout,context=ssl.create_default_context()) as response:
                            code=response.status;raw=response.read(32_000_001)
                        if len(raw)>32_000_000:raise ValueError('Response exceeds 32MB')
                        payload=json.loads(raw)
                        if code!=200 or not isinstance(payload,dict) or payload.get('result')!='successful' or not isinstance(payload.get('data'),list):raise ValueError(f'HTTP={code}, result={str(payload.get("result")) if isinstance(payload,dict) else "invalid"}')
                        payload=redact(payload)
                        save(file,payload)
                        break
                    except HTTPError as err:
                        failure=f'HTTP {err.code} page={page}'
                        if err.code in (401,403,400,404):break
                    except (TimeoutError,URLError,ValueError, OSError) as err:failure=f'{type(err).__name__}: {str(err)[:120]}'
                    if attempt+1<args.retries:time.sleep(min(5*2**attempt,40))
                if payload is None:
                    success=False;break
                records=payload['data']
                time.sleep(args.delay)
            count_pages+=1
            for record in records:
                # Canonical serialization lets us detect repeated pages without assuming field types.
                stamp=json.dumps(record,ensure_ascii=False,sort_keys=True)
                digest=hashlib.sha256(stamp.encode()).hexdigest()
                if digest not in seen:seen.add(digest);all_records.append(record)
            print(f'{path} page={page} received={len(records)} unique_records={len(all_records)}',flush=True)
            if len(records)<args.limit:
                complete=True;break
            if len(records)>0 and count_pages>1 and len(all_records)<(count_pages-1)*args.limit:
                success=False;failure='Repeated records detected before final page: pagination or duplicate data needs review';break
        if success and not complete:failure='Max pages reached without final partial/empty page'
        all_data={};all_shape={}
        for record in all_records:identifiers(record,out=all_data);shape(record,out=all_shape)
        save(dest/'response.json',all_records)
        save(dest/'identifiers.json',{k:sorted(v) for k,v in sorted(all_data.items())})
        save(dest/'fields.json',{k:sorted(v) for k,v in sorted(all_shape.items())})
        entry={'path':path,'complete':complete and success,'pages':count_pages,'unique_records':len(all_records),'error':failure,'evidence':str(dest.relative_to(ROOT))}
        save(dest/'report.json',entry);reports.append(entry)
        if failure and ('401' in failure or '403' in failure):print('Stopping after authorization error');break
    save(output/'report.json',{'timestamp_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'collections':reports,'summary':dict(collections.Counter(('complete' if r.get('complete') else r.get('state','incomplete')) for r in reports))})
    print('REPORT',output/'report.json')

if __name__=='__main__':main()
