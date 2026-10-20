#!/usr/bin/env python3
"""Deploy evidence-checked Magicplan read tools to Foundry; no data writes."""
import asyncio
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

import requests
from azure.identity import AzureCliCredential

ROOT = Path.cwd()
ENV = ROOT / '.env'
if not ENV.exists():
    sys.exit('Run from /mnt/f/apps/mcp/toolboxes where .env exists')
for line in ENV.read_text(encoding='utf8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
customer = os.environ.get('MAGICPLAN_API_ID')
key = os.environ.get('MAGICPLAN_API_KEY')
project_endpoint = os.environ.get('FOUNDRY_PROJECT_ENDPOINT')
assert customer and key and project_endpoint, 'Missing MAGICPLAN_API_ID / MAGICPLAN_API_KEY / FOUNDRY_PROJECT_ENDPOINT'
project_endpoint = project_endpoint.rstrip('/')
OUT = ROOT / 'magicplan' / 'foundry_ready'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://cloud.magicplan.app/api/v2'
PROJECT = '87f9ef45-ebff-4792-82a5-3a939ef463d4'  # real existing Sidi Gaber ID
checks = [
    ('workspace', '/workspace', '/workspace'),
    ('projects', '/projects', '/projects?page=1&page_size=10'),
    ('project', '/projects/{project_id}', f'/projects/{PROJECT}'),
    ('project_plan', '/projects/{project_id}/plan', f'/projects/{PROJECT}/plan'),
    ('project_files', '/projects/{project_id}/files', f'/projects/{PROJECT}/files?page=1'),
    ('project_estimates', '/projects/{project_id}/estimates', f'/projects/{PROJECT}/estimates?page=1'),
]
verified = []
results = {}
for name, path, probe in checks:
    request = urllib.request.Request(BASE+probe, headers={'customer': customer, 'key': key, 'Accept':'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=45) as r:
            raw = r.read()
            status = r.status
        body = json.loads(raw)
        passed = status == 200 and isinstance(body, (dict, list))
    except urllib.error.HTTPError as e:
        status = e.code; passed = False
    except Exception as e:
        status = type(e).__name__; passed = False
    print(f'PROBE {name}: {status} {"PASS" if passed else "SKIP"}', flush=True)
    results[name] = {'path':path,'status':status,'passed':passed}
    if passed:
        verified.append((name,path))

# A 200 for the two proven endpoints and at least one project detail is a prerequisite.
assert {'projects','project'}.issubset({n for n,p in verified}), 'Core Magicplan API probes failed; nothing deployed'

def param(name, where, required=True, type_='string'):
    return {'name':name,'in':where,'required':required,'schema':{'type':type_}}
paths = {}
for name, path in verified:
    params = []
    if '{project_id}' in path: params.append(param('project_id','path'))
    if name in ('projects', 'project_files', 'project_estimates'):
        params.append(param('page','query',False,'integer'))
    if name == 'projects': params.append(param('page_size','query',False,'integer'))
    paths[path]={'get': {
      'operationId':f'magicplan_get_{name}',
      'summary': f'Read Magicplan {name.replace("_", " ")}',
      'parameters':params,
      'responses':{'200':{'description':'Successful JSON response','content':{'application/json':{'schema':{'type':'object'}}}}}
    }}

# Foundry supports a single API-key security scheme per OpenAPI tool; both headers
# must be configured on the same project connection, never included in a spec.
spec = {
  'openapi':'3.0.3',
  'info':{'title':'Alazab Magicplan Verified Read APIs','version':'1.0.0'},
  'servers':[{'url':BASE}],
  'paths':paths,
  'components':{'securitySchemes':{'MagicplanKey':{'type':'apiKey','in':'header','name':'key'}}},
  'security':[{'MagicplanKey':[]}]
}
subscription = subprocess.check_output(['az','account','show','--query','id','-o','tsv'],text=True).strip()
resource_id = os.environ.get('FOUNDRY_RESOURCE_ID','').rstrip('/')
assert resource_id.startswith('/subscriptions/') and '/accounts/' in resource_id, 'FOUNDRY_RESOURCE_ID missing'
connection_name = 'magicplan-api-connection'
conn_id = f'{resource_id}/projects/az-ai-gateway/connections/{connection_name}'
payload = {'description':'Alazab Magicplan verified read-only project and plan operations', 'tools':[
    {'type':'openapi','name':'magicplan-read','openapi':{
        'name':'magicplan-read','spec':spec,
        'auth':{'type':'project_connection','security_scheme':{'project_connection_id':conn_id}}
    }}]}
(OUT/'magicplan.openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2))
(OUT/'magicplan-toolbox.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
(OUT/'probe-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('VERIFIED OPERATIONS:', len(verified))

subprocess.run(['azd','ai','project','set',project_endpoint],check=True)
conn = subprocess.run(['azd','ai','connection','show',connection_name],capture_output=True,text=True)
if conn.returncode:
    subprocess.run(['azd','ai','connection','create',connection_name,
      '--kind','remote-tool','--target','https://cloud.magicplan.app',
      '--auth-type','custom-keys',
      '--custom-key',f'customer={customer}',
      '--custom-key',f'key={key}'],check=True,stdout=subprocess.DEVNULL)
    print('CONNECTION CREATED')
else:
    print('CONNECTION EXISTS (verify customer/key configured; no values printed)')

token = AzureCliCredential().get_token('https://ai.azure.com/.default').token
url=f'{project_endpoint}/toolboxes/magicplan-toolbox/versions?api-version=v1'
base_url=f'{project_endpoint}/toolboxes/magicplan-toolbox?api-version=v1'
headers={'Authorization':f'Bearer {token}'}
check = requests.get(base_url,headers=headers,timeout=30)
if check.status_code==404:
    created=subprocess.run(['azd','ai','toolbox','create','magicplan-toolbox',
                            '--from-file',str(OUT/'magicplan-toolbox.json'),
                            '--no-prompt'],capture_output=True,text=True)
    if created.returncode:
        print('CREATE ERROR:',(created.stderr+'\n'+created.stdout)[-2000:]);sys.exit(2)
    match=re.search(r'Created toolbox magicplan-toolbox at version (\d+)',created.stdout)
    if not match:
        print('UNEXPECTED CREATE OUTPUT:',created.stdout);sys.exit(3)
    version=match.group(1)
    print('CREATE VERSION: SUCCESS')
else:
    response=requests.post(url,headers=headers,json=payload,timeout=120)
    print('CREATE VERSION HTTP:',response.status_code)
    if not response.ok:
        print(response.text[:1800]);sys.exit(2)
    result=response.json()
    version=str(result.get('version') or result.get('name') or '')
    if not version.isdigit():
        print('UNEXPECTED RESPONSE:',str(result)[:1600]);sys.exit(3)
print('CANDIDATE VERSION:',version)
(OUT/'candidate-version.txt').write_text(version)

async def smoke():
    import httpx2
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    endpoint=f'{project_endpoint}/toolboxes/magicplan-toolbox/versions/{version}/mcp?api-version=v1'
    async with httpx2.AsyncClient(headers={'Authorization':f'Bearer {token}'},timeout=httpx2.Timeout(120,connect=25)) as client:
      async with streamable_http_client(endpoint,http_client=client) as (read,write):
        async with ClientSession(read,write) as session:
          await session.initialize()
          names=[t.name for t in (await session.list_tools()).tools]
          print('MCP TOOLS:',len(names))
          tool=next((n for n in names if n.endswith('magicplan_get_projects')),None)
          if not tool: raise RuntimeError('Project list tool missing: '+str(names))
          response=await session.call_tool(tool,{'page':1,'page_size':10})
          print('PROJECT LIST MCP is_error:',response.is_error)
          if response.is_error: raise RuntimeError(str(response.content)[:1400])
          content=response.structured_content or [getattr(c,'text','') for c in response.content]
          text=json.dumps(content,ensure_ascii=False)
          # A passing MCP error flag is not enough; verify project records show up.
          if 'Arabesque' not in text and 'AbuAuf_Alex_Sidi_Gaber' not in text:
              raise RuntimeError('MCP returned success but no recognizable project names: '+text[:1000])
          print('MAGICPLAN MCP END-TO-END: PASS')

try:
    asyncio.run(smoke())
except Exception as e:
    print('NOT PUBLISHED - MCP TEST FAILED:',str(e)[:1900]);sys.exit(4)
subprocess.run(['azd','ai','toolbox','publish','magicplan-toolbox',version,'--no-prompt'],check=True)
print('MAGICPLAN TOOLBOX PUBLISHED:',version)
print('SPEC:', OUT/'magicplan.openapi.json')
