import asyncio,hashlib,json,time,uuid
import frappe
from jsonschema import Draft202012Validator,ValidationError
from mcp_server.policy import authenticate,check_chain,capability_visible,permitted
from mcp_server.net import request

def active_capabilities():
    # Three bulk queries instead of one database fetch per capability and parent.
    plugins={p.name:p for p in frappe.get_all('MCP Plugin',filters={'enabled':1},fields=['name','enabled','allowed_roles']) if permitted(p)}
    connectors={c.name:c for c in frappe.get_all('MCP Connector',filters={'enabled':1},fields=['name','plugin','enabled','allowed_roles','allow_writes']) if permitted(c) and c.plugin in plugins}
    writes=bool(frappe.get_single('MCP Server Settings').expose_writes)
    return [c for c in frappe.get_all('MCP Capability',filters={'enabled':1,'supported':1},fields=['*'],order_by='tool_name asc') if permitted(c) and c.plugin in plugins and c.connector in connectors and connectors[c.connector].plugin==c.plugin and (c.read_only or (writes and connectors[c.connector].allow_writes))]

def active_skills():
    out=[]
    for name in frappe.get_all('MCP Skill',filters={'enabled':1},pluck='name',order_by='skill_id asc'):
        doc=frappe.get_doc('MCP Skill',name)
        if permitted(doc) and permitted(frappe.get_doc('MCP Plugin',doc.plugin)):out.append(doc)
    return out

def public_skill(skill):return {'id':skill.skill_id,'title':skill.title,'description':skill.description,'instructions':skill.instructions,'hash':skill.content_hash}
def clean(obj,secret=None):
    if isinstance(obj,dict):return {k:('[REDACTED]' if any(s in k.lower() for s in ('password','secret','access_token','authorization','api_key')) else clean(v,secret)) for k,v in obj.items()}
    if isinstance(obj,list):return [clean(v,secret) for v in obj]
    if isinstance(obj,str) and secret:return obj.replace(secret,'[REDACTED]')
    return obj

def execute(tool_name,arguments):
    settings=authenticate();start=time.monotonic();rid=uuid.uuid4().hex;status='Failed';error='';size=0;connector=None
    if not isinstance(arguments,dict):raise ValueError('Arguments must be an object')
    capname=frappe.db.get_value('MCP Capability',{'tool_name':tool_name},'name')
    if not capname:frappe.throw('الأداة غير موجودة',frappe.DoesNotExistError)
    cap=frappe.get_doc('MCP Capability',capname)
    frappe.local.mcp_execution_request_id=rid
    frappe.db.savepoint('mcp_execution')
    try:
        connector=check_chain(cap)
        schema=json.loads(cap.input_schema)
        if cap.handler=='HTTP':
            accepted=schema.get('properties',{}).get('path_params',{}).get('properties',{})
            defaults={k:v for k,v in json.loads(connector.default_params_json or '{}').items() if k in accepted}
            if defaults:arguments={**arguments,'path_params':{**defaults,**arguments.get('path_params',{})}}
        Draft202012Validator(schema).validate(arguments)
        if cap.handler=='Frappe':
            from mcp_server import api
            value=getattr(api,cap.operation_id)(**arguments)
        elif cap.handler=='HTTP':
            value=request(connector,cap.method,cap.path,arguments,cap.content_type,int(settings.max_response_bytes or 2000000))
        elif cap.handler=='Backup':
            from mcp_server.backup import execute as execute_backup
            value=execute_backup(cap.operation_id,arguments)
        elif cap.handler=='AI':value=ai_generate(connector,arguments)
        elif cap.handler=='Remote MCP':value=asyncio.run(remote(connector,'call',cap.operation_id,arguments))
        else:raise ValueError('Unsupported handler')
        credential=connector.get_password('credential',raise_exception=False) if connector.get('credential') else None
        value=clean(value,credential);size=len(json.dumps(value,default=str,ensure_ascii=False).encode())
        if size>int(settings.max_response_bytes or 2000000):raise ValueError('RESULT_TOO_LARGE')
        status='Success';return value
    except Exception as exc:
        error=type(exc).__name__;frappe.db.rollback(save_point='mcp_execution');raise
    finally:
        frappe.get_doc({'doctype':'MCP Execution Log','request_id':rid,'user':frappe.session.user,'capability':cap.tool_name,'connector':cap.connector,'status':status,'duration_ms':int((time.monotonic()-start)*1000),'arguments_hash':hashlib.sha256(json.dumps(arguments,sort_keys=True,default=str).encode()).hexdigest(),'error_code':error,'result_bytes':size}).insert(ignore_permissions=True)

def ai_generate(connector,args):
    prompt=args['prompt'];maximum=args.get('max_tokens',1024);model=connector.model
    if not model:raise ValueError('MODEL_NOT_CONFIGURED')
    provider=connector.provider
    if provider=='OpenAI':path='/responses';body={'model':model,'input':prompt,'max_output_tokens':maximum}
    elif provider=='Anthropic':path='/messages';body={'model':model,'messages':[{'role':'user','content':prompt}],'max_tokens':maximum}
    elif provider=='Gemini':
        from urllib.parse import quote
        path='/models/'+quote(model,safe='')+':generateContent';body={'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'maxOutputTokens':maximum}}
    elif provider in ('OpenAI Compatible','Azure OpenAI'):path='/chat/completions';body={'model':model,'messages':[{'role':'user','content':prompt}],'max_tokens':maximum}
    else:raise ValueError('UNKNOWN_AI_PROVIDER')
    data=request(connector,'POST',path,{'body':body})
    if provider=='OpenAI':text='\n'.join(p.get('text','') for item in data.get('output',[]) for p in item.get('content',[]) if p.get('type')=='output_text')
    elif provider=='Anthropic':text='\n'.join(p.get('text','') for p in data.get('content',[]) if p.get('type')=='text')
    elif provider=='Gemini':text='\n'.join(p.get('text','') for item in data.get('candidates',[]) for p in item.get('content',{}).get('parts',[]))
    else:text=data.get('choices',[{}])[0].get('message',{}).get('content','')
    if not text:raise ValueError('NO_TEXT_RETURNED')
    return {'text':text,'model':model,'provider':provider,'usage':data.get('usage',data.get('usageMetadata',{}))}

async def remote(connector,action,operation=None,arguments=None):
    import httpx
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    from mcp_server.net import validate_url
    validate_url(connector.base_url)
    headers=json.loads(connector.headers_json or '{}')
    if connector.get('credential'):
        value=connector.get_password('credential')
        if connector.auth_scheme=='Bearer':headers['Authorization']='Bearer '+value
        elif connector.auth_scheme=='API Key':headers[connector.auth_header or 'apikey']=value
        elif connector.auth_scheme=='Frappe Token':headers['Authorization']='token '+value
    async with httpx.AsyncClient(headers=headers,timeout=int(connector.timeout_seconds or 30)) as http:
        async with streamable_http_client(connector.base_url,http_client=http) as streams:
            async with ClientSession(streams[0],streams[1]) as session:
                await session.initialize()
                if action=='call':
                    answer=await session.call_tool(operation,arguments or {})
                    if answer.isError:raise ValueError('REMOTE_TOOL_FAILED')
                    return answer.model_dump(mode='json',exclude_none=True)
                out=[];cursor=None;seen=set()
                for _ in range(50):
                    page=await session.list_tools(cursor=cursor);out.extend(t.model_dump(mode='json',exclude_none=True) for t in page.tools)
                    cursor=page.nextCursor
                    if not cursor:return out
                    if cursor in seen:raise ValueError('REMOTE_CURSOR_CYCLE')
                    seen.add(cursor)
                raise ValueError('REMOTE_TOOL_LIMIT')
