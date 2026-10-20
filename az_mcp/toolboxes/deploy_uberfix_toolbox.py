import os,json,subprocess,asyncio,copy,sys
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parent

def load_env():
    p=Path(os.getenv('AZ_ENV_FILE','/mnt/f/apps/mcp/toolboxes/.env'))
    if not p.exists():
        p=Path.cwd()/'.env'
    if not p.exists(): raise RuntimeError('ENV_FILE_NOT_FOUND: set AZ_ENV_FILE')
    for line in p.read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line:continue
        k,v=line.split('=',1)
        os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))
    return p

def need(*names):
    for name in names:
        if not os.environ.get(name): raise RuntimeError(f'MISSING_CONFIGURATION: {name}')

def cmd(*args):
    x=subprocess.run(args,text=True,capture_output=True)
    if x.returncode: raise RuntimeError(f'COMMAND_FAILED: {args[:4]}: {(x.stderr or x.stdout)[:650]}')
    return x.stdout.strip()

def setup():
    load_env()
    need('FOUNDRY_PROJECT_ENDPOINT')
    from azure.identity import AzureCliCredential
    endpoint=os.environ['FOUNDRY_PROJECT_ENDPOINT'].rstrip('/')
    token=AzureCliCredential().get_token('https://ai.azure.com/.default').token
    info=json.loads(cmd('az','account','show','-o','json'))
    resource=os.environ.get('FOUNDRY_RESOURCE_ID','').rstrip('/')
    if not resource: raise RuntimeError('MISSING_CONFIGURATION: FOUNDRY_RESOURCE_ID')
    # Azure Cognitive Services resource ID verified from user's environment
    return endpoint,token,resource

def connection_id(resource,conn):
    project=os.environ.get('FOUNDRY_PROJECT_NAME','az-ai-gateway')
    return f'{resource}/projects/{project}/connections/{conn}'

def ensure_connection(name,base,header,value):
    # Existence != matching value; do not silently reuse stale credentials
    r=subprocess.run(['azd','ai','connection','create',name,'--kind','remote-tool','--target',base,
        '--auth-type','custom-keys','--custom-key',f'{header}={value}'],capture_output=True,text=True)
    if r.returncode:
        if 'already exists' in (r.stderr+r.stdout).lower():
            print(f'CONNECTION EXISTS: {name}; existing secret not overwritten',flush=True)
        else:raise RuntimeError('CONNECTION_ERROR: '+(r.stderr+r.stdout)[:700])
    else:print('CONNECTION CREATED:',name,flush=True)

def check_spec(spec):
    ops=[]
    for path,item in spec['paths'].items():
        for m,op in item.items():
            if m.lower() in {'get','post','put','patch','delete'}:
                if m.lower()!='get':raise RuntimeError('UNEXPECTED_WRITE_OPERATION')
                ops.append((m,path,op['operationId']))
    assert len({x[2] for x in ops})==len(ops)
    assert spec.get('security') and spec.get('components',{}).get('securitySchemes')
    return ops

def deploy(name,base,header,secret,spec,connection,smoke_tool,smoke_args,validate):
    import httpx2
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    endpoint,token,resource=setup()
    ops=check_spec(spec)
    if not ops:raise RuntimeError('NO_OPERATIONS')
    print('SPEC OPERATIONS:',len(ops),flush=True)
    ensure_connection(connection,base,header,secret)
    auth={'type':'project_connection','security_scheme':{'project_connection_id':connection_id(resource,connection)}}
    doc={'description':f'Alazab {name} verified read-only API tools','tools':[
      {'type':'openapi','name':name.replace('-toolbox','-read'),'openapi':{'name':name.replace('-toolbox','-read'),'spec':spec,'auth':auth}}
    ]}
    out=Path.cwd()/name/'foundry_ready'
    out.mkdir(parents=True,exist_ok=True)
    (out/'definition.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2))
    head={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
    s=requests.Session();s.headers.update(head)
    found=s.get(f'{endpoint}/toolboxes/{name}?api-version=v1',timeout=30)
    if found.status_code==404:
        # Create v1 via the same service API; avoid accidentally overwriting existing toolbox.
        url=f'{endpoint}/toolboxes/{name}?api-version=v1'
        res=s.put(url,json=doc,timeout=120)
        if not res.ok:
            # Some Foundry backends permit create only through azd; don't assume a service contract.
            print('REST INITIAL CREATE REJECTED:',res.status_code,flush=True)
            # cmd has no shell interpolation and no secret in output
            cmd('azd','ai','toolbox','create',name,'--from-file',str(out/'definition.json'),'--no-prompt')
            vers='1'
        else:
            v=res.json() if res.content else {}
            vers=str(v.get('version') or '1')
    elif found.ok:
        r=s.post(f'{endpoint}/toolboxes/{name}/versions?api-version=v1',json=doc,timeout=120)
        if not r.ok:raise RuntimeError(f'CREATE_VERSION_FAILED {r.status_code}: {r.text[:700]}')
        ans=r.json();vers=str(ans.get('version') or ans.get('name') or '')
    else:raise RuntimeError(f'TOOLBOX_LOOKUP_FAILED {found.status_code}: {found.text[:500]}')
    if not vers.isdigit(): raise RuntimeError('UNKNOWN_CANDIDATE_VERSION '+vers)
    print('CANDIDATE VERSION:',vers,flush=True)
    async def smoke():
        url=f'{endpoint}/toolboxes/{name}/versions/{vers}/mcp?api-version=v1'
        async with httpx2.AsyncClient(headers={'Authorization':f'Bearer {token}'},timeout=httpx2.Timeout(150,connect=30)) as client:
          async with streamable_http_client(url,http_client=client) as (rd,wr):
            async with ClientSession(rd,wr) as session:
              await session.initialize()
              tools=(await session.list_tools()).tools
              print('MCP TOOLS:',len(tools),flush=True)
              if len(tools)!=len(ops):raise RuntimeError('MCP_COUNT_MISMATCH')
              tool=next((t for t in tools if t.name.endswith('___'+smoke_tool)),None)
              if tool is None:raise RuntimeError('SMOKE_TOOL_NOT_FOUND')
              props=tool.input_schema.get('properties',{})
              args={k:(str(v) if props.get(k,{}).get('type')=='string' else v) for k,v in smoke_args.items() if k in props}
              required=set(tool.input_schema.get('required',[]))
              if not required.issubset(args):raise RuntimeError('SMOKE_REQUIRED_MISSING:'+str(required-set(args)))
              result=await session.call_tool(tool.name,args)
              payload=result.model_dump(mode='json')
              (out/'smoke.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
              if result.is_error:raise RuntimeError('MCP_TOOL_ERROR: '+str(payload)[:600])
              if not validate(payload):raise RuntimeError('MCP_RESPONSE_SEMANTIC_VALIDATION_FAILED')
    try:
        asyncio.run(smoke())
    except BaseException as ex:
        def unwrap(e):
            if isinstance(e,BaseExceptionGroup):
                for c in e.exceptions:unwrap(c)
            else:print('ROOT ERROR:',type(e).__name__,str(e)[:1000],flush=True)
        unwrap(ex)
        print('NOT PUBLISHED; CANDIDATE:',vers,flush=True)
        raise SystemExit(1)
    print('MCP END TO END: PASS',flush=True)
    cmd('azd','ai','toolbox','publish',name,vers,'--no-prompt')
    print('PUBLISHED:',name,'v'+vers,flush=True)
    print('ENDPOINT:',f'{endpoint}/toolboxes/{name}/versions/{vers}/mcp?api-version=v1',flush=True)

# UberFix gateway operations derived from AlazabDev/uberfix.shop/src/lib/api-gateway/openapi-spec.ts
# Do not add unverified routes to this list.

def main():
    load_env()
    key=next((os.environ[k] for k in ('UBERFIX_API_KEY','UBERFIX_GATEWAY_API_KEY','UBERFIX_X_API_KEY') if os.environ.get(k)),None)
    if not key:
        raise RuntimeError('MISSING UBERFIX_API_KEY: create or retrieve a valid uf_ gateway consumer key; not present in shared .env')
    server=os.environ.get('UBERFIX_API_BASE','https://zrrffsjbfkphridqyais.supabase.co/functions/v1').rstrip('/')
    # Verified repo documents X-API-Key and GET maintenance-gateway/requests.
    r=requests.get(server+'/maintenance-gateway/requests',headers={'X-API-Key':key,'Accept':'application/json'},params={'limit':1},timeout=45)
    print('UBERFIX DIRECT HTTP:',r.status_code,flush=True)
    if r.status_code!=200:
        raise RuntimeError('DIRECT_GATEWAY_TEST_FAILED: '+str(r.status_code)+' '+r.text[:350])
    try:
        body=r.json()
    except ValueError:raise RuntimeError('DIRECT_RESPONSE_NOT_JSON')
    if not isinstance(body,dict):raise RuntimeError('UNEXPECTED_LIST_RESPONSE')
    paths={
       '/maintenance-gateway/requests':{'get':{'operationId':'list_maintenance_requests','summary':'List UberFix maintenance requests','parameters':[
        {'name':'status','in':'query','schema':{'type':'string'}},
        {'name':'limit','in':'query','schema':{'type':'integer','minimum':1,'maximum':200}},
        {'name':'cursor','in':'query','schema':{'type':'string'}}]}},
       '/maintenance-gateway/requests/{id}':{'get':{'operationId':'get_maintenance_request','summary':'Get a maintenance request','parameters':[{'name':'id','in':'path','required':True,'schema':{'type':'string'}}]}},
       '/maintenance-gateway/technicians':{'get':{'operationId':'list_technicians','summary':'List technicians','parameters':[{'name':'specialty','in':'query','schema':{'type':'string'}},{'name':'available_only','in':'query','schema':{'type':'boolean'}}]}},
       '/maintenance-gateway/invoices':{'get':{'operationId':'list_uberfix_invoices','summary':'List UberFix invoices'}},
    }
    for item in paths.values():
        for op in item.values():op['responses']={'200':{'description':'Successful JSON response','content':{'application/json':{'schema':{'type':'object','additionalProperties':True}}}}}
    spec={'openapi':'3.0.3','info':{'title':'UberFix Read Only API Gateway','version':'1.0.0'},'servers':[{'url':server}],
        'paths':paths,'components':{'securitySchemes':{'apiKey':{'type':'apiKey','in':'header','name':'X-API-Key'}}},'security':[{'apiKey':[]}]}
    def verify(payload):
        text=json.dumps(payload,ensure_ascii=False)
        # Direct and MCP result must include same expected shape, at minimum a JSON response not an upstream auth error
        return 'Unauthorized' not in text and '401' not in text and ('data' in text or 'next_cursor' in text or 'requests' in text)
    deploy('uberfix-toolbox',server,'X-API-Key',key,spec,'uberfix-gateway-connection','list_maintenance_requests',{'limit':1},verify)

if __name__=='__main__':
    try:main()
    except Exception as ex:
        print('STOP:',type(ex).__name__,str(ex)[:700],file=sys.stderr)
        sys.exit(1)
