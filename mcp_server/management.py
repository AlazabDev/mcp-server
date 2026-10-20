import asyncio,json,time,datetime
import frappe
from mcp_server.policy import authenticate,require_manager,MANAGERS,roles
from mcp_server.engine import active_capabilities,active_skills,remote
from mcp_server.net import request

REGISTRIES=('MCP Plugin','MCP Skill','MCP Connector','MCP Capability')
def has_app_permission():return frappe.session.user!='Guest' and bool(roles() & (MANAGERS|{'MCP Operator'}))
@frappe.whitelist()
def snapshot():
    authenticate();manager=bool(roles() & MANAGERS)
    plugins=frappe.get_all('MCP Plugin',fields=['name','plugin_id','title','enabled','description','version'],order_by='title') if manager else [dict(name=d.name,plugin_id=d.plugin_id,title=d.title,enabled=d.enabled,description=d.description,version=d.version) for n in frappe.get_all('MCP Plugin',filters={'enabled':1},pluck='name') if __import__('mcp_server.policy',fromlist=['permitted']).permitted(d:=frappe.get_doc('MCP Plugin',n))]
    connectors=frappe.get_all('MCP Connector',fields=['name','title','connector_id','enabled','kind','last_status','last_tested'],order_by='title') if manager else []
    skills=frappe.get_all('MCP Skill',fields=['name','skill_id','title','enabled','plugin','description']) if manager else [dict(name=s.name,skill_id=s.skill_id,title=s.title,enabled=s.enabled,plugin=s.plugin,description=s.description) for s in active_skills()]
    from mcp_server.transport import base_url,ENDPOINT
    return {'manager':manager,'plugins':plugins,'connectors':connectors,'skills':skills,'active_capabilities':len(active_capabilities()),'capability_total':frappe.db.count('MCP Capability') if manager else None,'mcp_url':base_url()+ENDPOINT,'oauth_metadata_url':base_url()+'/.well-known/oauth-authorization-server','logs':frappe.get_all('MCP Execution Log',fields=['name','request_id','capability','status','duration_ms','creation'],order_by='creation desc',limit_page_length=20) if manager else []}
@frappe.whitelist(methods=['POST'])
def set_enabled(doctype,name,enabled):
    require_manager()
    if doctype not in REGISTRIES:frappe.throw('سجل غير مسموح')
    doc=frappe.get_doc(doctype,name);doc.check_permission('write');doc.enabled=int(enabled);doc.save()
    return {'enabled':doc.enabled}
@frappe.whitelist(methods=['POST'])
def test_connector(name):
    require_manager();doc=frappe.get_doc('MCP Connector',name);start=time.monotonic();status='Failed';details=''
    try:
        if doc.kind=='Frappe':details='نجحت قراءة اسم الموقع والمستخدم: '+str(frappe.local.site);status='Success'
        elif doc.kind=='Local Backup':
            from mcp_server.backup import execute as execute_backup
            info=execute_backup('inventory',{});details='نجحت قراءة النسخة التاريخية؛ عدد السجلات: '+str(info['inventory']['total_rows']);status='Success'
        elif doc.kind=='Remote MCP':details='نجحت مصافحة MCP؛ عدد الأدوات: '+str(len(asyncio.run(remote(doc,'list'))));status='Success'
        elif doc.kind=='AI':
            # Free model discovery rather than spending balance on a generation test.
            if not doc.model:raise ValueError('اختر معرف النموذج أولا')
            if doc.provider=='Anthropic':path='/models'
            elif doc.provider=='Gemini':path='/models'
            else:path='/models'
            request(doc,'GET',path);details='نجح الاتصال بقائمة النماذج؛ توليد النص يختبر باستدعاء القدرة.';status='Success'
        elif doc.test_capability:
            from jsonschema import Draft202012Validator
            cap=frappe.get_doc('MCP Capability',doc.test_capability)
            if cap.connector!=doc.name or not cap.read_only or cap.handler!='HTTP' or not cap.supported:raise ValueError('اختر قدرة HTTP للقراءة من نفس الموصل')
            args=json.loads(doc.test_arguments_json or '{}');schema=json.loads(cap.input_schema)
            accepted=schema.get('properties',{}).get('path_params',{}).get('properties',{})
            defaults={k:v for k,v in json.loads(doc.default_params_json or '{}').items() if k in accepted}
            if defaults:args={**args,'path_params':{**defaults,**args.get('path_params',{})}}
            Draft202012Validator(schema).validate(args)
            request(doc,cap.method,cap.path,args,cap.content_type);status='Success';details='نجح فحص القراءة: '+cap.operation_id
        else:
            caps=frappe.get_all('MCP Capability',filters={'connector':name,'supported':1,'read_only':1,'method':'GET'},pluck='name',order_by='name')
            defaults=json.loads(doc.default_params_json or '{}');chosen=None
            for cname in caps:
                cap=frappe.get_doc('MCP Capability',cname);schema=json.loads(cap.input_schema)
                required=schema.get('properties',{}).get('path_params',{}).get('required',[])
                query_required=schema.get('properties',{}).get('query',{}).get('required',[])
                if all(p in defaults for p in required) and not query_required:chosen=cap;break
            if not chosen:status='Needs Configuration';details='لا توجد عملية GET تلقائية قابلة للفحص؛ اضبط قدرة فحص القراءة ومدخلاتها، أو أكمل معلمات المسار الافتراضية.'
            else:request(doc,chosen.method,chosen.path,{});status='Success';details='نجحت عملية قراءة: '+chosen.operation_id
    except Exception as e:details='فشل الاختبار: '+str(e)[:180] if isinstance(e,ValueError) else 'فشل الاتصال: '+type(e).__name__
    # No payloads, credentials or customer records stored in test logs.
    log=frappe.get_doc({'doctype':'MCP Connection Test','connector':name,'user':frappe.session.user,'status':status,'duration_ms':int((time.monotonic()-start)*1000),'details':details}).insert(ignore_permissions=True)
    frappe.db.set_value('MCP Connector',name,{'last_status':status,'last_tested':frappe.utils.now_datetime()},update_modified=False)
    return {'status':status,'details':details,'test_id':log.name}
@frappe.whitelist(methods=['POST'])
def sync_remote_tools(name):
    require_manager();doc=frappe.get_doc('MCP Connector',name)
    if doc.kind!='Remote MCP':frappe.throw('الموصل ليس MCP بعيدًا')
    from mcp_server.catalog import name_for
    count=0;present=set()
    for tool in asyncio.run(remote(doc,'list')):
        toolname=name_for(doc.connector_id,tool['name']);present.add(toolname)
        existing=frappe.db.get_value('MCP Capability',{'tool_name':toolname},'name')
        if existing:continue
        data={'doctype':'MCP Capability','title':doc.connector_id+':'+tool['name'],'connector':doc.name,'plugin':doc.plugin,'operation_id':tool['name'],'tool_name':toolname,'handler':'Remote MCP','read_only':int(tool.get('annotations',{}).get('readOnlyHint') is True),'enabled':1,'supported':1,'input_schema':json.dumps(tool['inputSchema']),'description':tool.get('description',''),'source_path':doc.base_url}
        frappe.get_doc(data).insert();count+=1
    # Removed upstream capabilities must stop being discoverable locally.
    for row in frappe.get_all('MCP Capability',filters={'connector':name,'handler':'Remote MCP'},fields=['name','tool_name']):
        if row.tool_name not in present:frappe.db.set_value('MCP Capability',row.name,'enabled',0)
    return {'added':count,'discovered':len(present)}
@frappe.whitelist(methods=['POST'])
def import_bundle_settings():
    require_manager()
    from mcp_server.install import configure_from_bundle
    return configure_from_bundle()
@frappe.whitelist(methods=['POST'])
def configure_oauth_discovery():
    require_manager()
    # Native Frappe v16 handles PKCE, client registration, consent and token revocation.
    doc=frappe.get_single('OAuth Settings')
    doc.show_auth_server_metadata=1;doc.show_protected_resource_metadata=1
    doc.save(ignore_permissions=True)
    return {'status':'configured','note':'سجل OAuth Client برد الاتصال الفعلي الظاهر في ChatGPT؛ لم يتم تفعيل التسجيل الديناميكي أو إنشاء عميل تلقائيا.'}
def prune_logs():
    days=int(frappe.get_single('MCP Server Settings').log_retention_days or 30)
    cutoff=frappe.utils.add_days(frappe.utils.now_datetime(),-max(days,1))
    for dt in ('MCP Execution Log','MCP Connection Test'):frappe.db.delete(dt,{'creation':['<',cutoff]})

@frappe.whitelist()
def read_skill(skill_id):
    authenticate()
    from mcp_server.engine import public_skill
    skill=next((s for s in active_skills() if s.skill_id==skill_id),None)
    if not skill:frappe.throw('المهارة غير متاحة',frappe.PermissionError)
    return public_skill(skill)

@frappe.whitelist(methods=['POST'])
def run_capability(tool_name,arguments):
    require_manager()
    from mcp_server.engine import execute
    args=json.loads(arguments) if isinstance(arguments,str) else arguments
    try:
        value=execute(tool_name,args)
        return {'ok':True,'result':value,'request_id':getattr(frappe.local,'mcp_execution_request_id',None)}
    except Exception as e:return {'ok':False,'error':type(e).__name__,'request_id':getattr(frappe.local,'mcp_execution_request_id',None)}
