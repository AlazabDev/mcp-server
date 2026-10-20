#!/usr/bin/env python3
"""Build evidence-gated, read-only Daftra OpenAPI toolboxes from live WSL evidence."""
import json, os, re, copy, hashlib, collections
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent if (Path(__file__).resolve().parent.parent/'daftra_openapi.json').exists() else Path.cwd()
SPEC=ROOT/'daftra_openapi.json'
EVIDENCE=ROOT/'evidence'
OUT=ROOT/'foundry_ready'
METHODS={'get','post','put','patch','delete','head','options','trace'}
COLLECTIONS={
 'sales':['invoices','invoices/subscription','estimates','invoice_payments','invoice_appointments','estimate_appointments','shipping_options'],
 'crm':['clients','client_appointments','client_payments','notes'],
 'operations':['work_orders','work_order_appointments'],
 'inventory':['products','requisitions','product_categories','stores','stock_transactions'],
 'accounting':['journals','journal_accounts','journal_cats'],
 'finance':['incomes','treasuries','expenses','taxes'],
 'purchases':['purchase_invoices','purchase_orders','suppliers'],
 'hr':['staff','time_tracking']
}
DETAILS={'clients':48,'invoices':332,'estimates':331,'products':267,'work_orders':19,'suppliers':13,'client_payments':272,'invoice_payments':287,'expenses':1,'journal_accounts':381,'staff':3}

def env_read(path):
 d={}
 if path.exists():
  for line in path.read_text(encoding='utf8').splitlines():
   line=line.strip()
   if not line or line.startswith('#') or '=' not in line:continue
   k,v=line.split('=',1); d[k.strip()]=v.strip().strip('"').strip("'")
 return d

def baseurl():
 env=env_read(ROOT/'.env')
 base=os.getenv('DAFTRA_BASE_URL') or env.get('DAFTRA_BASE_URL','')
 if not base:
  sub=os.getenv('DAFTRA_SUBDOMAIN') or env.get('DAFTRA_SUBDOMAIN','')
  if not sub: raise SystemExit('MISSING DAFTRA_BASE_URL / DAFTRA_SUBDOMAIN')
  base=f'https://{sub}.daftara.com/api2'
 base=base.rstrip('/')
 if not base.endswith('/api2'):base+='/api2'
 if not re.match(r'^https://[A-Za-z0-9.-]+(?::\d+)?/api2$',base):raise SystemExit('Unexpected base URL: '+base)
 return base

def loadj(p):
 try: return json.loads(p.read_text(encoding='utf8'))
 except Exception:return None

def status200(response, meta):
 if not isinstance(meta,dict) or str(meta.get('http_status',meta.get('status')))!='200':return False
 return isinstance(response,dict) and response.get('result')=='successful' and isinstance(response.get('data'),(list,dict))

def get_collection_data(resource):
 if resource=='products':
  p=EVIDENCE/'products_full'/'report.json'; j=loadj(p)
  if not isinstance(j,dict) or j.get('complete') is not True or j.get('errors') or j.get('unique_products')!=3256:return None
  return {'evidence':str(p.relative_to(ROOT)),'records':3256,'state':'verified'}
 summary=loadj(EVIDENCE/'collections_full'/'report.json')
 if not summary:return None
 entry=next((x for x in summary.get('collections',[]) if x.get('path') in (f'/{resource}{{format}}',f'/{resource}')),None)
 if not entry or entry.get('complete') is not True:return None
 return {'evidence':'evidence/collections_full/report.json','records':entry.get('unique_records'),'state':'verified'}

def get_detail_data(resource, recid):
 p=EVIDENCE/'details'/resource
 meta=loadj(p/'metadata.json');resp=loadj(p/'response.json')
 if not status200(resp,meta):return None
 if str(meta.get('record_id'))!=str(recid):return None
 return {'evidence':str((p/'response.json').relative_to(ROOT)),'record_id':recid,'state':'verified'}

def normalize_type(s):
 # sanitize invalid input schemas without inventing output schema contracts
 if not isinstance(s,dict):return {'type':'string'}
 out={k:copy.deepcopy(v) for k,v in s.items() if k in ('type','format','description','enum','default','minimum','maximum','minLength','maxLength','pattern','nullable','items')}
 if out.get('type') not in ('string','integer','number','boolean','array','object'):out={'type':'string'}
 if out.get('type')=='array':out['items']=normalize_type(out.get('items',{'type':'string'}))
 return out

def prepare_op(op,path,resource,kind):
 op2={'summary':op.get('summary') or ('Get '+resource), 'description':f"Live-read verified Daftra {kind} endpoint for {resource}. Use identifiers from collection responses for detail lookups."}
 params=[]
 for p in op.get('parameters',[]):
  if not isinstance(p,dict):continue
  name=p.get('name');where=p.get('in')
  if where not in ('path','query') or not name:continue
  if name=='format':continue
  if where=='query' and name not in ('page','limit','recursive'):continue
  params.append({'name':name,'in':where,'required':where=='path','schema':normalize_type(p.get('schema',{}))})
 op2['parameters']=params
 # Avoid invalid/inaccurate documentation; verified response shapes are separately recorded in evidence.
 op2['responses']={'200':{'description':'Successful response; actual response samples are stored in evidence files','content':{'application/json':{'schema':{'type':'object','additionalProperties':True}}}}}
 op2['security']=[{'DaftraApiKey':[]}]
 return op2

def slug(resource, kind):
 v=re.sub('[^A-Za-z]+','_',resource).strip('_').lower()
 return ('get_'+v+('_by_id' if kind=='detail' else '_list'))

def main():
 if not SPEC.exists():raise SystemExit('Missing daftra_openapi.json: '+str(SPEC))
 spec=loadj(SPEC)
 if not isinstance(spec,dict) or not isinstance(spec.get('paths'),dict):raise SystemExit('Invalid source OpenAPI')
 url=baseurl();OUT.mkdir(exist_ok=True)
 manifest={'source':str(SPEC),'server':url,'mode':'read_only','categories':{},'verified_operations':[],'excluded':[]}
 grouped=collections.defaultdict(list)
 for category,resources in COLLECTIONS.items():
  for resource in resources:
   path=next((p for p in (f'/{resource}{{format}}',f'/{resource}') if p in spec['paths'] and 'get' in spec['paths'][p]),None)
   if not path:manifest['excluded'].append({'resource':resource,'reason':'source_path_missing'});continue
   proof=get_collection_data(resource)
   if not proof:manifest['excluded'].append({'resource':resource,'reason':'collection_evidence_missing'});continue
   grouped[category].append((resource,path,'collection',proof))
 for resource,recid in DETAILS.items():
  path=f'/{resource}/{{id}}{{format}}'
  if path not in spec['paths'] or 'get' not in spec['paths'][path]:manifest['excluded'].append({'resource':resource,'reason':'detail_path_missing'});continue
  proof=get_detail_data(resource,recid)
  if not proof:manifest['excluded'].append({'resource':resource,'reason':'detail_evidence_missing'});continue
  category=next((c for c,vals in COLLECTIONS.items() if resource in vals),'misc')
  grouped[category].append((resource,path,'detail',proof))
 for category,operations in grouped.items():
  if not operations:continue
  target={'openapi':'3.0.1','info':{'title':f'Alazab Daftra {category.title()} Read Tools','version':'1.0.0','description':'Evidence-gated live-verified read endpoints.'},'servers':[{'url':url}], 'paths':{}, 'components':{'securitySchemes':{'DaftraApiKey':{'type':'apiKey','in':'header','name':'apikey'}}}}
  ids=set()
  for resource,path,kind,proof in operations:
   src=spec['paths'][path]['get'];op=prepare_op(src,path,resource,kind)
   opid=slug(resource,kind)
   if opid in ids:raise SystemExit('duplicate operationId '+opid)
   ids.add(opid);op['operationId']=opid
   # OpenAPI path extension is a literal part of the URL, not a required substitution.
   newpath=path.replace('{format}','.json')
   target['paths'][newpath]={'get':op}
   manifest['verified_operations'].append({'category':category,'method':'GET','source_path':path,'tool_path':newpath,'operationId':opid,**proof})
  filename=f'daftra-{category}-verified.openapi.json'
  (OUT/filename).write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  manifest['categories'][category]={'file':filename,'operations':len(operations)}
 manifest['total_verified_operations']=len(manifest['verified_operations'])
 manifest['source_total_operations']=sum(1 for m in spec['paths'].values() if isinstance(m,dict) for k in m if k.lower() in METHODS)
 manifest['not_verified_operations']=manifest['source_total_operations']-manifest['total_verified_operations']
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 # strict generated-output tests
 for category,entry in manifest['categories'].items():
  doc=loadj(OUT/entry['file']);assert doc['servers'][0]['url']==url
  assert sum('get' in x for x in doc['paths'].values())==entry['operations']
  for path,methods in doc['paths'].items():
   assert '{format}' not in path
   op=methods['get'];assert re.fullmatch('[A-Za-z_-]+',op['operationId'])
   assert all(x['in'] in ('path','query') for x in op['parameters'])
 print(json.dumps({'status':'PASS','output':str(OUT),'verified_operations':manifest['total_verified_operations'],'categories':manifest['categories'],'unverified':manifest['not_verified_operations'],'evidence_exclusions':manifest['excluded']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
