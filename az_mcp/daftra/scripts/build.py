import json,re,copy,collections,csv,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
METHODS={'get','post','put','patch','delete','head','options'}
def write(p,x):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def clean(x):
 if isinstance(x,list):return [clean(v) for v in x]
 if not isinstance(x,dict):return x
 out={k:clean(v) for k,v in x.items() if k not in ('example','examples') and not k.startswith('x-apifox') and not k.startswith('x-apidog')}
 for key in ('maxLength','minLength','maxItems','minItems','maxProperties','minProperties'):
  if isinstance(out.get(key),str) and out[key].isdigit():out[key]=int(out[key])
 if out.get('type')=='double':out['type']='number';out['format']='double'
 if out.get('type')=='null':
  out.pop('type');out['nullable']=True;out['enum']=[None]
 if isinstance(out.get('default'),str) and '{{' in out['default']:out.pop('default')
 return out

def build(source):
 D=json.loads(source.read_text()); groups={}; manifest=[]; used=set()
 canon=collections.defaultdict(list)
 for p in D['paths']:canon[re.sub(r'\{[^}]+\}','{}',p)].append(p)
 for p,x in D['paths'].items():
  for m,original in x.items():
   if m not in METHODS:continue
   o=clean(copy.deepcopy(original)); reasons=[]
   op=re.sub('[^a-zA-Z_-]+','_',m+'_'+p).strip('_')
   if op in used:raise ValueError('duplicate id '+op)
   used.add(op);o['operationId']=op
   tags=o.get('tags') or ['Other']; bits=tags[0].split('/');group=re.sub('[^a-z]+','_', (bits[1] if len(bits)>1 else bits[0]).lower()).strip('_')
   if len(canon[re.sub(r'\{[^}]+\}','{}',p)])>1:reasons.append('Equivalent path templates in source; endpoint semantics need resolution')
   if re.search(r'/id(?:/|$)',p):reasons.append('Literal /id in source; confirm actual route and identifier parameter')
   if p.startswith('/v2/'):reasons.append('Confirm v2 server base; source applies /api2 globally to v2 paths')
   if '/v2/api/entity' in o.get('description','') and not p.startswith('/v2/'):
    o['servers']=[{'url':'https://entity-base.invalid/v2/api/entity'}]
   body=o.get('requestBody')
   if body and m=='get':
    schema=body.get('content',{}).get('application/json',{}).get('schema',{})
    if not body.get('required') and schema=={'type':'object','properties':{}}:o.pop('requestBody')
    else:reasons.append('GET request body requires verified adapter or corrected upstream contract')
   if body and any(t not in ('application/json','application/json-patch+json') for t in body.get('content',{})):reasons.append('Request content type unsupported by Foundry OpenAPI tool')
   actual=set(re.findall(r'\{([^}]+)\}',p));params=[]
   for a in o.get('parameters',[]):
    if a.get('in')=='header' and a['name'].lower() in ('authorization','apikey','content-type','accept'):continue
    if a.get('in')=='path' and a['name'] not in actual:continue
    params.append(a)
   o['parameters']=params;o['security']=[{'DaftraConnection':[]}]
   if 'responses' not in o:o['responses']={'default':{'description':'Upstream response'}}
   mut=m not in ('get','head','options') or any(s in p for s in ('update_draft','change_status','convert_to_invoice','trigger_update','send_login_details','/activate/','/apps-manager/')) or p.endswith('/status')
   o['description']=('MUTATING operation. Verify target and authorized intent; reconcile outcome before retry. ' if mut else 'Read operation. Retrieve all required pages before reporting complete totals. ')+o.get('description',o.get('summary',''))
   status='blocked' if reasons else 'candidate'
   manifest.append({'operationId':op,'method':m.upper(),'path':p,'group':group,'summary':o.get('summary',''),'effect':'write' if mut else 'read','status':status,'reasons':reasons})
   # Preserve every normalized operation for review, including blocked ones.
   write(ROOT/'review'/f'{op}.json',{'path':p,'method':m,'operation':o,'blockers':reasons})
   if reasons:continue
   if group not in groups:groups[group]={'openapi':'3.0.1','info':{'title':'Alazab Daftra '+group,'version':'1.0.0','description':'Derived from supplied API export; tenant and runtime validation required.'},'servers':[{'url':'https://tenant.invalid/api2'}],'paths':{},'components':{'responses':clean(D['components'].get('responses',{})),'securitySchemes':{'DaftraConnection':{'type':'apiKey','in':'header','name':'Authorization'}}},'security':[{'DaftraConnection':[]}]}
   groups[group]['paths'].setdefault(p,{})[m]=o
 for g,s in groups.items():write(ROOT/'specs'/f'{g}.openapi.json',s)
 write(ROOT/'references'/'operations.json',manifest)
 with (ROOT/'references'/'operations.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(manifest[0]));w.writeheader();w.writerows({**r,'reasons':'; '.join(r['reasons'])} for r in manifest)
 print(json.dumps({'total':len(manifest),'candidates':sum(r['status']=='candidate' for r in manifest),'blocked':sum(r['status']=='blocked' for r in manifest),'groups':len(groups)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);build(p.parse_args().source)
