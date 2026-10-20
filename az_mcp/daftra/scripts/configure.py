import argparse,json,re
from pathlib import Path
from urllib.parse import urlsplit
p=argparse.ArgumentParser()
p.add_argument('--base-url',required=True,help='Verified API base including /api2 if applicable')
p.add_argument('--entity-base-url',required=True,help='Verified native entity base, typically https://TENANT/v2/api/entity')
p.add_argument('--connection',required=True,help='Existing Foundry project connection name')
p.add_argument('--auth-header',choices=['Authorization','apikey'],default='Authorization')
a=p.parse_args();u=urlsplit(a.base_url)
if u.scheme!='https' or not u.hostname or u.hostname.endswith('.invalid') or u.username or u.query or u.fragment or '{' in a.base_url: p.error('Provide the verified HTTPS API base URL')
e=urlsplit(a.entity_base_url)
if e.scheme!='https' or not e.hostname or e.hostname.endswith('.invalid') or e.username or e.query or e.fragment or '{' in a.entity_base_url:p.error('Provide verified entity base URL')
root=Path(__file__).resolve().parents[1];out=root/'configured';out.mkdir(exist_ok=True);tools=[]
for f in sorted((root/'specs').glob('*.json')):
 s=json.loads(f.read_text());s['servers']=[{'url':a.base_url.rstrip('/')}];s['components']['securitySchemes']['DaftraConnection']['name']=a.auth_header
 # Standard api2 suffix only; /{format} remains a required upstream parameter.
 paths={}
 for path,item in s['paths'].items():
  for op in item.values():
   if op.get('servers'):op['servers']=[{'url':a.entity_base_url.rstrip('/')}]

  if path.endswith('{format}') and not path.endswith('/{format}'):
   path=path[:-8]+'.json'
   for op in item.values():op['parameters']=[x for x in op.get('parameters',[]) if not(x['in']=='path' and x['name']=='format')]
  if path in paths:raise ValueError('Path collision after format resolution: '+path)
  paths[path]=item
 s['paths']=paths
 name='daftra_'+f.name.split('.')[0]
 (out/f.name).write_text(json.dumps(s,ensure_ascii=False,indent=2))
 tools.append({'type':'openapi','openapi':{'name':name,'description':s['info']['description'],'spec':s,'auth':{'type':'connection','security_scheme':{'project_connection_id':a.connection}}}})
(root/'toolbox.request.json').write_text(json.dumps({'description':'Alazab Daftra API toolbox: 266 candidate operations; blocked operations tracked separately','tools':tools},ensure_ascii=False,indent=2))
print('Wrote configured/*.openapi.json and toolbox.request.json; no network calls performed.')
