"""Stateless Streamable HTTP inside Frappe's own WSGI request and transaction."""
import json
import frappe
from werkzeug.wrappers import Response
from mcp_server.policy import authenticate,permitted,rate_allowed
from mcp_server.engine import active_capabilities,active_skills,execute,public_skill

ENDPOINT='/api/method/mcp_server.transport.handle'
PROTOCOLS=('2024-11-05','2025-03-26','2025-06-18','2025-11-25')
BUILTINS=[
 {'name':'central_status','description':'حالة الخادم والقدرات المفعلة للمستخدم الحالي','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'central_list_skills','description':'المهارات المفعلة؛ اقرأ المهارة قبل تطبيق تعليماتها','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'central_get_skill','description':'قراءة تعليمات مهارة مفعلة','inputSchema':{'type':'object','properties':{'skill_id':{'type':'string'}},'required':['skill_id'],'additionalProperties':False}},
 {'name':'central_get_plugin','description':'تفاصيل بلجن مفعّل ومهاراته وأدواته المتاحة','inputSchema':{'type':'object','properties':{'plugin_id':{'type':'string'}},'required':['plugin_id'],'additionalProperties':False}},
 {'name':'central_list_plugins','description':'البلجنات المفعلة لهذا المستخدم','inputSchema':{'type':'object','properties':{},'additionalProperties':False}}
]
def base_url():
    from frappe.utils import get_url
    return (frappe.get_single('MCP Server Settings').public_url or get_url()).rstrip('/')

def json_response(value,status=200,headers=None):return Response(json.dumps(value,ensure_ascii=False,default=str),status=status,content_type='application/json',headers=headers)
def metadata():return {'resource':base_url()+ENDPOINT,'authorization_servers':[base_url()],'bearer_methods_supported':['header'],'scopes_supported':['all','openid']}
def auth_header():return 'Bearer resource_metadata="'+base_url()+'/api/method/mcp_server.transport.resource_metadata"'
@frappe.whitelist(allow_guest=True,methods=['GET'])
def resource_metadata():return json_response(metadata())
def after_request(response):
    if frappe.request and frappe.request.path==ENDPOINT and response.status_code in (401,403):response.headers['WWW-Authenticate']=auth_header()
    return response

@frappe.whitelist(allow_guest=True,methods=['POST','GET','DELETE'])
def handle(**kwargs):
    try:settings=authenticate()
    except (frappe.PermissionError,frappe.AuthenticationError):return json_response({'error':'unauthorized'},401,{'WWW-Authenticate':auth_header()})
    if not rate_allowed(settings):return json_response({'error':'rate_limit_exceeded'},429,{'Retry-After':'60'})
    if frappe.request.method!='POST':return json_response({'error':'Stateless JSON MCP: POST only'},405,{'Allow':'POST'})
    if len(frappe.request.get_data())>1048576:return json_response({'error':'request_too_large'},413)
    try:message=frappe.request.get_json(silent=True)
    except Exception:message=None
    if not isinstance(message,dict) or message.get('jsonrpc')!='2.0' or not isinstance(message.get('method'),str):return json_response({'jsonrpc':'2.0','id':None,'error':{'code':-32600,'message':'Invalid request'}})
    if 'id' not in message:
        if message['method'].startswith('notifications/'):return Response(status=202)
        return json_response({'jsonrpc':'2.0','id':None,'error':{'code':-32600,'message':'Request id required'}})
    try:
        version=frappe.get_request_header('MCP-Protocol-Version')
        if version and version not in PROTOCOLS:return json_response({'error':'Unsupported MCP protocol version'},400)
        value=dispatch(message['method'],message.get('params') or {})
        return json_response({'jsonrpc':'2.0','id':message['id'],'result':value})
    except KeyError:return json_response({'jsonrpc':'2.0','id':message['id'],'error':{'code':-32602,'message':'Invalid parameters'}})
    except ValueError as e:return json_response({'jsonrpc':'2.0','id':message['id'],'error':{'code':-32602,'message':'Invalid parameters'}})
    except NotImplementedError:return json_response({'jsonrpc':'2.0','id':message['id'],'error':{'code':-32601,'message':'Method not found'}})
    except Exception:return json_response({'jsonrpc':'2.0','id':message['id'],'error':{'code':-32603,'message':'MCP request failed'}})

def page(rows,params,key):
    cursor=params.get('cursor','0')
    if not isinstance(cursor,str) or not cursor.isdigit():raise ValueError('Invalid cursor')
    start=int(cursor);out={key:rows[start:start+50]}
    if start+50<len(rows):out['nextCursor']=str(start+50)
    return out

def dispatch(method,params):
    if not isinstance(params,dict):raise ValueError('Invalid params')
    if method=='initialize':
        requested=params.get('protocolVersion')
        return {'protocolVersion':requested if requested in PROTOCOLS else PROTOCOLS[-1],'capabilities':{'tools':{'listChanged':False},'prompts':{'listChanged':False},'resources':{'subscribe':False,'listChanged':False}},'serverInfo':{'name':'alazab-frappe-mcp','version':'1.0.0'},'instructions':'ابدأ بـ central_list_skills ثم اقرأ المهارة المناسبة عبر central_get_skill. تنفذ الأدوات بالصلاحيات الفعلية لمستخدم Frappe.'}
    if method=='ping':return {}
    if method=='tools/list':
        rows=BUILTINS+[{'name':d.tool_name,'description':d.description or d.title,'inputSchema':json.loads(d.input_schema),'annotations':{'readOnlyHint':bool(d.read_only),'destructiveHint':not bool(d.read_only),'openWorldHint':d.handler!='Frappe'}} for d in active_capabilities()]
        return page(rows,params,'tools')
    if method=='tools/call':
        name=params['name'];args=params.get('arguments') or {}
        try:
            builtin=next((b for b in BUILTINS if b['name']==name),None)
            if builtin:
                from jsonschema import validate
                validate(args,builtin['inputSchema'])
            if name=='central_status':
                data={'site':frappe.local.site,'user':frappe.session.user,'capabilities':len(active_capabilities()),'skills':len(active_skills()),'mcp_url':base_url()+ENDPOINT}
            elif name=='central_list_skills':data=[{'id':s.skill_id,'title':s.title,'description':s.description} for s in active_skills()]
            elif name=='central_get_skill':
                skill=next((s for s in active_skills() if s.skill_id==args['skill_id']),None)
                if not skill:raise ValueError('Unknown skill')
                data=public_skill(skill)
            elif name=='central_get_plugin':
                pname=frappe.db.get_value('MCP Plugin',{'plugin_id':args['plugin_id']},'name')
                plugin=frappe.get_doc('MCP Plugin',pname) if pname else None
                if not plugin or not permitted(plugin):raise ValueError('Unknown plugin')
                data={'id':plugin.plugin_id,'title':plugin.title,'description':plugin.description,'version':plugin.version,'skills':[s.skill_id for s in active_skills() if s.plugin==plugin.name],'tools':[c.tool_name for c in active_capabilities() if c.plugin==plugin.name]}
            elif name=='central_list_plugins':data=[{'id':d.plugin_id,'title':d.title,'version':d.version} for n in frappe.get_all('MCP Plugin',filters={'enabled':1},pluck='name') if permitted(d:=frappe.get_doc('MCP Plugin',n))]
            else:data=execute(name,args)
            return {'content':[{'type':'text','text':json.dumps(data,ensure_ascii=False,default=str)}],'isError':False,**({'_meta':{'request_id':frappe.local.mcp_execution_request_id}} if getattr(frappe.local,'mcp_execution_request_id',None) else {})}
        except Exception as e:return {'content':[{'type':'text','text':json.dumps({'error':type(e).__name__,'message':'تعذر تنفيذ الأداة؛ راجع الصلاحيات والإعدادات وسجل التنفيذ'},ensure_ascii=False)}],'isError':True}
    if method in ('prompts/list','resources/list'):
        rows=[{'name':s.skill_id,'description':s.description or s.title,**({'uri':'alazab-skill://'+s.skill_id,'mimeType':'text/markdown'} if method=='resources/list' else {})} for s in active_skills()]
        return page(rows,params,'resources' if method=='resources/list' else 'prompts')
    if method in ('prompts/get','resources/read'):
        key=params['name'] if method=='prompts/get' else params['uri'].removeprefix('alazab-skill://')
        skill=next((s for s in active_skills() if s.skill_id==key),None)
        if not skill:raise ValueError('Unknown skill')
        if method=='resources/read':return {'contents':[{'uri':params['uri'],'mimeType':'text/markdown','text':skill.instructions}]}
        return {'description':skill.description or skill.title,'messages':[{'role':'user','content':{'type':'text','text':skill.instructions}}]}
    raise NotImplementedError(method)
